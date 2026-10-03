# Changelog

Todas as mudanças relevantes do GastroHub são registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado: M03 — Empresas e Filiais (branch `feat/m03-empresas-filiais`)

- **Módulo `organization`**:
  - tabelas `companies`, `branches` e `memberships` (vínculo mínimo, sem papéis), criadas pela migration `0002_tenancy`;
  - CNPJ numérico e **alfanumérico** com DV validado na aplicação;
  - filial com fuso IANA, virada do dia operacional (padrão 04:00) e endereço estruturado;
  - status em vez de exclusão (o runtime não tem `DELETE`).
- **Row-Level Security** (ADR-003): `ENABLE` + `FORCE` nas três tabelas; políticas por `app.company_id` e, para o seletor, por `app.user_id`; escrita só na empresa do contexto. As políticas usam `NULLIF` para funcionar em conexões reaproveitadas.
- **`TenantDb`** (`shared/tenancy`): transação com `app.company_id`/`app.user_id` via `set_config(..., true)`. Uma regra de fronteira nova impede módulos de negócio de usar o pool diretamente.
- **Empresa ativa na sessão** (`sessions.active_company_id`):
  - seleção automática no login quando há um único vínculo;
  - troca com rotação de token e CSRF (`company_switched`);
  - revalidação do vínculo e do status da empresa a cada requisição de tenant (`TenantGuard`, `@RequiresCompany()`).
  - O `identity` declara a porta `ACTIVE_COMPANY_PORT`, e o `organization` a implementa, sem dependência invertida.
- **Endpoints**: `GET /api/v1/companies`, `POST /api/v1/session/active-company`, `GET /api/v1/company`, `GET /api/v1/branches`; `activeCompany` em `GET /api/v1/auth/session` e no login. Códigos novos: `active_company_required`, `company_access_revoked`, `company_not_found`.
- **CLI operacional** (`pnpm company:create`, `company:suspend`, `company:activate`, `branch:create`, `member:add`, `member:remove`), com eventos nos logs da aplicação (D12; sem `audit_logs`, que vêm no M04).
- **Web**:
  - seletor `/selecionar-empresa`, com o estado "sem empresa";
  - empresa ativa no cabeçalho, com "Trocar empresa" quando há 2 ou mais;
  - página `/empresa` somente leitura (CNPJ formatado e filiais);
  - um 403 `company_access_revoked` volta ao seletor com aviso, e a troca de empresa descarta do cache os dados da empresa anterior.
- **Testes**: isolamento no banco para as três tabelas (A/B, escrita recusada, sem contexto, contexto de usuário, `FORCE`, sem `DELETE`), `TenantDb`, API (inclusive isolamento via HTTP), CLI, CNPJ e regras de filial, e fluxos da web.

### Adicionado: M02 — Autenticação (branch `feat/m02-autenticacao`)

- **Módulo `identity`**:
  - tabelas `users`, `sessions` e `auth_events`, criadas pela migration `0001_identity_auth` (como `gastrohub_owner`);
  - o runtime não tem `DELETE` em `users`/`sessions`, e `auth_events` é append-only.
- **Sessões opacas**:
  - token de 256 bits, com só o SHA-256 no banco;
  - cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, sem `Domain`, `__Host-gh_session` com `Secure` fora de desenvolvimento;
  - expiração por inatividade (12 h) e absoluta (7 dias);
  - revogação, rotação no login e na troca de senha, limite de 20 sessões.
- **Argon2id** (`m=19456, t=2, p=1`) com rehash e limite de concorrência. Política de senha com lista SecLists 10k (MIT).
- **Endpoints `/api/v1/auth`**: login, logout, sessão atual, troca de senha, sessões (listar, encerrar uma, encerrar as outras). Erros em Problem Details com o membro `code`.
- **Guard global de autenticação**, que nega por padrão (`@Public()` para rotas públicas). CSRF em três camadas: origem, JSON obrigatório e token sincronizador.
- **Rate limiting** por conta + IP, conta e IP (no PostgreSQL), mais 300 req/min global:
  - bloqueio por conta indistinguível de credenciais inválidas;
  - isenção por IP confiável contra lockout.
- **CLI operacional** (`pnpm user:create`, `user:set-password`, `user:disable`, `user:enable`, `seed:dev`): senhas só por TTY sem eco ou `--password-stdin`.
- **Web**: `/login`, rotas protegidas, sessão expirada/revogada, logout, `/conta/senha`, `/conta/sessoes`. O status foi para `/status`.
- **Configuração**: `AUTH_SECRET`, `SESSION_IDLE_TTL_MINUTES`, `SESSION_ABSOLUTE_TTL_HOURS`, `SESSION_COOKIE_SECURE`, `TRUST_PROXY`; `pnpm env:init -- --add-missing`.
- **Testes**: unitários (API, contracts, web) e de integração (login, sessões, CSRF, rate limiting, lockout, troca de senha, segredos fora do banco e dos logs, eventos, CLI, privilégios do banco).

### Alterado: M02

- Recuperação de senha por e-mail, verificação de e-mail e infraestrutura de e-mail saem do M02 (D1) e vão para depois do M04.
- Os parsers de corpo do Nest foram desligados: só JSON é aceito (formulários e `text/plain` recebem 415).

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
