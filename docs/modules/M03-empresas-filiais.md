# M03 — Empresas e Filiais (Tenancy)

- Status: **Aprovada pelo responsável em 2026-10-03** (D1–D11 sem alteração; D12 com a redação definida pelo responsável). Implementação ainda não iniciada
- Data: 2026-10-03
- Dependências: M01, M02 (concluídos)
- ADRs: [ADR-003](../decisions/ADR-003-multi-tenancy.md) (esta especificação o implementa e não o substitui), [ADR-004](../decisions/ADR-004-autenticacao.md) (empresa ativa na sessão), [ADR-001](../decisions/ADR-001-monolito-modular.md)
- Documentos base: [02-BANCO-DE-DADOS](../02-BANCO-DE-DADOS.md) §2–§3, [03-SEGURANCA](../03-SEGURANCA.md) §3, [04-API](../04-API.md), [M02](M02-autenticacao.md)

> Itens marcados com **[DECISÃO Dn]** foram decisões desta especificação, **aprovadas** pelo responsável (registro na §16). O resto é herdado dos ADRs e documentos base.

---

## 1. Objetivo

Criar a **fundação multi-tenant** do GastroHub:

- **Empresas** (tenants) e **filiais**, com isolamento garantido no banco por **Row-Level Security** (ADR-003);
- o **vínculo mínimo** usuário ↔ empresa;
- a **empresa ativa na sessão**, com rotação de token na troca (ADR-004);
- o mecanismo que todos os módulos de negócio usarão para acessar dados de tenant: transação com `app.company_id`.

Ao final do M03, cada requisição autenticada pode operar no contexto de **uma** empresa, e o banco recusa qualquer leitura ou escrita fora dela.

### Tenancy × Autorização

| | M03 (tenancy) | M04 (autorização) |
|---|---|---|
| Pergunta | *Em qual empresa esta requisição opera, e o usuário pertence a ela?* | *O que o usuário pode fazer nesta empresa/filial?* |
| Dados | `companies`, `branches`, `memberships` (vínculo simples) | papéis, permissões, escopo por filial, convites, `audit_logs` |
| Neste módulo | **Sim** | **Não**: nenhum papel, nenhuma permissão, nenhuma regra "quem pode editar" |

## 2. Escopo

### Incluído

1. Módulo `organization` (dono de `companies`, `branches`, `memberships`). **[DECISÃO D9]**
2. RLS por `company_id` nas tabelas de tenant, com `FORCE ROW LEVEL SECURITY` e políticas da §6.
3. Helper técnico `TenantDb` em `shared/tenancy`: abre a transação, aplica `app.company_id` e `app.user_id` e executa a operação (§7).
4. Vínculo mínimo usuário ↔ empresa (`memberships`: ativo/revogado, **sem papéis**). **[DECISÃO D1]**
5. Empresa ativa na sessão (`sessions.active_company_id`), troca com rotação de token, seleção automática quando há uma única empresa. **[DECISÃO D5]**
6. Guard de tenant para rotas que exigem empresa ativa, revalidando o vínculo a cada requisição.
7. API de leitura: minhas empresas, empresa ativa, filiais da empresa ativa, troca de empresa ativa.
8. CLI operacional: criar empresa, criar filial, vincular e desvincular usuário, suspender e reativar empresa. **[DECISÃO D2]**
9. Frontend: seletor de empresa, página "Empresa" somente leitura (dados e filiais), estado "sem empresa".
10. Testes de isolamento obrigatórios (docs/02 §6) para cada tabela de tenant.

### Fora do escopo (§15)

Papéis, permissões, RBAC, escopo por filial, convites, edição de empresa/filial pela interface, auditoria por empresa (`audit_logs`), **filial ativa**, dados fiscais completos, planos e cobrança, qualquer regra de negócio.

## 3. Modelo de dados

> As tabelas **não são criadas** nesta etapa. Migration na §11.

