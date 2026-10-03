# 02 — Banco de Dados

> Status: **proposta**. Decisão de tenancy em [ADR-003](decisions/ADR-003-multi-tenancy.md).

## 1. Escolha

**PostgreSQL 18** como banco principal e único nesta fase. Os motivos estão no [ADR-002](decisions/ADR-002-stack.md): Row-Level Security, integridade relacional, JSONB para dados semiestruturados e `uuidv7()` nativo.

## 2. Estratégia multi-tenant

**Banco compartilhado e schema compartilhado, com coluna `company_id` em toda tabela de tenant, protegida por Row-Level Security (RLS).**

Defesa em duas camadas:

1. **Aplicação:** todo acesso a tabela de tenant passa pelo `TenantDb` (`shared/tenancy`, [M03 §7](modules/M03-empresas-filiais.md)), que aplica o contexto da requisição. A regra de fronteira `tenant-data-only-via-tenant-db` (dependency-cruiser) impede módulos de negócio de usar o pool diretamente.
2. **Banco:** policies RLS rejeitam qualquer linha de outra empresa, mesmo que a aplicação tenha um bug.

### Como o contexto é aplicado

```text
Requisição → autenticação (sessão) → user + empresa ativa (TenantGuard revalida o vínculo)
          → tenantDb.run({ companyId, userId }, tx => …)
              → abre transação
              → SELECT set_config('app.company_id', '<uuid>', true),
                       set_config('app.user_id',    '<uuid>', true)   -- valem só na transação
              → queries do caso de uso
              → COMMIT
```

`app.user_id` serve **somente** para o usuário enxergar os próprios vínculos e as empresas a que pertence (seletor de empresa, M03 D3). Permissões entram no M04.

### Policy padrão (aplicada a toda tabela de tenant)

```sql
ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <tabela> FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON <tabela>
  USING      (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
```

Sem `app.company_id` definido, a expressão vale `NULL` e **nenhuma linha é visível**: o sistema falha de forma fechada.

> **O `NULLIF` é obrigatório.** Depois que uma variável `app.*` é usada numa conexão, `current_setting(..., true)` devolve `''` (e não `NULL`) nas transações seguintes da mesma conexão. Sem o `NULLIF`, `''::uuid` gera erro em conexões reaproveitadas do pool (descoberto nos testes do M03).

`memberships` e `companies` têm políticas próprias que também consideram `app.user_id` ([M03 §6.2](modules/M03-empresas-filiais.md)); a escrita continua restrita à empresa do contexto.

### Papéis de banco

| Papel | Uso | Privilégios |
|---|---|---|
| `gastrohub_owner` | Dono dos bancos e do schema; executa migrations | DDL; não usado pela aplicação em runtime |
| `gastrohub_app` | Conexão da API em runtime | Apenas `CONNECT` no banco, `USAGE` no schema `public` e DML (`SELECT/INSERT/UPDATE/DELETE`) via default privileges. **Sem** `CREATE`, `TEMPORARY`, `TRUNCATE`, `REFERENCES`, `TRIGGER`; **sem** `SUPERUSER`/`BYPASSRLS`; **não** é dono de nenhum objeto |
| `gastrohub_readonly` | Relatórios/suporte (futuro) | SELECT com RLS |

> **Atenção:** superusuários (ex.: `postgres`) e donos das tabelas **sempre ignoram RLS**, mesmo com `FORCE`. Por isso a aplicação conecta exclusivamente como `gastrohub_app`, e a API **recusa iniciar** se o papel de runtime for SUPERUSER ou tiver BYPASSRLS (coberto por teste). Migrations também recusam rodar como superusuário.

Garantias verificadas automaticamente (`apps/api/test/database-security.int-spec.ts` e `pnpm db:validate`): flags dos papéis, privilégios de banco e schema, default privileges somente DML, DDL negado ao runtime (`42501`), schema `drizzle` inacessível ao runtime e lista exata das tabelas existentes (nenhuma além das especificadas). As tabelas de tenant têm ainda os testes de isolamento da §6 (`tenancy-database.int-spec.ts`).

### Ambiente local

**Banco oficial de desenvolvimento: container `postgres:18.6`** em `127.0.0.1:5432`, com os bancos `gastrohub` e `gastrohub_test` criados por [`infra/database/docker-init/`](../infra/database/docker-init/). As tabelas são criadas pela aplicação via migrations (`pnpm db:migrate`). O PostgreSQL nativo do Windows fica como fallback desativado. Detalhes em [05-DEPLOY](05-DEPLOY.md) §2.

