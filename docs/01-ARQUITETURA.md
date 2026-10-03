# 01 — Arquitetura

> Status: **aceita**. Decisões em [ADR-001](decisions/ADR-001-monolito-modular.md) e [ADR-002](decisions/ADR-002-stack.md) (ambos aceitos em 2026-10-01).

## 1. Estado atual (M03, 2026-10-03)

- Fundação técnica implementada ([M01](modules/M01-fundacao-tecnica.md)): monorepo pnpm, API NestJS/Fastify (ESM), web React/Vite, PostgreSQL 18 em Docker, migrations Drizzle, testes e CI.
- Módulos de backend: `health` (técnico), `identity` ([M02](modules/M02-autenticacao.md): usuários, sessões, autenticação) e `organization` ([M03](modules/M03-empresas-filiais.md): empresas, filiais, vínculos, empresa ativa). Mecanismo técnico de tenancy em `shared/tenancy` (`TenantDb`). **Nenhuma regra de negócio** (produtos, pedidos etc.) ainda.
- Fronteiras entre módulos verificadas por `dependency-cruiser` (`pnpm deps:check`, parte de `pnpm lint` e do CI).

## 2. Estilo arquitetural: monólito modular

Uma única aplicação de backend, implantada como uma unidade e dividida em **módulos com fronteiras explícitas**. Microserviços estão descartados nesta fase (justificativa no ADR-001).

```text
                 ┌────────────────────────────┐
  Navegador ───► │  apps/web (React SPA)      │
  (back-office,  └─────────────┬──────────────┘
   PDV, KDS)                   │ HTTPS / JSON (REST)
                 ┌─────────────▼──────────────┐
                 │  apps/api (NestJS)         │
                 │ ┌────────────────────────┐ │
                 │ │ shared: auth, tenancy, │ │
                 │ │ db, logging, audit     │ │
                 │ ├────────┬────────┬──────┤ │
                 │ │identity│company │catalog│ … módulos
                 │ └────────┴────────┴──────┘ │
                 └─────────────┬──────────────┘
                               │ SQL (RLS por company_id)
                        ┌──────▼──────┐
                        │ PostgreSQL  │
                        └─────────────┘
```

### Regras de fronteira entre módulos

