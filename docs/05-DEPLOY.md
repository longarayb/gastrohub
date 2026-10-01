# 05 — Ambientes, Docker e Deploy

> Status: **proposta**. Docker Compose e CI serão entregues no **M01 — Fundação técnica**.

## 1. Avaliação do Docker (bootstrap)

- Ainda não há aplicação para conteinerizar.
- Docker **não está instalado** na máquina de desenvolvimento atual (verificado em 2026-10-01). Instalar o Docker Desktop é pré-requisito do M01.
- Por isso, nenhum `docker-compose.yml` foi criado nesta etapa: um arquivo que não pode ser validado não deve ser versionado.

## 2. Docker Compose local (alvo do M01)

Objetivo: `docker compose up -d` sobe tudo o que é necessário para desenvolver.

| Serviço | Imagem | Necessidade | Quando entra |
|---|---|---|---|
| `postgres` | `postgres:18` | Banco principal | M01 |
| `api` | build `infra/docker/api.Dockerfile` | Backend NestJS (hot reload em dev) | M01 |
| `web` | build `infra/docker/web.Dockerfile` | Frontend Vite (dev server) | M01 |
| `mailpit` | `axllent/mailpit` | Captura de e-mails em dev (convite, recuperação de senha) | M02 |

**Não incluídos até haver necessidade:** Redis, fila dedicada, MinIO/S3, Prometheus/Grafana.

Também será possível rodar `api` e `web` fora do Docker (via `pnpm dev`), usando apenas o `postgres` do Compose. Esse costuma ser o fluxo mais rápido no Windows.

Requisitos do compose:

- Volume nomeado para os dados do PostgreSQL.
- Script de init criando os papéis `gastrohub_owner` e `gastrohub_app` ([02-BANCO-DE-DADOS](02-BANCO-DE-DADOS.md) §2).
- `healthcheck` no postgres; `api` depende de `postgres: service_healthy`.
- Variáveis lidas de `.env` (não versionado), com `.env.example` versionado.

## 3. Ambientes

| Ambiente | Finalidade | Dados |
|---|---|---|
| `local` | Desenvolvimento | Seed fictício |
| `ci` | Testes automatizados | Banco efêmero (Testcontainers) |
| `staging` | Homologação | Fictícios / anonimizados. **Nunca** cópia de produção com dados pessoais |
| `production` | Clientes | Reais |

## 4. CI (GitHub Actions, a partir do M01)

Em todo push e pull request:

1. Instalar dependências (lockfile congelado).
2. Lint + format check + typecheck.
3. Testes unitários.
4. Testes de integração com PostgreSQL real (migrations + testes de RLS).
5. Build das imagens.
6. Varredura de segredos e auditoria de dependências.

## 5. Produção (decisão futura)

A escolha de provedor fica para quando houver o primeiro módulo utilizável, registrada em ADR próprio. Requisitos mínimos:

- Contêineres stateless para a API (escala horizontal).
- PostgreSQL gerenciado com backups automáticos, PITR e região no Brasil (latência e LGPD).
- TLS obrigatório; segredos em secret manager.
- Deploy automatizado a partir de tag/branch protegida, com migrations aplicadas antes da nova versão.
- Logs centralizados e alertas de disponibilidade.

Candidatos a avaliar: AWS (ECS/RDS em sa-east-1), Google Cloud (Cloud Run/Cloud SQL em southamerica-east1), Azure e PaaS mais simples (Railway, Render, Fly.io), com atenção à região de dados.
