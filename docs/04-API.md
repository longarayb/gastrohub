# 04 — API

> Status: **convenções em uso**. Endpoints existentes: infraestrutura (M01) e autenticação (M02, §10).

## 1. Estilo

- **REST + JSON** sobre HTTPS.
- Prefixo versionado: `/api/v1`.
- Contrato em **OpenAPI 3**, gerado a partir do código (NestJS) e publicado em `/api/docs`. Em produção, essa rota exige autenticação ou fica desabilitada.
- Schemas de entrada e saída definidos em zod em `packages/contracts`, compartilhados com o frontend.

## 2. Recursos e rotas

| Regra | Exemplo |
|---|---|
| Substantivos no plural, kebab-case | `/api/v1/products`, `/api/v1/stock-movements` |
| Recurso por ID | `GET /api/v1/products/{id}` |
| Ações que não são CRUD como sub-recurso de ação | `POST /api/v1/orders/{id}/cancel` |
| Filial explícita quando o recurso é por filial | `GET /api/v1/branches/{branchId}/cash-sessions` |
| JSON em camelCase | `{ "priceCents": 2990 }` |

**A empresa (tenant) nunca vai na URL nem no body.** Ela vem da sessão (empresa ativa). A troca de empresa é feita por `POST /api/v1/session/active-company`.

## 3. Métodos e status

| Método | Uso | Sucesso |
|---|---|---|
| GET | Leitura | 200 |
| POST | Criação / ação | 201 (criação) / 200 ou 202 (ação) |
| PATCH | Atualização parcial | 200 |
| DELETE | Arquivamento/remoção quando permitido | 204 |

Erros comuns: 400 (validação), 401 (não autenticado), 403 (sem permissão), 404 (não existe **ou** pertence a outra empresa, sem distinguir), 409 (conflito/versão), 422 (regra de negócio), 429 (rate limit).

## 4. Formato de erro: Problem Details (RFC 9457)

```json
{
  "type": "https://docs.gastrohub/errors/validation",
  "title": "Dados inválidos",
  "status": 400,
  "detail": "Um ou mais campos são inválidos.",
  "instance": "/api/v1/products",
  "requestId": "01J…",
  "errors": [{ "field": "priceCents", "message": "Deve ser maior ou igual a zero" }]
}
```

Nunca expor stack trace, SQL ou detalhes internos.

Membro de extensão **`code`** (M02, D14): string estável para o frontend tratar o erro sem depender do texto (ex.: `validation_failed`, `invalid_credentials`, `session_expired`, `session_revoked`, `csrf_failed`, `origin_not_allowed`, `rate_limited`). Respostas 429 trazem o cabeçalho `Retry-After`.

## 5. Paginação, filtros e ordenação

- Paginação por **cursor** em listas operacionais grandes (pedidos, movimentações): `?limit=50&cursor=…` → `{ "data": [...], "nextCursor": "…" }`.
- Paginação por página é aceita em cadastros pequenos: `?page=1&pageSize=20`.
- Filtros por query string: `?status=open&createdFrom=2026-10-01`.
- Ordenação: `?sort=-createdAt,name`.
- Limite máximo de `limit`/`pageSize` aplicado no servidor.

## 6. Idempotência e concorrência

- Operações financeiras e de pedido (criar pedido, registrar pagamento) aceitam o cabeçalho **`Idempotency-Key`**, para evitar duplicidade em retentativas, o que é comum em PDV com rede instável.
- Atualizações de entidades concorrentes usam lock otimista (`version`), retornando 409 em caso de conflito.

## 7. Datas e valores

- Datas em ISO 8601 com fuso (`2026-10-01T18:30:00Z`).
- Dinheiro em **centavos inteiros** (`priceCents`), com a moeda implícita BRL nesta fase.
- Quantidades decimais como string (`"0.250"`) para não perder precisão.

## 8. Autenticação da API

- Interface web: cookie de sessão + proteção CSRF ([03-SEGURANCA](03-SEGURANCA.md)). Toda rota exige sessão por padrão (guard global); rotas públicas são marcadas com `@Public()`.
- Métodos mutáveis exigem `Origin` permitida (ou `Sec-Fetch-Site: same-origin`) e corpo `application/json`; em rotas autenticadas, também `X-CSRF-Token`.
- **API pública e integrações** (módulo futuro): chaves de API por empresa, com escopo de permissões, hash armazenado, rotação e rate limit próprio. OAuth 2.0 quando houver aplicações de terceiros.
- **Webhooks de saída** (futuro): assinatura HMAC e retentativas com backoff.

## 9. Endpoints de infraestrutura (M01)

| Rota | Uso |
|---|---|
| `GET /health/live` | O processo está de pé |
| `GET /health/ready` | O processo está pronto (banco acessível) |
| `GET /api/docs` | OpenAPI (restrito em produção) |

## 10. Autenticação (M02)

Contratos completos, códigos de erro e fluxos em [M02 §7](modules/M02-autenticacao.md).

| Método | Rota | Autenticação | CSRF | Sucesso |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/login` | Pública | Origem + JSON | 200 + cookie |
| `POST` | `/api/v1/auth/logout` | Opcional (idempotente) | Sim, se houver sessão | 204 |
| `GET` | `/api/v1/auth/session` | Sessão | — | 200 (`user`, `session`, `csrfToken`) |
| `POST` | `/api/v1/auth/password` | Sessão | Sim | 200 + cookie novo |
| `GET` | `/api/v1/auth/sessions` | Sessão | — | 200 |
| `DELETE` | `/api/v1/auth/sessions/{id}` | Sessão | Sim | 204 |
| `POST` | `/api/v1/auth/sessions/revoke-others` | Sessão | Sim | 204 |
