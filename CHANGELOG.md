# Changelog

Todas as mudanças relevantes do GastroHub são registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado

- Bootstrap do projeto: README, documentação inicial (`docs/00` a `docs/06`), backlog e roadmap modular.
- ADR-001 (monólito modular), ADR-002 (stack), ADR-003 (multi-tenancy) e ADR-004 (autenticação), todos com status **Proposto**.
- Template de especificação de módulo em `docs/modules/`.
- Especificação do M01 — Fundação técnica (`docs/modules/M01-fundacao-tecnica.md`), em rascunho e aguardando aprovação. Ainda não implementada.
- Arquivos de higiene do repositório: `.gitignore`, `.gitattributes` e `.editorconfig`.
- Scripts `infra/database/00-recreate-database-icu.sql` (opcional) e `01-roles.sql` (papéis `gastrohub_owner` / `gastrohub_app`).

### Alterado

- Ambiente local passa a usar PostgreSQL 18.6 nativo em `localhost:5432` (banco `gastrohub`), e os testes locais usarão o banco `gastrohub_test`.
- Decisão: banco `gastrohub` recriado com ICU `pt-BR`, UTF8 e `template0`. Adicionado `infra/database/99-validate.sql`.
- Node.js 24 LTS e Docker Desktop instalados.
- Decisão: o banco oficial de desenvolvimento será o PostgreSQL 18 em Docker na porta 5432 (opção B). O serviço nativo será desativado, sem desinstalação, no M01.
