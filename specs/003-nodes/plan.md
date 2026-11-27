# Plano de implementação: 003 — Nós NestJS (coordenador e réplicas)

**Branch**: `feat/003-nodes` (a partir de `main`, após aprovação deste PR de docs) | **Data**: 2026-11-27 | **Spec**: [spec.md](./spec.md)

## Resumo

Trocar o esqueleto de `apps/node` por um nó NestJS com dois papéis (`ROLE=coordinator|replica`) na mesma imagem. A cadeia fica em `${DATA_DIR}/chain.json` com escrita atômica, e toda operação relê o disco. O coordenador serializa escritas com um mutex, usa `proposeBlock` da core, replica o bloco e só grava e responde 201 depois do 1º ack (até 2 s); senão, 503. As réplicas anexam blocos com `detectGap`/`appendBlock` e ressincronizam a cadeia completa (`canReplaceChain`) no startup ou em lacuna/conflito. Testes em três camadas (unit, integration, e2e) e Compose com healthcheck em `/health`.

## Verificação da constituição

| Princípio | Como esta spec atende |
|-----------|------------------------|
| I. Fidelidade ao enunciado | RF01–RF06 e RF08 via REST; RD03–RD07; T01, T02, T05–T10 com teste e2e |
| II. Simplicidade | Um `AppModule` com poucos providers; mutex próprio (~15 linhas); `fetch` nativo; validação pela core, sem `class-validator`; sem cache |
| III. TypeScript | `apps/node` em TS, consumindo `@sd/chain-core` (`workspace:*`) |
| IV. Regra de réplica | Mutex, ack de ≥ 1 réplica em 2 s, 503 sem ack, recuperação com cadeia completa validada. **Atenção**: D-W1 grava no coordenador *depois* do ack; a redação da § IV diz "após gravar localmente" → Q1 |
| V. Testes | Declarados no escopo (D-T1): unit + integration + e2e, `pnpm test` roda tudo |
| VI. pt-BR | Docs e `message` dos erros em pt-BR |
| VII. Código em inglês | Rotas, campos, env vars, códigos de erro, nomes de teste em inglês |
| VIII. Rede Docker | `NODE_COORDINATOR_URL` e `NODE_REPLICA_URLS` com nomes de serviço; nada de `localhost` no Compose |
| IX. Sem segredos | Só variáveis de configuração, sem credenciais |

**Gate**: Q1–Q5 respondidas (ou propostas aceitas) antes da implementação.

## Contexto técnico

| Item | Valor |
|------|-------|
| Runtime | Node **24** (`.nvmrc`), `node:24-alpine` |
| Framework | NestJS 11 + `@nestjs/platform-express` (já instalados) |
| HTTP entre nós | `fetch` nativo com `AbortSignal.timeout(ms)` |
| Domínio | `@sd/chain-core` (`proposeBlock`, `validateChain`, `deriveState`, `findProperty`, `detectGap`, `appendBlock`, `canReplaceChain`, `parseChain`, `serializeChain`, `createGenesisBlock`) |
| Persistência | `node:fs/promises`: `writeFile(tmp)` + `rename` |
| Testes | Vitest 3 com `test.projects` (unit, integration, e2e), `unplugin-swc`, `@nestjs/testing`, `supertest` (nova devDependency) |
| Escala | Dezenas de blocos; reler o arquivo a cada requisição é aceitável |
| Restrições | Sem CI; sem banco; sem libs de mutex/retry |

## Projeto técnico

### Configuração (`src/config/node-config.ts`)

```ts
export type NodeRole = 'coordinator' | 'replica';
export interface NodeConfig {
  role: NodeRole;
  nodeId: string;
  port: number;            // PORT, padrão 3000
  dataDir: string;         // DATA_DIR, padrão /data
  coordinatorUrl?: string; // NODE_COORDINATOR_URL (obrigatória na réplica)
  replicaUrls: string[];   // NODE_REPLICA_URLS, separada por vírgula (obrigatória no coordenador)
  ackTimeoutMs: number;    // ACK_TIMEOUT_MS, padrão 2000
}
export function loadNodeConfig(env: NodeJS.ProcessEnv): NodeConfig; // lança erro claro se faltar algo
```

