# Changelog

Todas as mudanças relevantes do GastroHub são registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado: M01 — Fundação técnica (branch `feat/m01-fundacao-tecnica`)

- **PostgreSQL 18.6 em Docker** como banco oficial de desenvolvimento (`127.0.0.1:5432`), com os bancos `gastrohub` e `gastrohub_test` (ICU `pt-BR`, UTF8, `template0`) e os papéis `gastrohub_owner` (DDL) e `gastrohub_app` (somente DML, sem `CREATE`/`TEMPORARY`, sem SUPERUSER/BYPASSRLS).
- `pnpm env:init`: gera o `.env` com senhas aleatórias, sem exibi-las e sem sobrescrever um `.env` existente sem confirmação. `.env.example` versionado sem valores.
- `pnpm db:validate`: validação somente leitura de ICU, encoding, owner, papéis, privilégios de banco, schema e default privileges.
- Monorepo pnpm 12 (Node 24, TypeScript 6.0 strict) com `@gastrohub/config` (ESLint + Prettier) e `@gastrohub/contracts` (schemas zod).
- Verificação de fronteiras entre módulos com dependency-cruiser.
- **API** NestJS 12 + Fastify (ESM):
  - configuração validada com zod, sem expor valores nos erros;
  - logs pino com redaction e `X-Request-Id` validado;
  - erros em Problem Details (RFC 9457);
  - Helmet e CORS por lista de origens;
  - OpenAPI fora de produção;
  - `GET /health/live` e `GET /health/ready`.
- **Segurança de base:** a API recusa iniciar se o papel de banco de runtime for SUPERUSER ou tiver BYPASSRLS.
- Migrations com Drizzle: baseline sem tabelas, aplicada como `gastrohub_owner`. O script recusa superusuário e bancos de teste sem sufixo `_test`.
- **Web** React 19 + Vite 8 + React Router + TanStack Query + Tailwind 4: página "Status do sistema" com proxy same-site para a API.
- **Testes:**
  - unitários: contracts, API e web;
  - integração da API contra `gastrohub_test`: health, 503, modo produção, recusa de SUPERUSER/BYPASSRLS;
  - segurança do banco: privilégios, DDL negado ao runtime, ausência de tabelas de negócio.
- Dockerfiles de produção para API e web, sem root, e profile `app` do Compose para a stack completa (web em `127.0.0.1:8080`).
- CI no GitHub Actions: formatação, lint, typecheck, testes unitários e de integração com o mesmo compose, build, build das imagens, `pnpm audit` e gitleaks.

### Adicionado: bootstrap

- README, documentação inicial (`docs/00` a `docs/06`), backlog e roadmap modular.
- ADR-001 (monólito modular), ADR-002 (stack), ADR-003 (multi-tenancy) e ADR-004 (autenticação).
- Templates de especificação de módulo e de ADR.
- Especificação do M01 (`docs/modules/M01-fundacao-tecnica.md`).
- Arquivos de higiene do repositório: `.gitignore`, `.gitattributes` e `.editorconfig`.
- Scripts do PostgreSQL nativo: `infra/database/00-recreate-database-icu.sql` e `01-roles.sql`.

### Alterado

- ADR-001 a ADR-004 **aceitos** pelo responsável do projeto (2026-10-01). O ADR-002 recebeu o registro das versões fixadas no M01, e o banco `gastrohub_test` substituiu o Testcontainers.
- Decisão: banco com collation ICU `pt-BR`, UTF8 e `template0`.
- Decisão: o banco oficial de desenvolvimento é o PostgreSQL 18 em Docker na porta 5432 (opção B). O serviço nativo `postgresql-x64-18` foi parado e colocado em início manual, sem desinstalação, como fallback.
- Ferramentas instaladas: Git, Node.js 24 LTS, pnpm (Corepack), Docker Desktop e WSL2.
- O script `01-roles.sql` (PostgreSQL nativo) deixou de conceder `TEMPORARY` ao runtime. A alteração **não** foi reaplicada ao banco nativo, que está desativado.
