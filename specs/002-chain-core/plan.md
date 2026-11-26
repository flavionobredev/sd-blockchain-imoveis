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
| VI. pt-BR | Docs, mensagens de erro e campos de `data` em pt-BR; identificadores em inglês |
| VIII. Rede Docker | Não se aplica (biblioteca sem rede) |
| IX. Sem segredos | Nenhuma variável de ambiente; dados de teste fictícios |

**Gate**: aprovado para implementação após revisão do Flávio e resposta às questões Q1–Q5 da spec (as propostas valem como padrão se ele não se opuser).

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
export type Operacao = 'GENESE' | 'CADASTRO' | 'TRANSFERENCIA';
export type GeneseData = { operacao: 'GENESE' };
export type CadastroData = { operacao: 'CADASTRO'; imovelId: string; endereco: string; proprietario: string };
export type TransferenciaData = { operacao: 'TRANSFERENCIA'; imovelId: string; proprietarioAnterior: string; novoProprietario: string };
export type BlockData = GeneseData | CadastroData | TransferenciaData;
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
  'GENESE_INVALIDA' | 'DADOS_INVALIDOS' | 'INDICE_FORA_DE_SEQUENCIA' | 'PREVIOUS_HASH_INVALIDO' | 'HASH_INVALIDO';
export type ChainValidationResult =
  | { valid: true; length: number }
  | { valid: false; invalidIndex: number; reason: ChainInvalidReason; message: string };
export function validateChain(chain: Chain): ChainValidationResult;

// estado e regras
export interface HistoricoEntry { proprietario: string; desde: string; blockIndex: number; operacao: 'CADASTRO' | 'TRANSFERENCIA' }
export interface Imovel { imovelId: string; endereco: string; proprietarioAtual: string; registradoEm: string; historico: HistoricoEntry[] }
export interface ChainState { imoveis: Imovel[] }               // ordem de cadastro
export type OperationErrorCode = 'IMOVEL_DUPLICADO' | 'IMOVEL_INEXISTENTE' | 'MESMO_PROPRIETARIO' | 'DADOS_INVALIDOS';
export interface OperationError { code: OperationErrorCode; message: string; blockIndex?: number }
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export function deriveState(chain: Chain): Result<ChainState, OperationError>;
export function findImovel(state: ChainState, imovelId: string): Imovel | undefined;
export function validateOperation(state: ChainState, data: CadastroData | TransferenciaData): Result<void, OperationError>;
export type NovaOperacao =
  | { operacao: 'CADASTRO'; imovelId: string; endereco: string; proprietario: string }
  | { operacao: 'TRANSFERENCIA'; imovelId: string; novoProprietario: string };
export function proposeBlock(chain: Chain, op: NovaOperacao, timestamp?: string): Result<Block, OperationError>;

// serialização
export class ChainParseError extends Error {}
export function serializeChain(chain: Chain): string;          // JSON.stringify(chain, null, 2) + '\n'
export function parseChain(text: string): Chain;               // lança ChainParseError