```text
companies ──< branches
    │
    └──< memberships >── users (global, M02)

sessions.active_company_id ──> companies   (coluna nova na tabela do M02)
```

### 3.1 `companies` (tenant raiz)

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id` | `uuid` | PK, `DEFAULT uuidv7()` | É o próprio `company_id` |
| `legal_name` | `text` | `NOT NULL`, 1–150 caracteres | Razão social |
| `trade_name` | `text` | `NOT NULL`, 1–100 caracteres | Nome fantasia (exibido na interface) |
| `tax_id` | `text` | `NOT NULL`, `UNIQUE`, `CHECK (tax_id ~ '^[0-9A-Z]{12}[0-9]{2}$')` | **CNPJ** normalizado, sem pontuação, com suporte ao **CNPJ alfanumérico** (Receita Federal, a partir de jul/2026). DV validado na aplicação **[DECISÃO D6]** |
| `status` | `text` | `NOT NULL DEFAULT 'active'`, `CHECK (status IN ('active', 'suspended'))` | `suspended`: nenhum membro acessa |
| `created_at`, `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |

Sem `plan` (cobrança é backlog) e sem dados fiscais além do CNPJ: inscrição estadual, regime tributário, CNAE e endereço fiscal ficam para o **M14 — Fiscal**, que definirá exatamente o que a emissão de NFC-e exige. **[DECISÃO D6]**

### 3.2 `branches` (filiais)

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id` | `uuid` | PK, `DEFAULT uuidv7()` | |
| `company_id` | `uuid` | `NOT NULL`, FK → `companies(id)` | RLS |
| `name` | `text` | `NOT NULL`, 1–100 caracteres; `UNIQUE (company_id, name)` | Ex.: "Centro", "Shopping Norte" |
| `tax_id` | `text` | `NULL`, `UNIQUE`, mesmo formato do CNPJ | CNPJ próprio da filial (opcional) |
| `timezone` | `text` | `NOT NULL DEFAULT 'America/Sao_Paulo'` | IANA; validado na aplicação (`Intl.supportedValuesOf('timeZone')`) |
| `business_day_cutoff` | `time` | `NOT NULL DEFAULT '04:00'` | Virada do **dia operacional** (operações após a meia-noite contam no dia anterior; docs/02 §4) **[DECISÃO D7]** |
| `postal_code` | `text` | `NULL`, `CHECK (postal_code ~ '^[0-9]{8}$')` | CEP |
| `street`, `number`, `complement`, `district`, `city` | `text` | `NULL`, até 150 caracteres cada | Endereço estruturado |
| `state` | `text` | `NULL`, `CHECK (state IN (<27 UFs>))` | UF |
| `status` | `text` | `NOT NULL DEFAULT 'active'`, `CHECK (status IN ('active', 'inactive'))` | |
| `created_at`, `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |

Restrição adicional: `UNIQUE (company_id, id)` (`branches_company_id_id_key`), para que as tabelas operacionais futuras usem FK composta `(company_id, branch_id)` e nunca referenciem filial de outra empresa (docs/02 §3).

### 3.3 `memberships` (vínculo mínimo) **[DECISÃO D1]**

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id` | `uuid` | PK, `DEFAULT uuidv7()` | |
| `company_id` | `uuid` | `NOT NULL`, FK → `companies(id)` | RLS |
| `user_id` | `uuid` | `NOT NULL`, FK → `users(id)` | Usuário global (M02) |
| `status` | `text` | `NOT NULL DEFAULT 'active'`, `CHECK (status IN ('active', 'revoked'))` | |
| `created_at`, `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |

`UNIQUE (company_id, user_id)`; índice `(user_id) WHERE status = 'active'` (listar as empresas do usuário).

O **M04** acrescenta papéis (`membership_roles`), escopo por filial (`all_branches`, `membership_branches`) e convites **nesta mesma tabela**, sem recriá-la.

