# Plano de implementação: 001 — Esqueleto e infraestrutura

**Branch**: `cursor/001-esqueleto-infra-e3f2` | **Data**: 2026-11-26 | **Spec**: [spec.md](./spec.md)

## Resumo

Estabelecer o monorepo pnpm, Dockerfiles e Compose com seis serviços e três volumes, HAProxy com health check, esqueletos executáveis de NestJS, Nuxt 4, Slidev e `chain-core`, scripts de teste na raiz, README operacional e bootstrap Impeccable — **sem** implementar blockchain nem RFs de imóveis.

## Verificação da constituição

| Princípio | Como esta spec atende |
|-----------|------------------------|
| Fidelidade ao enunciado | Compose com 6 contêineres, 3 volumes, HAProxy RR + httpchk; prepara RF07/RF08 sem implementá-los por completo |
| Simplicidade | Um Dockerfile por app; mesma imagem para nós; sem CI/Playwright |
| TypeScript | Todos os pacotes de produto em TS |
| Réplica (2 s) | Apenas variáveis/volumes preparados; lógica na spec 003 |
| Testes (melhoria) | Scripts `pnpm test*` com stubs OK na 001 |
| pt-BR | README e docs de spec em pt-BR |
| Sem segredos | `.env.example` somente; `.gitignore` cobre `.env` |
| Rede Docker | URLs por nome de serviço; HAProxy :8080; `docker/haproxy.cfg` |

**Gate**: aprovado para implementação (decisões de infra registradas em 2026-11-26).

## Contexto técnico

| Item | Valor |
|------|--------|
| Linguagem | TypeScript (Node **24** em dev e containers) |
| Monorepo | pnpm workspaces; `packageManager` + corepack |
| API esqueleto | NestJS em `apps/node` |
| Web esqueleto | Nuxt 4 + `@nuxt/ui` v4 + Tailwind v4 em `apps/web` |
| Slides | Slidev em `apps/slides` |
| Lib compartilhada | `packages/chain-core` — export placeholder + build tsup (CJS/ESM) vazio ou “hello” |
| Armazenamento | Volumes Docker → `/data/chain.json` (arquivo inicial gênesis vazio ou na spec 002) |
| Testes (001) | Vitest configurável; suites mínimas que passam |
| Plataforma alvo | Linux + Docker Compose v2 local |
| Docker base | `node:24-alpine` (todos os Dockerfiles; tag confirmada no Docker Hub) |
| Entrada HTTP | HAProxy **:8080** no host |
| Rede interna | URLs com nomes de serviço Compose (nunca localhost entre contêineres) |
| Health (001) | `GET /api/health` → `{ "status": "ok" }` |
| Restrições | Sem GitHub Actions; sem Playwright |

## Estrutura do repositório (alvo pós-001)

```text
.
├── apps/
│   ├── node/                 # NestJS — ROLE coordinator|replica
│   ├── web/                  # Nuxt 4 SSR — NUXT_SERVER_NAME
│   └── slides/               # Slidev
├── packages/
│   └── chain-core/           # tsup → dist CJS + ESM
├── docker/
│   └── haproxy.cfg           # Round Robin + httpchk; versionado
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json              # scripts test, test:node, test:web
├── .impeccable/
│   └── config.json           # telemetria: false
├── .specify/                 # Spec Kit (já inicializado)
├── specs/
│   └── 001-esqueleto-infra/
└── README.md                 # instruções completas de execução
```

### Documentação desta feature

```text
specs/001-esqueleto-infra/
├── spec.md
├── plan.md                   # este arquivo
└── tasks.md
```

`research.md`, `data-model.md` e `contracts/` ficam **opcionais** na 001 (infra sem domínio).

## Fases de implementação

### Fase A — Monorepo

1. `pnpm-workspace.yaml` incluindo os quatro pacotes.
2. `package.json` raiz com `engines` (Node 24), campo `packageManager` (pnpm pinado) e scripts agregados; README orienta `corepack enable`.
3. Esqueletos: `nest new` adaptado, `nuxi init`, Slidev template mínimo, `chain-core` com `tsup.config.ts`.
4. `pnpm -r build` verde.

### Fase B — Docker

1. Dockerfiles multi-stage para `web` e `node` com `FROM node:24-alpine` (build pnpm + runtime).
2. `docker-compose.yml`:
   - **haproxy**: imagem oficial, monta config, depends_on web apps.
   - **web-01 / web-02**: build `apps/web`, env `NUXT_SERVER_NAME`.
   - **node-coordinator / node-replica-1 / node-replica-2**: build `apps/node`, env `ROLE`, volumes `chain-coordinator`, `chain-replica-1`, `chain-replica-2`.
3. Rede bridge única `sd-net`; aliases DNS estáveis.

### Fase C — Health e proxy

1. `server/api/health.get.ts` (Nuxt Nitro) retornando JSON mínimo.
2. HAProxy (`docker/haproxy.cfg`): front `*:8080` no host, backends `web-01:3000`, `web-02:3000`, check `GET /api/health`.
3. Documentar cabeçalho futuro `X-Served-By` (implementação na 004).

### Fase D — Tooling e design prep

1. `npx impeccable install --providers=cursor --scope=project`.
2. Ajustar `.impeccable/config.json` → telemetria desligada.
3. Vitest configs stub por pacote; scripts raiz encadeando.

### Fase E — Documentação

1. README: pré-requisitos, comandos, mapa de portas, troubleshooting básico.
2. `.env.example` com URLs internas por nome de serviço (ex.: `NODE_COORDINATOR_URL=http://node-coordinator:3000`), `NUXT_SERVER_NAME`, sem localhost entre serviços.

## Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Nuxt 4 / UI v4 ainda em evolução | Pin de versões no `package.json`; build no CI local manual |
| Slidev / toolchain | Alinhar dev e Docker em Node 24; documentar no README |
| HAProxy health falha em SSR lento | `inter`/`fall`/`rise` conservadores no cfg |

## Complexidade

Nenhuma violação intencional da constituição. Monorepo com quatro pacotes é exigido pelo enunciado, não é over-engineering.