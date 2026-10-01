# M01 — Fundação Técnica

- Status: **Rascunho, aguardando aprovação do responsável**
- Data: 2026-10-01
- Dependências: nenhuma (primeiro módulo)
- ADRs: [ADR-001](../decisions/ADR-001-monolito-modular.md), [ADR-002](../decisions/ADR-002-stack.md), [ADR-003](../decisions/ADR-003-multi-tenancy.md)

## 1. Objetivo

Entregar o **esqueleto técnico executável** do GastroHub: monorepo, API e frontend vazios, PostgreSQL 18 em Docker, pipeline de migrations, health checks, testes e CI. É sobre essa base que todos os módulos de negócio serão construídos.

Ao final do M01, um desenvolvedor clona o repositório e, com poucos comandos, tem API, web e banco funcionando, com testes e CI verdes, **sem nenhuma regra de negócio**.

## 2. Escopo

### Incluído

| Área | Entrega |
|---|---|
| Monorepo | pnpm workspaces, TypeScript strict, configs compartilhadas |
| API | NestJS (adapter Fastify), config validada com zod, logging pino, `request_id`, Problem Details, Helmet, CORS, health checks |
| Web | React + Vite, uma página "status do sistema" que consome `/health/ready` |
| Contratos | `packages/contracts` com o schema zod da resposta de health (exemplo do padrão) |
| Banco | PostgreSQL 18 via Docker Compose na porta **5432**, ICU `pt-BR`, papéis `gastrohub_owner`/`gastrohub_app`, banco `gastrohub_test` isolado |
| Migrations | Drizzle + drizzle-kit, migration baseline **sem tabelas de negócio** |
| Segurança de base | A API **recusa iniciar** se o usuário do banco for superusuário ou tiver `BYPASSRLS` |
| Testes | Vitest (unit), Vitest + Supertest (integração contra `gastrohub_test`), Testing Library (web) |
| Qualidade | ESLint, Prettier, typecheck, verificação de fronteiras entre módulos |
| CI | GitHub Actions: lint, typecheck, testes, build, varredura de segredos |
| Docker de app | Dockerfiles de `api` e `web` (multi-stage), buildados no CI, executáveis via profile `app` do Compose |
| Ambiente | `.env.example`; script que gera `.env` local com senhas aleatórias |
| Migração do banco local | Desativar o serviço PostgreSQL nativo e passar a usar o container (decisão B) |
| Documentação | README com comandos, atualização de `docs/05-DEPLOY.md` e do CHANGELOG |

### Fora do escopo (backlog ou módulos seguintes)

- Qualquer tabela de negócio: usuários, empresas, filiais, produtos etc.
- Autenticação, sessões, RBAC (M02/M04) e RLS de tenant (M03). O M01 só garante que a conexão **não ignora** RLS.
- Rate limiting (M02, junto do login), auditoria (M04).
- Playwright/e2e, OpenTelemetry, Redis, filas.
- Deploy em cloud (ADR futuro).
- Design system e telas reais.
- Desinstalação do PostgreSQL nativo, que permanece instalado como fallback.

## 3. Estrutura do monorepo

