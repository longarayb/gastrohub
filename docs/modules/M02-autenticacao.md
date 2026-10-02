# M02 — Autenticação

- Status: **Aprovada pelo responsável em 2026-10-02** (D1–D15 aprovadas; D4 com o ajuste incorporado na §9.5). Implementação ainda não iniciada
- Data: 2026-10-02
- Dependências: M01 (concluído)
- ADRs: [ADR-004](../decisions/ADR-004-autenticacao.md) (aceito; esta especificação o detalha e não o substitui), [ADR-003](../decisions/ADR-003-multi-tenancy.md), [ADR-001](../decisions/ADR-001-monolito-modular.md), [ADR-002](../decisions/ADR-002-stack.md)
- Documentos base: [03-SEGURANCA](../03-SEGURANCA.md), [02-BANCO-DE-DADOS](../02-BANCO-DE-DADOS.md), [04-API](../04-API.md), [M01](M01-fundacao-tecnica.md)

> Itens marcados com **[DECISÃO Dn]** foram decisões desta especificação, **aprovadas** pelo responsável (registro na §17). Todo o resto é herdado do ADR-004 e dos documentos base.

---

## 1. Objetivo

Permitir que uma pessoa **comprove quem é** (e-mail + senha) e mantenha uma **sessão segura e revogável** no navegador. O resultado do M02 é uma identidade autenticada (`userId`, `sessionId`) disponível em cada requisição, que os módulos seguintes usarão para contexto de empresa (M03) e autorização (M04).

### Autenticação × Autorização

| | Autenticação (M02) | Autorização (M04) |
|---|---|---|
| Pergunta | *Quem é você?* | *O que você pode fazer, em qual empresa/filial?* |
| Resultado | `userId` + `sessionId` válidos, ou 401 | permitido, ou 403 |
| Dados | `users`, `sessions`, `auth_events` | `memberships`, `roles`, `permissions` |
| Neste módulo | **Sim** | **Não**. Nenhum papel, permissão, vínculo ou checagem de empresa |

O M02 só sabe responder "esta requisição pertence ao usuário X pela sessão Y". Ele **nunca** responde "X pode fazer Z".

## 2. Escopo

### Incluído

1. Módulo de backend `identity` (dono de `users`, `sessions` e `auth_events`). **[DECISÃO D15]**
2. Hash de senha com Argon2id e política de senha.
3. Login, logout, consulta da sessão atual, troca de senha.
4. Sessões opacas em cookie, com expiração por inatividade e absoluta, revogação e rotação.
5. Gestão das próprias sessões: listar dispositivos, encerrar uma sessão, encerrar todas as outras.
6. Guard global de **autenticação**: nega por padrão; rotas públicas são marcadas explicitamente.
7. Proteção CSRF (token sincronizador + validação de origem).
8. Rate limiting de login e limite global por IP.
9. Registro de eventos de segurança (`auth_events`), append-only.
10. Provisionamento de usuários por **linha de comando** (sem cadastro público). **[DECISÃO D2]**
11. Frontend: tela de login, proteção de rotas, sessão expirada, logout, troca de senha, lista de sessões.
12. Pipe de validação zod para entradas HTTP (infraestrutura técnica reutilizável).
13. Testes unitários, de integração e de segurança do banco.

### Fora do escopo (§16 detalha)

RBAC, permissões, papéis, empresas, filiais, vínculos, convites, **recuperação de senha por e-mail** **[DECISÃO D1]**, verificação de e-mail, infraestrutura de e-mail, MFA, SSO, PIN de operador, API keys, qualquer regra de negócio.

### Recuperação de senha e e-mail no M02 **[DECISÃO D1]**

- **Redefinição operacional via CLI:** `pnpm user:set-password <email>` (§6.9) é o único mecanismo de redefinição no M02. Executada por um operador com acesso ao ambiente, revoga todas as sessões e registra `password_set_by_operator`.
- **Recuperação de senha por e-mail** (link ou token de uso único) será implementada **posteriormente**, em módulo próprio, junto da infraestrutura de e-mail que também atenderá os convites do M04.
- **Verificação de e-mail** fica fora do M02 (sem coluna `email_verified_at`, §4.2).
- **Infraestrutura de e-mail** (SMTP, mailpit, templates, fila de envio) fica fora do M02.
- Consequência: não existe no M02 nenhum endpoint de "esqueci minha senha" e, portanto, nenhum ponto de enumeração por recuperação de senha.

## 3. Modelo de autenticação (herdado do ADR-004)

| Elemento | Definição |
|---|---|
| Implementação | Própria, seguindo OWASP (Session Management, Password Storage, Authentication, CSRF Prevention). **Sem** Auth0, Keycloak, Clerk, Cognito ou bibliotecas de autenticação de terceiros |
| Credencial | E-mail + senha |
| Senha | Argon2id (§9.1) |
| Sessão | Token opaco de **256 bits** (32 bytes de `crypto.randomBytes`), codificado em base64url (43 caracteres) |
| Armazenamento do token | No banco, **somente** `SHA-256(token)` (32 bytes, `bytea`). O token original nunca é gravado nem logado |
| Transporte | Cookie `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sem `Domain` (§9.3) |
| CSRF | Token sincronizador derivado da sessão em `X-CSRF-Token` + validação de `Origin`/`Sec-Fetch-Site` + `Content-Type: application/json` obrigatório (§9.4) |
| Expiração | Por inatividade (idle) e absoluta (§5.2) |
| Revogação | Logout, "encerrar outras sessões", encerrar sessão específica, troca de senha, desativação do usuário (CLI) |
| Rotação | Toda autenticação gera um token **novo** (nunca reaproveita o cookie recebido); troca de senha gera token novo para a sessão atual. A troca de empresa ativa (rotação prevista no ADR-004) será implementada no **M03** |

## 4. Modelo de dados

> As tabelas **não são criadas** nesta etapa. Migration prevista na §11.

### 4.1 Visão geral

```text
users (global) ──< sessions (global)
   │
   └──< auth_events (global, append-only)   ← também referencia sessions (opcional)