### 3.4 `sessions.active_company_id` (alteração na tabela do M02)

| Coluna | Tipo | Restrições |
|---|---|---|
| `active_company_id` | `uuid` | `NULL`, FK → `companies(id)` |

A coluna pertence à tabela `sessions` (módulo `identity`). Para não violar a fronteira entre módulos (ADR-001), o schema Drizzle do `identity` declara a coluna **sem** referenciar o schema do `organization`; a FK é criada em SQL na migration (§11).

### 3.5 Exclusão e privilégios

Nada é apagado: empresa é suspensa, filial inativada, vínculo revogado. O `gastrohub_app` recebe `SELECT`, `INSERT` e `UPDATE` nas três tabelas, **sem `DELETE`** (mesmo padrão do M02, D13). Nenhum DDL.

## 4. Empresa ativa na sessão

### 4.1 Regras

- `sessions.active_company_id` indica a empresa em que a sessão opera; pode ser `NULL`.
- **Seleção automática no login:** se o usuário tiver **exatamente um** vínculo ativo com empresa ativa, ela já vem selecionada; com zero ou mais de um, fica `NULL` e a interface pede a escolha. **[DECISÃO D5]**
- **Troca** (`POST /api/v1/session/active-company`):
  - valida que o vínculo e a empresa estão ativos;
  - cria um **token novo** com a nova empresa ativa e revoga o anterior (`revoked_reason = 'company_switched'`, valor novo no `CHECK` do M02);
  - devolve novo cookie e novo CSRF (rotação exigida pelo ADR-004).
- **Revalidação a cada requisição de tenant:** se o vínculo for revogado ou a empresa suspensa durante a sessão, a próxima requisição de tenant responde 403 `company_access_revoked` e `active_company_id` volta a `NULL`. A sessão continua válida para escolher outra empresa.

### 4.2 Contexto da requisição

O `AuthContext` do M02 passa a ser `{ userId, sessionId, activeCompanyId: string | null }`. O `GET /api/v1/auth/session` ganha o campo `activeCompany: { id, tradeName } | null`, uma mudança **aditiva** prevista na M02 §10.3.

## 5. Fluxos

| Fluxo | Comportamento |
|---|---|
| Login com 1 empresa | `active_company_id` definido na criação da sessão; a web vai direto para `/` |
| Login com 0 empresas | Sessão sem empresa; a web mostra "Você ainda não está vinculado a nenhuma empresa. Fale com o responsável." |
| Login com 2+ empresas | Sessão sem empresa; a web mostra o seletor (`/selecionar-empresa`) |
| Trocar empresa | Seletor no cabeçalho → `POST /session/active-company` → cookie e CSRF novos → os dados da nova empresa são recarregados |
| Empresa sem vínculo / inexistente | 404 `company_not_found`, sem distinguir "não existe" de "não é membro" |
| Rota de tenant sem empresa ativa | 403 `active_company_required` |
| Vínculo revogado ou empresa suspensa durante o uso | 403 `company_access_revoked`; a web volta ao seletor |

## 6. RLS (ADR-003)

### 6.1 Variáveis de contexto (por transação)

| Variável | Valor | Uso |
|---|---|---|
| `app.company_id` | empresa ativa | isolamento de todas as tabelas de tenant |
| `app.user_id` | usuário autenticado | **somente** para o usuário enxergar os próprios vínculos e as empresas a que pertence (seletor) **[DECISÃO D3]** |

Ambas são aplicadas com `set_config(..., true)` (escopo da transação). Sem elas, `current_setting(..., true)` é `NULL` e nada é visível: o sistema **falha fechado**.

### 6.2 Políticas **[DECISÃO D4]**

Todas as tabelas: `ENABLE` + `FORCE ROW LEVEL SECURITY`.