**Collation: decisão de 2026-10-01.** O banco foi criado inicialmente com `Portuguese_Brazil.1252`, um locale que só existe no Windows. O responsável do projeto decidiu usar **ICU** (o nativo foi recriado com [`00-recreate-database-icu.sql`](../infra/database/00-recreate-database-icu.sql); o container já nasce assim):

| Configuração | Valor |
|---|---|
| Encoding | `UTF8` |
| Locale provider | `icu` |
| Locale ICU | `pt-BR` |
| `LC_COLLATE` / `LC_CTYPE` | `C` (portável; a ordenação vem do ICU) |
| Template | `template0` (criação limpa) |
| Owner | `gastrohub_owner` |

**Validado em 2026-10-01** no container (`gastrohub` e `gastrohub_test`) e no nativo: provider `icu`, locale `pt-BR`, `UTF8`, owner `gastrohub_owner`, papéis com `rolsuper = f` e `rolbypassrls = f`, ordenação pt-BR correta (a, á, b, ç, d, É, z). Os papéis no banco nativo **não têm senha** (login desabilitado).

Motivo: ordenação, índices e dumps idênticos em Windows, CI e produção (Linux). A configuração efetiva é verificada com [`99-validate.sql`](../infra/database/99-validate.sql). Toda nova instância (container, CI, produção) deve ser criada com os mesmos parâmetros.

Rotinas que realmente precisam cruzar empresas (ex.: login, que busca o usuário pelo e-mail antes de existir tenant; tarefas de plataforma) usam caminhos explícitos e auditados, nunca o papel da aplicação com RLS desligado.

## 3. Modelo de fundação (M02–M04)

Somente as entidades de fundação. Tabelas de negócio serão especificadas em cada módulo.

```text
users ──< memberships >── companies ──< branches
              │                │
              ├──< membership_roles >── roles ──< role_permissions >── permissions
              └──< membership_branches >── branches

users ──< sessions
companies ──< audit_logs
```

| Tabela | Escopo | Campos principais |
|---|---|---|
| `users` | Global | **M02:** `id`, `email` (único, `text` normalizado: NFC, trim e minúsculas, sem `citext`), `name`, `password_hash` (argon2id), `status`, `password_changed_at`, `last_login_at`, `created_at`, `updated_at`. `email_verified_at` virá com a verificação de e-mail |
| `sessions` | Global (por usuário) | **M02:** `id`, `user_id`, `token_hash` (SHA-256, `bytea`), `created_at`, `last_seen_at`, `expires_at`, `revoked_at`, `revoked_reason`, `ip`, `user_agent`. **M03:** `active_company_id` (FK → `companies`; nulo = sem empresa ativa); `revoked_reason` aceita `company_switched` |
| `auth_events` | Global (append-only) | **M02:** trilha de segurança de autenticação (login, logout, revogações, rate limit, troca de senha, ações da CLI) |
| `companies` | Tenant raiz | **M03:** `id`, `legal_name`, `trade_name`, `tax_id` (CNPJ numérico ou alfanumérico, único; sem CPF), `status` (`active`/`suspended`), `created_at`, `updated_at`. Sem `plan` (backlog) e sem dados fiscais (M14) |
| `branches` | Tenant | **M03:** `id`, `company_id`, `name` (único por empresa), `tax_id` (opcional, único), `timezone` (IANA), `business_day_cutoff` (virada do dia operacional, padrão 04:00), endereço estruturado (`postal_code`, `street`, `number`, `complement`, `district`, `city`, `state`), `status` (`active`/`inactive`); `UNIQUE (company_id, id)` para FKs compostas |
| `memberships` | Tenant | **M03:** `id`, `company_id`, `user_id`, `status` (`active`/`revoked`), `created_at`, `updated_at`; `UNIQUE (company_id, user_id)`. O **M04** acrescenta `all_branches` e papéis |
| `membership_branches` | Tenant | `membership_id`, `branch_id`, `company_id` |
| `roles` | Tenant (+ papéis de sistema) | `id`, `company_id` (nulo = modelo do sistema), `name`, `is_system` |
| `permissions` | Global (catálogo fixo em código) | `key` (ex.: `orders.cancel`), `description` |
| `role_permissions` | Tenant | `role_id`, `permission_key`, `company_id` |
| `membership_roles` | Tenant | `membership_id`, `role_id`, `company_id` |
| `audit_logs` | Tenant | `id`, `company_id`, `branch_id`, `actor_user_id`, `action`, `entity`, `entity_id`, `changes` (jsonb), `ip`, `request_id`, `created_at` |