```

As três tabelas são **globais** (sem `company_id`): o usuário é global e o vínculo com empresas é do M04 (docs/02 §3). Ver §10 sobre RLS.

### 4.2 `users`

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id` | `uuid` | PK, `DEFAULT uuidv7()` | |
| `email` | `text` | `NOT NULL`, `UNIQUE` (`users_email_key`), `CHECK (email = lower(email) AND email = btrim(email))`, `CHECK (char_length(email) BETWEEN 3 AND 254)`, `CHECK (position('@' in email) > 1)` | Normalizado pela aplicação (NFC + trim + minúsculas) **[DECISÃO D6]** |
| `name` | `text` | `NOT NULL`, `CHECK (char_length(btrim(name)) BETWEEN 1 AND 120)` | Nome de exibição |
| `password_hash` | `text` | `NOT NULL`, `CHECK (password_hash LIKE '$argon2id$%')` | String PHC do Argon2id (inclui sal e parâmetros). **Nunca** senha em texto |
| `status` | `text` | `NOT NULL DEFAULT 'active'`, `CHECK (status IN ('active', 'disabled'))` | Usuário `disabled` não autentica |
| `password_changed_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Sessões criadas antes disso são inválidas (§5.3) |
| `last_login_at` | `timestamptz` | `NULL` | |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Atualizado pela aplicação |

Não há `email_verified_at` no M02: não existe verificação de e-mail (sem infraestrutura de e-mail, D1). A coluna será adicionada pelo módulo que introduzir verificação/convites.

### 4.3 `sessions`

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id` | `uuid` | PK, `DEFAULT uuidv7()` | Identificador público da sessão (usado na lista de dispositivos). **Não** autentica nada sozinho |
| `user_id` | `uuid` | `NOT NULL`, FK → `users(id)` `ON DELETE CASCADE` | |
| `token_hash` | `bytea` | `NOT NULL`, `UNIQUE` (`sessions_token_hash_key`), `CHECK (octet_length(token_hash) = 32)` | `SHA-256` do token. Nunca o token |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |
| `last_seen_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Base do timeout por inatividade; atualizado no máximo a cada 5 min |
| `expires_at` | `timestamptz` | `NOT NULL`, `CHECK (expires_at > created_at)` | Expiração absoluta |
| `revoked_at` | `timestamptz` | `NULL` | |
| `revoked_reason` | `text` | `NULL`, `CHECK (revoked_reason IN ('logout', 'revoked_by_user', 'revoked_others', 'password_changed', 'replaced', 'session_limit', 'user_disabled', 'operator'))` | |
| `ip` | `inet` | `NULL` | IP de criação (dado pessoal; §9.9) |
| `user_agent` | `text` | `NULL`, `CHECK (char_length(user_agent) <= 512)` | Truncado pela aplicação |

Constraints adicionais:

- `CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))`.

Índices:

| Índice | Definição | Uso |
|---|---|---|
| `sessions_token_hash_key` | `UNIQUE (token_hash)` | Autenticação de cada requisição |
| `sessions_user_active_idx` | `(user_id, created_at DESC) WHERE revoked_at IS NULL` | Listar sessões ativas; limite por usuário; revogações em massa |
| `sessions_expires_at_idx` | `(expires_at)` | Expurgo futuro (§9.9) |

Não há `active_company_id` no M02. A coluna (nullable, FK para `companies`) e a rotação na troca de empresa serão adicionadas pelo **M03**, que cria `companies` (não criamos colunas para tabelas inexistentes).

### 4.4 `auth_events` (eventos de segurança, append-only) **[DECISÃO D5]**

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id` | `uuid` | PK, `DEFAULT uuidv7()` | |
| `occurred_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |
| `event_type` | `text` | `NOT NULL`, `CHECK (event_type IN (...))` (lista abaixo) | |
| `user_id` | `uuid` | `NULL`, FK → `users(id)` `ON DELETE SET NULL` | Nulo quando o e-mail não corresponde a usuário |
| `session_id` | `uuid` | `NULL`, FK → `sessions(id)` `ON DELETE SET NULL` | |
| `identifier_hash` | `bytea` | `NULL`, `CHECK (octet_length(identifier_hash) = 32)` | `HMAC-SHA256(chave, e-mail normalizado)`. Permite contar tentativas por conta **sem gravar e-mails digitados em texto** |
| `ip` | `inet` | `NULL` | |
| `user_agent` | `text` | `NULL`, `CHECK (char_length(user_agent) <= 512)` | |
| `request_id` | `text` | `NULL`, `CHECK (char_length(request_id) <= 128)` | Correlação com os logs |
| `details` | `jsonb` | `NOT NULL DEFAULT '{}'` | Somente metadados (ex.: `{"reason": "wrong_password"}`). **Nunca** senha, token, cookie, CSRF ou e-mail em texto |

`event_type` permitido:

| Evento | Quando |
|---|---|
| `login_succeeded` | Login aceito |
| `login_failed` | Credenciais inválidas (`details.reason`: `unknown_user`, `wrong_password`, `user_disabled`) |
| `login_rate_limited` | Tentativa bloqueada por rate limit (`details.scope`: `account_ip`, `account` ou `ip`; `details.operation`: `login` ou `password_change`). **Só interno**: o cliente nunca é informado do bloqueio por conta (§9.5) |
| `logout` | Logout da sessão atual |
| `session_revoked` | Sessão encerrada pelo próprio usuário |
| `sessions_revoked_others` | "Encerrar outras sessões" |
| `password_changed` | Troca de senha pelo próprio usuário |
| `password_change_failed` | Senha atual incorreta na troca de senha (conta para o rate limit) |
| `user_created` | Usuário criado via CLI |
| `user_disabled` / `user_enabled` | Via CLI |
| `password_set_by_operator` | Senha redefinida via CLI |

Índices:

| Índice | Definição | Uso |
|---|---|---|
| `auth_events_identifier_time_idx` | `(identifier_hash, occurred_at DESC)` | Rate limit por conta |
| `auth_events_ip_time_idx` | `(ip, occurred_at DESC)` | Rate limit por IP |
| `auth_events_user_time_idx` | `(user_id, occurred_at DESC)` | Investigação |

`auth_events` é a trilha de segurança **global** (pré-tenant). Ela **não** substitui a `audit_logs` do M04, que é por empresa (docs/02 §3) e registrará ações de negócio.

### 4.5 Dados que nunca são armazenados em texto puro

| Dado | Como é tratado |
|---|---|
| Senha | Somente hash Argon2id (`users.password_hash`) |
| Token de sessão | Somente `SHA-256` (`sessions.token_hash`) |
| Token CSRF | Não armazenado: derivado por HMAC do `session.id` (§9.4) |
| E-mail digitado em tentativa de login | Somente `HMAC-SHA256` (`auth_events.identifier_hash`) |
| `AUTH_SECRET` | Somente no `.env` / secret manager |

## 5. Sessões

### 5.1 Criação

1. Gerar `token = randomBytes(32)`; `token_hash = sha256(token)`.
2. Inserir em `sessions` com `expires_at = now() + SESSION_ABSOLUTE_TTL`, `ip`, `user_agent` (truncado em 512).
3. Se o usuário passar a ter mais de **20** sessões ativas, revogar as mais antigas com `revoked_reason = 'session_limit'`. **[DECISÃO D3]**
4. Enviar `Set-Cookie` com o token (base64url) e `Max-Age` = segundos até `expires_at` (cookie persistente). **[DECISÃO D3]**
5. Responder com o `csrfToken` da nova sessão.

### 5.2 Validade **[DECISÃO D3]**

Uma sessão é **válida** se, e somente se:

```text
revoked_at IS NULL
AND now() < expires_at                                  -- absoluta (padrão: 7 dias)
AND now() < last_seen_at + SESSION_IDLE_TTL             -- inatividade (padrão: 12 horas)
AND users.status = 'active'
AND sessions.created_at >= users.password_changed_at    -- defesa extra após troca de senha
```

| Configuração | Padrão | Limites aceitos |
|---|---|---|
| `SESSION_IDLE_TTL_MINUTES` | `720` (12 h) | 15 a 1440 |
| `SESSION_ABSOLUTE_TTL_HOURS` | `168` (7 dias) | 1 a 720, e maior que o idle |

Justificativa dos padrões: um turno de restaurante passa de 8 horas, e um terminal de PDV não pode deslogar no meio do serviço. Papéis administrativos com timeouts menores ficam para o M04 (backlog).

### 5.3 Uso em cada requisição

1. O guard lê o cookie; ausente → 401 `unauthenticated` (se a rota não for pública).
2. Decodifica base64url; formato inválido (≠ 32 bytes) → 401 `unauthenticated`, sem consultar o banco.
3. Busca `sessions JOIN users` por `token_hash = sha256(token)`.
4. Não encontrada → 401 `unauthenticated`. Encontrada, mas revogada → 401 `session_revoked`. Expirada (absoluta ou idle) → 401 `session_expired`. Usuário desativado ou senha trocada depois da criação → 401 `session_revoked`.
5. Em qualquer 401 com cookie presente, a resposta **limpa o cookie** (`Max-Age=0`).
6. Válida: se `last_seen_at` tiver mais de 5 minutos, atualiza para `now()` (uma escrita a cada 5 min no máximo).
7. Anexa à requisição o contexto `AuthContext { userId, sessionId }`.

Sessões expiradas **não** são atualizadas no momento da detecção: a invalidade é calculada. O expurgo é tratado na §9.9.

### 5.4 Revogação

`UPDATE sessions SET revoked_at = now(), revoked_reason = ...` (nunca `DELETE`). Revogação é imediata: a próxima requisição com aquele cookie recebe 401.

### 5.5 Rotação

| Evento | Comportamento |
|---|---|
| Login com cookie de sessão válida já presente | Cria sessão nova; a anterior é revogada com `replaced` (impede fixação de sessão) |
| Troca de senha | Cria sessão nova para o dispositivo atual; revoga **todas** as outras e a atual antiga com `password_changed` |
| Troca de empresa ativa | **M03** |

Não há rotação periódica: os limites de inatividade e absoluto já limitam a vida do token.

## 6. Fluxos

### 6.1 Login

```text
Cliente                         API
  │ POST /api/v1/auth/login       │
  │ {email, password}             │
  │──────────────────────────────►│ 1. Origin/Sec-Fetch-Site + Content-Type JSON  → 403/415
  │                               │ 2. Validação zod                               → 400
  │                               │ 3. Normaliza e-mail; identifier_hash = HMAC
  │                               │ 4. Rate limit por IP (§9.5)                    → 429 genérico (+ evento)
  │                               │ 5. Rate limit por conta / conta+IP (§9.5):
  │                               │    bloqueado → Argon2id contra hash fictício
  │                               │    → 401 genérico (idêntico a senha errada)
  │                               │    + login_rate_limited (interno)
  │                               │ 6. Busca usuário por e-mail
  │                               │ 7. Argon2id verify (hash real OU hash fictício)
  │                               │ 8. Falha (usuário inexistente, senha errada,
  │                               │    desativado) → 401 genérico + login_failed
  │                               │ 9. Sucesso: rehash se parâmetros mudaram;
  │                               │    revoga sessão do cookie recebido (replaced);
  │                               │    cria sessão (§5.1); last_login_at;
  │                               │    login_succeeded
  │◄──────────────────────────────│ 200 + Set-Cookie + {user, session, csrfToken}