```sql
-- branches: somente a empresa ativa
CREATE POLICY tenant_isolation ON branches
  USING      (company_id = current_setting('app.company_id', true)::uuid)
  WITH CHECK (company_id = current_setting('app.company_id', true)::uuid);

-- memberships: os vínculos da empresa ativa OU os vínculos do próprio usuário
CREATE POLICY tenant_or_own ON memberships
  USING      (company_id = current_setting('app.company_id', true)::uuid
              OR user_id  = current_setting('app.user_id', true)::uuid)
  WITH CHECK (company_id = current_setting('app.company_id', true)::uuid);

-- companies: a empresa ativa OU as empresas em que o usuário tem vínculo ativo
CREATE POLICY tenant_or_member ON companies
  USING (id = current_setting('app.company_id', true)::uuid
         OR id IN (SELECT company_id FROM memberships
                    WHERE user_id = current_setting('app.user_id', true)::uuid
                      AND status = 'active'))
  WITH CHECK (id = current_setting('app.company_id', true)::uuid);
```

- **Escrita** só é permitida na empresa do contexto (`WITH CHECK`). Gravar com `company_id` de outra empresa é recusado pelo banco.
- A política de `companies` consulta `memberships`, mas a de `memberships` não consulta `companies`: não há recursão.
- `users`, `sessions` e `auth_events` continuam globais, sem RLS de tenant (M02 §10.2).

### 6.3 Caminhos entre empresas

ADR-003: consultas entre empresas exigem um caminho explícito.
- **Seletor de empresas:** usa `app.user_id`, que mostra só os vínculos do próprio usuário. Nunca há listagem de todas as empresas.
- **CLI de operação** (§9): cada comando age sobre **uma** empresa identificada pelo id e aplica o contexto dela. Não existe comando "listar todas as empresas".
- Nenhum papel de banco ignora a RLS (exceto o superusuário, que a aplicação recusa desde o M01).

## 7. `TenantDb` (`shared/tenancy`)

```ts
tenantDb.run({ companyId, userId }, async (tx) => { /* queries Drizzle */ })
```

- Abre uma transação, executa `SELECT set_config('app.company_id', $1, true), set_config('app.user_id', $2, true)` e chama a função.
- Todo acesso a tabela de tenant **deve** passar por ele. O acesso direto ao pool fica restrito a `shared/database` e às tabelas globais do `identity`.
- `run({ userId })` sem empresa é permitido **somente** para o seletor (vínculos e empresas do próprio usuário).
- Uso explícito em cada caso de uso, sem interceptor "mágico" por requisição, para que as fronteiras de transação fiquem visíveis no código. **[DECISÃO D3]**
- Compatível com pool em modo transação (PgBouncer): o contexto é `SET LOCAL`. A validação com PgBouncer real fica para o ADR de deploy.

## 8. API

| Método | Rota | Empresa ativa | CSRF | Resposta |
|---|---|---|---|---|
| `GET` | `/api/v1/companies` | Não | — | `{ data: [{ id, tradeName, legalName, active: boolean }] }`: empresas com vínculo ativo; `active` marca a empresa da sessão |
| `POST` | `/api/v1/session/active-company` | Não | Sim | `{ session, csrfToken, activeCompany }` + `Set-Cookie`; 404 `company_not_found` |
| `GET` | `/api/v1/company` | **Sim** | — | Empresa ativa: `{ id, legalName, tradeName, taxId, status }` |
| `GET` | `/api/v1/branches` | **Sim** | — | `{ data: [{ id, name, taxId, timezone, businessDayCutoff, address, status }] }` |
| `GET` | `/api/v1/auth/session` | Não | — | Inclui `activeCompany: { id, tradeName } \| null` (aditivo) |

Códigos novos (membro `code`, Problem Details): `active_company_required` (403), `company_access_revoked` (403), `company_not_found` (404). **[DECISÃO D10]**

Rotas de tenant usam o decorator `@RequiresCompany()`. O guard correspondente (`TenantGuard`, módulo `organization`) roda depois do `AuthGuard` e revalida o vínculo.

