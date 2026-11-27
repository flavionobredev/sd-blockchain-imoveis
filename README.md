# Cluster de Alta Disponibilidade com Armazenamento em Blockchain

Trabalho individual de Sistemas Distribuídos (IFCE Maracanaú): registro de propriedade de imóveis e histórico de transferências em uma blockchain simplificada, com cluster Docker de alta disponibilidade.

Specs implementadas: **001** (esqueleto do monorepo e infraestrutura local) e **002** (`chain-core`, a blockchain simplificada). Nós com replicação e telas chegam nas specs 003 e 004.

## Pré-requisitos

- **Docker** e **Docker Compose** v2
- **Node.js 24** (dev e containers usam `node:24-alpine`)
- **pnpm** via [Corepack](https://nodejs.org/api/corepack.html) (versão pinada no `packageManager` da raiz)

```bash
corepack enable
corepack prepare pnpm@10.33.4 --activate
```

## Estrutura do monorepo

| Pacote | Caminho | Descrição |
|--------|---------|-----------|
| API / nós | `apps/node` | NestJS (coordenador e réplicas) |
| Web | `apps/web` | Nuxt 4 SSR, `@nuxt/ui`, Tailwind v4 |
| Slides | `apps/slides` | Slidev |
| Lib | `packages/chain-core` | Blockchain simplificada (spec 002): bloco SHA-256 com gênese fixa, `validateChain`, `deriveState`, regras de negócio, `proposeBlock`, serialização JSON e recuperação (`detectGap`, `appendBlock`, `canReplaceChain`) |

## Instalação

```bash
git clone <url-do-repositorio>
cd sd-blockchain-imoveis
corepack enable
pnpm install
pnpm -r build
```

## Cluster Docker (6 serviços)

Na raiz do repositório:

```bash
docker compose up --build
```

### Serviços

| Serviço | Função |
|---------|--------|
| `haproxy` | Balanceador Round Robin, porta **8080** no host |
| `web-01` / `web-02` | Duas instâncias Nuxt (`NUXT_SERVER_NAME=WEB-01` / `WEB-02`) |
| `node-coordinator` | Nó Nest com `ROLE=coordinator` |
| `node-replica-1` / `node-replica-2` | Réplicas com volumes `chain-replica-*` |

### Volumes

Três volumes nomeados (`chain-coordinator`, `chain-replica-1`, `chain-replica-2`) montados em `/data` nos nós para futuros arquivos `chain.json`.

### URLs

- **Entrada HTTP (usuário):** [http://localhost:8080](http://localhost:8080)
- **Health check:** `GET http://localhost:8080/api/health` → corpo `{ "status": "ok" }`; cabeçalho `X-Served-By` indica `WEB-01` ou `WEB-02` (Round Robin entre backends saudáveis).
- **Comunicação interna:** somente nomes de serviço do Compose (ex.: `http://node-coordinator:3000`), nunca `localhost` entre contêineres.

Configuração do HAProxy: `docker/haproxy.cfg`.

### Teste manual de failover (web)

1. Com o cluster no ar, confira o cabeçalho `X-Served-By` alternando entre requisições:

   ```bash
   curl -s -D - -o /dev/null http://localhost:8080/api/health | grep -i x-served-by
   ```

2. Pare apenas `web-01`:

   ```bash
   docker compose stop web-01
   ```

3. Repita o `curl`; o tráfego deve ir apenas para `WEB-02` até `web-01` voltar.

## Desenvolvimento por pacote

```bash
pnpm --filter @sd/node dev
pnpm --filter @sd/web dev
pnpm --filter @sd/slides dev    # Slidev em http://localhost:3030/
```

## Testes

```bash
pnpm test          # agrega test:core + test:node + test:web
pnpm test:core     # testes unitários da chain-core
pnpm test:node
pnpm test:web
```

A `chain-core` tem testes unitários (spec 002); os e2e dos nós chegam na spec 003. Node e web ainda têm só smokes.

## Variáveis de ambiente

Copie `.env.example` para `.env` apenas para desenvolvimento local (não commitar). URLs entre contêineres usam **nomes de serviço** do Compose.

## Impeccable (design — spec 005)

Instalado na spec 001 com `npx impeccable install --providers=cursor --scope=project`. Telemetria desabilitada em `.impeccable/config.json` (`"telemetry": false`). Skills em `.cursor/skills/impeccable/`.

## Spec Kit

Documentação de specs em `specs/`; constituição em `.specify/memory/constitution.md`; skills Cursor em `.cursor/skills/speckit-*`.