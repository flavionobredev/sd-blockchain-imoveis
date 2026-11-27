---
description: "Lista de tarefas — spec 003 nós NestJS"
---

# Tarefas: 003 — Nós NestJS (coordenador e réplicas)

**Entrada**: `specs/003-nodes/spec.md`, `plan.md`

**Pré-requisitos**: spec 002 mergeada em `main` (PR #4); Q1–Q5 decididas; branch `feat/003-nodes` a partir de `main`.

**Testes**: incluídos por decisão explícita (D-T1): pirâmide unit → integration → e2e em `apps/node/test/`, scripts `test:unit`, `test:integration`, `test:e2e`, e `test` rodando tudo. Cada fase escreve os testes da sua camada junto do código.

**Decisões**: D-W1 (replica antes de gravar no coordenador), D-W2 (disco é a fonte da verdade), D-W3 (responde no 1º ack), D-R1 (ressincronização com a cadeia completa), D-A1 (rotas em inglês, `X-Node-Id`, `{ code, message }`), D-T1 (pirâmide de testes).

## Formato: `[ID] [P?] [História] Descrição`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[US1–US5]**: histórias da spec

## Fase 1: Setup

- [ ] T001 Adicionar `"@sd/chain-core": "workspace:*"` em `apps/node/package.json` e `supertest` + `@types/supertest` em dev; `pnpm install`
- [ ] T002 `apps/node/vitest.config.ts` com `test.projects` `unit` (`test/unit/**`), `integration` (`test/integration/**`) e `e2e` (`test/e2e/**`, `fileParallelism: false`), todos com `unplugin-swc`
- [ ] T003 Scripts `test`, `test:unit`, `test:integration`, `test:e2e` em `apps/node/package.json`
- [ ] T004 [P] `test/support/temp-dir.ts` (`mkdtemp` + limpeza) e `test/support/in-memory-clients.ts` (dublês de `ReplicaClient`/`CoordinatorClient`)
- [ ] T005 Remover `app.controller.ts`, `app.service.ts` e `src/app.spec.ts` do esqueleto

**Checkpoint**: `pnpm --filter @sd/node test` roda os três projetos (ainda vazios ou com um teste trivial por projeto).

---

## Fase 2: Fundação (bloqueante)

- [ ] T006 [P] `src/config/node-config.ts` com `loadNodeConfig(env)` (padrões, lista de réplicas, erro claro para `ROLE` inválido ou URL obrigatória ausente)
- [ ] T007 [P] `src/common/mutex.ts` (`runExclusive`, libera em erro)
- [ ] T008 [P] `src/common/api-error.ts` (`ApiError`, `fromOperation`, tabela `code → HTTP`) e `api-exception.filter.ts` (JSON malformado → 400 `INVALID_DATA`, inesperado → 500 `INTERNAL_ERROR`)
- [ ] T009 [P] `src/common/node-id.interceptor.ts` (header `X-Node-Id`) e `assert-role.ts` (`NOT_COORDINATOR` / `NOT_REPLICA`)
- [ ] T010 `src/chain/chain.repository.ts` (`read` com gênese se não existir; `write` atômico `tmp` + `rename`) e `chain.service.ts` (`loadValidState`, `status`)
- [ ] T011 `src/bootstrap.ts` (`createNodeApp(config)`), `AppModule.forRoot(config)`, `main.ts` usando `loadNodeConfig(process.env)`; `StatusController` com `GET /health`
- [ ] T012 [P] Unit: `mutex.spec.ts` (serializa duas tarefas; libera após erro)
- [ ] T013 [P] Unit: `node-config.spec.ts` (padrões; `NODE_REPLICA_URLS` com vírgulas; `ROLE` inválido lança)
- [ ] T014 [P] Unit: `api-error.spec.ts` (cada código no HTTP certo; corpo `{ code, message }`; JSON malformado → 400)
- [ ] T015 Integration: `chain.repository.spec.ts` (cria gênese; ida e volta; sem `.tmp` sobrando; JSON inválido → `ChainParseError`)

**Checkpoint**: um nó sobe com `createNodeApp` e responde `GET /health`.

---

## Fase 3: US1 + US2 — Escrita com maioria e leituras (P1) 🎯 MVP

- [ ] T016 `src/replication/http-clients.ts` (`ReplicaClient.sendBlock` e `CoordinatorClient.getChain` com `fetch` + `AbortSignal.timeout`)
- [ ] T017 `src/replication/replication.service.ts` (`broadcast`: paralelo, resolve no 1º ack ou em `ackTimeoutMs`, erro de rede = sem ack, restante em segundo plano com log)
- [ ] T018 `src/properties/write.service.ts` (`register`, `transfer`: mutex → ler → `CHAIN_INVALID` → `proposeBlock` → `broadcast` → `NO_REPLICA_ACK` ou gravar → `{ block, property }`)
- [ ] T019 `src/replication/sync.service.ts` — `receiveBlock` com `NEXT` e `ALREADY_EXISTS` (o resto na Fase 4)
- [ ] T020 `PropertiesController` (4 rotas; POST com `assertRole('coordinator')`), `BlocksController` (`GET /blocks`) e `InternalController` (`POST /internal/blocks` com `assertRole('replica')`)
- [ ] T021 [P] Unit: `replication.service.spec.ts` com fake timers (ack em 500 ms → `acked 1`; réplicas mudas → `acked 0` em 2000 ms; uma falha e outra confirma → `acked 1`)
- [ ] T022 Integration: `write-flow.spec.ts` (coordenador + 2 `SyncService` reais por cliente em memória: bloco nos 3 discos; clientes falhando → 503 e disco do coordenador igual; 2 escritas concorrentes → blocos 1 e 2)
- [ ] T023 `test/support/cluster.ts` (`startCluster`, `stopNode`, `restartNode`, `tamperBlock`; portas reservadas, `ACK_TIMEOUT_MS=300`)
- [ ] T024 [US1] E2E `writes.e2e-spec.ts`: T01, erros 409/404/422/400, T02
- [ ] T025 [US1] E2E `reads.e2e-spec.ts`: RF02 nos 3 nós, RF05 blocos com hashes
- [ ] T026 [US2] E2E `failures.e2e-spec.ts`: T05 (uma réplica fora → 201), T06 (duas fora → 503 `NO_REPLICA_ACK`, `length` igual), T10 (coordenador fora → leituras 200 nas réplicas, `POST` numa réplica → 503 `NOT_COORDINATOR`)

**Checkpoint**: escritas só confirmam com maioria; leituras em qualquer nó.

---

## Fase 4: US3 — Recuperação da réplica (P1)

- [ ] T027 [US3] `SyncService`: `GAP`, `CONFLICT` e cadeia local inválida → `resync()` → reanexar; `BLOCK_REJECTED` se ainda falhar
- [ ] T028 [US3] `GET /internal/chain` no coordenador (sem mutex; 503 `CHAIN_INVALID` se inválida) e `onApplicationBootstrap` da réplica com `resync()` tolerante a coordenador fora
- [ ] T029 [P] [US3] Unit: `sync.service.spec.ts` (`NEXT`, `ALREADY_EXISTS`, `GAP` → resync, `CONFLICT` → troca pela cadeia mais curta do coordenador, local inválida → resync, remota inválida → `BLOCK_REJECTED`)
- [ ] T030 [US3] Integration: `recovery.spec.ts` (réplica atrasada sincroniza no bootstrap; coordenador fora → mantém a local)
- [ ] T031 [US3] E2E `recovery.e2e-spec.ts` › T07 (fecha R2, 2 escritas, recria R2 → mesmo `lastHash`)

**Checkpoint**: réplica volta e alcança o coordenador.

---

## Fase 5: US4 + US5 — Integridade, status e reinício

- [ ] T032 [US4] `GET /status` (`nodeId`, `role`, `length`, `lastHash`, `integrity`; `INVALID_JSON` quando o arquivo não é JSON) e `CHAIN_INVALID` nas leituras de `/properties*` (Q3)
- [ ] T033 [US4] E2E `reads.e2e-spec.ts` › RF06/RF08 (status nos 3 nós) e `recovery.e2e-spec.ts` › T08 (`tamperBlock` em R1 → `INVALID_HASH`, `invalidIndex 1`; C e R2 válidos)
- [ ] T034 [US5] E2E `recovery.e2e-spec.ts` › T09 (fecha e recria os 3 com os mesmos diretórios → mesma cadeia válida e mesmos imóveis)

**Checkpoint**: todos os cenários da tabela da spec verdes.

---

## Fase 6: Infra, docs e validação

- [ ] T035 `apps/node/Dockerfile`: build com `pnpm --filter "@sd/node..." build`
- [ ] T036 `docker-compose.yml`: `DATA_DIR`, `NODE_REPLICA_URLS`, `ACK_TIMEOUT_MS` e healthcheck em `/health` nos 3 nós
- [ ] T037 [P] `.env.example` com as novas variáveis (comentários em inglês)
- [ ] T038 [P] `README.md`: tabela de rotas e comandos `docker compose stop/start` para T05–T10
- [ ] T039 Validação no notebook: `pnpm test`; `docker compose up --build -d` com 6 serviços `healthy`; `curl` de cadastro no coordenador via `docker compose exec`; parar as 2 réplicas → 503; religar uma → sincroniza
- [ ] T040 Marcar as tarefas e abrir o PR de implementação com a saída do `pnpm test` (contagem por camada)

---

## Dependências entre fases

- Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5 → Fase 6.
- T023 (`cluster.ts`) bloqueia todos os e2e.
- T019 é ampliada em T027 (mesmo arquivo).

## Oportunidades de paralelismo

- T006–T009 e os unit T012–T014 entre si.
- T021 e T029 (unit) em paralelo com o código das suas fases, por usarem só dublês.
- T037 e T038.

## Estratégia de entrega

1. MVP = Fases 1–3: T01, T02, T05, T06 e T10 já demonstráveis.
2. Fase 4 e 5 fecham T07, T08 e T09.
3. Fase 6 deixa o Compose pronto para a demo e o PR com a saída dos testes.
