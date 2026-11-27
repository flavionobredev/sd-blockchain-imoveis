# Especificação da Feature: 002 — chain-core

**Branch sugerida**: `docs/002-chain-core` (documentação) → `feat/002-chain-core` (implementação)

**Criada em**: 2026-11-26

**Status**: Revisada (questões Q1–Q5 decididas pelo Flávio em 2026-11-26; aguardando aprovação final)

**Entrada**: Biblioteca TypeScript `packages/chain-core` com a blockchain simplificada do enunciado (seção 5): estrutura de bloco, bloco gênese determinístico, hash SHA-256 sobre representação determinística, validação da cadeia, derivação do estado dos imóveis (dono atual e histórico), regras de negócio de cadastro/transferência, serialização JSON e utilitários de recuperação (detecção de lacuna, anexação e substituição validada da cadeia). Sem HTTP, sem arquivo em disco, sem replicação — isso é da spec 003.

## Contexto e mapeamento com o enunciado

A `chain-core` é o **núcleo de domínio** consumido pelos nós NestJS (spec 003) e, quando útil, pela web Nuxt (spec 004, apenas tipos e funções puras). Ela não sobe servidor nem acessa rede: só recebe e devolve dados.

| Item do enunciado | O que a 002 entrega | Quem completa |
|-------------------|---------------------|---------------|
| RF01 — Cadastro | Montagem do bloco `REGISTRATION` + regra de ID duplicado | 003 (rota no coordenador), 004 (tela) |
| RF02 — Listagem | `deriveState` → lista de imóveis com dono atual | 003/004 |
| RF03 — Transferência | Bloco `TRANSFER` + regras (imóvel inexistente, mesmo dono); cadeia só cresce (append-only) | 003/004 |
| RF04 — Histórico | `deriveState` → histórico por imóvel, derivado só da cadeia | 003/004 |
| RF05 — Visualização | Tipo `Block` estável (index, timestamp, data, previousHash, hash) | 004 |
| RF06 — Integridade | `validateChain` com índice e motivo do primeiro bloco inválido | 003 (relê o disco), 004 (UI) |
| RF07 / RF08 | — (não se aplica à core) | 004 |
| §5.1 Estrutura | Tipos `Block` e `BlockData` | — |
| §5.2 Hash | `calculateHash` SHA-256 (`node:crypto`) sobre JSON canônico, sem o campo `hash` | — |
| §5.3 Encadeamento / gênese | `createGenesisBlock` idêntico em todos os nós | — |
| §5.4 Armazenamento | `serializeChain` / `parseChain` (o arquivo `/data/chain.json` em si é da 003) | 003 |
| §5.5 Validação | Hash do conteúdo, `previousHash` e sequência de `index` | — |
| RD04 — Replicação | `appendBlock` valida encadeamento do bloco recebido | 003 |
| RD06 — Recuperação | `detectGap` + `canReplaceChain` (cadeia recebida validada antes de substituir) | 003 |
| RD07 — Persistência | Ida e volta JSON sem perda (serializar → ler → mesma cadeia válida) | 003 |

| Cenário | Suporte da core |
|---------|-----------------|
| T01 | Criar bloco de cadastro válido encadeado ao último |
| T02 | Transferência gera novo bloco; histórico preserva dono anterior |
| T05 | Réplica aceita bloco seguinte via `appendBlock` (escrita continua com 1 réplica) |
| T06 / T10 | — (bloqueio de escrita é regra de quórum na 003; a core não sabe de nós) |
| T07 | `detectGap` identifica réplica desatualizada; `canReplaceChain` valida a cadeia do coordenador |
| T08 | `validateChain` aponta o bloco adulterado (hash não confere) e o motivo |
| T09 | `parseChain(serializeChain(c))` devolve cadeia equivalente e válida |
| T03 / T04 | — (balanceamento web; specs 001/004) |

## User Scenarios & Testing

### História 1 — Nó registra e transfere imóveis na cadeia (Prioridade: P1) 🎯 MVP

Como nó coordenador (spec 003), quero montar blocos de cadastro e transferência a partir da cadeia atual, já checando as regras de negócio, para que cada escrita gere exatamente um bloco válido encadeado ao anterior.

