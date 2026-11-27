# Plano de implementação: 002 — chain-core

**Branch**: `feat/002-chain-core` (a partir de `main`, após aprovação deste PR de docs) | **Data**: 2026-11-26 | **Spec**: [spec.md](./spec.md)

## Resumo

Substituir o placeholder de `packages/chain-core` pela blockchain simplificada do enunciado: tipos de bloco, gênese determinística, hash SHA-256 sobre JSON canônico, `validateChain` com índice e motivo, `deriveState` (dono atual + histórico), regras de negócio, `proposeBlock`, serialização JSON e utilitários de recuperação (`detectGap`, `appendBlock`, `canReplaceChain`). Tudo em funções puras, sem I/O, sem HTTP e sem dependências de runtime. Testes unitários Vitest enxutos e script `pnpm test:core` ligado ao `pnpm test`.

## Verificação da constituição

| Princípio | Como esta spec atende |
|-----------|------------------------|
| I. Fidelidade ao enunciado | Bloco com os 5 atributos de §5.1, SHA-256 (§5.2), gênese igual em todos os nós (§5.3), validação dos 3 itens de §5.5; regras e histórico de RF01–RF04 |
| II. Simplicidade | Funções puras, zero dependência de runtime, JSON canônico próprio (~15 linhas); sem PoW, assinatura ou Merkle |
| III. TypeScript | Pacote em TS; build `tsup` CJS + ESM + `.d.ts` mantido |
| IV. Regra de réplica | A core não implementa quórum, mas dá `appendBlock`/`detectGap`/`canReplaceChain` para a 003 cumprir "validar antes de substituir" |
| V. Testes | Decisão explícita: ~10 testes unitários das funções críticas, de suporte aos e2e da 003 |
| VI. pt-BR | Prosa das specs, `message` dos erros e textos de UI em pt-BR |
| VII. Código em inglês | Tipos, funções, campos de `data`, valores de `operation`, códigos de erro e status em inglês; ajustes da 001 na Fase F |
| VIII. Rede Docker | Não se aplica (biblioteca sem rede) |
| IX. Sem segredos | Nenhuma variável de ambiente; dados de teste fictícios |

**Gate**: questões Q1–Q5 decididas (ver "Decisões fechadas" na spec); aprovado para implementação após o merge deste PR de docs.

## Contexto técnico

| Item | Valor |
|------|--------|
| Linguagem | TypeScript 5.9, `strict` |
| Runtime | Node **24** (`.nvmrc`), APIs nativas `node:crypto` |
| Dependências de runtime | Nenhuma |
| Build | `tsup` (já configurado: `cjs` + `esm`, `dts`, `sourcemap`) |
| Testes | Vitest 3 (`packages/chain-core/vitest.config.ts`, ambiente `node`) |
| Armazenamento | N/A na core; a 003 grava `serializeChain()` em `/data/chain.json` |
| Consumidores | `apps/node` (003) via `"@sd/chain-core": "workspace:*"`; `apps/web` (004) opcionalmente, só tipos/funções puras no servidor Nitro |
| Escala | Dezenas de blocos na demo; O(n) por consulta é aceitável |
| Restrições | Sem CI; sem I/O na core; sem mutação de argumentos |

## Projeto técnico

### API pública (`src/index.ts`)

