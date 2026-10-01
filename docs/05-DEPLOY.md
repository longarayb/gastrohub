# 05 — Ambientes, Docker e Deploy

> Status: **proposta**. Banco local atual: PostgreSQL 18 nativo. A estratégia definitiva do banco local (nativo vs. Docker) será fechada no **M01 — Fundação técnica**, com preferência do responsável por Docker.

## 1. Avaliação do Docker

- Ainda não há aplicação para conteinerizar, então nenhum `docker-compose.yml` foi criado: um arquivo que não pode ser validado não deve ser versionado.
- Docker Desktop 4.93 (CLI 29.8.1, Compose v5.5.1) instalado em 2026-10-01.
- **Pendente:** o engine do Docker depende do **WSL2**, que não está instalado. No Windows 11 Home não existe backend Hyper-V, então o WSL2 é obrigatório. A instalação (`wsl --install`) exige administrador e reinicialização.

## 2. Banco de dados local (estado em 2026-10-01)

Hoje o ambiente local usa um **PostgreSQL 18 nativo no Windows**:

| Item | Valor |
|---|---|
| Serviço Windows | `postgresql-x64-18` (início automático) |
| Versão | 18.6 |
| Host / porta | `localhost:5432` |
| Banco | `gastrohub` (criado pelo responsável do projeto) |
| Tabelas | Criadas **pela aplicação**, via migrations (drizzle-kit), a partir do M01 |

Preparação, executada uma vez pelo responsável (scripts em `infra/database/`):

1. `00-recreate-database-icu.sql`: recria o banco com ICU `pt-BR` (decisão de 2026-10-01; ver [02-BANCO-DE-DADOS](02-BANCO-DE-DADOS.md) §2).
2. `01-roles.sql`: cria `gastrohub_owner` (migrations) e `gastrohub_app` (runtime, sujeito a RLS) e transfere a propriedade do banco.
3. Definir as senhas com `\password` no psql e colocá-las **somente** no `.env` local.
4. `99-validate.sql`: confere versão, provider, locale, encoding, owner e papéis.

**A aplicação nunca conecta como `postgres`.** Superusuários ignoram Row-Level Security, o que anularia o isolamento entre empresas ([ADR-003](decisions/ADR-003-multi-tenancy.md)).

Variáveis previstas (`.env`, não versionado; `.env.example` com placeholders no M01):

```text
DATABASE_URL=postgres://gastrohub_app:<senha>@localhost:5432/gastrohub
DATABASE_MIGRATION_URL=postgres://gastrohub_owner:<senha>@localhost:5432/gastrohub
```

Testes de integração locais usarão um banco separado (`gastrohub_test`), criado no M01, para nunca apagar dados do banco de desenvolvimento.

### Decisão em aberto para o M01: PostgreSQL nativo vs. Docker

O responsável indicou **preferência por PostgreSQL via Docker**. Como o serviço nativo já ocupa `localhost:5432`, as opções são:

| Opção | Como | Prós | Contras |
|---|---|---|---|
| A. Docker em outra porta | Container `postgres:18` em `localhost:5433`, nativo continua | Sem conflito; paridade com CI/produção | Dois PostgreSQL na máquina; `DATABASE_URL` muda de porta |
| B. Docker na 5432, nativo desativado | Serviço `postgresql-x64-18` em início manual/parado | Mantém `localhost:5432` | Banco nativo deixa de ser o usado |
| C. Manter nativo | Sem container de banco | Já funciona; nada a instalar | Menor paridade com Linux; setup manual por desenvolvedor |

Em qualquer opção, o banco é criado com os mesmos parâmetros (ICU `pt-BR`, UTF8, `template0`) e os mesmos scripts de `infra/database/`.

## 3. Docker Compose

O Compose (a definir no M01) atenderá a conteinerização de `api` e `web` (paridade com produção), serviços auxiliares e, conforme a decisão acima, o `postgres`:

| Serviço | Imagem | Necessidade | Quando entra |
|---|---|---|---|
| `api` | build `infra/docker/api.Dockerfile` | Imagem de produção do backend | Quando houver deploy |
| `web` | build `infra/docker/web.Dockerfile` | Imagem de produção do frontend | Quando houver deploy |
| `mailpit` | `axllent/mailpit` | Captura de e-mails em dev (convite, recuperação de senha) | M02 (ou binário nativo) |

**Não incluídos até haver necessidade:** Redis, fila dedicada, MinIO/S3, Prometheus/Grafana.

Requisitos do compose (quando existir):

- Se houver container `postgres`: imagem `postgres:18`, `POSTGRES_INITDB_ARGS` com ICU `pt-BR`, scripts de `infra/database/` como init, volume nomeado e `healthcheck`.
- Variáveis lidas de `.env` (não versionado), com `.env.example` versionado.

## 4. Ambientes

| Ambiente | Finalidade | Dados |
|---|---|---|
| `local` | Desenvolvimento | Seed fictício |
| `ci` | Testes automatizados | Banco efêmero (Testcontainers) |
| `staging` | Homologação | Fictícios / anonimizados. **Nunca** cópia de produção com dados pessoais |
| `production` | Clientes | Reais |

## 5. CI (GitHub Actions, a partir do M01)

Em todo push e pull request:

1. Instalar dependências (lockfile congelado).
2. Lint + format check + typecheck.
3. Testes unitários.
4. Testes de integração com PostgreSQL 18 real (service container do GitHub Actions; mesmos scripts de `infra/database/`; migrations + testes de RLS).
5. Build das imagens.
6. Varredura de segredos e auditoria de dependências.

## 6. Produção (decisão futura)

A escolha de provedor fica para quando houver o primeiro módulo utilizável, registrada em ADR próprio. Requisitos mínimos:

- Contêineres stateless para a API (escala horizontal).
- PostgreSQL gerenciado com backups automáticos, PITR e região no Brasil (latência e LGPD).
- TLS obrigatório; segredos em secret manager.
- Deploy automatizado a partir de tag/branch protegida, com migrations aplicadas antes da nova versão.
- Logs centralizados e alertas de disponibilidade.

Candidatos a avaliar: AWS (ECS/RDS em sa-east-1), Google Cloud (Cloud Run/Cloud SQL em southamerica-east1), Azure e PaaS mais simples (Railway, Render, Fly.io), com atenção à região de dados.