```

Regras:

- A mensagem de falha é **sempre a mesma**, com o mesmo status (401), para usuário inexistente, senha errada, usuário desativado **e conta bloqueada por rate limit**. Mensagem única: "E-mail ou senha inválidos. Após várias tentativas, aguarde alguns minutos antes de tentar novamente."
- Durante um bloqueio por conta, nem a senha correta autentica, e a resposta continua a mesma (o cliente não distingue "bloqueado" de "senha errada").
- Usuário inexistente: o servidor executa Argon2id contra um **hash fictício** pré-computado no boot, com os mesmos parâmetros, para igualar o tempo de resposta.
- O login não exige CSRF token (não há sessão), mas exige origem permitida e JSON (§9.4).

### 6.2 Sessão existente (boot do SPA)

`GET /api/v1/auth/session` → 200 com usuário, metadados da sessão e `csrfToken`; ou 401 com `code`. O frontend chama esse endpoint ao carregar.

### 6.3 Sessão expirada

Requisição com cookie expirado → 401, `code: "session_expired"`, cookie limpo. O frontend redireciona para `/login?next=<rota>` com a mensagem "Sua sessão expirou. Entre novamente."

### 6.4 Sessão revogada

Requisição com cookie de sessão revogada (logout em outro dispositivo, troca de senha, limite de sessões, usuário desativado) → 401, `code: "session_revoked"`, cookie limpo. O frontend exibe "Sua sessão foi encerrada. Entre novamente."

### 6.5 Logout

`POST /api/v1/auth/logout` (com CSRF) → revoga a sessão atual (`logout`), limpa o cookie, evento `logout`, 204. Sem sessão válida → 204 e cookie limpo (idempotente; nada a revogar).

### 6.6 Troca de senha

`POST /api/v1/auth/password` (autenticado, com CSRF), body `{currentPassword, newPassword}`:

1. Rate limit pela conta (mesmos contadores do login, §9.5): se bloqueado, Argon2id contra hash fictício e resposta **idêntica** à senha atual incorreta (400 `invalid_current_password`), com evento interno `login_rate_limited` (`operation: password_change`). Limite por IP → 429 genérico.
2. Verifica `currentPassword`; incorreta → 400 `invalid_current_password` + evento `password_change_failed` (conta como falha para o rate limit). A sessão **não** é derrubada.
3. Valida a política da nova senha (§9.2) → 400 com `errors[]`.
4. Nova senha igual à atual → 400 (`password_reused`).
5. Em uma transação: grava o novo hash e `password_changed_at = now()`; revoga **todas** as sessões do usuário (`password_changed`); cria uma sessão nova para o dispositivo atual.
6. 200 + `Set-Cookie` novo + `{session, csrfToken}`; evento `password_changed`.

### 6.7 Múltiplas sessões / dispositivos

- Um usuário pode ter até 20 sessões ativas (D3). Cada login em outro navegador/dispositivo cria uma sessão independente.
- `GET /api/v1/auth/sessions`: lista as sessões **ativas** do próprio usuário, marcando a atual.
- `DELETE /api/v1/auth/sessions/{id}`: encerra uma sessão do próprio usuário (`revoked_by_user`). Id de outro usuário, inexistente ou já inativo → 404 (sem distinguir). Encerrar a própria sessão atual por essa rota equivale a logout (o cookie é limpo).
- `POST /api/v1/auth/sessions/revoke-others`: encerra todas as outras (`revoked_others`).

### 6.8 Tentativa inválida e força bruta

Ver §9.5 (rate limit) e §9.6 (enumeração e timing).

### 6.9 Provisionamento e administração de usuários (CLI) **[DECISÃO D2]**

Não há cadastro público nem tela de administração de usuários no M02 (convites e gestão são do M04). Comandos em `apps/api/scripts/` (Node 24, type stripping), conectando como `gastrohub_app`:

| Comando | Efeito |
|---|---|
| `pnpm user:create` | Pergunta e-mail, nome e senha (**sem eco**, com confirmação); valida a política; cria o usuário; evento `user_created` |
| `pnpm user:set-password <email>` | Nova senha sem eco; revoga todas as sessões (`operator`); evento `password_set_by_operator`. É o mecanismo de recuperação enquanto D1 estiver adiada |
| `pnpm user:disable <email>` / `pnpm user:enable <email>` | Altera o `status`; desativar revoga todas as sessões (`user_disabled`) |

As senhas são lidas só de TTY interativo (ou de `--password-stdin`, para automação). Nunca vêm de argumentos de linha de comando, que ficam no histórico do shell.

### 6.10 CSRF e rate limiting

Fluxos detalhados em §9.4 e §9.5.

## 7. API

Prefixo `/api/v1/auth`. Todas as respostas de erro usam **Problem Details** (M01), com o membro de extensão **`code`** (string estável para o frontend). **[DECISÃO D14]** Exemplo:

```json
{
  "type": "about:blank",
  "title": "Não autenticado",
  "status": 401,
  "detail": "Sua sessão expirou.",
  "instance": "/api/v1/auth/session",
  "requestId": "01a0f9…",
  "code": "session_expired"
}
```

### 7.1 Endpoints

| Método | Rota | Autenticação | CSRF | Sucesso |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/login` | Pública | Origem + JSON | 200 |
| `POST` | `/api/v1/auth/logout` | Sessão (opcional, idempotente) | Sim, se houver sessão | 204 |
| `GET` | `/api/v1/auth/session` | Sessão | — | 200 |
| `POST` | `/api/v1/auth/password` | Sessão | Sim | 200 |
| `GET` | `/api/v1/auth/sessions` | Sessão | — | 200 |
| `DELETE` | `/api/v1/auth/sessions/{id}` | Sessão | Sim | 204 |
| `POST` | `/api/v1/auth/sessions/revoke-others` | Sessão | Sim | 204 |