```ts
// tipos
export type Operation = 'GENESIS' | 'REGISTRATION' | 'TRANSFER';
export type GenesisData = { operation: 'GENESIS' };
export type RegistrationData = { operation: 'REGISTRATION'; propertyId: string; address: string; owner: string };
export type TransferData = { operation: 'TRANSFER'; propertyId: string; address: string; previousOwner: string; newOwner: string };
export type BlockData = GenesisData | RegistrationData | TransferData;
export interface Block { index: number; timestamp: string; data: BlockData; previousHash: string; hash: string }
export type Chain = Block[];

// hash e blocos
export const GENESIS_TIMESTAMP = '2026-01-01T00:00:00.000Z';
export const GENESIS_PREVIOUS_HASH = '0'.repeat(64);
export const GENESIS_HASH: string;
export function canonicalJson(value: unknown): string;
export function calculateHash(block: Omit<Block, 'hash'>): string;
export function createGenesisBlock(): Block;
export function createBlock(previous: Block, data: BlockData, timestamp?: string): Block;

// validação
export type ChainInvalidReason =
  'INVALID_GENESIS' | 'INVALID_DATA' | 'INDEX_OUT_OF_SEQUENCE' | 'INVALID_PREVIOUS_HASH' | 'INVALID_HASH';
export type ChainValidationResult =
  | { valid: true; length: number }
  | { valid: false; invalidIndex: number; reason: ChainInvalidReason; message: string };
export function validateChain(chain: Chain): ChainValidationResult;

// estado e regras
export interface HistoryEntry { owner: string; since: string; blockIndex: number; operation: 'REGISTRATION' | 'TRANSFER' }
export interface Property { propertyId: string; address: string; currentOwner: string; registeredAt: string; history: HistoryEntry[] }
export interface ChainState { properties: Property[] }               // ordem de cadastro
export type OperationErrorCode = 'DUPLICATE_PROPERTY' | 'PROPERTY_NOT_FOUND' | 'SAME_OWNER' | 'INVALID_DATA';
export interface OperationError { code: OperationErrorCode; message: string; blockIndex?: number }
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export function deriveState(chain: Chain): Result<ChainState, OperationError>;
export function findProperty(state: ChainState, propertyId: string): Property | undefined;
export function validateOperation(state: ChainState, data: RegistrationData | TransferData): Result<void, OperationError>;
export type NewOperation =
  | { operation: 'REGISTRATION'; propertyId: string; address: string; owner: string }
  | { operation: 'TRANSFER'; propertyId: string; newOwner: string };   // address e previousOwner vêm do estado
export function proposeBlock(chain: Chain, op: NewOperation, timestamp?: string): Result<Block, OperationError>;

// serialização
export class ChainParseError extends Error {}
export function serializeChain(chain: Chain): string;          // JSON.stringify(chain, null, 2) + '\n'
export function parseChain(text: string): Chain;               // lança ChainParseError

// recuperação
export type GapStatus = 'NEXT' | 'GAP' | 'ALREADY_EXISTS' | 'CONFLICT';
export function detectGap(chain: Chain, incoming: Block): GapStatus;
export function appendBlock(chain: Chain, block: Block): Result<Chain, { reason: GapStatus | ChainInvalidReason; message: string }>;
export function canReplaceChain(remote: Chain): Result<void, ChainValidationResult | OperationError>;
```

Os nomes acima são o contrato com a 003; pequenos ajustes de assinatura na implementação devem ser refletidos neste plano.

**Ajustes na implementação (PR `feat/002-chain-core`)**: o erro do `appendBlock` ganhou o nome `AppendBlockError` (mesmo formato `{ reason, message }`), e a API também exporta `MAX_PROPERTY_ID_LENGTH` (40) e `normalizePropertyId` (trim + maiúsculas), úteis para a 003 validar a entrada. Após o review do PR #4, também exporta `isIsoUtcTimestamp`: `validateChain` e `proposeBlock` só aceitam `timestamp` ISO 8601 em UTC com milissegundos e data real (FR-001-C); fora disso, `INVALID_DATA`. Assinaturas acima inalteradas.

### Detalhes de decisão

1. **JSON canônico**: `canonicalJson` serializa objetos com chaves ordenadas (recursivo), arrays em ordem, sem espaços; `undefined` é omitido. É o que entra no SHA-256. Evita depender da ordem de chaves que o `JSON.parse` do disco devolve e não exige biblioteca externa.
2. **Hash**: `createHash('sha256').update(canonicalJson({ index, timestamp, data, previousHash })).digest('hex')`.
3. **Gênese**: constante calculada uma vez no carregamento do módulo; `validateChain` compara o bloco 0 inteiro com ela (não só o hash).
4. **Ordem das checagens em `validateChain`**: gênese → formato → `index` → `previousHash` → `hash`. Para T08 (alterar `data` sem recalcular), o motivo esperado é `INVALID_HASH` no bloco adulterado. Se o aluno recalcular só aquele hash, o próximo bloco acusa `INVALID_PREVIOUS_HASH` — bom para explicar o encadeamento na apresentação.
5. **Normalização**: `trim` em todos os textos de entrada no `proposeBlock`; `propertyId` também em maiúsculas e no máximo 40 caracteres (D2, D5); `owner` só com `trim`. Os blocos guardam o valor já normalizado, então o hash não depende de normalização na leitura.
6. **Regras no replay**: `deriveState` reaplica `validateOperation` bloco a bloco; o primeiro bloco que violar devolve erro com `blockIndex`. Com isso `canReplaceChain` recusa cadeias "estruturalmente válidas mas absurdas".
7. **`detectGap`**: compara `incoming.index` com `last.index`: `index === last.index + 1` → `NEXT`; `index > last.index + 1` → `GAP`; `index <= last.index` e hash igual ao bloco local daquele índice → `ALREADY_EXISTS`; senão → `CONFLICT`. `appendBlock` só anexa no caso `NEXT` e se `previousHash`/`hash` conferirem.
8. **Imutabilidade**: todas as funções devolvem arrays/objetos novos; testes conferem que a entrada não mudou.
9. **Mensagens**: em pt-BR, prefixadas com o bloco quando houver (ex.: `Bloco 2: previousHash não corresponde ao hash do bloco 1`).
10. **`address` na transferência, sem value object (D1)**: `proposeBlock` copia o `address` do imóvel registrado para o bloco `TRANSFER`; no replay, `deriveState` recusa com `INVALID_DATA` se o `address` divergir. Não há classe `Address`/`Property`: os blocos são objetos JSON simples (hash canônico, edição manual no T08), e `Property` é só a interface do estado derivado.
11. **Autoridade do coordenador (D3)**: `canReplaceChain` só valida a remota; não compara tamanhos. A 003 sempre substitui pela cadeia do coordenador em `GAP`/`CONFLICT`.

