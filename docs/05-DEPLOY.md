# 05 — Ambientes, Docker e Deploy

> Status: **implementado no M01** para desenvolvimento e CI. O deploy em produção é uma decisão futura (§7).

## 1. Ambiente de desenvolvimento

Direção definida pelo responsável: **Windows → WSL2 → Docker → PostgreSQL 18 → GastroHub**, para reduzir diferenças entre desenvolvimento, CI, staging e produção.

```text
Windows (host)
├── Node 24 + pnpm → API NestJS (127.0.0.1:3000) e web Vite (127.0.0.1:5173)   ← pnpm dev
└── Docker Desktop (WSL2)
    └── gastrohub-postgres: PostgreSQL 18.6 (127.0.0.1:5432)                    ← docker compose up -d
        ├── gastrohub        (desenvolvimento)
        └── gastrohub_test   (testes automatizados)
```

API e web rodam **no host** (hot reload rápido; bind mounts do Windows para containers são lentos). O banco roda **no Docker**. O profile `app` sobe a stack inteira em containers, para validar a paridade com produção (§4).

Ferramentas instaladas e validadas em 2026-10-01: Git 2.55, Node 24 LTS, pnpm 12.8.1 (Corepack), Docker Desktop 4.93 (Engine 29.8.1, Compose v5.5.1) e WSL 3.0.1. No Windows 11 Home o WSL2 é obrigatório, porque não existe backend Hyper-V.

## 2. Banco de dados de desenvolvimento

**Decisão (2026-10-01): o banco oficial de desenvolvimento do GastroHub é o container** `postgres:18.6`, na porta 5432 (opção B).

| Item | Valor |
|---|---|
| Container / imagem | `gastrohub-postgres` / `postgres:18.6` |
| Porta | `127.0.0.1:5432` (somente interface local; não exposto na rede) |
| Volume | `gastrohub_pgdata` |
| Bancos | `gastrohub` e `gastrohub_test` (ICU `pt-BR`, UTF8, `template0`, owner `gastrohub_owner`) |
| Init | `infra/database/docker-init/` (roda só na primeira inicialização do volume; sem `DROP`) |
| Papéis | `gastrohub_owner` (migrations/DDL) e `gastrohub_app` (runtime, só DML, sem SUPERUSER/BYPASSRLS) |
| Senhas | Geradas por `pnpm env:init` no `.env` (não versionado) e lidas pelo init via `\getenv` |
| Tabelas | Criadas **pela aplicação**, via migrations (`pnpm db:migrate`) |

**A aplicação nunca conecta como `postgres`.** Superusuários ignoram Row-Level Security, o que anularia o isolamento entre empresas ([ADR-003](decisions/ADR-003-multi-tenancy.md)). A API **recusa iniciar** se o papel de runtime for SUPERUSER ou tiver BYPASSRLS.

Validação: `pnpm db:validate` executa [`99-validate.sql`](../infra/database/99-validate.sql) nos dois bancos (versão, ICU, encoding, owner, papéis, privilégios de banco e schema, default privileges, objetos do runtime, tabelas existentes, ordenação pt-BR).

### Isolamento do `gastrohub_test`

- É um banco separado no mesmo container (decisão do responsável), com o mesmo modelo de papéis.
- `pnpm test:integration` e `pnpm db:migrate:test` **recusam** URLs cujo nome de banco não termine em `_test`.
- O setup dos testes aplica as migrations no `gastrohub_test` antes de rodar.

### PostgreSQL nativo (fallback temporário)

| Item | Estado |
|---|---|
| Serviço | `postgresql-x64-18`: **parado**, início **manual** (desde 2026-10-01). Não desinstalado |
| Banco | `gastrohub` com ICU `pt-BR`, vazio; papéis sem senha (login desabilitado) |
| Scripts | `infra/database/00-recreate-database-icu.sql` (destrutivo, uso manual) e `01-roles.sql` |

Para voltar ao nativo em emergência (requer administrador):

```powershell
docker compose stop postgres
Set-Service postgresql-x64-18 -StartupType Automatic
Start-Service postgresql-x64-18
# definir senhas dos papéis no banco nativo e ajustar o .env
```

## 3. Variáveis de ambiente

Modelo versionado: [`.env.example`](../.env.example) (sem valores reais). O `.env` local é gerado por `pnpm env:init`:

- senhas aleatórias de 256 bits (base64url, seguras em URLs);
- **nunca** imprime nem registra as senhas;
- **não sobrescreve** um `.env` existente sem confirmação interativa (em modo não interativo, recusa).

