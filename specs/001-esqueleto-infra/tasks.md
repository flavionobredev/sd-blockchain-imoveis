---
description: "Lista de tarefas — spec 001 esqueleto e infraestrutura"
---

# Tarefas: 001 — Esqueleto e infraestrutura

**Entrada**: `specs/001-esqueleto-infra/spec.md`, `plan.md`

**Pré-requisitos**: constituição em `.specify/memory/constitution.md`; branch de implementação a partir de `main`.

**Testes**: stubs permitidos na 001; suites completas são melhoria nas specs 002–004.

## Fase 1: Setup do monorepo

**Objetivo**: workspaces pnpm instaláveis e buildáveis.

- [ ] T001 Criar `pnpm-workspace.yaml` listando `apps/*` e `packages/*`
- [ ] T002 Criar `package.json` na raiz com scripts `test`, `test:node`, `test:web`, `build`, `dev` (encadeamento)
- [ ] T003 [P] Esqueleto `packages/chain-core` com `tsup` (formats CJS+ESM), `src/index.ts` placeholder, `package.json` exports
- [ ] T004 [P] Esqueleto `apps/node` NestJS (`main.ts`, módulo `AppModule`, porta via env)
- [ ] T005 [P] Esqueleto `apps/web` Nuxt 4 com `@nuxt/ui` e Tailwind v4; página index placeholder
- [ ] T006 [P] Esqueleto `apps/slides` Slidev com slide inicial do projeto
- [ ] T007 Validar `pnpm install` e `pnpm -r build` na raiz
- [ ] T008 Documentar em README pré-requisitos Node ≥ 22.12 para Slidev

**Checkpoint**: monorepo builda sem erros.

---

## Fase 2: Infra Docker (bloqueante)

**Objetivo**: seis serviços e três volumes conforme enunciado.

- [ ] T009 Criar `docker-compose.yml` com serviços `haproxy`, `web-01`, `web-02`, `node-coordinator`, `node-replica-1`, `node-replica-2`
- [ ] T010 Declarar volumes `chain-coordinator`, `chain-replica-1`, `chain-replica-2` montados em `/data` nos nós
- [ ] T011 Criar `apps/node/Dockerfile` (build + runtime) com suporte a `ROLE` e `NODE_ID`
- [ ] T012 Criar `apps/web/Dockerfile` com build Nuxt e runtime Nitro
- [ ] T013 [P] Arquivo `docker/haproxy.cfg` (ou caminho acordado) com Round Robin e `option httpchk GET /api/health`
- [ ] T014 Configurar `web-01` e `web-02` com `NUXT_SERVER_NAME=WEB-01` e `WEB-02`
- [ ] T015 Configurar nós com `ROLE=coordinator` e `ROLE=replica` respectivamente
- [ ] T016 [NEEDS CLARIFICATION] Definir porta publicada do HAProxy no host e documentar no README
- [ ] T017 Validar `docker compose up --build` com todos os serviços estáveis

**Checkpoint**: cluster local sobe; README descreve portas e URLs.

---

## Fase 3: Health check e API mínima (Nuxt)

**Objetivo**: HAProxy consegue marcar backends saudáveis.

- [ ] T018 Implementar `apps/web/server/api/health.get.ts` retornando JSON (conteúdo mínimo — ver FR-014-S na spec)
- [ ] T019 Garantir que health responde na porta interna usada pelo Compose (ex.: 3000)
- [ ] T020 Teste manual documentado: parar `web-01` e verificar tráfego apenas em `web-02` via HAProxy

**Checkpoint**: cenário de falha parcial de web demonstrável.

---

## Fase 4: Scripts de teste (stubs)

**Objetivo**: contrato `pnpm test*` existente para specs futuras.

- [ ] T021 Configurar Vitest em `apps/node` com suite vazia ou smoke `expect(true).toBe(true)`
- [ ] T022 Configurar Vitest + `@nuxt/test-utils` em `apps/web` com smoke unitário
- [ ] T023 Ligar `pnpm test:node` e `pnpm test:web` no `package.json` raiz
- [ ] T024 Ligar `pnpm test` agregando ambos

**Checkpoint**: `pnpm test` exit 0 no esqueleto.

---

## Fase 5: Slidev e Impeccable

**Objetivo**: validar apresentação e design prep.

- [ ] T025 Validar `pnpm --filter slides dev` sobe Slidev (documentar URL no README)
- [ ] T026 Executar `npx impeccable install --providers=cursor --scope=project` (telemetria off em `.impeccable/config.json`)
- [ ] T027 Versionar apenas arquivos de config necessários; respeitar `.gitignore` do Impeccable

**Checkpoint**: Impeccable instalado; sem uso de UI na 001 (reservado spec 005).

---

## Fase 6: Documentação e higiene

- [ ] T028 Expandir `README.md` com: clone, `pnpm install`, `docker compose up`, portas, `pnpm --filter slides dev`, variáveis de ambiente
- [ ] T029 Criar `.env.example` sem segredos (URLs internas Docker, nomes de servidor)
- [ ] T030 Revisar `.gitignore` raiz (Node + Nuxt + env + caches Impeccable)
- [ ] T031 Atualizar `specs/001-esqueleto-infra/spec.md` removendo `[NEEDS CLARIFICATION]` conforme decisões do Flávio

**Checkpoint**: professor consegue subir o projeto só pelo README.

---

## Dependências entre fases

```text
Fase 1 → Fase 2 → Fase 3
              ↘
Fase 1 → Fase 4
Fase 1 → Fase 5 (parcialmente paralelo à 2)
Fases 1–5 → Fase 6
```

## Oportunidades de paralelismo

- T003–T006 podem rodar em paralelo após T001–T002.
- T011 e T012 em paralelo.
- T021 e T022 em paralelo após esqueletos web/node.

## Estratégia de entrega

1. Concluir Fase 1 e abrir PR intermediário **somente** se o time precisar; preferência: um PR 001 completo.
2. Não iniciar mutex/replicação (spec 003) nem telas RF (spec 004) neste escopo.
3. Registrar no PR quaisquer `[NEEDS CLARIFICATION]` ainda abertos.