**Por que esta prioridade**: sem isso não existe RF01/RF03 nem T01/T02.

**Teste independente**: testes unitários criam a gênese, cadastram `IMV001`, transferem para outro dono e conferem `index`, `previousHash`, `hash` e o resultado das regras.

**Cenários de aceite**:

1. **Dado** uma cadeia só com a gênese, **Quando** cadastro `IMV001` (endereço "Rua A, 100", dona "Maria Silva"), **Então** recebo o bloco `index: 1` com `previousHash` igual ao hash da gênese e `hash` SHA-256 recalculável.
2. **Dado** `IMV001` já cadastrado, **Quando** tento cadastrar `IMV001` de novo, **Então** a operação é recusada com o código `DUPLICATE_PROPERTY` e nenhum bloco é criado.
3. **Dado** que `IMV999` não existe, **Quando** tento transferi-lo, **Então** recebo `PROPERTY_NOT_FOUND`.
4. **Dado** `IMV001` pertencente a "Maria Silva", **Quando** tento transferi-lo para "Maria Silva", **Então** recebo `SAME_OWNER`.
5. **Dado** `IMV001` de "Maria Silva", **Quando** transfiro para "João Souza", **Então** recebo um bloco `TRANSFER` com `address: "Rua A, 100"` (repetido do cadastro), `previousOwner: "Maria Silva"` e `newOwner: "João Souza"`.

---

### História 2 — Consultar imóveis e histórico a partir da cadeia (Prioridade: P1)

Como nó (ou web), quero derivar a lista de imóveis com dono atual e o histórico completo de cada um **somente** a partir dos blocos, sem banco adicional (§5.4, RD08).

**Por que esta prioridade**: atende RF02 e RF04 e comprova T02 ("histórico preservado").

**Teste independente**: aplicar uma cadeia com cadastro + duas transferências e conferir dono atual e as três entradas do histórico, em ordem.

**Cenários de aceite**:

1. **Dado** cadeia com cadastro de `IMV001` (Maria) e transferências Maria → João → Ana, **Quando** derivo o estado, **Então** o dono atual é Ana e o histórico tem Maria, João e Ana, cada um com `blockIndex` e `timestamp` do bloco.
2. **Dado** a cadeia só com a gênese, **Quando** derivo o estado, **Então** a lista de imóveis é vazia.

---

### História 3 — Verificar integridade da cadeia (Prioridade: P1)

Como nó, quero validar a cadeia que leio do disco e saber **qual** bloco está inválido e **por quê**, para o RF06 e o cenário T08 (alteração manual sem recalcular hashes).

**Por que esta prioridade**: é o diferencial "blockchain" do trabalho e um cenário obrigatório da demo.

**Teste independente**: adulterar `data.owner` do bloco 1 de uma cadeia válida e chamar `validateChain`.

**Cenários de aceite**:

1. **Dado** uma cadeia íntegra, **Quando** valido, **Então** recebo `{ valid: true, length }`.
2. **Dado** o bloco 1 com `data` alterado e hash antigo, **Quando** valido, **Então** recebo `{ valid: false, invalidIndex: 1, reason: "INVALID_HASH" }` e uma mensagem em pt-BR.
3. **Dado** um bloco cujo `previousHash` não bate com o anterior, **Quando** valido, **Então** `reason: "INVALID_PREVIOUS_HASH"`.
4. **Dado** um bloco com `index` fora de sequência, **Quando** valido, **Então** `reason: "INDEX_OUT_OF_SEQUENCE"`.
5. **Dado** uma gênese diferente da canônica, **Quando** valido, **Então** `invalidIndex: 0` e `reason: "INVALID_GENESIS"`.

---

### História 4 — Réplica recupera e acompanha a cadeia (Prioridade: P2)

Como réplica (spec 003), quero saber se o bloco recebido é o próximo, se há lacuna ou conflito, anexá-lo com validação e, quando necessário, substituir minha cadeia pela do coordenador **só depois** de validá-la (RD06, T05, T07).

**Por que esta prioridade**: necessária para T07, mas só faz sentido com os nós da 003.

