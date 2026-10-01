# 03 — Segurança

> Status: **estratégia inicial (proposta)**. Nada aqui está implementado ainda.
> Este documento **não** afirma conformidade com nenhuma norma ou lei (incluindo LGPD), nem certificação. Conformidade exige implementação, processos e evidências, que serão produzidos ao longo dos módulos.

## 1. Autenticação

Decisão em [ADR-004](decisions/ADR-004-autenticacao.md).

| Item | Estratégia |
|---|---|
| Credencial | E-mail + senha |
| Hash de senha | **Argon2id** (parâmetros recomendados pela OWASP, revisados periodicamente) |
| Política de senha | Mínimo de 12 caracteres; verificação contra lista de senhas vazadas; sem regras de composição arbitrárias |
| Sessão | Token opaco aleatório (256 bits) em cookie `httpOnly`, `Secure`, `SameSite=Lax`. O banco guarda apenas o **hash** do token |
| Expiração | Expiração por inatividade + expiração absoluta; rotação do token no login e na troca de empresa ativa |
| Revogação | Logout, troca de senha e ação do administrador revogam sessões |
| Força bruta | Rate limit por IP e por conta; atraso progressivo; mensagem genérica ("credenciais inválidas") |
| Recuperação | Token de uso único, expira em minutos, armazenado como hash |
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
| **CSRF** | `SameSite=Lax` + exigência de cabeçalho customizado/token CSRF em métodos mutáveis + validação de `Origin` |
| **Validação de entrada** | Schema zod em toda entrada (body, query, params); rejeitar campos desconhecidos; limites de tamanho |
| **Mass assignment** | DTOs explícitos; `company_id` e campos de controle nunca vêm do cliente |
| **Rate limiting** | Global por IP + regras mais restritas em login, recuperação de senha e endpoints caros. Em memória no início; Redis quando houver várias instâncias |
| **Cabeçalhos** | Helmet: HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors` |
| **CORS** | Lista explícita de origens permitidas |
| **Dependências** | Lockfile versionado; Dependabot/Renovate; `pnpm audit` no CI |
| **Uploads** (futuro) | Tipo e tamanho validados; armazenamento fora do servidor da aplicação; sem execução |

## 6. Logs e auditoria

- **Logs de aplicação** (pino, JSON): `request_id`, `user_id`, `company_id`, rota, status e latência. **Nunca** registrar senhas, tokens, cookies ou dados de cartão. O logger terá uma lista de redaction.
- **Auditoria** (`audit_logs`, append-only): login/logout, falhas de login, mudanças de permissão, criação ou remoção de usuários, cancelamentos, estornos, ajustes de estoque, abertura e fechamento de caixa, alteração de preço. O registro guarda quem, o quê, quando, de onde e os valores antes e depois.
- O papel da aplicação não pode alterar nem apagar registros de auditoria.

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