`createNodeApp(config)` (`src/bootstrap.ts`) monta o app a partir de um `NodeConfig` explícito. O `main.ts` chama `createNodeApp(loadNodeConfig(process.env))`; os testes chamam com portas e diretórios temporários. É isso que permite subir os 3 nós num processo.

### Componentes

| Provider / controller | Papel | Responsabilidade |
|-----------------------|-------|------------------|
| `ChainRepository` | todos | `read()` → `parseChain` do arquivo (cria a gênese se não existir); `write(chain)` atômico (`chain.json.tmp` + `rename`) |
| `ChainService` | todos | `loadValidState()` (`validateChain` + `deriveState`, ou `ApiError CHAIN_INVALID`); `status()` relendo o disco |
| `Mutex` | todos | `runExclusive(fn)`: fila de promessas; libera mesmo com erro |
| `WriteService` | coordenador | `register(op)` / `transfer(id, op)`: mutex → ler → validar → `proposeBlock` → `ReplicationService.broadcast` → gravar → `{ block, property }` |
| `ReplicationService` | coordenador | envia o bloco a cada réplica em paralelo e resolve no 1º ack ou após `ackTimeoutMs`; o resto segue em segundo plano |
| `ReplicaClient` / `CoordinatorClient` | ambos | interfaces injetáveis (token) com implementação HTTP; nos testes de integração viram dublês em memória |
| `SyncService` | réplica | `receiveBlock(block)` (sob mutex; `detectGap` → append / ressincronizar); `resync()`; `onApplicationBootstrap` → `resync()` com timeout |
| `PropertiesController` | todos | `GET/POST /properties`, `GET /properties/:propertyId`, `POST /properties/:propertyId/transfers` (POST só no coordenador) |
| `BlocksController` | todos | `GET /blocks` |
| `InternalController` | ambos | `POST /internal/blocks` (réplica), `GET /internal/chain` (coordenador) |
| `StatusController` | todos | `GET /status`, `GET /health` |
| `ApiExceptionFilter` | todos | converte `ApiError`, `OperationError` da core, JSON malformado e erros inesperados em `{ code, message }` |
| `NodeIdInterceptor` | todos | header `X-Node-Id` |

Guarda de papel: um helper `assertRole(config, 'coordinator')` no início de cada handler restrito, que lança `ApiError('NOT_COORDINATOR' | 'NOT_REPLICA')`. Sem módulos dinâmicos por papel (§ II).

### Escrita (coordenador)

```ts
register(input) => mutex.runExclusive(async () => {
  const chain = await repo.read();
  assertValid(chain);                                       // 503 CHAIN_INVALID
  const proposed = proposeBlock(chain, { operation: 'REGISTRATION', ...input });
  if (!proposed.ok) throw ApiError.fromOperation(proposed.error); // 400/404/409/422
  const { acked } = await replication.broadcast(proposed.value);  // 1º ack ou timeout
  if (acked === 0) throw new ApiError('NO_REPLICA_ACK');      // disco intocado (D-W1)
  const next = [...chain, proposed.value];
  await repo.write(next);
  return { block: proposed.value, property: findProperty(deriveState(next).value, id) };
});
```

`broadcast` usa `Promise` própria: cada envio que volta `{ ack: true }` resolve com `acked = 1`; um `setTimeout(ackTimeoutMs)` resolve com `acked = 0`; erros de rede e respostas ≠ 200 só contam como "sem ack". O `fetch` de cada réplica usa `AbortSignal.timeout(ackTimeoutMs)`.

### Réplica

```ts
receiveBlock(block) => mutex.runExclusive(async () => {
  let chain = await repo.read();
  const status = validateChain(chain).valid ? detectGap(chain, block) : 'CONFLICT';
  if (status === 'ALREADY_EXISTS') return ack(chain);
  if (status !== 'NEXT') chain = await resyncLocked();       // GAP, CONFLICT ou local inválida
  if (detectGap(chain, block) === 'ALREADY_EXISTS') return ack(chain);
  const appended = appendBlock(chain, block);
  if (!appended.ok) throw new ApiError('BLOCK_REJECTED', appended.error);
  await repo.write(appended.value);
  return ack(appended.value);
});
```

`resyncLocked()` = `coordinatorClient.getChain()` (timeout 2 s) → `canReplaceChain` → `repo.write`. Se falhar, mantém a local. O `GET /internal/chain` do coordenador **não** usa o mutex (lê o disco, que ainda não tem o bloco pendente), então não há deadlock quando a réplica ressincroniza durante uma escrita.

