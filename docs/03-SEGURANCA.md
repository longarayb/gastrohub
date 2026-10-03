# 03 — Segurança

> Status: **autenticação implementada no M02** (§1, CSRF, rate limiting, logs e `auth_events`; detalhes em [M02](modules/M02-autenticacao.md)). Autorização (RBAC), isolamento por empresa e auditoria por empresa continuam como estratégia para M03/M04.
> Este documento **não** afirma conformidade com nenhuma norma ou lei (incluindo LGPD), nem certificação. Conformidade exige implementação, processos e evidências, que serão produzidos ao longo dos módulos.

## 1. Autenticação

Decisão em [ADR-004](decisions/ADR-004-autenticacao.md).

| Item | Estratégia |
|---|---|
| Credencial | E-mail + senha |
| Hash de senha | **Argon2id** `m=19456 KiB, t=2, p=1` (mínimo OWASP), `@node-rs/argon2`, rehash automático, até 4 verificações simultâneas |
| Política de senha | 12 a 128 caracteres (NFC); sem regras de composição; bloqueio das 10 mil senhas mais comuns (SecLists), da parte local do e-mail (4+ caracteres) e do nome. Verificação de vazamentos (HIBP) no backlog |
| Sessão | Token opaco de 256 bits em cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, sem `Domain`; `__Host-gh_session` com `Secure` fora de desenvolvimento. O banco guarda só o SHA-256 do token |
| Expiração | Inatividade (12 h) + absoluta (7 dias), configuráveis; rotação no login e na troca de senha (troca de empresa ativa: M03) |
| Revogação | Logout, encerrar sessão/outras sessões, troca de senha, usuário desativado e redefinição pelo operador (CLI) |
| Força bruta | Rate limit por conta + IP (5/15 min), conta (20/60 min, com isenção de IP confiável) e IP (50/15 min), por janela (em vez de atraso progressivo). Bloqueio por conta é indistinguível de credenciais inválidas; 429 só por IP/global |
| Recuperação | Por e-mail: módulo posterior (junto dos convites do M04). No M02, redefinição operacional via CLI (`pnpm user:set-password`) |
| MFA | TOTP no backlog, prioritário para papéis administrativos |
| PIN de operador (PDV) | Avaliar no módulo PDV (troca rápida de operador em terminal já autenticado). Não substitui o login |

## 2. Autorização (RBAC)

- **Permissões granulares** declaradas em código (`<recurso>.<ação>`, ex.: `products.create`, `orders.cancel`, `cash.close`).
- **Papéis** agrupam permissões. O sistema fornece papéis-modelo (Proprietário, Gerente, Caixa, Garçom, Cozinha), e cada empresa pode criar os seus.
- **Escopo de filial:** um vínculo pode valer para todas as filiais ou para uma lista delas.
- Toda rota declara a permissão exigida. O guard global **nega por padrão**: uma rota sem declaração explícita não é acessível.
- Ações críticas (cancelar pedido pago, estornar, ajustar estoque, fechar caixa com diferença) podem exigir permissão adicional ou aprovação de supervisor, a definir por módulo.

## 3. Isolamento entre empresas

Detalhado em [02-BANCO-DE-DADOS](02-BANCO-DE-DADOS.md) §2:

- O contexto de tenant vem **da sessão do servidor**, nunca de parâmetro enviado pelo cliente sem validação.
- RLS no PostgreSQL com `FORCE ROW LEVEL SECURITY`, e a aplicação conecta com um papel sem `BYPASSRLS`.
- Testes automatizados de isolamento para cada tabela.
- IDs UUID evitam enumeração, mas **não** substituem a verificação de autorização.

## 4. Credenciais e segredos

- Segredos ficam apenas em variáveis de ambiente / secret manager do provedor. **Nunca no repositório.**
- `.env` é ignorado pelo Git. O versionado é só o `.env.example`, sem valores reais.
- Credenciais de integrações por empresa (ex.: tokens de marketplace) serão cifradas em repouso (envelope encryption) e definidas no módulo de Integrações.
- Varredura de segredos no CI (ex.: gitleaks) a partir do M01.