// recuperação
export type GapStatus = 'PROXIMO' | 'LACUNA' | 'JA_EXISTE' | 'CONFLITO';
export function detectGap(chain: Chain, incoming: Block): GapStatus;
export function appendBlock(chain: Chain, block: Block): Result<Chain, { reason: GapStatus | ChainInvalidReason; message: string }>;
export function canReplaceChain(remote: Chain): Result<void, ChainValidationResult | OperationError>;
```

Os nomes acima são o contrato com a 003; pequenos ajustes de assinatura na implementação devem ser refletidos neste plano.

### Detalhes de decisão

1. **JSON canônico**: `canonicalJson` serializa objetos com chaves ordenadas (recursivo), arrays em ordem, sem espaços; `undefined` é omitido. É o que entra no SHA-256. Evita depender da ordem de chaves que o `JSON.parse` do disco devolve e não exige biblioteca externa.
2. **Hash**: `createHash('sha256').update(canonicalJson({ index, timestamp, data, previousHash })).digest('hex')`.
3. **Gênese**: constante calculada uma vez no carregamento do módulo; `validateChain` compara o bloco 0 inteiro com ela (não só o hash).
4. **Ordem das checagens em `validateChain`**: gênese → formato → `index` → `previousHash` → `hash`. Para T08 (alterar `data` sem recalcular), o motivo esperado é `HASH_INVALIDO` no bloco adulterado. Se o aluno recalcular só aquele hash, o próximo bloco acusa `PREVIOUS_HASH_INVALIDO` — bom para explicar o encadeamento na apresentação.
5. **Normalização**: `trim` em todos os textos de entrada no `proposeBlock`; `imovelId` também em maiúsculas (proposta Q2). Os blocos guardam o valor já normalizado, então o hash não depende de normalização na leitura.
6. **Regras no replay**: `deriveState` reaplica `validateOperation` bloco a bloco; o primeiro bloco que violar devolve erro com `blockIndex`. Com isso `canReplaceChain` recusa cadeias "estruturalmente válidas mas absurdas".
7. **`detectGap`**: compara `incoming.index` com `last.index`: `index === last.index + 1` → `PROXIMO`; `index > last.index + 1` → `LACUNA`; `index <= last.index` e hash igual ao bloco local daquele índice → `JA_EXISTE`; senão → `CONFLITO`. `appendBlock` só anexa no caso `PROXIMO` e se `previousHash`/`hash` conferirem.
8. **Imutabilidade**: todas as funções devolvem arrays/objetos novos; testes conferem que a entrada não mudou.
9. **Mensagens**: em pt-BR, prefixadas com o bloco quando houver (ex.: `Bloco 2: previousHash não corresponde ao hash do bloco 1`).

### Mapeamento códigos → HTTP (referência para a 003)

| Código | HTTP sugerido |
|--------|---------------|
| `IMOVEL_DUPLICADO` | 409 |
| `IMOVEL_INEXISTENTE` | 404 |
| `MESMO_PROPRIETARIO` | 422 |
| `DADOS_INVALIDOS` | 400 |

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
    ├── types.ts          # Block, BlockData, Chain, Imovel, Result...
    ├── hash.ts           # canonicalJson, calculateHash
    ├── block.ts          # gênese, createBlock
    ├── validate.ts       # validateChain
    ├── state.ts          # deriveState, findImovel, validateOperation, proposeBlock
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
2. Testes: cadeia íntegra; `data` adulterado → `HASH_INVALIDO` no índice certo; `previousHash` quebrado; gênese diferente.

### Fase C — Estado e regras (RF01–RF04, T01, T02)
1. `state.ts`: `deriveState`, `validateOperation`, `proposeBlock`, `findImovel`.
2. Testes: as 3 regras; histórico Maria → João → Ana.

### Fase D — Serialização e recuperação (RD06, RD07, T07, T09)
1. `serialize.ts`, `sync.ts`.
2. Testes: ida e volta JSON; JSON inválido; `detectGap` nos 4 casos; `canReplaceChain` recusa adulterada.

### Fase E — Integração no monorepo
1. `index.ts` reexportando tudo; `pnpm --filter @sd/chain-core build` gera CJS + ESM + d.ts.
2. Script raiz `test:core` e `test` encadeado; README atualizado.
3. Rodar `pnpm test` no notebook do Flávio e colar a saída no PR de implementação.

## Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Consumo da core pelo Nest (CJS) e pelo Nuxt (ESM) | Build dual já existe; `exports` com `import`/`require`/`types`; validar `require('@sd/chain-core')` num smoke na 003 |
| Dockerfile do nó precisar buildar a core antes | Tratado na 003 (build `pnpm --filter @sd/chain-core build` no estágio de build) |
| `node:crypto` no bundle do browser, se a web importar a core no cliente | A web só usa a core no servidor Nitro (004); componentes Vue importam apenas tipos (`import type`) |
| Ordem de chaves no JSON editado à mão mudar o hash | JSON canônico com chaves ordenadas |

## Complexidade

Nenhuma violação da constituição. Separar em ~7 arquivos pequenos é organização, não abstração extra; não há classes de domínio, injeção de dependência nem bibliotecas novas.
