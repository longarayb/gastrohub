# ADR-002 — Stack tecnológica

- Status: Aceito
- Data: 2026-10-01
- Aceito em: 2026-10-01, pelo responsável do projeto (com todos os pontos detalhados abaixo)

## Contexto

Não existe stack prévia. O sistema terá back-office web, PDV e KDS no navegador, API REST e, no futuro, API pública e integrações. A equipe é pequena: uma linguagem única entre front e back reduz a troca de contexto e permite compartilhar contratos.

## Problema

Escolher linguagem, frameworks, banco, ORM e ferramentas de teste que sejam produtivos, seguros, com mão de obra disponível no Brasil e adequados a um SaaS multi-tenant.

## Decisões e alternativas

### Linguagem: TypeScript (Node.js LTS) no front e no back

- **Vantagens:** tipos e schemas compartilhados (zod), um ecossistema só, contratação facilitada.
- **Desvantagens:** menos adequado a processamento numérico pesado (irrelevante aqui); exige disciplina de tipos (`strict`).
- **Alternativas:** C#/.NET (excelente, mas com duas linguagens no projeto); Python/Django (admin pronto, tipagem mais fraca, front separado); PHP/Laravel (produtivo, mas também com duas linguagens); Go (performático, mais verboso para CRUD de domínio rico).

### Backend: NestJS (adapter Fastify)

- **Vantagens:** sistema de módulos alinhado ao ADR-001, injeção de dependência, guards e interceptors (RBAC e tenancy), geração de OpenAPI e documentação ampla.
- **Desvantagens:** curva de aprendizado e alguma cerimônia (decorators).
- **Alternativas:** Fastify puro ou Hono (mais leves, mas a estrutura teria de ser construída à mão); AdonisJS (completo, comunidade menor); Express (antigo, sem estrutura).

### Frontend: React + Vite (SPA) + TanStack Query + React Router + Tailwind

- **Vantagens:** a aplicação é toda autenticada (sem SEO), e SPA simplifica o deploy (arquivos estáticos). Também facilita uma eventual operação offline do PDV (PWA). É o maior ecossistema disponível.
- **Desvantagens:** sem SSR, o que só importaria para um futuro cardápio digital público. Esse caso pode virar uma app separada.
- **Alternativas:** Next.js (SSR/RSC, mais complexidade sem ganho aqui); Angular (robusto, mais verboso); Vue/Nuxt (bom, ecossistema menor no Brasil para este perfil).

### Banco: PostgreSQL 18

- **Vantagens:** Row-Level Security (base do isolamento, ADR-003), integridade relacional forte, JSONB, `uuidv7()` nativo, oferta gerenciada em todas as clouds.
- **Desvantagens:** escala de escrita vertical. Para o volume de food service, é suficiente por muito tempo.
- **Alternativas:** MySQL (sem RLS nativo); MongoDB (dados financeiros e operacionais são relacionais e transacionais por natureza).

### ORM: Drizzle ORM + drizzle-kit

- **Vantagens:** API próxima do SQL, tipagem forte, migrations em SQL legível e editável (necessário para policies RLS), controle explícito de transações (para o `SET LOCAL` por requisição) e runtime leve.
- **Desvantagens:** projeto mais jovem que o Prisma; algumas operações exigem SQL manual.
- **Alternativas:** Prisma (DX excelente, mas RLS exige transações interativas com extensão, o que custa performance e complexidade); TypeORM (manutenção irregular, tipos fracos); Kysely (query builder excelente, mas sem schema/migrations integrados).

### Testes: Vitest + Supertest contra PostgreSQL real; Playwright depois

- **Vantagens:** testes de integração contra PostgreSQL **real**, indispensáveis para validar RLS. Vitest é rápido e compatível com TS/ESM.
- **Banco de testes** (decisão do responsável, 2026-10-01): banco `gastrohub_test` separado, no mesmo container PostgreSQL do desenvolvimento. Os testes se recusam a rodar contra banco cujo nome não termine em `_test`. Isso substitui o Testcontainers da proposta original.
- **Desvantagens:** os testes de integração exigem o container PostgreSQL ativo (local e CI).
- **Alternativas:** Jest (mais lento, configuração ESM trabalhosa); Testcontainers (mais um container por execução); banco em memória (não valida RLS, descartado).

### Qualidade: ESLint + Prettier, TypeScript `strict`

- **Alternativa:** Biome (mais rápido, uma ferramenta só; ecossistema de regras menor). Reavaliar no futuro.

### Monorepo: pnpm workspaces

- **Alternativas:** Turborepo/Nx (cache de build; adicionar quando o tempo de build justificar).

## Consequências

- Node.js LTS e pnpm passam a ser pré-requisitos (ainda não instalados na máquina atual).
- *Atualização 2026-10-01:* o desenvolvimento local usa PostgreSQL 18.6 **nativo** (`localhost:5432`). Testes de integração locais rodam contra um banco dedicado `gastrohub_test`, e o CI usa um service container PostgreSQL 18. Docker Desktop foi instalado. Decisão do responsável: o banco oficial de desenvolvimento será o PostgreSQL 18 em Docker, na porta 5432 (opção B, [05-DEPLOY](../05-DEPLOY.md) §2), implantado no M01.
- A escolha de ORM é a de maior risco de troca futura. Mitigação: acesso a dados isolado na camada `infrastructure/` de cada módulo.

## Registro de implementação (M01, 2026-10-01)

Versões fixadas no M01 (lockfile `pnpm-lock.yaml` é a fonte exata):

| Item | Versão | Observação |
|---|---|---|
| Node.js | 24 LTS (`engines: >=24 <25`) | Imagens: `node:24.21.0-alpine3.24` |
| pnpm | 12.8.1 (`packageManager`, via Corepack) | |
| TypeScript | **6.0.x** | O TypeScript 7 (compilador nativo) ainda não expõe a API JavaScript usada por typescript-eslint (`<6.1`), Nest CLI e drizzle-kit. Reavaliar quando o ecossistema suportar |
| NestJS | 12.x + `@nestjs/platform-fastify` | **NestJS 12 é distribuído somente em ESM**: a API é um pacote ESM (`"type": "module"`, imports com `.js`). Injeção de dependência com `@Inject(token)` explícito |
| React / React Router / TanStack Query | 19 / 8 / 5 | |
| Vite / Tailwind CSS / Vitest | 8 / 4 / 5 | Vitest da API usa SWC (`unplugin-swc`) para metadados de decorators |
| zod | 4 | |
| drizzle-orm / drizzle-kit | 0.45 / 0.31 | |
| PostgreSQL | `postgres:18.6` | |
