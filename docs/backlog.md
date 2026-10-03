# Backlog

Funcionalidades e melhorias registradas para o futuro. **Nada aqui deve ser implementado fora do módulo correspondente.**

Formato: `[módulo-alvo] descrição: origem/motivo`.

## Plataforma / técnico

- ~~[M01] Verificação automática de fronteiras entre módulos~~: entregue no M01 (dependency-cruiser).
- ~~[M01] Varredura de segredos (gitleaks) e auditoria de dependências no CI~~: entregue no M01.
- ~~[M01] `.env.example` e validação de configuração com zod na inicialização~~: entregue no M01.
- [Deploy] Mecanismo de migrations em produção (imagem/job dedicado como `gastrohub_owner`); a imagem atual da API não inclui migrations: M01.
- [Técnico] Migrar para TypeScript 7 (compilador nativo) quando typescript-eslint, Nest CLI e drizzle-kit suportarem: M01 fixou 6.0.x.
- [Técnico] Aviso moderado do `pnpm audit`: esbuild ≤ 0.24 via `drizzle-kit` (apenas ferramenta de desenvolvimento, fora da imagem de produção). Atualizar quando o drizzle-kit trocar a dependência: M01.
- [Técnico] Cache do store do pnpm no CI para acelerar instalações: M01.
- [Técnico] Dependabot/Renovate para atualização de dependências e imagens Docker: M01.
- [Técnico] Code splitting no frontend quando houver telas reais (bundle inicial ~430 kB): M01.
- [Técnico] Proteção da branch `main` no GitHub exigindo CI verde (configuração do responsável): M01.
- [Futuro] OpenTelemetry (traces e métricas) quando houver ambiente de produção.
- [Futuro] Fila de jobs (pg-boss ou Redis + BullMQ) quando houver trabalho assíncrono.
- [Futuro] Turborepo/Nx se o tempo de build do monorepo justificar.
- [Futuro] ADR de provedor de cloud e região de dados (Brasil).
- [Futuro] Procedimento de backup/restore testado e plano de resposta a incidentes.

## Identidade e acesso

- [Pós-M04] **Recuperação de senha por e-mail**, verificação de e-mail e infraestrutura de e-mail (SMTP, mailpit, templates), junto dos convites do M04: D1 do M02. Até lá, redefinição via CLI.
- [Futuro] MFA por TOTP (prioritário para Proprietário/Gerente): movido do M02.
- [Futuro] Verificação contra senhas vazadas via HIBP (k-anonymity): chamada externa e decisão de privacidade (M02 D8; hoje: lista local SecLists).
- ~~[M02] Lista de sessões ativas com revogação pelo próprio usuário~~: entregue no M02.
- [M04] Timeouts de sessão menores por papel (ex.: administradores): M02 §5.2.
- [Deploy/jobs] Expurgo de `sessions` (30 dias após o fim) e `auth_events` (180 dias), executado como `gastrohub_owner`: M02 §9.9.
- [Técnico] Rate limit de login com contagem atômica: hoje os contadores são lidos antes da tentativa, e requisições paralelas podem ultrapassar o limite por poucas tentativas (M02 §20).
- [Técnico] Rate limit global distribuído (Redis) quando houver mais de uma instância da API: M02 §9.5.
- [M04] `audit_logs` por empresa e sua política; até lá, as operações da CLI de empresas ficam só nos logs operacionais: M03 D12.
- [M04] Edição de empresa, filial e vínculos pela web (depende de "quem pode"): M03 D2.
- [M04] Verificação de permissões no `TenantGuard`, sem alterar o mecanismo de tenancy: M03 §17.
- [Caixa/PDV] Filial ativa / filial padrão do usuário: M03 D11.
- [M14] Dados fiscais da empresa (IE, regime, CNAE, endereço fiscal, certificado): M03 D6.
- [Técnico] Cache da revalidação do vínculo por requisição de tenant, se houver medição que o justifique: M03 §17.
- [Deploy] Validar o contexto por transação (`set_config(..., true)`) com PgBouncer em modo transação: M03 §7.
- [Futuro] Painel da plataforma para listar e administrar todas as empresas (exige ADR: caminho entre empresas): M03 §15.
- [M04] Aprovação de supervisor para ações críticas (cancelamento de pedido pago, estorno, ajuste de estoque).
- [M11] PIN de operador para troca rápida em terminal de PDV.
- [Futuro] Login social / SSO para redes maiores.

## Operação

- [M11] **ADR: operação offline do PDV** (fila local e sincronização), a decidir antes de iniciar o M11.
- [M11] Impressão de comandas e cupons (impressoras térmicas ESC/POS), estratégia a definir (agente local vs. impressão pelo navegador).
- [M12] Divisão de conta por pessoa e por item.
- [M13] Canal de tempo real (SSE vs. WebSocket): decidir no M13.
- [M14] Escolha do provedor de emissão fiscal (NFC-e) e modelo de certificado digital por empresa.
- [M16] Cálculo de taxa por raio/bairro/CEP.

## Comercial / produto

- [Futuro] Planos e cobrança do SaaS (assinaturas, limites por plano).
- [Futuro] Onboarding guiado de nova empresa.
- [Futuro] Aplicativo/cardápio digital para o consumidor final (pedido via QR code na mesa).
- [Futuro] Suporte a outros segmentos (pizzaria: sabores fracionados; bares: comanda por cartão).