Todas as demais rotas sob `/api/v1` passam a exigir sessão por padrão (guard global de autenticação). Rotas públicas: `/health/*`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout` e `/api/docs` (fora de produção).

### 7.2 Schemas (em `packages/contracts`)

```ts
// Entradas (campos desconhecidos são rejeitados)
loginRequest          = { email: string (email, ≤254), password: string (1..256) }
changePasswordRequest = { currentPassword: string (1..256), newPassword: string (política §9.2) }

// Saídas
authUser       = { id: uuid, email: string, name: string }
sessionInfo    = { id: uuid, createdAt: datetime, expiresAt: datetime, idleExpiresAt: datetime }
loginResponse  = { user: authUser, session: sessionInfo, csrfToken: string }
currentSession = { user: authUser, session: sessionInfo, csrfToken: string }
passwordChangedResponse = { session: sessionInfo, csrfToken: string }
sessionListItem = { id: uuid, createdAt: datetime, lastSeenAt: datetime, expiresAt: datetime,
                    ip: string | null, userAgent: string | null, current: boolean }
sessionList    = { data: sessionListItem[] }
```

`idleExpiresAt = lastSeenAt + SESSION_IDLE_TTL`. O token de sessão **nunca** aparece em corpo de resposta, só no `Set-Cookie`.

### 7.3 Respostas por endpoint

**`POST /login`**

| Status | `code` | Quando |
|---|---|---|
| 200 | — | Sucesso; `Set-Cookie` |
| 400 | `validation_failed` | Corpo inválido (`errors[]`) |
| 401 | `invalid_credentials` | Usuário inexistente, senha errada, usuário desativado **ou conta bloqueada por rate limit** (indistinguíveis). `detail`: "E-mail ou senha inválidos. Após várias tentativas, aguarde alguns minutos antes de tentar novamente." |
| 403 | `origin_not_allowed` | Origem não permitida |
| 415 | — | `Content-Type` diferente de `application/json` |
| 429 | `rate_limited` | **Somente** limite por IP ou limite global (nunca por conta). `detail` genérico: "Muitas requisições. Tente novamente mais tarde."; cabeçalho `Retry-After` (segundos) |

**`POST /logout`**: 204 sempre que a origem for válida; 403 `csrf_failed` se houver sessão válida e o token CSRF estiver ausente ou incorreto; 403 `origin_not_allowed`.

**`GET /session`**: 200; 401 `unauthenticated` / `session_expired` / `session_revoked`.

**`POST /password`**: 200; 400 `validation_failed` (política, com `errors[]` em `newPassword`) / `invalid_current_password` (também quando a conta está bloqueada por rate limit) / `password_reused`; 401; 403 `csrf_failed`/`origin_not_allowed`; 429 `rate_limited` (só por IP/global).

**`GET /sessions`**: 200; 401.

**`DELETE /sessions/{id}`**: 204; 400 (id não é UUID); 401; 403; 404 `session_not_found`.

**`POST /sessions/revoke-others`**: 204; 401; 403.

Erros comuns a qualquer rota autenticada: 401 (sem sessão, expirada, revogada); 403 `csrf_failed`/`origin_not_allowed` em métodos mutáveis; 429 do limite global.

### 7.4 Cookie

| Atributo | Produção | Desenvolvimento (`NODE_ENV=development`) |
|---|---|---|
| Nome | `__Host-gh_session` | `gh_session` |
| `HttpOnly` | sim | sim |
| `Secure` | sim | **não** (HTTP em `127.0.0.1`), permitido só em desenvolvimento **[DECISÃO D10]** |
| `SameSite` | `Lax` | `Lax` |
| `Path` | `/` | `/` |
| `Domain` | ausente | ausente |
| `Max-Age` | até `expires_at` | até `expires_at` |

A configuração recusa iniciar se `SESSION_COOKIE_SECURE=false` com `NODE_ENV` diferente de `development`.

## 8. Frontend

**[DECISÃO D12]** Rotas:

| Rota | Acesso | Conteúdo |
|---|---|---|
| `/login` | Pública (autenticado → redireciona para `next` ou `/`) | Formulário de login |
| `/` | Protegida | Área inicial **mínima**: "Olá, {nome}", links para Minha conta, botão Sair. Sem dashboard |
| `/conta/senha` | Protegida | Troca de senha |
| `/conta/sessoes` | Protegida | Sessões ativas, encerrar uma, encerrar outras |
| `/status` | Pública | Página "Status do sistema" do M01 (sai de `/`) |

### 8.1 Gerenciamento da sessão

- Estado vindo de `GET /api/v1/auth/session` (TanStack Query, chave `['auth', 'session']`), consultado no carregamento.
- O `csrfToken` fica **somente em memória** (cache do Query). Nunca em `localStorage`/`sessionStorage`. O cookie é `HttpOnly` e o JavaScript não o lê.
- Cliente HTTP único (`apiFetch`): `credentials: 'same-origin'`, `Content-Type: application/json` e `X-CSRF-Token` automático em métodos mutáveis, além de conversão de Problem Details em erro tipado com `code`.

### 8.2 Proteção de rotas

- Componente `RequireAuth`: enquanto a sessão carrega, mostra "Carregando…". Com 401, redireciona para `/login?next=<caminho atual>`.
- `next` só é aceito se for caminho **relativo** interno (começa com `/`, não com `//`). Caso contrário, usa `/` (evita open redirect).

### 8.3 Sessão expira ou é revogada durante o uso

Qualquer resposta 401 de qualquer chamada: limpa o cache, redireciona para `/login?next=…` e mostra a mensagem do `code` (`session_expired` → "Sua sessão expirou."; `session_revoked` → "Sua sessão foi encerrada."; demais → nada). Resposta 403 `csrf_failed`: refaz `GET /auth/session` (token novo) e informa "Tente novamente."

### 8.4 Login

- Campos: e-mail (`autocomplete="username"`, `type="email"`) e senha (`autocomplete="current-password"`).
- Botão desabilitado durante o envio. Erros: 401 → exibe o `detail` genérico da API ("E-mail ou senha inválidos. Após várias tentativas, aguarde alguns minutos antes de tentar novamente."); 429 (só limite por IP/global) → "Muitas requisições. Tente novamente mais tarde." (sem mencionar conta); 400 → mensagens por campo; falha de rede → "Não foi possível conectar ao servidor."
- Nenhum indicador de "este e-mail não existe".

### 8.5 Logout e troca de senha

- "Sair": `POST /logout` → limpa cache → `/login`.
- Troca de senha: senha atual (`current-password`), nova e confirmação (`new-password`); requisitos exibidos (mínimo de 12 caracteres); após sucesso, mensagem "Senha alterada. As outras sessões foram encerradas."

## 9. Segurança

### 9.1 Argon2id **[DECISÃO D7]**

| Item | Valor |
|---|---|
| Biblioteca | `@node-rs/argon2` (binários pré-compilados, sem script de instalação) |
| Parâmetros | `m = 19456 KiB (19 MiB)`, `t = 2`, `p = 1`, sal aleatório de 16 bytes, hash de 32 bytes (mínimo recomendado pela OWASP) |
| Formato | String PHC (`$argon2id$v=19$m=19456,t=2,p=1$…`) |
| Rehash | No login bem-sucedido, se os parâmetros do hash forem inferiores aos atuais, recalcular e gravar |
| Hash fictício | Gerado no boot com os mesmos parâmetros, para a verificação de usuário inexistente |
| Pepper | Não usado no M02 (avaliado: complica rotação; ganho marginal com Argon2id) |
| Concorrência | Verificações de senha limitadas a **4 simultâneas** por processo (fila), para que uma rajada de logins não esgote memória e CPU |

