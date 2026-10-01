# 01 — Arquitetura

> Status: **proposta**, pendente de aprovação. Decisões em [ADR-001](decisions/ADR-001-monolito-modular.md) e [ADR-002](decisions/ADR-002-stack.md).

## 1. Estado atual (bootstrap, 2026-10-01)

- Repositório novo: diretório local e GitHub vazios.
- Ainda não há stack, código, banco, Docker, testes ou CI.
- Ferramentas na máquina de desenvolvimento: Git (instalado neste bootstrap) e PostgreSQL 18.6 nativo (`localhost:5432`, banco `gastrohub`). **Node.js ainda não está instalado** e será necessário no M01. Docker é opcional.

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
4. As fronteiras serão verificadas automaticamente no CI (ex.: `dependency-cruiser` ou regras de import do ESLint) a partir do M01.

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

## 3. Estrutura do repositório (a ser criada no M01)

```text
C:\GastroHub
├── apps/
│   ├── api/                 # backend NestJS
│   │   ├── src/
│   │   │   ├── modules/     # um diretório por módulo de negócio
│   │   │   ├── shared/      # tenancy, auth, db, logging, audit, errors
│   │   │   └── main.ts
│   │   ├── drizzle/         # migrations SQL versionadas
│   │   └── test/            # testes de integração / e2e da API
│   └── web/                 # frontend React + Vite
├── packages/
│   ├── contracts/           # schemas zod e tipos compartilhados API ↔ web
│   └── config/              # tsconfig / eslint / prettier compartilhados
├── infra/
│   ├── database/            # scripts SQL de preparação (papéis, collation)
│   └── docker/              # Dockerfiles (quando houver deploy)
├── docs/
├── .env.example
├── package.json
└── pnpm-workspace.yaml
```

Monorepo com **pnpm workspaces**. Turborepo/Nx ficam fora até que o tempo de build justifique ([backlog](backlog.md)).

## 4. Stack recomendada

| Camada | Escolha | Principal motivo |
|---|---|---|
| Runtime | Node.js LTS (24.x) | Ecossistema amplo e TypeScript ponta a ponta |
| Linguagem | TypeScript (strict) | Tipos compartilhados entre frontend e backend |
| Backend | NestJS (adapter Fastify) | Módulos, injeção de dependência, guards (RBAC) e OpenAPI nativos |
| Frontend | React + Vite + TanStack Query + React Router | SPA autenticada; não há necessidade de SSR/SEO |
| UI | Tailwind CSS + componentes próprios (base shadcn/ui) | Design próprio, sem dependência visual de terceiros |
| Banco | PostgreSQL 18 | Relacional, RLS, JSONB, `uuidv7()` nativo |
| ORM / migrations | Drizzle ORM + drizzle-kit | Próximo do SQL; facilita RLS e `SET LOCAL` por transação |
| Validação | zod (compartilhado em `packages/contracts`) | Um único schema para front e back |
| Auth | Sessões opacas próprias + Argon2id | Revogáveis e simples (ADR-004) |
| Logs | pino (JSON estruturado) | Rápido; correlação por `request_id` |
| Testes | Vitest e Supertest contra PostgreSQL real (`gastrohub_test` local, service container no CI); Playwright (e2e, depois) | Integração contra banco real, inclusive RLS |
| Lint/format | ESLint + Prettier | Padrão de mercado e integração com NestJS |
| Docs de API | OpenAPI 3 (gerado pelo NestJS) | Contrato navegável e testável |
| Banco local | PostgreSQL 18 nativo + scripts em `infra/database/` | Já instalado; reproduzível via scripts |
| Contêineres | Docker (imagens de deploy; opcional localmente) | Paridade com produção |
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
