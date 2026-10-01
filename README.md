# GastroHub

Plataforma modular de gestão para food service: restaurantes e hamburguerias no início e, no futuro, outros tipos de operação de alimentação.

> **Status:** M01 — Fundação técnica implementado (sem funcionalidades de negócio). API, web, PostgreSQL em Docker, migrations, testes e CI estão operacionais. Próximo módulo: M02 — Autenticação ([roadmap](docs/06-ROADMAP.md)).

---

## Visão geral

| Item | Definição (ADRs aceitos) |
|---|---|
| Modelo | SaaS multiempresa (multi-tenant), com várias filiais por empresa |
| Arquitetura | Monólito modular ([ADR-001](docs/decisions/ADR-001-monolito-modular.md)) |
| Backend | Node.js 24 + TypeScript + NestJS/Fastify ([ADR-002](docs/decisions/ADR-002-stack.md)) |
| Frontend | React + Vite + TanStack Query + React Router + Tailwind (SPA) |
| Banco | PostgreSQL 18 com isolamento por `company_id` e Row-Level Security ([ADR-003](docs/decisions/ADR-003-multi-tenancy.md)) |
| ORM | Drizzle ORM |
| Autenticação | Sessões opacas em cookie httpOnly ([ADR-004](docs/decisions/ADR-004-autenticacao.md)) |
| Ambiente local | Windows → WSL2 → Docker (PostgreSQL 18) + API e web no host via pnpm |

## Estrutura

```text
apps/api            API NestJS (Fastify, ESM)
apps/web            Frontend React + Vite
packages/contracts  Schemas zod compartilhados entre API e web
packages/config     ESLint e Prettier compartilhados
infra/database      Scripts SQL (init do container, validação, fallback nativo)
scripts/            env:init e db:validate
docs/               Documentação, ADRs e especificações de módulos
```

## Pré-requisitos

- Git
- Node.js 24 LTS + pnpm via Corepack (`corepack enable`)
- Docker Desktop com WSL2

## Execução local

```powershell
# uma vez
corepack enable
pnpm install
pnpm env:init                 # gera .env com senhas aleatórias (não versionado, não exibidas)
docker compose up -d          # PostgreSQL 18 em 127.0.0.1:5432 (gastrohub + gastrohub_test)
pnpm db:migrate               # migrations no banco de desenvolvimento (como gastrohub_owner)
pnpm db:validate              # confere ICU, encoding, owner, papéis e privilégios

# dia a dia
pnpm dev                      # API em http://127.0.0.1:3000 e web em http://127.0.0.1:5173
```

| Comando | Função |
|---|---|
| `pnpm test` | Testes unitários (contracts, API, web) |
| `pnpm test:integration` | Testes de integração da API contra `gastrohub_test` (exige o container ativo) |
| `pnpm lint` | ESLint + verificação de fronteiras entre módulos |
| `pnpm typecheck` | TypeScript em todos os pacotes |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm build` | Build de todos os pacotes |
| `docker compose --profile app up -d --build` | Stack completa em containers (web em http://127.0.0.1:8080) |
| `docker compose down -v` | Para tudo e **apaga** o volume do banco de desenvolvimento |

Endpoints: `GET /health/live`, `GET /health/ready` e OpenAPI em `/api/docs` (somente fora de produção).

Detalhes de ambiente, banco e CI em [docs/05-DEPLOY.md](docs/05-DEPLOY.md).

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/00-PROJETO.md](docs/00-PROJETO.md) | Visão, escopo, princípios e convenções |
| [docs/01-ARQUITETURA.md](docs/01-ARQUITETURA.md) | Arquitetura, stack e estrutura de diretórios |
| [docs/02-BANCO-DE-DADOS.md](docs/02-BANCO-DE-DADOS.md) | Modelo de tenancy, convenções e migrations |
| [docs/03-SEGURANCA.md](docs/03-SEGURANCA.md) | Autenticação, RBAC, isolamento, LGPD |
| [docs/04-API.md](docs/04-API.md) | Convenções da API REST |
| [docs/05-DEPLOY.md](docs/05-DEPLOY.md) | Docker, ambientes, CI/CD |
| [docs/06-ROADMAP.md](docs/06-ROADMAP.md) | Módulos, dependências e ordem de desenvolvimento |
| [docs/backlog.md](docs/backlog.md) | Funcionalidades futuras registradas |
| [docs/decisions/](docs/decisions/) | Architecture Decision Records (ADRs) |
| [docs/modules/](docs/modules/) | Especificação de cada módulo |

## Fluxo de trabalho

- Desenvolvimento **módulo por módulo**, na ordem de [docs/06-ROADMAP.md](docs/06-ROADMAP.md), em branches `feat/<modulo>-<descricao>`.
- Commits em [Conventional Commits](https://www.conventionalcommits.org/pt-br/) (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
- Toda mudança relevante entra no [CHANGELOG.md](CHANGELOG.md).
- Decisões arquiteturais são registradas em [docs/decisions/](docs/decisions/).
- Funcionalidades fora do módulo atual vão para o [backlog](docs/backlog.md), não para o código.
- Nunca versionar `.env`, chaves, tokens ou credenciais.