```text
C:\GastroHub
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── modules/
│   │   │   │   └── health/            # único módulo do M01
│   │   │   └── shared/
│   │   │       ├── config/            # schema zod das env vars
│   │   │       ├── database/          # pool, drizzle, verificação de papel
│   │   │       ├── logging/           # pino + request_id
│   │   │       └── http/              # filtro Problem Details
│   │   ├── drizzle/                   # migrations SQL versionadas
│   │   ├── drizzle.config.ts
│   │   ├── test/                      # testes de integração
│   │   └── Dockerfile
│   └── web/
│       ├── src/
│       ├── index.html
│       ├── vite.config.ts             # proxy /api → localhost:3000
│       └── Dockerfile
├── packages/
│   ├── contracts/                     # schemas zod compartilhados
│   └── config/                        # tsconfig base, eslint, prettier
├── infra/
│   └── database/
│       ├── 00-recreate-database-icu.sql   # já existe (uso manual, DESTRUTIVO)
│       ├── 01-roles.sql                   # já existe
│       ├── 99-validate.sql                # já existe
│       └── docker-init/                   # init do container (somente criação, sem DROP)
│           ├── 10-databases.sql           # gastrohub e gastrohub_test, ICU pt-BR, template0
│           ├── 20-roles.sh                # papéis + senhas lidas do ambiente
│           └── 30-grants.sql              # privilégios nos dois bancos
├── scripts/
│   └── env-init.mjs                   # gera .env com senhas aleatórias
├── .github/workflows/ci.yml
├── docker-compose.yml
├── .env.example
├── package.json                       # scripts raiz, "packageManager": "pnpm@<versão>"
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## 4. pnpm workspaces

- pnpm ativado via **Corepack** (`corepack enable`), com versão fixada no campo `packageManager`.
- `pnpm-workspace.yaml`: `apps/*`, `packages/*`.
- `pnpm-lock.yaml` versionado. O CI usa `pnpm install --frozen-lockfile`.
- `engines.node` fixado em `>=24 <25` (Node 24 LTS, instalado em 2026-10-01).
- Pacotes internos referenciados por `workspace:*` (`@gastrohub/contracts`, `@gastrohub/config`).
- Scripts raiz (seção 13) delegam para os pacotes com `pnpm -r` / `pnpm --filter`.

## 5. API (NestJS)

- NestJS com **adapter Fastify**.
- Configuração: `shared/config` valida `process.env` com zod no boot. Variável ausente ou inválida faz o processo encerrar com mensagem clara, **sem imprimir valores**.
- Logging: pino em JSON (pino-pretty só em dev), `request_id` por requisição (aceita `X-Request-Id` ou gera um UUIDv7), redaction de `authorization`, `cookie` e `*password*`.
- Erros: filtro global que responde no formato **Problem Details (RFC 9457)**, sem stack trace fora de dev.
- Segurança de base: Helmet; CORS com origens de `CORS_ORIGINS`.
- **Verificação de papel do banco no boot:**
  ```sql
  SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
  ```
  Se qualquer valor for `true`, a API **não inicia**. Isso protege o modelo do ADR-003 contra configuração errada.
- Prefixo global `/api/v1` para rotas de negócio. Health fica fora do prefixo.
- OpenAPI em `/api/docs`, habilitado só fora de produção.

## 6. Web (React + Vite)

- React + Vite + TypeScript strict, React Router e TanStack Query.
- Uma única página, "Status do sistema", que chama `/health/ready` e mostra API e banco como ok ou indisponível. É a prova de que front, API e banco estão integrados.
- O dev server faz proxy de `/api` e `/health` para `http://localhost:3000`, mantendo front e API no mesmo site, como pede o ADR-004 (cookies).
- Tailwind configurado, sem design system (fica para quando houver telas reais).

## 7. PostgreSQL

### Banco oficial de desenvolvimento: container Docker (decisão B, 2026-10-01)

| Item | Valor |
|---|---|
| Imagem | `postgres:18` (tag de minor fixada no compose) |
| Porta | `localhost:5432` |
| Volume | `gastrohub_pgdata` (nomeado) |
| Bancos | `gastrohub` (dev) e `gastrohub_test` (testes) |
| Criação | `template0`, `UTF8`, `LOCALE_PROVIDER icu`, `ICU_LOCALE 'pt-BR'`, `LC_COLLATE/LC_CTYPE 'C'` |
| Owner | `gastrohub_owner` |
| Runtime da API | `gastrohub_app` (`NOSUPERUSER`, `NOBYPASSRLS`, não é dono das tabelas) |
| Superusuário | `postgres`, com senha só no `.env`, usado apenas pelo init do container |

- O banco **não** é criado pela variável `POSTGRES_DB` da imagem, porque ela usaria `template1` e o locale padrão. A criação é feita explicitamente pelos scripts de `infra/database/docker-init/`, que **não contêm DROP**.
- As senhas dos papéis vêm do ambiente (`GASTROHUB_OWNER_PASSWORD`, `GASTROHUB_APP_PASSWORD`) e são aplicadas pelo script de init. Nunca aparecem em arquivos versionados nem em logs.
- `healthcheck` com `pg_isready`.

### Isolamento do `gastrohub_test`

- É um banco separado no mesmo container, com o mesmo modelo de papéis.
- Os testes de integração usam `TEST_DATABASE_URL` e **se recusam a rodar** se o nome do banco não terminar em `_test`. Isso impede apagar o banco de desenvolvimento por engano.
- Cada execução aplica as migrations no `gastrohub_test` e limpa os dados entre suítes.

### Transição do PostgreSQL nativo (executada no início da implementação)

Requer administrador:

```powershell
Stop-Service postgresql-x64-18
Set-Service  postgresql-x64-18 -StartupType Manual   # desativa, sem desinstalar
```

Em seguida, `docker compose up -d postgres` sobe o container na 5432, e o `99-validate.sql` é executado contra ele. O PostgreSQL nativo permanece instalado como fallback (ver seção 12).

## 8. Docker Compose

```text
services:
  postgres   # sempre: banco oficial de desenvolvimento
  api        # profile "app": imagem de produção da API
  web        # profile "app": imagem de produção do web (estático)
```

- `docker compose up -d` sobe **somente o postgres**, que é o fluxo diário. API e web rodam no host com `pnpm dev` (hot reload rápido; bind mounts do Windows para containers são lentos).
- `docker compose --profile app up -d --build` sobe a stack inteira em containers, com paridade com produção.
- Variáveis lidas do `.env`.
- Não entram: Redis, mailpit (M02), observabilidade.

## 9. Drizzle e migrations

- `drizzle-kit` com `drizzle.config.ts` em `apps/api`. Migrations SQL em `apps/api/drizzle/`, revisadas manualmente.
- **Migrations rodam como `gastrohub_owner`** (`DATABASE_MIGRATION_URL`). A API em runtime usa `gastrohub_app` (`DATABASE_URL`).
- Migration **baseline** (`0000_baseline`): não cria tabelas de negócio. Serve para provar o pipeline: aplicação, registro em `drizzle.__drizzle_migrations` e grants automáticos para `gastrohub_app` (via `ALTER DEFAULT PRIVILEGES`).
- Política: somente para frente. Correções viram uma nova migration.
- Scripts: `db:generate`, `db:migrate`, `db:migrate:test`, `db:validate` (executa `99-validate.sql`).

## 10. Health checks

| Rota | Comportamento | Status |
|---|---|---|
| `GET /health/live` | Processo de pé; não toca no banco | 200 `{ "status": "ok" }` |
| `GET /health/ready` | `SELECT 1` com `gastrohub_app` e timeout curto | 200 `{ "status": "ok", "database": "ok" }` ou 503 em Problem Details |

O schema da resposta fica em `packages/contracts` e é usado pela API e pela web.

## 11. Testes

| Tipo | Ferramenta | Cobertura no M01 |
|---|---|---|
| Unit (API) | Vitest | Validação de config (aceita e rejeita), filtro Problem Details |
| Integração (API) | Vitest + Supertest + `gastrohub_test` | `/health/live`, `/health/ready` com banco ok e com banco indisponível (503) |
| Banco | Vitest + `gastrohub_test` | Migrations aplicam do zero; `gastrohub_app` tem `rolsuper=false` e `rolbypassrls=false`; a API recusa subir com superusuário; o banco usa ICU `pt-BR` e UTF8; a guarda do sufixo `_test` funciona |
| Web | Vitest + Testing Library | A página de status renderiza os estados ok e indisponível (API mockada) |

## 12. CI (GitHub Actions)

`.github/workflows/ci.yml`, disparado em push e pull request para `main`:

1. Checkout, setup do Node 24, `corepack enable`, `pnpm install --frozen-lockfile`.
2. `pnpm lint` e `pnpm format:check`.
3. `pnpm typecheck`.
4. `pnpm test` (unit).
5. `docker compose up -d postgres` com um `.env` gerado no CI (senhas aleatórias por execução). É o **mesmo compose** do desenvolvimento, para paridade.
6. `pnpm db:migrate:test` e `pnpm test:integration`.
7. `pnpm build` e `docker compose --profile app build`.
8. Varredura de segredos (gitleaks) e `pnpm audit --audit-level=high`.

Branch `main` protegida (configuração no GitHub, feita pelo responsável): exige o CI verde para merge.

## 13. Variáveis de ambiente

`.env.example` (versionado, sem valores reais):

```text
# Aplicação
NODE_ENV=development
LOG_LEVEL=info
API_PORT=3000
CORS_ORIGINS=http://localhost:5173

# PostgreSQL (container)
POSTGRES_PORT=5432
POSTGRES_PASSWORD=__gerado_por_env_init__
GASTROHUB_OWNER_PASSWORD=__gerado_por_env_init__
GASTROHUB_APP_PASSWORD=__gerado_por_env_init__

# Conexões (montadas pelo env-init com as senhas acima)
DATABASE_URL=postgres://gastrohub_app:<senha>@localhost:5432/gastrohub
DATABASE_MIGRATION_URL=postgres://gastrohub_owner:<senha>@localhost:5432/gastrohub
TEST_DATABASE_URL=postgres://gastrohub_app:<senha>@localhost:5432/gastrohub_test
TEST_DATABASE_MIGRATION_URL=postgres://gastrohub_owner:<senha>@localhost:5432/gastrohub_test
```

`pnpm env:init` cria o `.env` a partir do exemplo, com senhas aleatórias fortes. Ele **não sobrescreve** um `.env` existente e **não imprime** as senhas.

## 14. Comandos locais

```powershell
# uma vez
corepack enable
pnpm install
pnpm env:init                 # gera .env (não versionado)
docker compose up -d          # PostgreSQL 18 em localhost:5432
pnpm db:migrate               # aplica migrations no gastrohub
pnpm db:validate              # confere ICU, encoding, owner e papéis

# dia a dia
pnpm dev                      # API (3000) + web (5173)
pnpm test                     # unit
pnpm test:integration         # integração (gastrohub_test)
pnpm lint
pnpm typecheck
pnpm build

# stack completa em containers
docker compose --profile app up -d --build

# parar / resetar
docker compose stop
docker compose down -v        # APAGA o volume do banco de dev
```

## 15. Critérios de aceite

- [ ] Serviço `postgresql-x64-18` parado e com início **manual**, sem ter sido desinstalado
- [ ] `docker compose up -d` sobe o PostgreSQL 18 em `localhost:5432` com healthcheck saudável
- [ ] `99-validate.sql` no container confirma: ICU, `pt-BR`, UTF8, owner `gastrohub_owner`, `gastrohub_app` sem SUPERUSER e sem BYPASSRLS, 0 tabelas de negócio
- [ ] `gastrohub_test` existe, isolado, e os testes se recusam a rodar contra um banco sem sufixo `_test`
- [ ] `pnpm install`, `pnpm env:init`, `pnpm db:migrate` e `pnpm dev` funcionam em uma máquina limpa seguindo só o README
- [ ] `/health/live` → 200; `/health/ready` → 200 com banco e 503 sem banco
- [ ] A API recusa iniciar conectada como superusuário ou como papel com `BYPASSRLS` (coberto por teste)
- [ ] A página de status da web mostra API e banco ok
- [ ] Lint, typecheck, testes unit e de integração e build passam localmente e no CI
- [ ] `docker compose --profile app up -d --build` sobe API e web em containers
- [ ] Nenhum segredo versionado (gitleaks no CI); `.env` ignorado
- [ ] Nenhuma tabela de negócio criada
- [ ] README, `docs/05-DEPLOY.md` e CHANGELOG atualizados

## 16. Estratégia de rollback

| Camada | Como reverter |
|---|---|
| Código | O M01 é desenvolvido na branch `feat/m01-fundacao-tecnica`, com commits pequenos. Só entra na `main` após o aceite. Para reverter: `git revert` do merge commit. **Nunca** reset nem force push |
| Banco de dev (container) | Não há dados de negócio. `docker compose down -v` e `docker compose up -d` recriam do zero |
| Migrations | Baseline sem tabelas de negócio. Reverter = recriar o volume. Fora do M01, a correção é sempre uma nova migration |
| PostgreSQL nativo (fallback) | `docker compose stop postgres`, depois `Set-Service postgresql-x64-18 -StartupType Automatic` e `Start-Service postgresql-x64-18` (admin). O banco nativo `gastrohub` (ICU, vazio) volta a responder na 5432. Ajustar senhas/`.env` se for usá-lo |
| CI | Reverter o commit do workflow |
| Ferramentas | Node, Docker e WSL continuam instalados; nada a desfazer |

## 17. Plano de implementação (após aprovação)

1. Desativar o serviço nativo e criar o compose do postgres, com init e validação.
2. Monorepo: pnpm, configs compartilhadas, `env:init`.
3. API: config, logging, erros, verificação de papel, health.
4. Drizzle: config, baseline, scripts de migração (dev e test).
5. Web: página de status e proxy.
6. Testes (unit, integração, web).
7. Dockerfiles e profile `app`.
8. CI.
9. Documentação, CHANGELOG, revisão final e PR/merge com o aceite do responsável.

Cada passo vira um ou mais commits em Conventional Commits. Push somente com autorização.

## 18. Pontos para revisão do responsável

1. **Modo de desenvolvimento:** API e web no host (`pnpm dev`) com o banco no Docker (recomendado), ou tudo em containers no dia a dia.
2. **`gastrohub_test`:** banco separado no mesmo container (recomendado, mais simples) ou um container dedicado em outra porta com `tmpfs` (mais isolado e rápido, porém mais um serviço).
3. **Senhas geradas automaticamente** pelo `pnpm env:init`, ou definidas manualmente.
4. **Itens dos ADRs ainda não aprovados explicitamente** usados nesta especificação: adapter Fastify, Tailwind, React Router/TanStack Query, Vitest, ESLint/Prettier e pnpm (ver relatório do ambiente).