## 9. CLI operacional **[DECISÃO D2]**

No M03 não há edição pela interface: quem pode criar e editar empresas, filiais e vínculos é uma regra de **autorização** (M04). Até lá, a operação é feita pela CLI, no mesmo padrão do M02 (`src/cli`, compilada, roda também no container):

| Comando | Efeito |
|---|---|
| `pnpm company:create --legal-name … --trade-name … --cnpj …` | Valida o CNPJ (DV, alfanumérico) e cria a empresa; imprime o **id** |
| `pnpm company:suspend <companyId>` / `company:activate <companyId>` | Altera o status |
| `pnpm branch:create <companyId> --name … [--cnpj … --timezone … --cutoff HH:MM --cep … --street … …]` | Cria a filial |
| `pnpm member:add <companyId> <email>` | Vincula um usuário existente (ou reativa o vínculo) |
| `pnpm member:remove <companyId> <email>` | Revoga o vínculo; sessões com essa empresa ativa perdem o acesso na próxima requisição |

Cada comando aplica `app.company_id` da empresa alvo (caminho explícito, §6.3).

**Auditoria [DECISÃO D12]:** as operações administrativas realizadas pela CLI serão registradas nos logs operacionais da aplicação, sem criar `audit_logs` no M03. O M04 será responsável por introduzir a auditoria por empresa (`audit_logs`) e definir sua política. Os logs do M03 não devem ser tratados como substitutos da auditoria de negócio.

## 10. Frontend

| Rota | Conteúdo |
|---|---|
| `/selecionar-empresa` | Lista "minhas empresas"; escolher → troca a empresa ativa → `/` |
| Cabeçalho (área autenticada) | Nome fantasia da empresa ativa; menu para trocar (se houver 2 ou mais) |
| `/empresa` | **Somente leitura:** razão social, nome fantasia, CNPJ formatado, filiais (nome, cidade/UF, fuso, virada do dia, status) |
| Estado sem empresa | Mensagem orientando a procurar o responsável (nenhum vínculo) |

- `RequireCompany`: rotas de tenant redirecionam para `/selecionar-empresa` quando não há empresa ativa.
- `403 company_access_revoked` em qualquer chamada: limpa o estado e volta ao seletor com a mensagem "Seu acesso a esta empresa foi encerrado."
- A troca de empresa **limpa todo o cache** de dados do TanStack Query (nada de uma empresa aparece na outra).

## 11. Migration

| Ordem | Nome | Conteúdo |
|---|---|---|
| 2 | `0002_tenancy` | `companies`, `branches`, `memberships` com constraints e índices; `sessions.active_company_id` + FK; `revoked_reason` aceita `company_switched`; RLS (`ENABLE`/`FORCE`) e políticas da §6.2; `REVOKE DELETE` das três tabelas para `gastrohub_app` |

Gerada pelo drizzle-kit; políticas, `FORCE`, FK da `sessions` e `REVOKE` escritos à mão e revisados. Somente para frente; em desenvolvimento, o rollback é recriar o volume.

## 12. Testes

### 12.1 Isolamento (obrigatório para cada tabela de tenant, docs/02 §6)

Para `companies`, `branches` e `memberships`, com as empresas A e B:
1. no contexto de A, nada de B é visível;
2. no contexto de A, inserir ou atualizar linha com `company_id` de B é **recusado pelo banco**;
3. sem contexto, a consulta retorna **zero linhas**;
4. `app.user_id` mostra apenas os vínculos e empresas do próprio usuário, nunca os de terceiros;
5. o mesmo vale via API: um usuário de A não obtém dados de B por nenhuma rota (404/403).

### 12.2 Demais