### Mapeamento de erros

| `code` | HTTP | Origem | `message` (exemplo) |
|--------|------|--------|---------------------|
| `INVALID_DATA` | 400 | core / JSON malformado | "O nome do proprietário é obrigatório" |
| `PROPERTY_NOT_FOUND` | 404 | core | "O imóvel IMV999 não está cadastrado" |
| `DUPLICATE_PROPERTY` | 409 | core | "O imóvel IMV001 já está cadastrado" |
| `SAME_OWNER` | 422 | core | "Maria Silva já é o proprietário atual do imóvel IMV001" |
| `BLOCK_REJECTED` | 422 | réplica | texto do `appendBlock` |
| `NO_REPLICA_ACK` | 503 | coordenador | "Nenhuma réplica confirmou o bloco em 2 s; a escrita não foi confirmada" |
| `NOT_COORDINATOR` | 503 | réplica | "Este nó é uma réplica: escritas só no coordenador" |
| `NOT_REPLICA` | 503 | coordenador | "Este nó é o coordenador e não recebe blocos replicados" |
| `CHAIN_INVALID` | 503 | todos | "A cadeia local deste nó está inválida (bloco 1: INVALID_HASH)" |
| `INTERNAL_ERROR` | 500 | filtro | "Erro interno no nó" |

### Status

`integrity` vem de `validateChain` sobre o arquivo relido. Se `parseChain` lançar `ChainParseError`, `integrity = { valid: false, invalidIndex: null, reason: 'INVALID_JSON', message }` e `length = 0`. `INVALID_JSON` é um motivo do nó (não da core).

## Testes (D-T1)

### Pirâmide

| Camada | O que cobre | Dublês | Tempo-alvo |
|--------|-------------|--------|------------|
| **unit** (~12) | `Mutex`; `loadNodeConfig`; mapeamento `code → HTTP` e `ApiExceptionFilter`; `ReplicationService` com fake timers (ack em 500 ms → 1; réplicas mudas → 0 após 2000 ms; erro de rede = sem ack); `SyncService` com repo e coordenador em memória (`NEXT`, `ALREADY_EXISTS`, `GAP`→resync, `CONFLICT`→troca pela mais curta, local inválida→resync, remota inválida→`BLOCK_REJECTED`) | tudo em memória | < 1 s |
| **integration** (~8) | `ChainRepository` em diretório temporário (gênese criada, escrita atômica sem `.tmp` sobrando, ida e volta, JSON inválido); fluxo de escrita com `TestingModule` do coordenador + 2 `SyncService` reais ligados por um `ReplicaClient` em memória (bloco nos 3 discos; sem ack → disco do coordenador igual); recuperação no `onApplicationBootstrap` de uma réplica desatualizada | rede trocada por chamada direta; disco real | < 3 s |
| **e2e** (~14) | 3 apps Nest reais via `createNodeApp`, cada um numa porta livre e diretório temporário; supertest nas rotas públicas; `fetch` real entre os nós; queda simulada com `app.close()` e volta recriando o app na mesma porta e diretório. Tabela de cenários da spec | nenhum | < 15 s (`ACK_TIMEOUT_MS=300` nos testes) |

### Estrutura

```text
apps/node/
├── vitest.config.ts          # test.projects: unit, integration, e2e (unplugin-swc em todos)
└── test/
    ├── unit/
    │   ├── mutex.spec.ts
    │   ├── node-config.spec.ts
    │   ├── api-error.spec.ts
    │   ├── replication.service.spec.ts
    │   └── sync.service.spec.ts
    ├── integration/
    │   ├── chain.repository.spec.ts
    │   ├── write-flow.spec.ts
    │   └── recovery.spec.ts
    ├── e2e/
    │   ├── writes.e2e-spec.ts
    │   ├── reads.e2e-spec.ts
    │   ├── failures.e2e-spec.ts
    │   └── recovery.e2e-spec.ts
    └── support/
        ├── temp-dir.ts       # mkdtemp + cleanup
        ├── in-memory-clients.ts
        └── cluster.ts        # startCluster(), stopNode(), restartNode(), tamperBlock()
```

