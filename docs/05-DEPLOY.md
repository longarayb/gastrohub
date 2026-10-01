# 05 — Ambientes, Docker e Deploy

> Status: **proposta**. Banco local definido (PostgreSQL 18 nativo). CI será entregue no **M01 — Fundação técnica**.

## 1. Avaliação do Docker (bootstrap)

- Ainda não há aplicação para conteinerizar.
- Docker **não está instalado** na máquina de desenvolvimento atual (verificado em 2026-10-01).
- Por isso, nenhum `docker-compose.yml` foi criado nesta etapa: um arquivo que não pode ser validado não deve ser versionado.

## 2. Banco de dados local (definido em 2026-10-01)

O ambiente local usa um **PostgreSQL 18 nativo no Windows**, não um container:

| Item | Valor |
|---|---|
| Serviço Windows | `postgresql-x64-18` (início automático) |
| Versão | 18.6 |
| Host / porta | `localhost:5432` |
| Banco | `gastrohub` (criado pelo responsável do projeto) |
| Tabelas | Criadas **pela aplicação**, via migrations (drizzle-kit), a partir do M01 |

Preparação, executada uma vez pelo responsável (scripts em `infra/database/`):

1. *(Opcional, recomendado, só com o banco vazio)* `00-recreate-database-icu.sql`: recria o banco com collation ICU `pt-BR`, portável entre Windows e Linux.
2. `01-roles.sql`: cria `gastrohub_owner` (migrations) e `gastrohub_app` (runtime, sujeito a RLS) e transfere a propriedade do banco.
3. Definir as senhas com `\password` no psql e colocá-las **somente** no `.env` local.

**A aplicação nunca conecta como `postgres`.** Superusuários ignoram Row-Level Security, o que anularia o isolamento entre empresas ([ADR-003](decisions/ADR-003-multi-tenancy.md)).

Variáveis previstas (`.env`, não versionado; `.env.example` com placeholders no M01):

```text
DATABASE_URL=postgres://gastrohub_app:<senha>@localhost:5432/gastrohub
DATABASE_MIGRATION_URL=postgres://gastrohub_owner:<senha>@localhost:5432/gastrohub
```

Testes de integração locais usarão um banco separado (`gastrohub_test`), criado no M01, para nunca apagar dados do banco de desenvolvimento.

## 3. Docker Compose (opcional localmente)

Com o PostgreSQL nativo, o Docker **deixa de ser pré-requisito** para desenvolver: `api` e `web` rodam com `pnpm dev`. O Compose continua útil para conteinerizar `api` e `web` (paridade com produção) e para serviços auxiliares:

| Serviço | Imagem | Necessidade | Quando entra |
|---|---|---|---|
| `api` | build `infra/docker/api.Dockerfile` | Imagem de produção do backend | Quando houver deploy |
| `web` | build `infra/docker/web.Dockerfile` | Imagem de produção do frontend | Quando houver deploy |
| `mailpit` | `axllent/mailpit` | Captura de e-mails em dev (convite, recuperação de senha) | M02 (ou binário nativo) |

**Não incluídos até haver necessidade:** Redis, fila dedicada, MinIO/S3, Prometheus/Grafana.

Requisitos do compose (quando existir):

- Se um container `postgres` for adicionado no futuro: usar os mesmos scripts de `infra/database/` como init e um volume nomeado.
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
