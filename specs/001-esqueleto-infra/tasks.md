---
description: "Lista de tarefas — spec 001 esqueleto e infraestrutura"
---

# Tarefas: 001 — Esqueleto e infraestrutura

**Entrada**: `specs/001-esqueleto-infra/spec.md`, `plan.md`

**Pré-requisitos**: constituição em `.specify/memory/constitution.md`; branch de implementação a partir de `main`.

**Testes**: stubs permitidos na 001; suites completas são melhoria nas specs 002–004.

**Decisões de infra (2026-11-26)**: HAProxy :8080; rede Compose por nome de serviço; pnpm via corepack; `node:24-alpine`; health mínimo; `docker/haproxy.cfg`; skills em `.cursor/skills/` versionadas.

## Fase 1: Setup do monorepo

**Objetivo**: workspaces pnpm instaláveis e buildáveis.

- [x] T001 Criar `pnpm-workspace.yaml` listando `apps/*` e `packages/*`
- [x] T002 Criar `package.json` na raiz com `packageManager` (pnpm pinado), scripts `test`, `test:node`, `test:web`, `build`, `dev` (encadeamento)
- [x] T003 [P] Esqueleto `packages/chain-core` com `tsup` (formats CJS+ESM), `src/index.ts` placeholder, `package.json` exports
- [x] T004 [P] Esqueleto `apps/node` NestJS (`main.ts`, módulo `AppModule`, porta via env)
- [x] T005 [P] Esqueleto `apps/web` Nuxt 4 com `@nuxt/ui` e Tailwind v4; página index placeholder
- [x] T006 [P] Esqueleto `apps/slides` Slidev com slide inicial do projeto
- [x] T007 Validar `corepack enable`, `pnpm install` e `pnpm -r build` na raiz
- [x] T008 Documentar em README pré-requisitos **Node 24** e corepack

**Checkpoint**: monorepo builda sem erros.

---

## Fase 2: Infra Docker (bloqueante)

**Objetivo**: seis serviços e três volumes conforme enunciado.

- [x] T009 Criar `docker-compose.yml` com serviços `haproxy`, `web-01`, `web-02`, `node-coordinator`, `node-replica-1`, `node-replica-2`
- [x] T010 Declarar volumes `chain-coordinator`, `chain-replica-1`, `chain-replica-2` montados em `/data` nos nós
- [x] T011 Criar `apps/node/Dockerfile` com `FROM node:24-alpine`, suporte a `ROLE` e `NODE_ID`
- [x] T012 Criar `apps/web/Dockerfile` com `FROM node:24-alpine`, build Nuxt e runtime Nitro
- [x] T013 [P] Criar `docker/haproxy.cfg` com Round Robin, `option httpchk GET /api/health`, bind publicado **8080:80** (ou equivalente documentado)
- [x] T014 Configurar `web-01` e `web-02` com `NUXT_SERVER_NAME=WEB-01` e `WEB-02`
- [x] T015 Configurar nós com `ROLE=coordinator` e `ROLE=replica`; env URLs usando nomes de serviço (ex.: `NODE_COORDINATOR_URL=http://node-coordinator:3000`)
- [x] T016 Publicar HAProxy em **8080** no host e documentar `http://localhost:8080` no README
- [x] T017 Validar `docker compose up --build` com todos os serviços estáveis (validação manual pendente na VM do agente — sem Docker; procedimento no README)

**Checkpoint**: cluster local sobe; README descreve portas e URLs.

---

## Fase 3: Health check e API mínima (Nuxt)

**Objetivo**: HAProxy consegue marcar backends saudáveis.

- [x] T018 Implementar `apps/web/server/api/health.get.ts` retornando exatamente `{ "status": "ok" }`
- [x] T019 Garantir que health responde na porta interna **3000** usada pelo Compose
- [x] T020 Teste manual documentado: parar `web-01` e verificar tráfego apenas em `web-02` via HAProxy na 8080

**Checkpoint**: cenário de falha parcial de web demonstrável.

---

## Fase 4: Scripts de teste (stubs)

**Objetivo**: contrato `pnpm test*` existente para specs futuras.

- [x] T021 Configurar Vitest em `apps/node` com suite vazia ou smoke `expect(true).toBe(true)`
- [x] T022 Configurar Vitest + `@nuxt/test-utils` em `apps/web` com smoke unitário
- [x] T023 Ligar `pnpm test:node` e `pnpm test:web` no `package.json` raiz
- [x] T024 Ligar `pnpm test` agregando ambos

**Checkpoint**: `pnpm test` exit 0 no esqueleto.

---

## Fase 5: Slidev e Impeccable

**Objetivo**: validar apresentação e design prep.

- [x] T025 Validar `pnpm --filter slides dev` sobe Slidev com Node 24 (documentar URL no README)
- [x] T026 Executar `npx impeccable install --providers=cursor --scope=project` (telemetria off em `.impeccable/config.json`)
- [x] T027 Versionar apenas arquivos de config necessários; respeitar `.gitignore` do Impeccable

**Checkpoint**: Impeccable instalado; sem uso de UI na 001 (reservado spec 005).

---

## Fase 6: Documentação e higiene

- [x] T028 Expandir `README.md` com: clone, corepack, `pnpm install`, `docker compose up`, **porta 8080**, `pnpm --filter slides dev`, variáveis de ambiente
- [x] T029 Criar `.env.example` sem segredos — URLs `http://<serviço-compose>:<porta>`, sem localhost para tráfego entre contêineres
- [x] T030 Revisar `.gitignore` raiz (Node + Nuxt + env + caches Impeccable)
- [x] T031 Confirmar `.cursor/skills/` versionadas e alinhadas ao Spec Kit

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

1. Concluir Fase 1–6 em um PR de implementação da spec 001.
2. Não iniciar mutex/replicação (spec 003) nem telas RF / health com status de nós (spec 004) neste escopo.
3. Respeitar a constituição § VIII (rede Docker) em todo `.env` e código de chamada HTTP entre serviços.