| Área | Casos |
|---|---|
| Banco | Privilégios (sem `DELETE`, sem DDL), `FORCE` ativo, constraints (CNPJ, UF, CEP, fuso), `UNIQUE (company_id, id)` |
| CNPJ | DV numérico e alfanumérico válidos e inválidos; normalização (pontuação, minúsculas) |
| Login | 1 empresa → selecionada; 0 ou 2+ → `null` |
| Troca de empresa | Rotação (cookie e CSRF novos; antigo → 401); empresa sem vínculo → 404 idêntico a inexistente; empresa suspensa → 404 |
| Revalidação | Vínculo revogado / empresa suspensa durante o uso → 403 `company_access_revoked` e `active_company_id` limpo |
| Guard | Rota `@RequiresCompany()` sem empresa → 403 `active_company_required` |
| `TenantDb` | Contexto aplicado e restrito à transação (não vaza para a próxima conexão do pool) |
| CLI | Criar empresa, filial e vínculo; suspender; remover vínculo |
| Frontend | Seletor, troca (limpa o cache), página Empresa, estados sem empresa e acesso encerrado |
| Regressão | Toda a suíte do M02 continua verde |

## 13. Critérios de aceite

- [ ] Migration `0002_tenancy` aplicada como `gastrohub_owner`
- [ ] RLS com `FORCE` e as políticas da §6.2 nas três tabelas
- [ ] Testes de isolamento da §12.1 para cada tabela, inclusive via API
- [ ] `gastrohub_app` sem `DELETE` e sem DDL (teste)
- [ ] `TenantDb` usado em todo acesso a tabela de tenant (revisão + regra de fronteira)
- [ ] Empresa ativa: seleção automática, troca com rotação, revalidação a cada requisição
- [ ] Endpoints da §8 com Problem Details e códigos novos
- [ ] CLI da §9
- [ ] Frontend da §10
- [ ] Nenhum papel, permissão, convite ou regra de negócio
- [ ] Lint, fronteiras, typecheck, testes, build e CI verdes; documentação e CHANGELOG atualizados
- [ ] PR para `main`; merge somente com autorização

## 14. Estrutura prevista

```text
apps/api/src/shared/tenancy/          # TenantDb (técnico, sem regra de negócio)
apps/api/src/modules/organization/
├── domain/          # CNPJ, UF, fuso, regras de status
├── application/     # CompanyService, MembershipService, ActiveCompanyService, admin (CLI)
├── infrastructure/  # schema Drizzle, repositórios (sempre via TenantDb)
├── http/            # controllers, TenantGuard, @RequiresCompany()
└── index.ts
apps/api/src/cli/organization-cli.ts
packages/contracts/src/organization.ts
apps/web/src/features/organization/
```

O `identity` não importa o `organization`. O `organization` usa a interface pública do `identity` (AuthContext e a rotação de sessão com empresa ativa).

## 15. Fora do escopo

| Item | Onde fica |
|---|---|
| Papéis, permissões, RBAC, escopo por filial, convites, gestão de usuários pela interface | M04 |
| Edição de empresa/filial pela interface (depende de "quem pode") | M04 em diante |
| `audit_logs` por empresa (e sua política) | M04 (D12) |
| Filial ativa / filial padrão do usuário | Módulo que precisar dela primeiro (Caixa/PDV) **[DECISÃO D11]** |
| Dados fiscais (IE, regime, CNAE, endereço fiscal, certificado) | M14 |
| CPF como identificação de empresa | Fora (D6) |
| Planos, cobrança, onboarding self-service de empresa | Backlog |
| Listagem/administração global de empresas (painel da plataforma) | Backlog (exige ADR) |
| Produtos, pedidos, PDV, caixa, estoque e qualquer regra de negócio | Módulos correspondentes |

## 16. Decisões (aprovadas em 2026-10-03)

D1–D11 aprovadas sem alteração. D12 aprovada com a redação definida pelo responsável:

> **D12** — As operações administrativas realizadas pela CLI serão registradas nos logs operacionais da aplicação, sem criar `audit_logs` no M03. O M04 será responsável por introduzir a auditoria por empresa (`audit_logs`) e definir sua política. Os logs do M03 não devem ser tratados como substitutos da auditoria de negócio.