O `src/app.spec.ts` de fumaça da 001 é removido.

### Scripts (`apps/node/package.json`)

```json
{
  "test": "vitest run",
  "test:unit": "vitest run --project unit",
  "test:integration": "vitest run --project integration",
  "test:e2e": "vitest run --project e2e"
}
```

O `pnpm test` da raiz já chama `test:node` → `vitest run` (as três camadas). Os e2e rodam com `fileParallelism: false` no projeto `e2e` para não disputar portas.

## Infra

- `apps/node/package.json`: `"@sd/chain-core": "workspace:*"` e `supertest` + `@types/supertest` em dev.
- `apps/node/Dockerfile`: trocar `pnpm --filter @sd/node build` por `pnpm --filter "@sd/node..." build` (compila a core antes) — o `pnpm deploy` leva o `dist` da core.
- `docker-compose.yml`:
  - coordenador: `DATA_DIR: /data`, `NODE_REPLICA_URLS: http://node-replica-1:3000,http://node-replica-2:3000`, `ACK_TIMEOUT_MS: '2000'`;
  - réplicas: `DATA_DIR: /data` (o `NODE_COORDINATOR_URL` já existe);
  - healthcheck dos 3 nós: `http://127.0.0.1:3000/health`;
  - réplicas mantêm o `depends_on: node-coordinator (service_healthy)`, que só afeta a ordem do `up` e ajuda o sync inicial; `docker compose start` de uma réplica com o coordenador parado continua funcionando (R3).
- `.env.example`: `DATA_DIR`, `NODE_REPLICA_URLS`, `ACK_TIMEOUT_MS`.
- `README.md`: tabela de rotas e como simular T05–T10 com `docker compose stop/start`.

## Estrutura do repositório

### Documentação desta feature

```text
specs/003-nodes/
├── spec.md
├── plan.md      # este arquivo
└── tasks.md
```

Sem `contracts/` separado: os contratos estão na spec (Constituição § II).

### Código-fonte (alvo pós-003)

```text
apps/node/src/
├── main.ts
├── bootstrap.ts                 # createNodeApp(config)
├── app.module.ts                # AppModule.forRoot(config)
├── config/node-config.ts
├── common/{mutex,api-error,api-exception.filter,node-id.interceptor,assert-role}.ts
├── chain/{chain.repository,chain.service}.ts
├── properties/{properties.controller,write.service}.ts
├── blocks/blocks.controller.ts
├── replication/{replication.service,sync.service,http-clients}.ts
├── internal/internal.controller.ts
└── status/status.controller.ts
```

Remove `app.controller.ts`, `app.service.ts` e `src/app.spec.ts` do esqueleto.

## Fases de implementação

- **A — Setup e testes**: dependências, `vitest.config.ts` com projetos, scripts, `test/support`.
- **B — Fundação**: config, mutex, erros, interceptor, repositório, `createNodeApp`, `/health`.
- **C — Escrita e replicação (US1, US2)**: `WriteService`, `ReplicationService`, réplica recebendo `NEXT`/`ALREADY_EXISTS`, rotas públicas de escrita e leitura.
- **D — Recuperação (US3)**: `SyncService` completo, `GET /internal/chain`, sync no startup.
- **E — Integridade, status e reinício (US4, US5)**: `/status`, `/blocks`, T08, T09.
- **F — Infra e docs**: Compose, Dockerfile, `.env.example`, README, validação manual no notebook.

## Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| R1 — Réplica confirma depois dos 2 s e fica "à frente" | Previsto: `CONFLICT` na próxima replicação → ressincroniza (D3); teste unit e integration |
| R2 — Porta ocupada ao recriar um nó no e2e | `cluster.ts` reserva as portas no início e recria na mesma; e2e sem paralelismo de arquivos |
| R3 — Réplica sobe com o coordenador fora do ar (T10 + restart) | Sync no startup tem timeout e é refeito no 1º bloco recebido (`GAP`) |
| R4 — `pnpm deploy` sem o `dist` da core | Build com `"@sd/node..."`; checar `docker compose build` na Fase F |
| R5 — Fake timers e `fetch` | `ReplicationService` recebe o `ReplicaClient` injetado; nos unit o cliente é uma promessa controlada, sem `fetch` |

## Complexidade

Sem desvios da constituição além de Q1 (redação da § IV).
