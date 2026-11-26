# Especificação da Feature: 001 — Esqueleto e infraestrutura

**Branch sugerida**: `cursor/001-esqueleto-infra-e3f2`

**Criada em**: 2026-11-26

**Status**: Rascunho

**Entrada**: Monorepo pnpm com quatro pacotes mínimos, Docker Compose (6 serviços, 3 volumes), HAProxy, scripts de teste, instalação Impeccable, validação Slidev e README operacional — sem lógica de negócio de imóveis/blockchain.

## User Scenarios & Testing

### História 1 — Desenvolvedor sobe o cluster local (Prioridade: P1)

Como desenvolvedor (ou professor avaliando), quero subir todos os contêineres com um comando para verificar que o esqueleto de alta disponibilidade está correto antes de implementar RFs.

**Por que esta prioridade**: Sem infraestrutura estável nenhuma outra spec avança.

**Teste independente**: `docker compose up --build` com os seis serviços `healthy` ou `running`, HAProxy expondo a porta agregada e health check atingindo `GET /api/health` nas instâncias web.

**Cenários de aceite**:

1. **Dado** Docker e pnpm instalados, **Quando** executo `pnpm install` e `docker compose up --build`, **Então** sobem `haproxy`, `web-01`, `web-02`, `node-coordinator`, `node-replica-1`, `node-replica-2`.
2. **Dado** o cluster no ar, **Quando** acesso o balanceador, **Então** recebo resposta HTTP da aplicação web (mesmo que página placeholder).
3. **Dado** uma instância web parada, **Quando** o HAProxy faz health check, **Então** o tráfego vai apenas para a instância saudável (Round Robin entre saudáveis).

---

### História 2 — Desenvolvedor valida workspaces e scripts (Prioridade: P1)

Como desenvolvedor, quero instalar dependências uma vez na raiz e rodar `dev`/`build`/`test` por pacote para garantir que o monorepo está configurado.

**Teste independente**: `pnpm install`, `pnpm -r build` (ou equivalente) sem erro nos quatro pacotes; `pnpm --filter slides dev` inicia Slidev; `pnpm test` encadeia scripts mesmo que testes sejam vazios/pass-through na 001.

**Cenários de aceite**:

1. **Dado** o repositório clonado, **Quando** executo `pnpm install`, **Então** workspaces `apps/node`, `apps/web`, `apps/slides`, `packages/chain-core` resolvem dependências.
2. **Quando** executo `pnpm --filter slides dev`, **Então** o servidor de desenvolvimento Slidev escuta em porta documentada no README.
3. **Quando** executo `pnpm test`, `pnpm test:node` e `pnpm test:web`, **Então** os comandos terminam com código 0 (stubs permitidos na 001).

---

### História 3 — Revisor verifica Spec Kit e Impeccable (Prioridade: P2)

Como revisor (Flávio), quero Spec Kit inicializado e Impeccable instalado com telemetria desligada, para specs seguintes e design na 005.

**Teste independente**: existem `.specify/` com constituição e templates; `.impeccable/config.json` com telemetria desabilitada; skills Cursor em `.cursor/skills/`.

**Cenários de aceite**:

1. **Dado** o clone pós-001, **Quando** inspeciono `.specify/memory/constitution.md`, **Então** encontro princípios do projeto em pt-BR.
2. **Quando** inspeciono `.impeccable/config.json`, **Então** telemetria está explicitamente desligada.

---

### Edge Cases

- Falha de build de imagem Docker por versão de Node incompatível com Slidev (≥ 22.12).
- Porta do balanceador já em uso no host.
- Volume Docker sem permissão de escrita em `chain.json`.

## Requisitos funcionais

### Infraestrutura (escopo desta spec)

