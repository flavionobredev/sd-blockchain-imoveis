---
theme: default
title: 'SD Blockchain Imóveis'
info: |
  Roteiro de demonstração (spec 006) — esqueleto spec 001.
---

# Cluster HA + Blockchain Imóveis

Trabalho de Sistemas Distribuídos — IFCE Maracanaú

---

## Spec 001 — Esqueleto

- Monorepo pnpm (Nest, Nuxt, Slidev, chain-core)
- Docker Compose: 6 serviços + HAProxy :8080
- Health: `GET /api/health` → `{ "status": "ok" }`

---

## Próximos passos

Specs 002–006: chain-core, nós, web, design, demo T01–T10