### 9.2 Política de senha **[DECISÃO D8]**

- Normalização Unicode **NFC** antes de validar e de calcular o hash.
- Mínimo de **12** caracteres; máximo de **128** (protege o custo do hash).
- Todos os caracteres imprimíveis permitidos, inclusive espaços e acentos. **Sem** regras de composição (OWASP/NIST 800-63B).
- Bloqueio de senhas comuns: lista local versionada (10 mil senhas mais comuns, em `apps/api/src/modules/identity/domain/`), comparação sem diferenciar maiúsculas.
- Bloqueio contextual: a senha não pode conter a parte local do e-mail nem ser igual ao nome do usuário ou a "gastrohub".
- Verificação contra vazamentos via serviço externo (HIBP, k-anonymity) **fica no backlog**: chamada externa, dependência de disponibilidade e decisão de privacidade.

### 9.3 Armazenamento da sessão

Ver §4.3, §5 e §7.4. O banco guarda só o hash, comparado por igualdade em índice único. Comparar hashes de um segredo de 256 bits não é sensível a timing.

### 9.4 CSRF **[DECISÃO D9]**

Três camadas, todas aplicadas a métodos mutáveis (`POST`, `PUT`, `PATCH`, `DELETE`):

1. **Origem.** `Origin` deve estar em `CORS_ORIGINS` (lista já existente do M01). Se ausente, aceita só `Sec-Fetch-Site: same-origin`. Sem nenhum dos dois → 403 `origin_not_allowed`.
2. **Tipo de conteúdo.** Corpo apenas `application/json`: formulários HTML cross-site não conseguem enviá-lo sem preflight CORS.
3. **Token sincronizador** (rotas autenticadas): `X-CSRF-Token` = `base64url(HMAC-SHA256(K_csrf, session.id))`, comparado com `timingSafeEqual`. Não é armazenado (derivado do id), muda a cada sessão nova (login, troca de senha) e é o mesmo em todas as abas da mesma sessão.

`SameSite=Lax` no cookie é uma camada adicional, não a única defesa. Métodos `GET`/`HEAD` nunca alteram estado.

### 9.5 Rate limiting **[DECISÃO D4]**

**Login e troca de senha**: contadores sobre `auth_events` (PostgreSQL), válidos com várias instâncias da API e sem Redis.

| Regra | Chave | Limite | Janela |
|---|---|---|---|
| Conta + IP | `identifier_hash` + `ip` | 5 falhas | 15 min |
| Conta (qualquer IP) | `identifier_hash` | 20 falhas | 60 min |
| IP (qualquer conta) | `ip` | 50 falhas | 15 min |

- "Falhas" = `login_failed` + `password_change_failed`. Tentativas já bloqueadas (`login_rate_limited`) **não** contam como novas falhas. Um login bem-sucedido zera a contagem conta + IP (só contam falhas posteriores ao último `login_succeeded` daquela conta naquele IP).
- Os contadores funcionam igual para e-mails inexistentes (`identifier_hash` sem `user_id`).
- Ordem de avaliação: **IP** primeiro, depois **conta + IP**, depois **conta**.

#### Resposta ao cliente: nada é revelado sobre a conta (ajuste aprovado da D4)

| Regra atingida | Resposta externa | Registro interno (`auth_events`) |
|---|---|---|
| Conta + IP | **Idêntica a credenciais inválidas**: 401 `invalid_credentials` (login) ou 400 `invalid_current_password` (troca de senha). Argon2id executado contra o hash fictício, sem diferença de tempo | `login_rate_limited`, `details.scope = "account_ip"` |
| Conta | Idem | `login_rate_limited`, `details.scope = "account"` |
| IP | 429 `rate_limited`, mensagem genérica, `Retry-After`. Não executa Argon2id. Não menciona conta nem e-mail | `login_rate_limited`, `details.scope = "ip"` |
| Global | 429 `rate_limited`, mensagem genérica | (log de aplicação; não grava `auth_events`) |

Garantias:

- O cliente **não consegue distinguir** conta existente de inexistente, nem conta bloqueada de senha errada: status, corpo, cabeçalhos e ordem de grandeza do tempo são iguais.
- A mensagem única de 401 já orienta o usuário legítimo ("após várias tentativas, aguarde alguns minutos"), sem confirmar o bloqueio.
- O 429 só aparece pelas regras de IP e global, que dizem respeito à conexão do cliente e não carregam informação sobre nenhuma conta.
- Este bloqueio por janela substitui o "atraso progressivo" citado em docs/03. É mais simples, determinístico e não prende conexões abertas.

#### Mitigação de account lockout / negação de serviço

Risco: um atacante que conheça o e-mail de uma vítima pode gerar falhas para bloquear o login dela.

| Medida | Efeito |
|---|---|
| **Bloqueios sempre temporários** (janelas deslizantes de 15 e 60 min) | Não existe bloqueio permanente nem desbloqueio manual; a conta volta sozinha |
| **Regra conta + IP isola o atacante** | Falhas geradas a partir do IP do atacante não contam contra o IP da vítima nessa regra |
| **Isenção por IP confiável na regra "conta"** | A regra "conta (qualquer IP)" **não se aplica** a um IP de onde aquela conta teve `login_succeeded` nos últimos **30 dias**. Um ataque distribuído não bloqueia o usuário na rede de sempre (restaurante, casa). Nesse IP vale apenas a regra conta + IP, que exige que as falhas venham do próprio IP |
| **Tentativas bloqueadas não renovam o bloqueio** | `login_rate_limited` não conta como falha; o atacante precisa de falhas "reais" a cada janela |
| **Regra por IP** (50 falhas/15 min) | Limita quantas contas um único IP atacante consegue atingir |
| **Trilha interna** | Todo bloqueio grava `login_rate_limited` com escopo, IP e `identifier_hash`, o que permite detectar ataques (alertas automáticos ficam para quando houver observabilidade) |
| **Operador** | Pode redefinir a senha via CLI (§6.9) se houver suspeita de comprometimento; não há "desbloqueio", porque o bloqueio expira |

Risco residual aceito: durante um ataque distribuído contra uma conta específica, um login da vítima a partir de um IP **novo** (sem login bem-sucedido nos últimos 30 dias) pode ficar bloqueado por até 60 min. A trilha em `auth_events` permite identificar a situação.

**Limite global** (todas as rotas, exceto `/health/*`): `@fastify/rate-limit`, **300 requisições/min por IP**, em memória. Limitação documentada: com várias instâncias, cada uma conta separadamente (Redis entra quando houver mais de uma instância; docs/03).

**IP do cliente** **[DECISÃO D11]**: nova variável `TRUST_PROXY` (padrão `false`; o profile `app` do compose usa `1`, para confiar no nginx). Sem ela, todo tráfego vindo do proxy pareceria vir de um único IP.

### 9.6 Enumeração de usuários e timing

- Mesma resposta (401, mesmo `detail`, mesmo `code`) para usuário inexistente, senha errada, usuário desativado e conta bloqueada por rate limit.
- Argon2id sempre executado nesses quatro casos (hash fictício quando não há hash real a verificar), o que deixa o tempo semelhante.
- Rate limit idêntico para contas existentes e inexistentes; bloqueio por conta nunca exposto (§9.5).
- Não há endpoint que diga se um e-mail existe (sem cadastro público; sem recuperação de senha no M02).
- Comparações de segredos (CSRF) com `crypto.timingSafeEqual`.

### 9.7 Logs sem credenciais

Ampliar a redaction do pino (M01) com: `*.currentPassword`, `*.newPassword`, `*.csrfToken`, `req.headers["x-csrf-token"]` (cookie e authorization já cobertos). Os corpos de requisição não são logados. Eventos de autenticação no log da aplicação incluem só `userId`, `sessionId`, `event` e `requestId`. Teste automatizado: os logs de um login completo não contêm a senha, o token nem o CSRF.