Detalhes das tabelas do M02 (constraints, índices, privilégios, por que não têm RLS de tenant): [M02 §4 e §10](modules/M02-autenticacao.md). Privilégios do runtime no M02: `users` e `sessions` sem `DELETE`; `auth_events` só `SELECT`/`INSERT` (append-only).

Detalhes das tabelas do M03 (constraints, políticas RLS, empresa ativa): [M03 §3 e §6](modules/M03-empresas-filiais.md). `companies`, `branches` e `memberships` têm `ENABLE` + `FORCE ROW LEVEL SECURITY`, e o runtime não tem `DELETE` nelas (empresa é suspensa, filial inativada, vínculo revogado).

**Usuário é global, vínculo é por empresa.** Uma mesma pessoa (ex.: contador, consultor, dono de duas marcas) pode acessar várias empresas, com papéis diferentes em cada uma.

### Regra para toda tabela operacional futura

```text
company_id  uuid NOT NULL   -- isolamento (RLS)
branch_id   uuid NOT NULL   -- quando o dado pertence a uma filial (pedido, caixa, estoque…)
```

- Chaves estrangeiras compostas `(company_id, branch_id)` → `branches(company_id, id)` impedem a referência a uma filial de outra empresa.
- Índices sempre começando por `company_id` (ex.: `(company_id, branch_id, created_at)`).
- Restrições de unicidade sempre incluem `company_id` (ex.: código do produto é único **por empresa**).

## 4. Convenções

| Item | Convenção |
|---|---|
| Nomes | `snake_case`, tabelas no plural em inglês |
| Chave primária | `id uuid DEFAULT uuidv7()`: ordenável por tempo e sem exposição de contagem |
| Datas | `timestamptz` (UTC); `created_at` e `updated_at` em todas as tabelas |
| Dinheiro | `bigint` em centavos (`price_cents`) |
| Quantidades | `numeric(14,4)` (insumos em kg, l e unidade) |
| Enums | `text` + `CHECK`, ou tabela de domínio. Evitar `ENUM` nativo, que é difícil de alterar |
| Exclusão | Cadastros usam `archived_at` (arquivamento). Registros operacionais **não são apagados**: cancelamento é um estado, com auditoria |
| Concorrência | Coluna `version` (lock otimista) em entidades editadas por várias pessoas |
| Dia operacional | Calculado pelo fuso da filial e pelo horário de virada configurável (operações que passam da meia-noite) |

## 5. Migrations e seeds

- Migrations SQL versionadas em `apps/api/drizzle/`, geradas pelo drizzle-kit (`pnpm db:generate`) e **revisadas manualmente** (policies RLS são escritas à mão).
- Aplicadas por `apps/api/scripts/migrate.ts` **como `gastrohub_owner`** (`pnpm db:migrate` / `pnpm db:migrate:test`), registradas em `drizzle.__drizzle_migrations`. O script recusa superusuário e, no alvo de teste, bancos sem sufixo `_test`.
- M01: apenas `0000_baseline` (sem tabelas; prova o pipeline).
- Migrations são **somente para frente** em produção. Uma correção é feita com uma nova migration.
- Seeds separados (a partir do M02/M04):
  - `seed:system`: catálogo de permissões e papéis-modelo (idempotente, roda em todo ambiente).
  - `seed:dev`: empresa, filiais e usuários fictícios **apenas** para desenvolvimento local.
- O CI aplica todas as migrations em um PostgreSQL limpo e roda os testes de isolamento.

## 6. Testes de isolamento obrigatórios

Para cada tabela de tenant, um teste de integração deve provar que:

1. A empresa A não lê dados da empresa B.
2. A empresa A não grava linha com `company_id` de B.
3. Sem contexto de tenant, a consulta retorna zero linhas.

Referência: `apps/api/test/tenancy-database.int-spec.ts` (M03). O `apps/api/test/tenant-db.int-spec.ts` cobre ainda a reutilização da mesma conexão com outro contexto (caso que exige o `NULLIF` da §2).

## 7. Backup e retenção (para produção)

Definir no módulo de deploy: backups automáticos diários com PITR (recuperação para um ponto no tempo), teste periódico de restauração e política de retenção alinhada à LGPD ([03-SEGURANCA](03-SEGURANCA.md)).