**Teste independente**: cadeia local com 2 blocos recebe bloco `index: 4` → `GAP`; cadeia do coordenador válida com 5 blocos → `canReplaceChain` aceita; cadeia adulterada → recusa.

**Cenários de aceite**:

1. **Dado** cadeia local até o `index` 2, **Quando** recebo o bloco 3 encadeado corretamente, **Então** `detectGap` retorna `NEXT` e `appendBlock` devolve a nova cadeia.
2. **Dado** cadeia local até o `index` 2, **Quando** recebo o bloco 4, **Então** `detectGap` retorna `GAP` (a 003 baixa a cadeia completa).
3. **Dado** que já tenho o bloco 3 com o mesmo hash, **Quando** recebo de novo, **Então** `ALREADY_EXISTS` (idempotente, ack sem regravar).
4. **Dado** que tenho um bloco 3 com hash diferente, **Quando** recebo outro bloco 3, **Então** `CONFLICT`.
5. **Dado** uma cadeia remota adulterada, **Quando** chamo `canReplaceChain`, **Então** a substituição é recusada com o resultado de `validateChain`.

---

### História 5 — Persistir e reler a cadeia (Prioridade: P2)

Como nó, quero serializar a cadeia em JSON e reler o arquivo sem perder nada, para RD07 e T09.

**Teste independente**: `parseChain(serializeChain(c))` é igual a `c` e continua válida; JSON malformado gera erro claro.

**Cenários de aceite**:

1. **Dado** uma cadeia válida, **Quando** serializo e releio, **Então** obtenho a mesma cadeia e `validateChain` continua `valid: true`.
2. **Dado** um texto que não é JSON ou não é um array de blocos, **Quando** chamo `parseChain`, **Então** recebo `ChainParseError` com mensagem em pt-BR.
3. **Dado** um JSON bem formado mas com hash adulterado, **Quando** chamo `parseChain`, **Então** a leitura **funciona** (a integridade é papel do `validateChain`, para a UI mostrar o bloco inválido no T08).

---

### Edge Cases

- Campos de texto vazios ou só com espaços (`propertyId`, `address`, `owner`, `newOwner`) → `INVALID_DATA`.
- Comparação de dono atual na regra "mesmo proprietário": após `trim`, sensível a maiúsculas/minúsculas (decisão D2).
- `propertyId` é normalizado com `trim` e maiúsculas antes de checar duplicidade (`imv001` = `IMV001`, decisão D2).
- `propertyId` com mais de 40 caracteres → `INVALID_DATA` (decisão D5).
- Bloco `TRANSFER` com `address` diferente do endereço registrado → `INVALID_DATA` no replay (decisão D1).
- Cadeia vazia (`[]`) é inválida (`invalidIndex: 0`, `INVALID_GENESIS`).
- Ordem de chaves diferente no JSON lido do disco não pode alterar o hash (por isso o JSON canônico).
- Bloco com operação desconhecida em `data.operation` → `INVALID_DATA` na validação.
- Cadeia estruturalmente válida mas que viola regra de negócio (ex.: transferência de imóvel inexistente gravada à mão) → `deriveState` sinaliza o bloco (ver FR-010-C).

## Requisitos funcionais

### Estrutura e hash

- **FR-001-C**: A core MUST exportar o tipo `Block` com `index` (inteiro ≥ 0), `timestamp` (ISO 8601 em UTC, ex.: `2026-11-25T14:00:00.000Z`), `data`, `previousHash` e `hash` (hex de 64 caracteres), conforme §5.1.
- **FR-002-C**: `data` MUST ser uma união discriminada por `operation`, com nomes de campo e valores de `operation` em **inglês** (Constituição § VII). O enunciado mostra o exemplo com chaves em português (`operacao`, `imovelId`...), mas os atributos de `data` são livres (§5.1 só exige `data` "dados da operação realizada"); a correspondência fica documentada aqui para a apresentação:
  - `GENESIS` — `{ operation: "GENESIS" }` (só no bloco 0);
  - `REGISTRATION` — `{ operation, propertyId, address, owner }`;
  - `TRANSFER` — `{ operation, propertyId, address, previousOwner, newOwner }`. O `address` é **repetido** do cadastro, porque o imóvel não muda fisicamente e assim cada bloco de transferência se explica sozinho na tela de blocos (decisão D1).

  | Enunciado (§5.1) | Código |
  |------------------|--------|
  | `operacao: "CADASTRO"` | `operation: "REGISTRATION"` |
  | (transferência) | `operation: "TRANSFER"` |
  | `imovelId` | `propertyId` |
  | `endereco` | `address` |
  | `proprietario` | `owner` |
  A data e hora do registro exigida no RF01 é o `timestamp` do bloco de cadastro.
