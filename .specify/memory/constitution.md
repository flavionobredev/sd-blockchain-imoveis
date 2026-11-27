# Constituição do Projeto — sd-blockchain-imoveis

**Versão**: 1.2.0 | **Ratificada**: 2026-11-26 | **Última emenda**: 2026-11-26

Documento normativo para todas as specs (`specs/`) e implementações deste repositório. Em caso de conflito, a constituição prevalece sobre conveniência técnica ou preferência estética.

## I. Fidelidade ao enunciado

O sistema deve atender aos requisitos funcionais **RF01–RF08** e suportar os cenários de demonstração **T01–T10** (incluindo falhas), conforme o trabalho de Sistemas Distribuídos:

- Seis contêineres no Docker Compose: HAProxy (Round Robin + health check), duas apps web idênticas (WEB-01, WEB-02), três nós de blockchain (1 coordenador + 2 réplicas).
- Cadeia em arquivos JSON em volumes persistentes, hashing SHA-256.
- Confirmação de bloco somente após persistência no coordenador **e** ack de pelo menos uma réplica (até 2 s).

Funcionalidades ou arquiteturas que não estejam no enunciado só entram se forem estritamente necessárias para cumprir um RF explícito.

## II. Simplicidade

- Priorizar soluções diretas e demonstráveis em ambiente local (Docker Compose).
- Não adotar tecnologias, padrões ou designs sofisticados que o enunciado não exige; o professor **não** concede nota extra por sofisticação.
- Uma imagem Docker para os nós (`ROLE=coordinator|replica`), biblioteca compartilhada `chain-core`, e o mínimo de acoplamento entre pacotes.
- YAGNI: nada de CI (GitHub Actions), Playwright, hospedagem em nuvem ou microsserviços além do que o cluster pede.

## III. TypeScript como linguagem única de produto

- Código de aplicação em **TypeScript** nos pacotes `apps/node`, `apps/web`, `apps/slides` e `packages/chain-core`.
- `packages/chain-core` expõe build **CJS + ESM** via `tsup`.
- Scripts de automação podem usar shell ou Node, desde que não dupliquem lógica de negócio.

## IV. Confirmação de escrita na blockchain (regra de réplica)

- Escritas serializadas no **coordenador** (mutex; uma escrita por vez).
- Após gravar localmente, o coordenador envia o bloco às réplicas e aguarda **pelo menos um ack** em até **2 segundos**.
- Sem ack suficiente: descartar o bloco pendente e responder **503** ao cliente; a cadeia não avança de forma inconsistente.
- Réplicas recuperam lacunas baixando a cadeia completa, validam e só então substituem o arquivo local.

## V. Testes como melhoria (fluxo principal)

Testes automatizados são **desejáveis**, não bloqueantes para a entrega mínima do enunciado:

- Backend (NestJS): e2e com Vitest + supertest + unplugin-swc, três nós no mesmo processo, pastas temporárias; cobrir RFs e cenários **T01, T02, T05–T10** (sem obsessão por bordas).
- Frontend (Nuxt): apenas testes **unitários** (Vitest + `@nuxt/test-utils`).
- Sem Playwright; execução local via `pnpm test`, `pnpm test:node`, `pnpm test:web`.
- Specs futuras devem declarar explicitamente quando testes fazem parte do escopo.

## VI. Documentação e idioma (pt-BR)

- Toda documentação de specs, planos, tarefas e README em **português brasileiro (pt-BR)**.
- Slides e demo (spec 006) também em pt-BR.
- O código segue o § VII (inglês); só mensagens de erro legíveis e textos exibidos no frontend ficam em pt-BR.

## VII. Código em inglês

- Todo o código MUST estar em **inglês**: nomes de variáveis, funções, classes, tipos, campos de objetos e de JSON (incluindo o `data` dos blocos), valores de enums/uniões (ex.: `REGISTRATION`, `TRANSFER`), códigos de erro (ex.: `DUPLICATE_PROPERTY`), rotas HTTP, env vars, comentários e descrições de testes.
- Ficam em **pt-BR** apenas: o texto legível das mensagens de erro (campo `message`) e tudo o que for exibido no frontend (textos de tela, rótulos, avisos).
- Quando o enunciado usar termos em português (ex.: `imovelId`, `operacao`), a spec registra a correspondência com o identificador em inglês.

## VIII. Rede Docker e descoberta de serviços

- Toda comunicação **entre contêineres** ocorre na rede definida pelo Docker Compose, usando **nomes de serviço** e portas internas (ex.: `http://node-coordinator:3000`, `http://web-01:3000`).
- URLs podem ser expostas via variáveis de ambiente (`NODE_COORDINATOR_URL`, etc.), mas os valores MUST apontar para nomes de serviço do Compose — **nunca** `localhost`, `127.0.0.1` nem IP de host ao rodar dentro do cluster.
- O único ponto de entrada HTTP para o usuário no host é o **HAProxy na porta 8080** (mapeamento publicado no Compose).
- Configuração do HAProxy versionada em `docker/haproxy.cfg`.

## IX. Segurança de repositório — nenhum segredo

- **Proibido** commitar credenciais, tokens, chaves privadas ou `.env` com valores reais.
- Usar `.env.example` com placeholders quando variáveis forem necessárias.
- Dados de demonstração são fictícios; não usar PII real.

## Stack e estrutura acordadas

| Área | Decisão |
|------|---------|
| Monorepo | pnpm workspaces; versão fixada em `packageManager` + **corepack** |
| Runtime / Docker | **Node 24** (`node:24-alpine` em todos os Dockerfiles; tag disponível no Docker Hub) |
| API / nós | `apps/node` — NestJS |
| Web | `apps/web` — Nuxt 4, SSR, `@nuxt/ui` v4, Tailwind v4 |
| Slides | `apps/slides` — Slidev (Node 24) |
| Blockchain | `packages/chain-core` |
| Proxy | HAProxy na porta **8080**, `GET /api/health` → `{ "status": "ok" }` na 001; status dos nós na spec 004 |
| Spec Kit / Cursor | `.specify/` e skills **`.cursor/skills/`** versionadas no repositório |
| Design | Impeccable (spec 001 instala; uso visual na spec 005) |

## Governança

1. Cada funcionalidade segue o ciclo Spec Kit: especificação → plano → tarefas → implementação.
2. Pull requests devem referenciar a spec correspondente e respeitar esta constituição.
3. Emendas à constituição exigem PR dedicado, revisão do Flávio (dono do repositório) e incremento de versão semver neste arquivo.
4. Ambiguidades do enunciado ficam marcadas como `[NEEDS CLARIFICATION]` na spec até decisão registrada.

## Ordem das specs

| Spec | Escopo |
|------|--------|
| 001 | Esqueleto, infra, Docker Compose, scripts de teste, Impeccable install |
| 002 | `chain-core` |
| 003 | Nós NestJS e replicação |
| 004 | Web Nuxt |
| 005 | Design (Impeccable) |
| 006 | Slides e roteiro de demo T01–T10 |

## Histórico de emendas

| Versão | Data | Mudança |
|--------|------|---------|
| 1.1.0 | 2026-11-26 | Ratificação com a spec 000 (PR #1) |
| 1.2.0 | 2026-11-26 | Novo § VII — código em inglês; pt-BR só em `message` de erro, UI e documentação (§ VI ajustado). Pedido do Flávio na revisão do PR #3 |