1. Cada módulo é dono das **suas tabelas**. Outro módulo nunca lê nem escreve essas tabelas diretamente.
2. A comunicação entre módulos acontece por uma **interface pública** (serviço exportado pelo módulo) ou por **eventos de domínio** em processo.
3. Dependências entre módulos seguem o grafo do [roadmap](06-ROADMAP.md). Dependências circulares são proibidas.
4. As fronteiras são verificadas automaticamente por `dependency-cruiser` ([`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs)): um módulo só importa outro via `modules/<modulo>/index.ts`; `shared/` não depende de módulos; `apps/` não importam umas das outras; sem ciclos; módulos (exceto `identity` e `health`) acessam o banco só pelo `TenantDb` (`shared/tenancy`), nunca pelo pool (M03).

**Inversão de dependência entre módulos.** Quando um módulo mais básico precisa de algo de um módulo que depende dele, o módulo básico declara uma **porta** (interface + token) na sua interface pública, e o outro a implementa. Exemplo (M03): o `identity` declara `ACTIVE_COMPANY_PORT` (seleção e validação da empresa ativa) e o `organization` o implementa. Assim o `identity` não importa o `organization`, e o grafo continua `organization → identity`.

Com isso, um módulo pode ser extraído para um serviço próprio no futuro, se um dia houver justificativa.

### Estrutura interna de um módulo (backend)

```text
modules/<modulo>/
├── domain/          # entidades, regras e invariantes (sem framework)
├── application/     # casos de uso / serviços de aplicação
├── infrastructure/  # repositórios Drizzle, integrações
├── http/            # controllers, DTOs (schemas zod), mapeamento
├── <modulo>.module.ts
└── index.ts         # interface pública do módulo
```

Camadas leves: sem DDD cerimonial. O objetivo é manter as regras de negócio testáveis sem banco e sem HTTP.

## 3. Estrutura do repositório

```text
C:\GastroHub
├── apps/
│   ├── api/                       # backend NestJS (pacote ESM)
│   │   ├── src/
│   │   │   ├── modules/           # um diretório por módulo (M01: apenas health)
│   │   │   ├── shared/            # config, database, http (erros, request id), logging
│   │   │   ├── app.factory.ts     # criação da aplicação (usada por main.ts e pelos testes)
│   │   │   └── main.ts
│   │   ├── drizzle/               # migrations SQL versionadas
│   │   ├── scripts/               # migrate.ts (Node 24, type stripping)
│   │   ├── test/                  # testes de integração (banco *_test)
│   │   └── Dockerfile
│   └── web/                       # frontend React + Vite
│       ├── src/
│       ├── nginx.conf             # servidor da imagem de produção
│       └── Dockerfile
├── packages/
│   ├── contracts/                 # schemas zod e tipos compartilhados API ↔ web
│   └── config/                    # ESLint e Prettier compartilhados
├── infra/
│   └── database/
│       ├── docker-init/           # init do container (papéis, bancos, privilégios)
│       ├── 99-validate.sql        # validação somente leitura
│       └── 00-*/01-*.sql          # PostgreSQL nativo (fallback)
├── scripts/                       # env-init.mjs, db-validate.mjs
├── .github/workflows/ci.yml
├── docker-compose.yml
├── .env.example
├── package.json / pnpm-workspace.yaml / tsconfig.base.json
└── docs/
```

Monorepo com **pnpm workspaces**. Turborepo/Nx ficam fora até que o tempo de build justifique ([backlog](backlog.md)).

## 4. Stack

| Camada | Escolha | Principal motivo |
|---|---|---|
| Runtime | Node.js LTS (24.x) | Ecossistema amplo e TypeScript ponta a ponta |
| Linguagem | TypeScript (strict) | Tipos compartilhados entre frontend e backend |
| Backend | NestJS (adapter Fastify) | Módulos, injeção de dependência, guards (RBAC) e OpenAPI nativos |
| Frontend | React + Vite + TanStack Query + React Router | SPA autenticada; não há necessidade de SSR/SEO |
| UI | Tailwind CSS + componentes próprios (design system a definir quando houver telas reais) | Design próprio, sem dependência visual de terceiros |
| Banco | PostgreSQL 18 | Relacional, RLS, JSONB, `uuidv7()` nativo |
| ORM / migrations | Drizzle ORM + drizzle-kit | Próximo do SQL; facilita RLS e `SET LOCAL` por transação |
| Validação | zod (compartilhado em `packages/contracts`) | Um único schema para front e back |
| Auth | Sessões opacas próprias + Argon2id | Revogáveis e simples (ADR-004) |
| Logs | pino (JSON estruturado) | Rápido; correlação por `request_id` |
| Testes | Vitest e Supertest contra PostgreSQL real (`gastrohub_test`, mesmo container do compose local e no CI); Playwright (e2e, depois) | Integração contra banco real, inclusive RLS |
| Lint/format | ESLint + Prettier | Padrão de mercado e integração com NestJS |
| Docs de API | OpenAPI 3 (gerado pelo NestJS) | Contrato navegável e testável |
| Banco local | PostgreSQL 18 em Docker (container oficial) + scripts em `infra/database/` | Paridade com CI e produção (Linux) |
| Contêineres | Docker + Compose (banco no dia a dia; profile `app` para a stack completa) | Paridade com produção |
| CI | GitHub Actions | Repositório já está no GitHub |

Prós, contras e alternativas de cada escolha estão no [ADR-002](decisions/ADR-002-stack.md).

## 5. Aspectos transversais

| Aspecto | Abordagem |
|---|---|
| Multi-tenancy | Contexto de tenant resolvido por requisição e aplicado via `SET LOCAL app.company_id` + RLS ([ADR-003](decisions/ADR-003-multi-tenancy.md)) |
| Autorização | RBAC com permissões granulares, verificado por guard em cada rota ([03-SEGURANCA](03-SEGURANCA.md)) |
| Auditoria | Tabela `audit_logs` append-only para ações sensíveis |
| Observabilidade | Logs estruturados + `request_id`; health checks `/health/live` e `/health/ready`; OpenTelemetry (traces/métricas) no backlog até haver ambiente de produção |
| Erros | Formato único (RFC 9457 Problem Details) ([04-API](04-API.md)) |
| Configuração | Variáveis de ambiente validadas com zod na inicialização; a aplicação não sobe com configuração inválida |
| Tempo | `timestamptz` em UTC no banco; fuso horário por filial para dia operacional e relatórios |
| Dinheiro | Inteiros em centavos (`bigint`) para evitar ponto flutuante |
| Eventos | Event bus em processo no início; outbox pattern quando houver integrações externas assíncronas |
| Tempo real (KDS/PDV) | Server-Sent Events ou WebSocket a definir no módulo de Cozinha |

## 6. Evolução prevista (sem implementar agora)

- **Fila/jobs** (ex.: pg-boss sobre o próprio PostgreSQL, ou Redis + BullMQ): quando surgirem tarefas assíncronas (integrações, e-mails, relatórios pesados).
- **Redis**: apenas quando houver necessidade comprovada (rate limit distribuído, cache, pub/sub com várias instâncias).
- **Operação offline do PDV**: requisito comum no food service. Exige decisão própria (ADR) antes do módulo PDV. Está registrada no backlog.
- **Extração de serviços**: só com motivo concreto (escala isolada, time dedicado, requisito regulatório).
