# Spec Kit neste repositório

## Inicialização

O [GitHub Spec Kit](https://github.com/github/spec-kit) foi instalado com:

```bash
pip install specify-cli   # ou: uv tool install specify-cli
specify init --here --force --non-interactive
specify integration switch cursor-agent
```

A integração `cursor` direta não consta no catálogo da CLI 1.4.5; a integração equivalente é **`cursor-agent`**, que instala skills em `.cursor/skills/`.

## Artefatos

| Caminho | Função |
|---------|--------|
| `.specify/memory/constitution.md` | Constituição do projeto |
| `.specify/templates/` | Modelos de spec, plan, tasks |
| `.specify/scripts/bash/` | Automação (ex.: `create-new-feature.sh`) |
| `.cursor/skills/speckit-*` | Skills para o Cursor |

## Fluxo sugerido

1. Constituição (já versionada)
2. Nova feature: script `create-new-feature.sh` ou pasta `specs/NNN-nome/`
3. Implementação conforme `tasks.md`

Documentação do usuário em **pt-BR**; comandos Spec Kit permanecem nos nomes upstream (`/speckit-specify`, etc.).