- **FR-001-S**: O repositório MUST ser monorepo **pnpm** com workspaces `apps/node`, `apps/web`, `apps/slides`, `packages/chain-core`, cada um com `package.json`, script `dev` ou equivalente e capacidade de build mínima.
- **FR-002-S**: `docker-compose.yml` (ou pasta `compose/`) MUST definir **6 serviços**: `haproxy`, `web-01`, `web-02`, `node-coordinator`, `node-replica-1`, `node-replica-2`.
- **FR-003-S**: MUST existir **3 volumes** nomeados para persistir cadeias JSON (coordenador + 2 réplicas) em caminhos montados em `/data` nos nós.
- **FR-004-S**: HAProxy MUST usar balanceamento **Round Robin** e `option httpchk` apontando para `GET /api/health` nas backends web.
- **FR-005-S**: Cada app web MUST receber variável `NUXT_SERVER_NAME` (ex.: `WEB-01`, `WEB-02`) para uso futuro em RF07.
- **FR-006-S**: Cada nó MUST receber `ROLE` (`coordinator` | `replica`) e identificador de réplica; mesma imagem Docker para os três.
- **FR-007-S**: README MUST documentar pré-requisitos (Docker, Node, pnpm), `pnpm install`, `docker compose up`, URLs/ports e `pnpm --filter slides dev`.
- **FR-008-S**: Raiz MUST expor scripts `pnpm test`, `pnpm test:node`, `pnpm test:web` (podem delegar a stubs na 001).
- **FR-009-S**: MUST executar `npx impeccable install --providers=cursor --scope=project` e versionar `.impeccable/config.json` com telemetria desligada.

### Fora de escopo (specs posteriores)

- RF01–RF08 de negócio (specs 002–004).
- Mutex, replicação com ack 2 s, telas Imóveis/Blockchain/Cluster (003–004).
- Testes e2e completos e cenários T01–T10 (melhoria contínua; base de scripts na 001).

### Ambiguidades

- **FR-010-S**: Porta exposta do HAProxy no host MUST ser [NEEDS CLARIFICATION: 8080, 80 ou outra porta padrão da turma?].
- **FR-011-S**: Rede interna entre nós e web MUST usar hostnames [NEEDS CLARIFICATION: nomes exatos dos serviços Compose vs. variáveis `NODE_COORDINATOR_URL` documentadas no README].
- **FR-012-S**: Versão mínima de **pnpm** e política de `packageManager` no root [NEEDS CLARIFICATION: pinar 9.x via corepack?].
- **FR-013-S**: Imagem base Node para Dockerfiles [NEEDS CLARIFICATION: `node:22-alpine` única para todos ou imagens distintas para Nest vs. Nuxt?].
- **FR-014-S**: Conteúdo mínimo de `GET /api/health` na 001 [NEEDS CLARIFICATION: JSON `{ "status":"ok" }` vs. já incluir status dos nós (RF08)].
- **FR-015-S**: HAProxy config em arquivo versionado `haproxy/haproxy.cfg` vs. montagem por env [NEEDS CLARIFICATION].

### Entidades (preparação; sem modelo de domínio ainda)

- **VolumeChain**: arquivo `chain.json` por nó.
- **ServicoWeb**: instância Nuxt com nome `WEB-0X`.
- **ServicoNo**: instância Nest com `ROLE` e volume `/data`.

## Critérios de sucesso

- **SC-001**: Em máquina limpa com Docker, cluster sobe em menos de 10 minutos seguindo só o README (build inicial incluído).
- **SC-002**: `pnpm install` e `pnpm -r build` completam sem erro.
- **SC-003**: `pnpm --filter slides dev` inicia sem erro de engine Node.
- **SC-004**: Health check do HAProxy marca backend como down quando `web-01` está parado (demonstrável manualmente).
- **SC-005**: Nenhum arquivo com segredo no repositório; `.env` no `.gitignore`.

## Pressupostos

- Hospedagem apenas local; sem secrets de registry privado.
- Git branch padrão de entrega: `main`; trabalho em branches `cursor/<nome>-e3f2`.
- Spec Kit instalado com integração **cursor-agent** (CLI `specify-cli`); skills em `.cursor/skills/`.
- Documentação 100% pt-BR.