### 9.8 Auditoria

`auth_events` (§4.4) é **append-only** para o runtime: `gastrohub_app` tem só `SELECT` e `INSERT` (sem `UPDATE`/`DELETE`), conforme docs/03 §6 ("o papel da aplicação não pode alterar nem apagar registros de auditoria").

### 9.9 LGPD e retenção

| Dado | Finalidade | Retenção proposta |
|---|---|---|
| E-mail, nome | Identificação e login | Enquanto a conta existir |
| IP e user agent (`sessions`) | Segurança; lista de dispositivos | 30 dias após o fim da sessão |
| IP, user agent, `identifier_hash` (`auth_events`) | Segurança, prevenção de fraude, investigação | 180 dias |

O **expurgo** (apagar sessões e eventos antigos) exige `DELETE`, que o runtime não tem (§10). Ele será feito por uma rotina de manutenção executada como `gastrohub_owner`, definida junto com o ADR de deploy/jobs (backlog). Até lá, os dados se acumulam sem expurgo, o que é aceitável em desenvolvimento, sem dados reais.

### 9.10 Segredo da aplicação **[DECISÃO D9]**

Nova variável `AUTH_SECRET` (mínimo de 32 bytes, gerada pelo `pnpm env:init`). Chaves derivadas por HKDF-SHA256:

- `K_csrf` (info `gastrohub/csrf/v1`): token CSRF;
- `K_identifier` (info `gastrohub/login-identifier/v1`): `identifier_hash`.

Trocar o `AUTH_SECRET` invalida os tokens CSRF em uso (o frontend obtém um novo em `GET /auth/session`) e reinicia os contadores de rate limit por conta. Não derruba sessões.

## 10. Banco, papéis e RLS

### 10.1 Separação owner/app (M01)

- A migration roda como `gastrohub_owner`. **Nenhum** privilégio de DDL é concedido ao `gastrohub_app`.
- Privilégios de runtime nas tabelas do M02 (mínimo necessário):

| Tabela | `gastrohub_app` |
|---|---|
| `users` | `SELECT`, `INSERT`, `UPDATE` (**sem** `DELETE`) |
| `sessions` | `SELECT`, `INSERT`, `UPDATE` (**sem** `DELETE`) |
| `auth_events` | `SELECT`, `INSERT` (**sem** `UPDATE`/`DELETE`) |

A migration revoga explicitamente o que os default privileges do M01 concederam além disso (`REVOKE DELETE ON users, sessions FROM gastrohub_app; REVOKE UPDATE, DELETE ON auth_events FROM gastrohub_app;`). **[DECISÃO D13]**

### 10.2 RLS

As três tabelas são **globais**, não de tenant: **não têm `company_id` e não recebem RLS por empresa** no M02. Isso é consistente com o ADR-003, cuja política vale para tabelas de tenant, e com docs/02 §2, que prevê que o login busca o usuário pelo e-mail antes de existir tenant.

Justificativa e controles compensatórios:

- O login precisa localizar o usuário por e-mail **antes** de existir qualquer contexto. Uma política por usuário exigiria `SET` de contexto antes da busca, o que não acrescenta segurança.
- O acesso fica confinado ao módulo `identity` (fronteira do dependency-cruiser). Nenhum endpoint do M02 lista ou expõe usuários de terceiros: as rotas de sessões filtram por `user_id` da sessão autenticada, coberto por teste.
- O M04, ao listar usuários de uma empresa, fará isso via `memberships`, que é de tenant e tem RLS, e não por leitura direta de `users`.

Nenhuma solução improvisada de RLS é criada. Se, no futuro, `users` precisar de RLS (ex.: administração de plataforma), isso exigirá um ADR.

### 10.3 Preparação para o contexto de empresa (M03/M04)

O M02 entrega o `AuthContext { userId, sessionId }`. O M03, que cria `companies`, vai acrescentar:

- a coluna `sessions.active_company_id` (FK para `companies`);
- o endpoint de troca de empresa ativa, com rotação de token (ADR-004);
- a aplicação de `app.company_id` por transação (ADR-003).

O M04 adiciona vínculos e permissões. O M02 **não** cria nada disso nem regras sobre empresa e filial. `GET /auth/session` foi desenhado para receber campos novos (ex.: `activeCompany`) sem quebrar o contrato.

## 11. Migrations

| Ordem | Nome | Conteúdo |
|---|---|---|
| 1 | `0001_identity_auth` | Tabelas `users`, `sessions`, `auth_events`; constraints e índices da §4; `REVOKE` da §10.1 |

- Gerada pelo `drizzle-kit generate --name=identity_auth` a partir do schema Drizzle do módulo (`apps/api/src/modules/identity/infrastructure/schema.ts`, exportado pelo schema agregado). Os `REVOKE` e `CHECK` não suportados pelo gerador são adicionados manualmente e revisados.
- Aplicada como `gastrohub_owner` (`pnpm db:migrate` / `db:migrate:test`).
- **Rollback**: migrations são somente para frente (docs/02 §5). Em desenvolvimento, o rollback é recriar o banco (`docker compose down -v`). Para referência e testes, o SQL inverso documentado é:

  ```sql
  DROP TABLE auth_events; DROP TABLE sessions; DROP TABLE users;
  ```

  Não há migration "down" versionada.
- `seed:dev` (desenvolvimento): cria um usuário de exemplo **somente** se `NODE_ENV=development`, com senha informada no momento (sem senha fixa no repositório).

## 12. Variáveis de ambiente novas

| Variável | Padrão | Regras |
|---|---|---|
| `AUTH_SECRET` | gerado por `env:init` | Obrigatória; mínimo de 32 bytes (base64url) |
| `SESSION_IDLE_TTL_MINUTES` | `720` | 15 a 1440 |
| `SESSION_ABSOLUTE_TTL_HOURS` | `168` | 1 a 720, maior que o idle |
| `SESSION_COOKIE_SECURE` | `true` | `false` só com `NODE_ENV=development` |
| `TRUST_PROXY` | `false` | `false` ou número de hops (`1` no profile `app`) |
| `CORS_ORIGINS` (existente) | `http://localhost:5173,http://127.0.0.1:5173` | Passa a valer também para a validação de origem do CSRF. O valor do `.env.example` ganha `127.0.0.1` |

O `env:init` passa a gerar `AUTH_SECRET`. Para quem já tem `.env`, o README documenta como acrescentar a variável sem regenerar as senhas do banco.

## 13. Estrutura prevista

```text
apps/api/src/modules/identity/
├── domain/            # política de senha, lista de senhas comuns, regras de validade de sessão
├── application/       # LoginService, SessionService, PasswordService, RateLimiter
├── infrastructure/    # schema Drizzle, repositórios, hasher Argon2id, gerador de tokens
├── http/              # AuthController, SessionsController, AuthGuard, CsrfGuard, cookies
├── identity.module.ts
└── index.ts           # interface pública: AuthContext, @CurrentAuth(), guards
apps/api/src/shared/http/public.decorator.ts   # @Public() (metadado; o guard fica no módulo identity)
apps/api/src/shared/http/zod-validation.pipe.ts
apps/api/scripts/user-*.ts                     # CLI de usuários
packages/contracts/src/auth.ts
apps/web/src/features/auth/                    # login, RequireAuth, apiFetch, conta
```

## 14. Testes

### 14.1 Unitários