Variáveis novas (ex.: `AUTH_SECRET` e as de sessão do M02) são acrescentadas a um `.env` existente com `pnpm env:init -- --add-missing`, que não toca nas senhas já em uso e não exibe segredos.

> Sobrescrever o `.env` gera senhas novas, mas o volume do PostgreSQL já inicializado mantém as antigas. Nesse caso: `docker compose down -v` e `docker compose up -d` (apaga os dados de desenvolvimento).

## 4. Docker Compose

| Serviço | Profile | Imagem | Exposição |
|---|---|---|---|
| `postgres` | (padrão) | `postgres:18.6` | `127.0.0.1:5432` |
| `api` | `app` | build `apps/api/Dockerfile` (`node:24.21.0-alpine3.24`) | não publicada no host; acessível pelo `web` |
| `web` | `app` | build `apps/web/Dockerfile` (`nginx-unprivileged:1.30.5-alpine`) | `127.0.0.1:8080` |

- `docker compose up -d` sobe **somente o PostgreSQL** (fluxo diário).
- `docker compose --profile app up -d --build` sobe a stack completa: a web (nginx) serve a SPA e encaminha `/api` e `/health` para a API (mesmo site, ADR-004). A API roda em `NODE_ENV=production` (sem OpenAPI, CSP restritiva, logs JSON).
- Imagens sem root em runtime (`node` uid 1000; `nginx` uid 101), sem código-fonte nem dependências de desenvolvimento.
- `.dockerignore` mantém `.env` e segredos fora do contexto de build.

**Não incluídos até haver necessidade:** Redis, fila dedicada, MinIO/S3, Prometheus/Grafana. `mailpit` (e a infraestrutura de e-mail) **não** entra no M02 (D1): virá com a recuperação de senha por e-mail e os convites do M04.

No profile `app`, a API recebe `AUTH_SECRET` do `.env` e `TRUST_PROXY=1` (o nginx é o único proxy à frente dela, D11). Usuários podem ser administrados dentro do container: `docker compose exec api node dist/cli/user-cli.main.js <comando>`. Empresas, filiais e vínculos (M03), da mesma forma: `docker compose exec api node dist/cli/organization-cli.main.js <comando>` (comandos no [README](../README.md)). O M03 não traz variáveis de ambiente novas.

## 5. Ambientes

| Ambiente | Finalidade | Dados |
|---|---|---|
| `local` | Desenvolvimento | Fictícios |
| `ci` | Testes automatizados | Banco efêmero no container do compose, `.env` com senhas aleatórias por execução |
| `staging` | Homologação | Fictícios / anonimizados. **Nunca** cópia de produção com dados pessoais |
| `production` | Clientes | Reais |

## 6. CI (GitHub Actions)

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml), em push e pull request para `main`:

1. Node 24 + pnpm (Corepack), `pnpm install --frozen-lockfile`.
2. `pnpm format:check`, `pnpm lint` (ESLint + fronteiras entre módulos), `pnpm typecheck`.
3. `pnpm test` (unitários).
4. `pnpm env:init` e `docker compose up -d --wait postgres`: **o mesmo compose do desenvolvimento**.
5. `pnpm db:validate` e `pnpm test:integration`.
6. `pnpm build` e `docker compose --profile app build`.
7. `pnpm audit --audit-level=high`.
8. Job separado: **gitleaks** sobre todo o histórico Git.

A proteção da branch `main` (exigir CI verde para merge) é configurada no GitHub pelo responsável.

## 7. Produção (decisão futura)

A escolha de provedor fica para quando houver o primeiro módulo utilizável, registrada em ADR próprio. Requisitos mínimos:

- Contêineres stateless para a API (escala horizontal).
- PostgreSQL gerenciado com backups automáticos, PITR e região no Brasil (latência e LGPD), criado com os mesmos parâmetros (ICU `pt-BR`, UTF8) e o mesmo modelo de papéis.
- TLS obrigatório; segredos em secret manager.
- Deploy automatizado a partir de tag/branch protegida, com migrations aplicadas (como `gastrohub_owner`) antes da nova versão. A imagem atual da API **não** inclui as migrations: o mecanismo de migração em produção será definido nesse ADR.
- Logs centralizados e alertas de disponibilidade.

Candidatos a avaliar: AWS (ECS/RDS em sa-east-1), Google Cloud (Cloud Run/Cloud SQL em southamerica-east1), Azure e PaaS mais simples (Railway, Render, Fly.io), com atenção à região de dados.
