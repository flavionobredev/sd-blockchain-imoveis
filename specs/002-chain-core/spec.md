# Especificação da Feature: 002 — chain-core

**Branch sugerida**: `docs/002-chain-core` (documentação) → `feat/002-chain-core` (implementação)

**Criada em**: 2026-11-26

**Status**: Rascunho (aguardando revisão do Flávio)

**Entrada**: Biblioteca TypeScript `packages/chain-core` com a blockchain simplificada do enunciado (seção 5): estrutura de bloco, bloco gênese determinístico, hash SHA-256 sobre representação determinística, validação da cadeia, derivação do estado dos imóveis (dono atual e histórico), regras de negócio de cadastro/transferência, serialização JSON e utilitários de recuperação (detecção de lacuna, anexação e substituição validada da cadeia). Sem HTTP, sem arquivo em disco, sem replicação — isso é da spec 003.

## Contexto e mapeamento com o enunciado

A `chain-core` é o **núcleo de domínio** consumido pelos nós NestJS (spec 003) e, quando útil, pela web Nuxt (spec 004, apenas tipos e funções puras). Ela não sobe servidor nem acessa rede: só recebe e devolve dados.

| Item do enunciado | O que a 002 entrega | Quem completa |
|-------------------|---------------------|---------------|
| RF01 — Cadastro | Montagem do bloco `CADASTRO` + regra de ID duplicado | 003 (rota no coordenador), 004 (tela) |
| RF02 — Listagem | `deriveState` → lista de imóveis com dono atual | 003/004 |
| RF03 — Transferência | Bloco `TRANSFERENCIA` + regras (imóvel inexistente, mesmo dono); cadeia só cresce (append-only) | 003/004 |
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
2. **Dado** `IMV001` já cadastrado, **Quando** tento cadastrar `IMV001` de novo, **Então** a operação é recusada com o código `IMOVEL_DUPLICADO` e nenhum bloco é criado.
3. **Dado** que `IMV999` não existe, **Quando** tento transferi-lo, **Então** recebo `IMOVEL_INEXISTENTE`.
4. **Dado** `IMV001` pertencente a "Maria Silva", **Quando** tento transferi-lo para "Maria Silva", **Então** recebo `MESMO_PROPRIETARIO`.
5. **Dado** `IMV001` de "Maria Silva", **Quando** transfiro para "João Souza", **Então** recebo um bloco `TRANSFERENCIA` com `proprietarioAnterior: "Maria Silva"` e `novoProprietario: "João Souza"`.

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

**Teste independente**: adulterar `data.proprietario` do bloco 1 de uma cadeia válida e chamar `validateChain`.

**Cenários de aceite**:

1. **Dado** uma cadeia íntegra, **Quando** valido, **Então** recebo `{ valid: true, length }`.
2. **Dado** o bloco 1 com `data` alterado e hash antigo, **Quando** valido, **Então** recebo `{ valid: false, invalidIndex: 1, reason: "HASH_INVALIDO" }` e uma mensagem em pt-BR.
3. **Dado** um bloco cujo `previousHash` não bate com o anterior, **Quando** valido, **Então** `reason: "PREVIOUS_HASH_INVALIDO"`.
4. **Dado** um bloco com `index` fora de sequência, **Quando** valido, **Então** `reason: "INDICE_FORA_DE_SEQUENCIA"`.
5. **Dado** uma gênese diferente da canônica, **Quando** valido, **Então** `invalidIndex: 0` e `reason: "GENESE_INVALIDA"`.

---

### História 4 — Réplica recupera e acompanha a cadeia (Prioridade: P2)

Como réplica (spec 003), quero saber se o bloco recebido é o próximo, se há lacuna ou conflito, anexá-lo com validação e, quando necessário, substituir minha cadeia pela do coordenador **só depois** de validá-la (RD06, T05, T07).

**Por que esta prioridade**: necessária para T07, mas só faz sentido com os nós da 003.

**Teste independente**: cadeia local com 2 blocos recebe bloco `index: 4` → `LACUNA`; cadeia do coordenador válida com 5 blocos → `canReplaceChain` aceita; cadeia adulterada → recusa.

**Cenários de aceite**:

