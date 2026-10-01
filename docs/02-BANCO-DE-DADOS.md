# 02 — Banco de Dados

> Status: **proposta**. Decisão de tenancy em [ADR-003](decisions/ADR-003-multi-tenancy.md).

## 1. Escolha

**PostgreSQL 18** como banco principal e único nesta fase. Os motivos estão no [ADR-002](decisions/ADR-002-stack.md): Row-Level Security, integridade relacional, JSONB para dados semiestruturados e `uuidv7()` nativo.

## 2. Estratégia multi-tenant

**Banco compartilhado e schema compartilhado, com coluna `company_id` em toda tabela de tenant, protegida por Row-Level Security (RLS).**

Defesa em duas camadas:

1. **Aplicação:** todo acesso a dados passa por um repositório que exige o contexto de tenant da requisição.
2. **Banco:** policies RLS rejeitam qualquer linha de outra empresa, mesmo que a aplicação tenha um bug.

### Como o contexto é aplicado

```text
Requisição → autenticação (sessão) → resolve user + company ativa + permissões
          → abre transação
          → SELECT set_config('app.company_id', '<uuid>', true)   -- vale só na transação
          → queries da requisição
          → COMMIT
```

### Policy padrão (aplicada a toda tabela de tenant)

```sql
ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <tabela> FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON <tabela>
  USING      (company_id = current_setting('app.company_id', true)::uuid)
  WITH CHECK (company_id = current_setting('app.company_id', true)::uuid);
```

Sem `app.company_id` definido, `current_setting(..., true)` retorna `NULL` e **nenhuma linha é visível**: o sistema falha de forma fechada.

### Papéis de banco

| Papel | Uso | Privilégios |
|---|---|---|
| `gastrohub_owner` | Dono do schema; executa migrations | DDL; não usado pela aplicação em runtime |
| `gastrohub_app` | Conexão da API em runtime | DML apenas; **sem** `BYPASSRLS`, **sem** ser dono das tabelas |
| `gastrohub_readonly` | Relatórios/suporte (futuro) | SELECT com RLS |

> **Atenção:** superusuários (ex.: `postgres`) e donos das tabelas **sempre ignoram RLS**, mesmo com `FORCE`. Por isso a aplicação conecta exclusivamente como `gastrohub_app`. Os papéis são criados por [`infra/database/01-roles.sql`](../infra/database/01-roles.sql).

### Ambiente local

PostgreSQL 18.6 nativo em `localhost:5432`, banco `gastrohub`. As tabelas são criadas pela aplicação via migrations. Detalhes em [05-DEPLOY](05-DEPLOY.md) §2.

**Collation:** o banco foi criado com `Portuguese_Brazil.1252`, um locale que só existe no Windows. A recomendação é recriá-lo, enquanto está vazio, com ICU `pt-BR` ([`infra/database/00-recreate-database-icu.sql`](../infra/database/00-recreate-database-icu.sql)), para que ordenação, índices e dumps sejam idênticos em Windows, CI e produção.

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
| `users` | Global | `id`, `email` (único, citext), `password_hash`, `name`, `status`, `email_verified_at`, `created_at` |
| `sessions` | Global (por usuário) | `id`, `user_id`, `token_hash`, `active_company_id`, `ip`, `user_agent`, `expires_at`, `revoked_at` |
| `companies` | Tenant raiz | `id`, `legal_name`, `trade_name`, `tax_id` (CNPJ/CPF), `status`, `plan`, `created_at` |
| `branches` | Tenant | `id`, `company_id`, `name`, `tax_id`, `timezone`, `address`, `status` |
| `memberships` | Tenant | `id`, `company_id`, `user_id`, `status`, `all_branches` (bool) |
| `membership_branches` | Tenant | `membership_id`, `branch_id`, `company_id` |
| `roles` | Tenant (+ papéis de sistema) | `id`, `company_id` (nulo = modelo do sistema), `name`, `is_system` |
| `permissions` | Global (catálogo fixo em código) | `key` (ex.: `orders.cancel`), `description` |
| `role_permissions` | Tenant | `role_id`, `permission_key`, `company_id` |
| `membership_roles` | Tenant | `membership_id`, `role_id`, `company_id` |
| `audit_logs` | Tenant | `id`, `company_id`, `branch_id`, `actor_user_id`, `action`, `entity`, `entity_id`, `changes` (jsonb), `ip`, `request_id`, `created_at` |

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

- Migrations SQL versionadas em `apps/api/drizzle/`, geradas pelo drizzle-kit e **revisadas manualmente** (policies RLS são escritas à mão).
- Migrations são **somente para frente** em produção. Uma correção é feita com uma nova migration.
- Seeds separados:
  - `seed:system`: catálogo de permissões e papéis-modelo (idempotente, roda em todo ambiente).
  - `seed:dev`: empresa, filiais e usuários fictícios **apenas** para desenvolvimento local.
- O CI aplica todas as migrations em um PostgreSQL limpo e roda os testes de isolamento.

## 6. Testes de isolamento obrigatórios

Para cada tabela de tenant, um teste de integração deve provar que:

1. A empresa A não lê dados da empresa B.
2. A empresa A não grava linha com `company_id` de B.
3. Sem contexto de tenant, a consulta retorna zero linhas.

## 7. Backup e retenção (para produção)

Definir no módulo de deploy: backups automáticos diários com PITR (recuperação para um ponto no tempo), teste periódico de restauração e política de retenção alinhada à LGPD ([03-SEGURANCA](03-SEGURANCA.md)).