| Área | Casos |
|---|---|
| Política de senha | 11 caracteres rejeitado; 12 aceito; 129 rejeitado; senha comum rejeitada (sem diferenciar maiúsculas); contém parte local do e-mail; normalização NFC (formas compostas e decompostas equivalentes) |
| Hasher | Hash em formato PHC argon2id com os parâmetros definidos; verify correto e incorreto; `needsRehash` para parâmetros antigos |
| Tokens | Token de 32 bytes; base64url de 43 caracteres; `sha256` determinístico; tokens distintos a cada geração |
| CSRF | Token derivado estável por sessão; difere entre sessões; comparação aceita o correto e rejeita alterado ou ausente |
| Validade de sessão | Válida; revogada; expirada (absoluta); expirada (idle); usuário desativado; criada antes de `password_changed_at` |
| Normalização de e-mail | Trim, minúsculas e NFC; `identifier_hash` igual para variações de caixa |
| Rate limiter | Abaixo do limite permite; no limite bloqueia com o escopo correto (`account_ip`, `account`, `ip`); `Retry-After` correto para o escopo `ip`; sucesso zera conta + IP; tentativas bloqueadas não contam como falha; IP com login bem-sucedido nos últimos 30 dias isento da regra "conta" |
| `next` do frontend | Aceita `/conta`; rejeita `//evil.com`, `https://evil.com`, `javascript:` |

### 14.2 Integração (API + `gastrohub_test`)

| Caso | Esperado |
|---|---|
| Login com senha correta | 200, `Set-Cookie` com atributos corretos, `csrfToken`, linha em `sessions`, evento `login_succeeded` |
| Login com senha incorreta | 401 `invalid_credentials`, sem cookie, evento `login_failed` |
| Login de usuário inexistente | 401 com corpo **idêntico** ao da senha incorreta; tempo na mesma ordem de grandeza (Argon2id executado; verificado por contagem de chamadas ao hasher, não por cronômetro) |
| Login de usuário desativado | 401 idêntico |
| Sessão válida | `GET /auth/session` 200 |
| Sessão expirada (idle e absoluta) | 401 `session_expired` e cookie limpo (datas manipuladas no banco de teste) |
| Sessão revogada | 401 `session_revoked` |
| Logout | 204; o mesmo cookie depois → 401; evento `logout` |
| Token inválido (formato errado, aleatório válido inexistente) | 401 `unauthenticated` |
| Sem cookie em rota protegida | 401 `unauthenticated` |
| CSRF | Rota mutável sem `X-CSRF-Token` → 403; com token de outra sessão → 403; com origem não permitida → 403; sem `Origin` e sem `Sec-Fetch-Site` → 403; `Content-Type` `text/plain` → 415 |
| Rate limiting por conta (não revela bloqueio) | Após 5 falhas (conta + IP), a 6ª tentativa, **mesmo com a senha correta**, recebe resposta byte a byte igual à de senha errada (status, corpo exceto `requestId`, cabeçalhos relevantes); Argon2id executado (contagem de chamadas ao hasher); evento interno `login_rate_limited` com `scope = account_ip`. Mesmo comportamento para a regra "conta" e para e-mail inexistente |
| Rate limiting por IP | 50 falhas do mesmo IP em contas variadas → 429 genérico com `Retry-After`, sem Argon2id, corpo sem e-mail nem menção à conta; evento `scope = ip` |
| Mitigação de lockout | Falhas de vários IPs bloqueiam a regra "conta", mas o login a partir de um IP com `login_succeeded` recente para a mesma conta **é aceito** com a senha correta |
| Troca de senha bloqueada | Conta bloqueada → 400 `invalid_current_password` idêntico ao de senha atual errada; evento interno com `operation = password_change` |
| Troca de senha | Sucesso rotaciona o cookie, revoga as outras sessões (outro "dispositivo" recebe 401), a sessão antiga do próprio dispositivo recebe 401; senha atual errada → 400 e conta para o rate limit; política violada → 400 |
| Múltiplas sessões | Dois logins → lista com 2 e `current` correto; encerrar a outra → ela recebe 401; `revoke-others`; id de sessão de outro usuário → 404; 21º login revoga a mais antiga |
| Login com cookie válido | Sessão anterior revogada (`replaced`) |
| Token irrecuperável | Após o login, nenhuma coluna de nenhuma tabela contém o valor do cookie nem o `csrfToken` (busca em `sessions`, `auth_events` e `users`); `token_hash` = `sha256(cookie)` |
| Senha nunca em texto | `users.password_hash` começa com `$argon2id$` e não contém a senha |
| Logs | Os logs capturados de login, troca de senha e logout não contêm senha, token nem CSRF |
| Guard padrão | Rota de teste sob `/api/v1` sem `@Public()` → 401 sem sessão |
| Rate limit global | Acima de 300 req/min → 429 |
| CLI | `user:create` cria o usuário com hash válido; `user:set-password` e `user:disable` revogam as sessões |

### 14.3 Segurança do banco (estende `database-security.int-spec.ts`)

- `gastrohub_app`: `SELECT/INSERT/UPDATE` em `users` e `sessions`, sem `DELETE`; `SELECT/INSERT` em `auth_events`, sem `UPDATE`/`DELETE` (tentativas retornam `42501`).
- Constraints: e-mail não normalizado rejeitado; `token_hash` com tamanho diferente de 32 rejeitado; `revoked_reason` sem `revoked_at` rejeitado; `password_hash` sem prefixo argon2id rejeitado.
- Ainda nenhuma tabela de tenant e nenhuma tabela de negócio.

### 14.4 Frontend

Login (sucesso, 401, 429, erro de rede); `RequireAuth` redireciona sem sessão e preserva `next`; 401 durante o uso redireciona com a mensagem certa; `apiFetch` envia `X-CSRF-Token` só em métodos mutáveis; logout limpa o estado; o `csrfToken` não é gravado em `localStorage`/`sessionStorage`.

## 15. Critérios de aceite

- [ ] Migration `0001_identity_auth` aplicada como `gastrohub_owner` em `gastrohub` e `gastrohub_test`
- [ ] `users`, `sessions` e `auth_events` com as constraints e os índices da §4
- [ ] `gastrohub_app` sem DDL e com os privilégios exatos da §10.1 (teste)
- [ ] Senhas apenas em Argon2id com os parâmetros da §9.1 (teste)
- [ ] Token de sessão nunca armazenado nem logado; banco só com SHA-256 (teste)
- [ ] Cookie com `HttpOnly`, `SameSite=Lax`, `Path=/`, sem `Domain`; `Secure` e prefixo `__Host-` fora de desenvolvimento (teste)
- [ ] Login, logout, sessão atual, troca de senha, listar, encerrar e revoke-others conforme a §7 (testes)
- [ ] Expiração idle e absoluta, revogação e rotação conforme a §5 (testes)
- [ ] Respostas de falha de login indistinguíveis entre usuário inexistente, senha errada e desativado (teste)
- [ ] CSRF: origem, JSON e token sincronizador (testes)
- [ ] Rate limits da §9.5 (conta + IP, conta, IP, global), incluindo e-mail inexistente (testes)
- [ ] Bloqueio por conta indistinguível de credenciais inválidas para o cliente; 429 só para IP/global; escopo registrado em `auth_events` (testes)
- [ ] Mitigação de lockout: IP com login recente bem-sucedido isento da regra "conta" (teste)
- [ ] Guard global: rotas `/api/v1` exigem sessão por padrão (teste)
- [ ] `auth_events` gravado para todos os eventos da §4.4; append-only para o runtime (teste)
- [ ] Logs sem senha, token ou CSRF (teste)
- [ ] CLI `user:create`, `user:set-password`, `user:disable` e `user:enable` funcionando, sem senhas em argumentos
- [ ] Frontend: login, rotas protegidas, sessão expirada/revogada, logout, troca de senha e sessões (testes)
- [ ] Nenhuma tabela, coluna ou regra de RBAC, empresa ou filial
- [ ] Contratos em `packages/contracts`; OpenAPI documentando os endpoints
- [ ] Lint, fronteiras, typecheck, testes unitários e de integração, build e CI verdes
- [ ] Documentação atualizada (§18) e CHANGELOG
- [ ] PR para `main` com CI verde; merge somente com autorização