- **FR-003-C**: `calculateHash(block)` MUST calcular SHA-256 (`node:crypto`, saída hex) sobre o **JSON canônico** de `{ index, timestamp, data, previousHash }` — chaves ordenadas recursivamente, sem espaços, sem o campo `hash` (§5.2).
- **FR-004-C**: `createGenesisBlock()` MUST ser determinístico e idêntico em todos os nós: `index: 0`, `timestamp: "2026-01-01T00:00:00.000Z"`, `data: { operation: "GENESIS" }`, `previousHash: "0"` repetido 64 vezes, `hash` calculado. A core MUST exportar também a constante `GENESIS_HASH`.
- **FR-005-C**: `createBlock(previous, data, timestamp?)` MUST gerar o próximo bloco (`index = previous.index + 1`, `previousHash = previous.hash`, hash calculado). O `timestamp` é injetável para testes; o padrão é o relógio atual em ISO UTC.

### Validação de integridade (RF06, §5.5)

- **FR-006-C**: `validateChain(chain)` MUST verificar, do bloco 0 ao último, parando no **primeiro** problema:
  1. gênese igual à canônica (`INVALID_GENESIS`);
  2. formato do bloco e de `data` (`INVALID_DATA`);
  3. `index` igual à posição no array (`INDEX_OUT_OF_SEQUENCE`);
  4. `previousHash` igual ao `hash` do bloco anterior (`INVALID_PREVIOUS_HASH`);
  5. `hash` igual ao recalculado (`INVALID_HASH`).
- **FR-007-C**: O resultado MUST ser `{ valid: true, length }` ou `{ valid: false, invalidIndex, reason, message }`, com `message` em pt-BR pronta para a UI (ex.: "Bloco 3: o hash armazenado não corresponde ao conteúdo").
- **FR-008-C**: A validação MUST ser pura (sem I/O). Reler o arquivo do disco a cada verificação é responsabilidade do nó (spec 003).

### Estado dos imóveis e regras de negócio (RF01–RF04)

- **FR-009-C**: `deriveState(chain)` MUST percorrer os blocos em ordem e devolver os imóveis com `propertyId`, `address`, `currentOwner`, `registeredAt` (timestamp do cadastro) e `history` (lista ordenada de `{ owner, since, blockIndex, operation }`). A lista de imóveis MUST seguir a ordem de cadastro.
- **FR-010-C**: Se um bloco da cadeia violar regra de negócio (ex.: gravado à mão), `deriveState` MUST devolver erro indicando o `blockIndex` e o código da regra, sem lançar exceção não tratada.
- **FR-011-C**: `validateOperation(state, data)` MUST recusar:
  - cadastro com `propertyId` já existente → `DUPLICATE_PROPERTY`;
  - transferência de `propertyId` inexistente → `PROPERTY_NOT_FOUND`;
  - transferência para o dono atual → `SAME_OWNER`;
  - campos obrigatórios vazios, `propertyId` com mais de 40 caracteres ou `address` da transferência diferente do registrado → `INVALID_DATA`.
  Erros MUST trazer `code` (estável, para a API mapear em HTTP 409/404/422 na 003) e `message` em pt-BR.
- **FR-012-C**: A core MUST oferecer um atalho que, dado a cadeia e uma operação de entrada (`REGISTRATION` com `propertyId`, `address`, `owner` ou `TRANSFER` com `propertyId`, `newOwner`), valide as regras e devolva o próximo bloco pronto ou o erro (`proposeBlock`). Na transferência, `previousOwner` e `address` são preenchidos pela core a partir do estado (quem chama não informa o endereço).