| # | Decisão | Alternativa considerada | Por quê |
|---|---|---|---|
| **D1** | **Vínculo mínimo (`memberships`) no M03**, sem papéis; o M04 estende a mesma tabela | Esperar o M04 para ter vínculos | Sem vínculo não há como validar a empresa ativa (ADR-004) nem testar o isolamento |
| **D2** | Empresas, filiais e vínculos geridos **por CLI**; a web só lê e troca de empresa | Editar pela web já no M03 | "Quem pode editar" é autorização (M04); evita inventar regras de permissão |
| **D3** | Contexto `app.company_id` + `app.user_id` por transação, via helper explícito `TenantDb.run` | Só `app.company_id`; interceptor transacional automático | `app.user_id` permite o seletor sem caminho que ignore a RLS; helper explícito deixa as transações visíveis |
| **D4** | Políticas da §6.2 (membro enxerga as próprias empresas; escrita só na empresa ativa) | Função `SECURITY DEFINER` para listar empresas | Com `FORCE`, nenhuma função ignora a RLS; política declarativa é testável |
| **D5** | Seleção automática da empresa no login quando há exatamente uma | Sempre exigir a escolha | Caso mais comum (uma hamburgueria) sem passo extra |
| **D6** | Identificação **só por CNPJ**, com suporte ao CNPJ alfanumérico; CPF fora; demais dados fiscais no M14 | Incluir IE, regime e CNAE já | O M14 definirá o que a NFC-e exige; evita campos sem uso |
| **D7** | Filial com fuso IANA (padrão `America/Sao_Paulo`), endereço estruturado, CNPJ opcional e **virada do dia operacional** (padrão 04:00) | Endereço em JSON; sem virada do dia | A virada é necessária para caixa e relatórios (docs/02 §4); colunas estruturadas são validáveis |
| **D8** | Status: empresa `active/suspended`, filial `active/inactive`, vínculo `active/revoked`; sem `DELETE` | Exclusão física | Padrão do projeto (docs/02 §4) e do M02 (D13) |
| **D9** | Módulo **`organization`** + helper técnico `shared/tenancy` | Módulo `tenancy` | O módulo tem dados de negócio (empresas e filiais); `shared/tenancy` é só mecanismo |
| **D10** | Códigos `active_company_required` (403), `company_access_revoked` (403), `company_not_found` (404) | Reusar 401/404 genéricos | O frontend precisa distinguir "escolha uma empresa" de "faça login" |
| **D11** | **Filial ativa fora** do M03 | Filial ativa na sessão já | Nenhum fluxo do M03 a usa; o módulo que precisar dela (Caixa/PDV) define a regra |
| **D12** | Operações administrativas da CLI registradas nos logs operacionais, sem `audit_logs` no M03; o M04 introduz a auditoria por empresa e define sua política; os logs do M03 **não** substituem a auditoria de negócio | Criar `audit_logs` já no M03 | `audit_logs` é escopo do M04 (roadmap); evita adiantar o modelo de auditoria |

## 17. Pontos de atenção

- **Revalidação por requisição:** uma consulta a mais em cada rota de tenant (vínculo + status da empresa). É o custo de revogação imediata, coerente com o ADR-004; cache fica para quando houver medição.
- **CNPJ alfanumérico:** o algoritmo de DV converte cada caractere em `código ASCII − 48`, e os dois dígitos verificadores continuam numéricos. Os testes incluem exemplos oficiais.
- **Unicidade de CNPJ global:** a restrição `UNIQUE` vale entre empresas mesmo com RLS. Na CLI, tentar cadastrar um CNPJ já existente revela que ele existe, mas só ao operador, nunca a usuários da web.
- O M04 precisará revisitar o `TenantGuard` para acrescentar a verificação de permissões, sem alterar o mecanismo de tenancy.
