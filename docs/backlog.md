# Backlog

Funcionalidades e melhorias registradas para o futuro. **Nada aqui deve ser implementado fora do módulo correspondente.**

Formato: `[módulo-alvo] descrição: origem/motivo`.

## Plataforma / técnico

- [M01] Verificação automática de fronteiras entre módulos (dependency-cruiser ou regras de import do ESLint): ADR-001.
- [M01] Varredura de segredos (gitleaks) e auditoria de dependências no CI.
- [M01] `.env.example` e validação de configuração com zod na inicialização.
- [Futuro] OpenTelemetry (traces e métricas) quando houver ambiente de produção.
- [Futuro] Fila de jobs (pg-boss ou Redis + BullMQ) quando houver trabalho assíncrono.
- [Futuro] Turborepo/Nx se o tempo de build do monorepo justificar.
- [Futuro] ADR de provedor de cloud e região de dados (Brasil).
- [Futuro] Procedimento de backup/restore testado e plano de resposta a incidentes.

## Identidade e acesso

- [M02] MFA por TOTP (prioritário para Proprietário/Gerente).
- [M02] Verificação contra senhas vazadas (lista k-anonymity).
- [M02] Lista de sessões ativas com revogação pelo próprio usuário.
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
