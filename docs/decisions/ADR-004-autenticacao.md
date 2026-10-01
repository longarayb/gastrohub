# ADR-004 — Autenticação por sessões opacas no servidor

- Status: Proposto
- Data: 2026-10-01

## Contexto

Os usuários acessam o GastroHub por navegador (back-office, PDV, KDS). Uma pessoa pode pertencer a várias empresas e trocar a empresa ativa. Gerentes precisam conseguir desligar o acesso de um funcionário **imediatamente**. Integrações e a API pública virão depois.

## Problema

Qual mecanismo de autenticação para a interface web é seguro, revogável e simples?

## Alternativas consideradas

| Alternativa | Prós | Contras |
|---|---|---|
| **Sessão opaca (token aleatório em cookie httpOnly, hash no Postgres)** | Revogação imediata; token não carrega dados; simples; sem Redis no início | Uma consulta ao banco por requisição (indexada, barata) |
| JWT de acesso + refresh token | Stateless; comum em APIs | Revogação não é imediata, maior complexidade (rotação e detecção de reuso), risco de JWT em localStorage |
| Provedor externo (Auth0, Clerk, Cognito, Keycloak) | MFA/SSO prontos | Custo por usuário, dependência externa, dados de identidade fora do sistema; Keycloak exige operar mais um serviço |
| Auth.js / Lucia / Better Auth | Bibliotecas prontas | Pouca vantagem num backend NestJS; acoplamento a terceiros em parte crítica |

## Decisão

- Sessões opacas: token de 256 bits em cookie `httpOnly`, `Secure`, `SameSite=Lax`, com o banco armazenando apenas o hash SHA-256.
- Senhas com Argon2id.
- A sessão guarda a `active_company_id`. A troca de empresa valida o vínculo e rotaciona o token.
- Proteção CSRF em métodos mutáveis (cabeçalho/token + validação de `Origin`).
- **API pública/integrações** usarão mecanismo separado (chaves de API com escopo e, depois, OAuth 2.0), definido no módulo correspondente.
- A implementação é própria, mas segue as recomendações do OWASP (Session Management e Password Storage Cheat Sheets).

## Consequências

- Revogação imediata (demissão, troca de senha, dispositivo perdido).
- Frontend e API devem ser servidos no mesmo site (ex.: `app.dominio` e `api.dominio`, ou proxy `/api`) para os cookies funcionarem com `SameSite`.
- Custo de manter código de autenticação próprio. Mitigação: escopo mínimo, testes extensivos e revisão de segurança no M02.
- MFA (TOTP) fica no backlog com prioridade para papéis administrativos.