### Serialização (§5.4, RD07)

- **FR-013-C**: `serializeChain(chain)` MUST gerar JSON legível (indentação de 2 espaços) para facilitar a edição manual na demo do T08.
- **FR-014-C**: `parseChain(text)` MUST rejeitar JSON malformado ou que não seja um array de objetos com os 5 campos (`ChainParseError`), mas MUST aceitar blocos com hash adulterado — quem acusa é o `validateChain`.

### Recuperação e replicação (RD04, RD06)

- **FR-015-C**: `detectGap(chain, incoming)` MUST classificar o bloco recebido como `NEXT`, `GAP`, `ALREADY_EXISTS` ou `CONFLICT` em relação ao último bloco local.
- **FR-016-C**: `appendBlock(chain, block)` MUST anexar somente se o bloco for o próximo, com `previousHash` correto e hash válido; caso contrário devolve erro com o motivo. Não muta o array recebido.
- **FR-017-C**: `canReplaceChain(remote)` MUST aprovar a substituição apenas se a cadeia remota passar em `validateChain` **e** em `deriveState` sem erro (RD06: "a cadeia recebida deverá ser validada antes de substituir a cópia local"). A core **não** exige que a remota seja mais longa: o coordenador é a autoridade (decisão D3), e a 003 substitui a cópia da réplica pela do coordenador sempre que houver `GAP` ou `CONFLICT`, mesmo que ela seja mais curta.

### Empacotamento e testes

- **FR-018-C**: O pacote `@sd/chain-core` MUST continuar buildando com `tsup` em CJS + ESM com `.d.ts`, sem dependências de runtime além do Node (`node:crypto`).
- **FR-019-C**: Funções MUST ser puras/imutáveis (não alteram os argumentos); o único efeito externo permitido é ler o relógio no `timestamp` padrão do `createBlock`.
- **FR-020-C**: O placeholder `chainCoreHello` da 001 MUST ser removido.

### Decisão de testes (Constituição § V)

- **FR-021-C**: A 002 inclui **testes unitários Vitest enxutos** em `packages/chain-core` (cerca de 10 casos): determinismo do hash e da gênese, criação/encadeamento de bloco, as 3 regras de negócio, histórico após transferências, detecção de adulteração (T08), `detectGap`/`appendBlock`/`canReplaceChain` (T07) e ida e volta JSON (T09). Eles **dão suporte** aos e2e de T01, T02 e T05–T10 da 003, que continuam sendo os testes principais do backend. Sem testes de borda exaustivos nem cobertura mínima obrigatória.
- **FR-022-C**: A raiz MUST ganhar o script `pnpm test:core` e o `pnpm test` MUST passar a incluí-lo (`test:core && test:node && test:web`).

### Fora de escopo (specs posteriores)

- Leitura/escrita do arquivo `/data/chain.json`, escrita atômica e criação da gênese no primeiro boot (003).
- Rotas HTTP, mutex, envio às réplicas, ack em 2 s, 503, quórum (003).
- Telas, badge de servidor, status dos nós (004).
- Assinatura digital, prova de trabalho, Merkle tree ou qualquer consenso além do enunciado (Constituição § II).

### Entidades

- **Block**: unidade da cadeia (`index`, `timestamp`, `data`, `previousHash`, `hash`).
- **BlockData**: operação registrada (`GENESIS`, `REGISTRATION`, `TRANSFER`).
- **Chain**: `Block[]` começando pela gênese canônica.
- **Property** (derivado): estado atual de um imóvel + histórico de proprietários.
- **ChainValidationResult**: `valid` ou `invalidIndex` + `reason` + `message`.
- **OperationError**: `code` + `message` (+ `blockIndex` quando vier de `deriveState`).

## Critérios de sucesso

- **SC-001**: `pnpm --filter @sd/chain-core build` gera `dist/index.js`, `dist/index.cjs` e `dist/index.d.ts`.
- **SC-002**: `pnpm test` (com `test:core`) termina com código 0 num clone limpo.
- **SC-003**: O mesmo bloco gera o mesmo hash independentemente da ordem das chaves no JSON.
- **SC-004**: Alterar qualquer campo de `data` de um bloco sem recalcular o hash é detectado por `validateChain` com o índice exato do bloco.
- **SC-005**: Dois processos diferentes geram exatamente o mesmo `GENESIS_HASH`.
- **SC-006**: Nenhuma dependência de runtime nova no `package.json` da core.