## 16. Fora do escopo

| Item | Onde fica |
|---|---|
| RBAC, permissões, papéis, guard de autorização | M04 |
| Vínculos usuário × empresa, convites, gestão de usuários pela interface | M04 |
| Empresas, filiais, empresa ativa na sessão, `app.company_id`, RLS de tenant | M03 |
| `audit_logs` por empresa | M04 |
| Recuperação de senha por e-mail, verificação de e-mail, infraestrutura de e-mail (SMTP, mailpit, templates) | Módulo posterior, junto dos convites do M04 (D1). No M02, a redefinição é operacional, via CLI |
| MFA (TOTP), SSO, login social | Backlog |
| PIN de operador no PDV | M11 |
| API keys, OAuth 2.0, webhooks | M21 |
| Verificação de senhas vazadas via HIBP | Backlog |
| Expurgo automático de sessões e eventos | Backlog (ADR de deploy/jobs) |
| Timeouts por papel (ex.: administradores) | M04 |
| Produtos, pedidos, PDV, caixa, estoque, CRM, fiscal e qualquer regra de negócio | Módulos correspondentes |

## 17. Decisões (aprovadas em 2026-10-02)

Todas as decisões D1–D15 foram **aprovadas** pelo responsável. A **D4** foi aprovada **com ajuste**: o cliente nunca é informado de bloqueio por conta nem da existência da conta (respostas genéricas e idênticas às de credenciais inválidas), os eventos específicos ficam só em `auth_events` e a mitigação de lockout/DoS está documentada (§9.5). A **D1** foi aprovada com o registro explícito do que fica fora (§2: redefinição via CLI, recuperação por e-mail posterior, sem verificação de e-mail nem infraestrutura de e-mail).

| # | Decisão | Alternativa considerada | Motivo |
|---|---|---|---|
| **D1** | **Recuperação de senha por e-mail fora do M02** (assim como verificação de e-mail e infraestrutura de e-mail). Até lá, o operador redefine pela CLI | Incluir no M02 (SMTP, mailpit, templates, tabela de tokens, 2 endpoints) | O roadmap previa no M02, mas a infraestrutura de e-mail será necessária também para os convites do M04; construí-la uma vez, junto, evita retrabalho. Ainda não há usuários reais |
| **D2** | Sem cadastro público; usuários criados por **CLI** | Cadastro público (signup) | O onboarding SaaS e os convites ainda não foram especificados; signup aberto amplia a superfície de ataque |
| **D3** | Inatividade de **12 h**, absoluta de **7 dias**, cookie persistente, máximo de **20 sessões** por usuário | Timeouts curtos (15–30 min) e cookie de sessão | Realidade de turno e de PDV; timeouts menores por papel no M04 |
| **D4** | Rate limit de login **no PostgreSQL** (`auth_events`) por conta + IP, conta e IP, mais limite global por IP em memória; bloqueio por janela. **Ajuste:** bloqueio por conta nunca exposto (resposta idêntica a credenciais inválidas); 429 só para IP/global; escopo registrado internamente; isenção por IP confiável contra lockout | Redis; somente em memória; 429 para todos os bloqueios | Funciona com várias instâncias sem infraestrutura nova; não revela existência nem bloqueio de contas; reduz o risco de DoS por bloqueio |
| **D5** | Tabela **`auth_events`** global e append-only no M02 | Só logs de aplicação até o M04 | docs/03 exige auditoria de login/logout; `audit_logs` é por empresa e só existe no M04 |
| **D6** | E-mail como `text` normalizado (NFC, trim, minúsculas) + `CHECK`, em vez de `citext` (docs/02) | `citext` | Dispensa extensão do PostgreSQL; a normalização explícita é testável |
| **D7** | `@node-rs/argon2`, `m=19 MiB, t=2, p=1`, rehash, até 4 verificações simultâneas | `argon2` (node-gyp); parâmetros maiores | Mínimo OWASP com custo previsível em containers pequenos; sem script de instalação (pnpm `allowBuilds`) |
| **D8** | Lista local de 10 mil senhas comuns + bloqueio contextual; HIBP no backlog | HIBP já no M02 | Evita dependência externa e a decisão de privacidade agora |
| **D9** | CSRF por token derivado (HMAC do id da sessão) + `Origin`/`Sec-Fetch-Site` + JSON obrigatório; novo `AUTH_SECRET` com chaves HKDF | Double-submit cookie; token armazenado no banco | Nada a armazenar; mesmo token em todas as abas; atende o ADR-004 (token + `Origin`) |
| **D10** | Cookie `__Host-gh_session` com `Secure` em produção; `gh_session` sem `Secure` só em `NODE_ENV=development` | `Secure` sempre (exigiria HTTPS local) | O desenvolvimento usa HTTP em `127.0.0.1`; a configuração impede o uso fora de dev |
| **D11** | `TRUST_PROXY` (padrão `false`; `1` no profile `app`) | Manter `trustProxy: false` fixo | Sem isso, o rate limit por IP veria só o IP do nginx |
| **D12** | Rotas web: `/login`, `/` protegida mínima, `/conta/senha`, `/conta/sessoes`; status do M01 vai para `/status` | Manter o status em `/` | `/` passa a ser a área autenticada; o status continua público |
| **D13** | Runtime sem `DELETE` em `users`/`sessions` e sem `UPDATE`/`DELETE` em `auth_events`; expurgo futuro como owner | Manter os default privileges completos | Menor privilégio; revogação é `UPDATE`, nunca `DELETE` |
| **D14** | Membro de extensão `code` no Problem Details | Distinguir só por `title`/`detail` | Códigos estáveis para o frontend, sem depender de texto |
| **D15** | Nome do módulo: **`identity`** | `auth` | Ele é dono de `users`, que o M04 consumirá pela interface pública; "identidade" descreve melhor |

## 18. Documentação a atualizar na implementação

- `docs/02-BANCO-DE-DADOS.md`: tabelas do M02, e-mail sem citext (D6), privilégios por tabela (D13).
- `docs/03-SEGURANCA.md`: parâmetros do Argon2id, política de senha, CSRF, rate limit por janela (D4), `auth_events`.
- `docs/04-API.md`: endpoints de autenticação; membro `code` (D14).
- `docs/05-DEPLOY.md`: novas variáveis; mailpit sai do M02 (D1); `TRUST_PROXY` no profile `app`.
- `docs/06-ROADMAP.md`: recuperação de senha movida (D1).
- `docs/backlog.md`: HIBP, expurgo, timeouts por papel, recuperação de senha.
- Os ADRs **não** são alterados: esta especificação detalha o ADR-004 sem contrariá-lo.

## 19. Plano de implementação (após aprovação)

Branch `feat/m02-autenticacao`; commits pequenos; PR para `main`; merge só com autorização.

1. Contratos (`packages/contracts/src/auth.ts`) e pipe de validação zod.
2. Schema Drizzle + migration `0001_identity_auth` + testes de segurança do banco.
3. Domínio: política de senha, hasher, tokens, CSRF, validade de sessão (com testes unitários).
4. Serviços e repositórios: login, sessão, senha, rate limiter, `auth_events`.
5. HTTP: controllers, guard de autenticação global, `@Public()`, CSRF/origem, cookies, limite global, redaction.
6. CLI de usuários.
7. Testes de integração da §14.2.
8. Frontend: `apiFetch`, sessão, `RequireAuth`, páginas e testes.
9. Configuração (`env:init`, `.env.example`, compose `TRUST_PROXY`), documentação e CHANGELOG.
