# GastroHub

Plataforma modular de gestão para food service: restaurantes e hamburguerias no início e, no futuro, outros tipos de operação de alimentação.

> **Status:** fase de fundação (bootstrap). Ainda **não existe código de aplicação**: o repositório contém apenas documentação, decisões de arquitetura e configurações de higiene.

---

## Visão geral

| Item | Definição (proposta, ver ADRs) |
|---|---|
| Modelo | SaaS multiempresa (multi-tenant), com várias filiais por empresa |
| Arquitetura | Monólito modular ([ADR-001](docs/decisions/ADR-001-monolito-modular.md)) |
| Backend | Node.js LTS + TypeScript + NestJS ([ADR-002](docs/decisions/ADR-002-stack.md)) |
| Frontend | React + Vite + TypeScript (SPA) |
| Banco | PostgreSQL com isolamento por `company_id` e Row-Level Security ([ADR-003](docs/decisions/ADR-003-multi-tenancy.md)) |
| ORM | Drizzle ORM |
| Autenticação | Sessões opacas em cookie httpOnly ([ADR-004](docs/decisions/ADR-004-autenticacao.md)) |
| Ambiente local | Docker Compose |

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

## Pré-requisitos (a partir do M01)

- Git
- Node.js LTS + pnpm (via Corepack)
- PostgreSQL 18 em `localhost:5432`, banco `gastrohub` (ICU `pt-BR`), preparado com os scripts de [infra/database/](infra/database/)
- Docker Desktop com WSL2 (estratégia do banco local, nativo ou Docker, definida no M01)

## Execução local

Ainda não se aplica. A aplicação (que criará as tabelas via migrations) será entregue no módulo **M01 — Fundação técnica**. Veja [docs/05-DEPLOY.md](docs/05-DEPLOY.md).

## Fluxo de trabalho

- Desenvolvimento **módulo por módulo**, na ordem de [docs/06-ROADMAP.md](docs/06-ROADMAP.md).
- Commits em [Conventional Commits](https://www.conventionalcommits.org/pt-br/) (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
- Toda mudança relevante entra no [CHANGELOG.md](CHANGELOG.md).
- Decisões arquiteturais são registradas em [docs/decisions/](docs/decisions/).
- Funcionalidades fora do módulo atual vão para o [backlog](docs/backlog.md), não para o código.
- Nunca versionar `.env`, chaves, tokens ou credenciais.