## Pressupostos

- Volume de dados de demonstração pequeno (dezenas de blocos); recalcular a cadeia inteira a cada consulta é aceitável.
- Todo identificador de código em inglês (Constituição § VII): tipos, funções, campos do bloco e de `data`, valores de `operation`, códigos de erro e status. Só o texto legível (`message`) e o que aparece no frontend ficam em pt-BR.
- Dados de demonstração fictícios (Constituição § IX).
- O coordenador é a única fonte de novos blocos (RD04); a core não resolve forks, só os detecta (`CONFLICT`).

## Decisões fechadas (revisão do Flávio, 2026-11-26)

- **D0 — Idioma do código**: tudo em inglês (identificadores, campos, valores de `operation`, códigos de erro, status do `detectGap`). Ficam em pt-BR só as `message` legíveis e o que o frontend mostra. Registrado na Constituição v1.2.0 (§ VII).
- **D1 (Q1)** — A transferência **repete** o `address`, porque o imóvel não muda fisicamente. Os nomes `previousOwner` e `newOwner` ficam. **Sem value object**: `address` é um campo `string` simples em `data`, preenchido pelo `proposeBlock` a partir do estado e conferido no replay. Motivo: o bloco precisa ser JSON puro para o hash canônico e para a edição manual no T08; uma classe `Address`/`Property` exigiria (de)serialização extra sem ganho para o enunciado (Constituição § II). O tipo derivado `Property` (estado do imóvel) continua sendo só uma interface de leitura.
- **D2 (Q2)** — Normalização: `trim` em todos os textos; `propertyId` também em maiúsculas; `owner`/`newOwner` só com `trim`, e a regra `SAME_OWNER` diferencia maiúsculas de minúsculas.
- **D3 (Q3)** — O coordenador manda: em `GAP` ou `CONFLICT`, a réplica substitui sua cadeia pela do coordenador (validada com `canReplaceChain`), mesmo que a do coordenador seja mais curta.
- **D4 (Q4)** — Gênese com `timestamp` fixo `2026-01-01T00:00:00.000Z`.
- **D5 (Q5)** — `propertyId` aceita qualquer texto não vazio de até 40 caracteres, sem exigir o formato `IMV` + dígitos.

## Ajustes de idioma no código já mergeado (spec 001)

Revisão de `apps/node`, `apps/web` e `packages/chain-core` em `main` (merge do PR #2). **Não há identificadores em português** (nomes de variáveis, funções, tipos, rotas, env vars e chaves de JSON já estão em inglês). O que está em português e não é texto de UI:

| Arquivo | Trecho | Ajuste |
|---------|--------|--------|
| `apps/node/src/app.spec.ts` | `it('passa')` | descrição do teste em inglês |
| `apps/web/tests/smoke.spec.ts` | `it('passa')` | descrição do teste em inglês |
| `apps/web/tests/server-name.spec.ts` | `it('usa o valor do runtimeConfig (NUXT_SERVER_NAME)')`, `it('cai no padrão quando não há valor')` | descrições em inglês |
| `apps/web/server/utils/server-name.ts` | comentários `/** Normaliza o nome... */`, `/** Nome da instância... */` | comentários em inglês |
| `apps/web/server/api/health.get.ts` | comentário sobre `X-Served-By` | comentário em inglês |
| `apps/web/pages/index.vue` | comentário no `<script setup>` | comentário em inglês |
| `apps/web/nuxt.config.ts` | comentário do `runtimeConfig` | comentário em inglês |
| `packages/chain-core/src/index.ts` e `index.spec.ts` | comentário e `it('expõe placeholder')` | removidos na T001 (placeholder sai) |
| `.env.example` | comentários `#` | comentários em inglês |

Ficam como estão (texto de UI): título, subtítulo e "Instância:" em `apps/web/pages/index.vue`. As tarefas estão em `tasks.md` (Fase 7).
