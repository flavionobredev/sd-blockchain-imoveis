---
description: "Lista de tarefas — spec 002 chain-core"
---

# Tarefas: 002 — chain-core

**Entrada**: `specs/002-chain-core/spec.md`, `plan.md`

**Pré-requisitos**: spec 001 mergeada em `main`; questões Q1–Q5 respondidas (ou propostas aceitas); branch de implementação `feat/002-chain-core` a partir de `main`.

**Testes**: incluídos nesta spec por decisão explícita (FR-021-C): ~10 testes unitários Vitest em `packages/chain-core`, de suporte aos e2e da 003. Sem testes exaustivos de borda.

**Decisões (2026-11-26)**: funções puras sem I/O; SHA-256 via `node:crypto` sobre JSON canônico; gênese fixa (`2026-01-01T00:00:00.000Z`, `previousHash` = 64 zeros); campos de `data` em pt-BR como no enunciado; códigos de erro estáveis; `pnpm test` passa a incluir `test:core`.

## Formato: `[ID] [P?] [História] Descrição`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[US1–US5]**: histórias da spec

## Fase 1: Setup

**Objetivo**: pacote pronto para receber a implementação.

- [ ] T001 Remover `chainCoreHello` de `packages/chain-core/src/index.ts` e o teste placeholder `src/index.spec.ts`
- [ ] T002 Adicionar `"test:core": "pnpm --filter @sd/chain-core test"` no `package.json` raiz e encadear `"test": "pnpm run test:core && pnpm run test:node && pnpm run test:web"`

**Checkpoint**: `pnpm --filter @sd/chain-core build` continua gerando `dist/` (mesmo vazio de funções).

---

## Fase 2: Fundação (bloqueante)

**Objetivo**: tipos, hash e gênese que todas as histórias usam.

- [ ] T003 Criar `packages/chain-core/src/types.ts` com `Block`, `BlockData` (GENESE, CADASTRO, TRANSFERENCIA), `Chain`, `Imovel`, `HistoricoEntry`, `ChainState`, `Result`, códigos de erro
- [ ] T004 Criar `src/hash.ts` com `canonicalJson` (chaves ordenadas, recursivo) e `calculateHash` (SHA-256 hex, sem o campo `hash`)
- [ ] T005 Criar `src/block.ts` com `GENESIS_TIMESTAMP`, `GENESIS_PREVIOUS_HASH`, `createGenesisBlock`, `GENESIS_HASH` e `createBlock(previous, data, timestamp?)`
- [ ] T006 Teste: mesmo bloco com chaves em ordem diferente → mesmo hash; `GENESIS_HASH` estável; `createBlock` define `index` e `previousHash` corretos

**Checkpoint**: hash e gênese determinísticos.

---

## Fase 3: História 1 + 2 — Cadastro, transferência, listagem e histórico (P1) 🎯 MVP

**Objetivo**: RF01–RF04, T01, T02.

- [ ] T007 [US1] Criar `src/state.ts` com `validateOperation` (`IMOVEL_DUPLICADO`, `IMOVEL_INEXISTENTE`, `MESMO_PROPRIETARIO`, `DADOS_INVALIDOS`, mensagens pt-BR)
- [ ] T008 [US2] Implementar `deriveState` (replay em ordem, dono atual, `registradoEm`, `historico` com `blockIndex`/`desde`/`operacao`; erro com `blockIndex` em bloco que viola regra) e `findImovel`
- [ ] T009 [US1] Implementar `proposeBlock(chain, op, timestamp?)` com normalização (`trim`; `imovelId` em maiúsculas conforme Q2) e preenchimento de `proprietarioAnterior`
- [ ] T010 [US1] Teste: as 3 regras de negócio recusam com o código certo e não geram bloco
- [ ] T011 [US2] Teste: cadastro + transferências Maria → João → Ana → dono atual Ana e histórico com 3 entradas em ordem (T02)

**Checkpoint**: a 003 já consegue montar blocos de escrita e responder listagem/histórico.

---

## Fase 4: História 3 — Integridade (P1)

**Objetivo**: RF06, §5.5, T08.

- [ ] T012 [US3] Criar `src/validate.ts` com `validateChain` (ordem: gênese → formato → `index` → `previousHash` → `hash`; primeiro erro com `invalidIndex`, `reason`, `message`)
- [ ] T013 [US3] Teste: cadeia íntegra → `valid: true`; `data.proprietario` do bloco 1 alterado → `HASH_INVALIDO` em `invalidIndex: 1`; `previousHash` quebrado → `PREVIOUS_HASH_INVALIDO`; gênese diferente → `GENESE_INVALIDA`

**Checkpoint**: adulteração manual detectada com índice e motivo.

---

## Fase 5: Histórias 4 + 5 — Recuperação e persistência (P2)

**Objetivo**: RD04, RD06, RD07, T05, T07, T09.

- [ ] T014 [P] [US5] Criar `src/serialize.ts` com `serializeChain` (indentação 2 + quebra de linha final), `parseChain` e `ChainParseError` (rejeita JSON/formato inválido; aceita hash adulterado)
- [ ] T015 [P] [US4] Criar `src/sync.ts` com `detectGap` (`PROXIMO`, `LACUNA`, `JA_EXISTE`, `CONFLITO`), `appendBlock` (imutável) e `canReplaceChain` (`validateChain` + `deriveState`)
- [ ] T016 [US5] Teste: `parseChain(serializeChain(c))` igual a `c` e válida; texto inválido → `ChainParseError` (T09)
- [ ] T017 [US4] Teste: `detectGap` nos 4 casos; `appendBlock` aceita o próximo e recusa `previousHash` errado; `canReplaceChain` recusa cadeia adulterada (T07)

**Checkpoint**: réplica tem tudo para detectar lacuna e substituir a cadeia com validação.

---

## Fase 6: Integração e documentação

- [ ] T018 Reexportar a API pública em `src/index.ts`; conferir `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` após `pnpm --filter @sd/chain-core build`
- [ ] T019 Teste de imutabilidade: funções não alteram arrays/objetos recebidos (pode estar embutido nos testes anteriores)
- [ ] T020 Atualizar a linha `packages/chain-core` no `README.md` (sai "Placeholder", entra resumo da API)
- [ ] T021 Rodar `pnpm install` e `pnpm test` num clone limpo no notebook do Flávio (Node 24 via `nvm use`) e colar a saída no PR de implementação

**Checkpoint**: `pnpm test` verde com core + node + web.

---

## Dependências entre fases

```text
Fase 1 → Fase 2 → Fase 3 → Fase 4
                     ↘
                      Fase 5 (T015 depende de T008 e T012)
Fases 3–5 → Fase 6
```

## Oportunidades de paralelismo

- T014 e T015 em arquivos diferentes; T014 pode começar logo após a Fase 2.
- T012 (validação) pode ser feito em paralelo à Fase 3, pois só depende da Fase 2.

## Estratégia de entrega

1. Este PR contém **apenas** documentação (`specs/002-chain-core/`).
2. Após aprovação, um PR de implementação `feat/002-chain-core` cobre as Fases 1–6, com a saída do `pnpm test`.
3. Não implementar nesta spec: arquivo `/data/chain.json`, rotas HTTP, mutex, ack de 2 s, quórum (spec 003); telas (spec 004).