1. **Dado** cadeia local até o `index` 2, **Quando** recebo o bloco 3 encadeado corretamente, **Então** `detectGap` retorna `PROXIMO` e `appendBlock` devolve a nova cadeia.
2. **Dado** cadeia local até o `index` 2, **Quando** recebo o bloco 4, **Então** `detectGap` retorna `LACUNA` (a 003 baixa a cadeia completa).
3. **Dado** que já tenho o bloco 3 com o mesmo hash, **Quando** recebo de novo, **Então** `JA_EXISTE` (idempotente, ack sem regravar).
4. **Dado** que tenho um bloco 3 com hash diferente, **Quando** recebo outro bloco 3, **Então** `CONFLITO`.
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

- Campos de texto vazios ou só com espaços (`imovelId`, `endereco`, `proprietario`, `novoProprietario`) → `DADOS_INVALIDOS`.
- Comparação de dono atual na regra "mesmo proprietário": após `trim`, sensível a maiúsculas/minúsculas (ver questão aberta Q2).
- `imovelId` com espaços nas pontas é normalizado com `trim` antes de checar duplicidade.
- Cadeia vazia (`[]`) é inválida (`invalidIndex: 0`, `GENESE_INVALIDA`).
- Ordem de chaves diferente no JSON lido do disco não pode alterar o hash (por isso o JSON canônico).
- Bloco com operação desconhecida em `data.operacao` → `DADOS_INVALIDOS` na validação.
- Cadeia estruturalmente válida mas que viola regra de negócio (ex.: transferência de imóvel inexistente gravada à mão) → `deriveState` sinaliza o bloco (ver FR-010-C).

## Requisitos funcionais

### Estrutura e hash

- **FR-001-C**: A core MUST exportar o tipo `Block` com `index` (inteiro ≥ 0), `timestamp` (ISO 8601 em UTC, ex.: `2026-11-25T14:00:00.000Z`), `data`, `previousHash` e `hash` (hex de 64 caracteres), conforme §5.1.
- **FR-002-C**: `data` MUST ser uma união discriminada por `operacao`, com nomes de campo em pt-BR iguais ao exemplo do enunciado:
  - `GENESE` — `{ operacao: "GENESE" }` (só no bloco 0);
  - `CADASTRO` — `{ operacao, imovelId, endereco, proprietario }`;
  - `TRANSFERENCIA` — `{ operacao, imovelId, proprietarioAnterior, novoProprietario }`.
  A data e hora do registro exigida no RF01 é o `timestamp` do bloco de cadastro.
- **FR-003-C**: `calculateHash(block)` MUST calcular SHA-256 (`node:crypto`, saída hex) sobre o **JSON canônico** de `{ index, timestamp, data, previousHash }` — chaves ordenadas recursivamente, sem espaços, sem o campo `hash` (§5.2).
- **FR-004-C**: `createGenesisBlock()` MUST ser determinístico e idêntico em todos os nós: `index: 0`, `timestamp: "2026-01-01T00:00:00.000Z"`, `data: { operacao: "GENESE" }`, `previousHash: "0"` repetido 64 vezes, `hash` calculado. A core MUST exportar também a constante `GENESIS_HASH`.
- **FR-005-C**: `createBlock(previous, data, timestamp?)` MUST gerar o próximo bloco (`index = previous.index + 1`, `previousHash = previous.hash`, hash calculado). O `timestamp` é injetável para testes; o padrão é o relógio atual em ISO UTC.

### Validação de integridade (RF06, §5.5)

- **FR-006-C**: `validateChain(chain)` MUST verificar, do bloco 0 ao último, parando no **primeiro** problema:
  1. gênese igual à canônica (`GENESE_INVALIDA`);
  2. formato do bloco e de `data` (`DADOS_INVALIDOS`);
  3. `index` igual à posição no array (`INDICE_FORA_DE_SEQUENCIA`);
  4. `previousHash` igual ao `hash` do bloco anterior (`PREVIOUS_HASH_INVALIDO`);
  5. `hash` igual ao recalculado (`HASH_INVALIDO`).
- **FR-007-C**: O resultado MUST ser `{ valid: true, length }` ou `{ valid: false, invalidIndex, reason, message }`, com `message` em pt-BR pronta para a UI (ex.: "Bloco 3: o hash armazenado não corresponde ao conteúdo").
- **FR-008-C**: A validação MUST ser pura (sem I/O). Reler o arquivo do disco a cada verificação é responsabilidade do nó (spec 003).

### Estado dos imóveis e regras de negócio (RF01–RF04)