## 5. Proteções da aplicação

| Ameaça | Mitigação |
|---|---|
| **SQL Injection** | Queries parametrizadas via Drizzle; proibido concatenar SQL com entrada do usuário; SQL bruto só com `sql` template parametrizado e revisão |
| **XSS** | React escapa por padrão; proibido `dangerouslySetInnerHTML` sem sanitização; cabeçalho Content-Security-Policy restritivo; cookies `httpOnly` |
| **CSRF** | Implementado no M02: `Origin` (ou `Sec-Fetch-Site: same-origin`) em todo método mutável + corpo somente JSON (formulários e `text/plain` → 415) + token sincronizador `X-CSRF-Token` (HMAC do id da sessão) nas rotas autenticadas; `SameSite=Lax` como camada adicional |
| **Validação de entrada** | Schema zod em toda entrada (body, query, params); rejeitar campos desconhecidos; limites de tamanho |
| **Mass assignment** | DTOs explícitos; `company_id` e campos de controle nunca vêm do cliente |
| **Rate limiting** | Global: 300 req/min por IP (em memória; Redis quando houver várias instâncias). Login e troca de senha: contadores no PostgreSQL (`auth_events`), válidos entre instâncias (M02 §9.5) |
| **Cabeçalhos** | Helmet: HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors` |
| **CORS** | Lista explícita de origens permitidas |
| **Dependências** | Lockfile versionado; Dependabot/Renovate; `pnpm audit` no CI |
| **Uploads** (futuro) | Tipo e tamanho validados; armazenamento fora do servidor da aplicação; sem execução |

## 6. Logs e auditoria

- **Logs de aplicação** (pino, JSON): `request_id`, `user_id`, `company_id`, rota, status e latência. **Nunca** registrar senhas, tokens, cookies ou dados de cartão. O logger terá uma lista de redaction.
- **Auditoria** (`audit_logs`, append-only): login/logout, falhas de login, mudanças de permissão, criação ou remoção de usuários, cancelamentos, estornos, ajustes de estoque, abertura e fechamento de caixa, alteração de preço. O registro guarda quem, o quê, quando, de onde e os valores antes e depois.
- O papel da aplicação não pode alterar nem apagar registros de auditoria.
- **M02:** eventos de autenticação ficam em `auth_events` (global, pré-tenant, append-only para o runtime). E-mails digitados em tentativas são guardados só como HMAC. A `audit_logs` por empresa (M04) registrará as ações de negócio.

## 7. LGPD: diretrizes de projeto

O GastroHub atua como **operador** dos dados pessoais dos clientes finais das empresas (que são as **controladoras**) e como **controlador** dos dados de seus próprios usuários. A validação jurídica fica a cargo do responsável pelo projeto.

Diretrizes técnicas que serão adotadas:

- **Minimização:** coletar só o necessário (ex.: cliente de delivery = nome, telefone e endereço).
- **Finalidade e base legal** registradas por categoria de dado na especificação do módulo de Clientes/CRM.
- **Consentimento** separado e auditável para marketing (CRM/Fidelidade).
- **Direitos do titular:** suporte técnico para exportar, corrigir e anonimizar dados de um cliente.
- **Retenção:** prazos definidos por categoria; anonimização em vez de exclusão quando houver obrigação fiscal de guarda.
- **Segurança:** TLS em trânsito, criptografia em repouso no provedor e acesso mínimo necessário.
- **Incidentes:** procedimento de resposta a ser documentado antes de entrar em produção.
- **Dados de cartão:** o GastroHub **não armazena** dados de cartão. Pagamentos ficam com gateways/adquirentes certificados (PCI DSS é responsabilidade deles).

## 8. Checklist de segurança por módulo

- [ ] Permissões declaradas e testadas (inclusive acesso negado)
- [ ] Tabelas novas com RLS e testes de isolamento
- [ ] Entradas validadas por schema
- [ ] Ações sensíveis auditadas
- [ ] Sem segredos ou dados pessoais em logs
- [ ] Dados pessoais novos com finalidade e retenção documentadas