### Mapeamento códigos → HTTP (referência para a 003)

| Código | HTTP sugerido |
|--------|---------------|
| `DUPLICATE_PROPERTY` | 409 |
| `PROPERTY_NOT_FOUND` | 404 |
| `SAME_OWNER` | 422 |
| `INVALID_DATA` | 400 |

## Estrutura do repositório

### Documentação desta feature

```text
specs/002-chain-core/
├── spec.md
├── plan.md      # este arquivo
└── tasks.md
```

`research.md`, `data-model.md` e `contracts/` não são criados: o modelo de dados e o contrato da API pública estão neste plano (Constituição § II).

### Código-fonte (alvo pós-002)

```text
packages/chain-core/
├── package.json          # sem novas dependências de runtime
├── tsup.config.ts        # inalterado (cjs + esm + dts)
├── vitest.config.ts      # inalterado
└── src/
    ├── index.ts          # reexporta a API pública
    ├── types.ts          # Block, BlockData, Chain, Property, Result...
    ├── hash.ts           # canonicalJson, calculateHash
    ├── block.ts          # gênese, createBlock
    ├── validate.ts       # validateChain
    ├── state.ts          # deriveState, findProperty, validateOperation, proposeBlock
    ├── serialize.ts      # serializeChain, parseChain, ChainParseError
    ├── sync.ts           # detectGap, appendBlock, canReplaceChain
    └── chain-core.spec.ts  # ~10 testes unitários
package.json (raiz)       # + "test:core"; "test" passa a encadear core → node → web
README.md                 # linha da tabela de pacotes deixa de dizer "placeholder"
```

**Decisão de estrutura**: um arquivo por responsabilidade, sem subpastas; um único arquivo de teste, porque a suíte é pequena.

## Fases de implementação

### Fase A — Tipos, hash e gênese
1. `types.ts`, `hash.ts`, `block.ts`; remover `chainCoreHello` e o teste placeholder.
2. Testes: hash determinístico com chaves embaralhadas; `GENESIS_HASH` estável; `createBlock` encadeia.

### Fase B — Validação (RF06, T08)
1. `validate.ts` com os 5 motivos.
2. Testes: cadeia íntegra; `data` adulterado → `INVALID_HASH` no índice certo; `previousHash` quebrado; gênese diferente.

### Fase C — Estado e regras (RF01–RF04, T01, T02)
1. `state.ts`: `deriveState`, `validateOperation`, `proposeBlock`, `findProperty`.
2. Testes: as 3 regras; histórico Maria → João → Ana.

### Fase D — Serialização e recuperação (RD06, RD07, T07, T09)
1. `serialize.ts`, `sync.ts`.
2. Testes: ida e volta JSON; JSON inválido; `detectGap` nos 4 casos; `canReplaceChain` recusa adulterada.

### Fase E — Integração no monorepo
1. `index.ts` reexportando tudo; `pnpm --filter @sd/chain-core build` gera CJS + ESM + d.ts.
2. Script raiz `test:core` e `test` encadeado; README atualizado.
3. Rodar `pnpm test` no notebook do Flávio e colar a saída no PR de implementação.

### Fase F — Ajustes de idioma no código da 001
1. Passar para inglês as descrições de teste e os comentários listados na seção "Ajustes de idioma" da spec, sem mudar comportamento nem textos de UI.
2. Rodar `pnpm test` de novo.

## Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Consumo da core pelo Nest (CJS) e pelo Nuxt (ESM) | Build dual já existe; `exports` com `import`/`require`/`types`; validar `require('@sd/chain-core')` num smoke na 003 |
| Dockerfile do nó precisar buildar a core antes | Tratado na 003 (build `pnpm --filter @sd/chain-core build` no estágio de build) |
| `node:crypto` no bundle do browser, se a web importar a core no cliente | A web só usa a core no servidor Nitro (004); componentes Vue importam apenas tipos (`import type`) |
| Ordem de chaves no JSON editado à mão mudar o hash | JSON canônico com chaves ordenadas |

## Complexidade

Nenhuma violação da constituição. Separar em ~7 arquivos pequenos é organização, não abstração extra; não há classes de domínio, injeção de dependência nem bibliotecas novas.