- **FR-009-C**: `deriveState(chain)` MUST percorrer os blocos em ordem e devolver os imóveis com `imovelId`, `endereco`, `proprietarioAtual`, `registradoEm` (timestamp do cadastro) e `historico` (lista ordenada de `{ proprietario, desde, blockIndex, operacao }`). A lista de imóveis MUST seguir a ordem de cadastro.
- **FR-010-C**: Se um bloco da cadeia violar regra de negócio (ex.: gravado à mão), `deriveState` MUST devolver erro indicando o `blockIndex` e o código da regra, sem lançar exceção não tratada.
- **FR-011-C**: `validateOperation(state, data)` MUST recusar:
  - cadastro com `imovelId` já existente → `IMOVEL_DUPLICADO`;
  - transferência de `imovelId` inexistente → `IMOVEL_INEXISTENTE`;
  - transferência para o dono atual → `MESMO_PROPRIETARIO`;
  - campos obrigatórios vazios → `DADOS_INVALIDOS`.
  Erros MUST trazer `code` (estável, para a API mapear em HTTP 409/404/422 na 003) e `message` em pt-BR.
- **FR-012-C**: A core MUST oferecer um atalho que, dado a cadeia e uma operação de entrada (`CADASTRO` com `imovelId`, `endereco`, `proprietario` ou `TRANSFERENCIA` com `imovelId`, `novoProprietario`), valide as regras e devolva o próximo bloco pronto ou o erro (`proposeBlock`). Na transferência, `proprietarioAnterior` é preenchido pela core a partir do estado.

### Serialização (§5.4, RD07)

- **FR-013-C**: `serializeChain(chain)` MUST gerar JSON legível (indentação de 2 espaços) para facilitar a edição manual na demo do T08.
- **FR-014-C**: `parseChain(text)` MUST rejeitar JSON malformado ou que não seja um array de objetos com os 5 campos (`ChainParseError`), mas MUST aceitar blocos com hash adulterado — quem acusa é o `validateChain`.

### Recuperação e replicação (RD04, RD06)

- **FR-015-C**: `detectGap(chain, incoming)` MUST classificar o bloco recebido como `PROXIMO`, `LACUNA`, `JA_EXISTE` ou `CONFLITO` em relação ao último bloco local.
- **FR-016-C**: `appendBlock(chain, block)` MUST anexar somente se o bloco for o próximo, com `previousHash` correto e hash válido; caso contrário devolve erro com o motivo. Não muta o array recebido.
- **FR-017-C**: `canReplaceChain(remote)` MUST aprovar a substituição apenas se a cadeia remota passar em `validateChain` **e** em `deriveState` sem erro (RD06: "a cadeia recebida deverá ser validada antes de substituir a cópia local"). A política de **quando** substituir (coordenador como autoridade) é da 003; ver Q3.

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
- **BlockData**: operação registrada (`GENESE`, `CADASTRO`, `TRANSFERENCIA`).
- **Chain**: `Block[]` começando pela gênese canônica.
- **Imovel** (derivado): estado atual de um imóvel + histórico de proprietários.
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
- Nomes de função e tipos em inglês (convenção do ecossistema, Constituição § VI); campos de `data`, códigos de erro e mensagens em pt-BR, alinhados ao exemplo do enunciado.
- Dados de demonstração fictícios (Constituição § IX).
- O coordenador é a única fonte de novos blocos (RD04); a core não resolve forks, só os detecta (`CONFLITO`).

## Questões abertas (para o Flávio decidir)

- **Q1** — Campos da transferência: `proprietarioAnterior` + `novoProprietario` (proposta) ou outro nome? Um bloco de transferência MUST repetir o `endereco`? *Proposta*: não repetir; o endereço vem do cadastro.
- **Q2** — Regra "mesmo proprietário": comparar nome com `trim` e sensível a maiúsculas (proposta, mais simples) ou normalizado (sem acento/caixa)? Também: `imovelId` deve ser case-insensitive (`imv001` = `IMV001`)? *Proposta*: `trim` + `toUpperCase` só no `imovelId`; nome só `trim`.
- **Q3** — Réplica com um bloco **não confirmado** à frente do coordenador (ack chegou depois dos 2 s e o coordenador descartou): a core expõe `CONFLITO`; a 003 deve substituir pela cadeia do coordenador mesmo se ela for **mais curta**? *Proposta*: sim, coordenador é a autoridade (RD04); `canReplaceChain` não exige que a remota seja mais longa.
- **Q4** — Timestamp da gênese fixo em `2026-01-01T00:00:00.000Z` está ok, ou prefere outra data simbólica?
- **Q5** — Validar o formato do `imovelId` (ex.: `IMV` + 3 dígitos, como no enunciado) ou aceitar qualquer texto não vazio? *Proposta*: qualquer texto não vazio (até 40 caracteres).
