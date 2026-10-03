# 06 — Roadmap Modular

> Status: **proposta**, pendente de aprovação. A numeração abaixo substitui a lista de referência do prompt de bootstrap. O mapeamento está no §5.

## 1. Critérios de ordenação

1. **Dependências técnicas:** um módulo só começa quando tudo de que ele depende está concluído.
2. **Valor operacional:** chegar o quanto antes a um fluxo de venda completo (cardápio → pedido → cozinha → pagamento → caixa).
3. **Risco de retrabalho:** decisões estruturais (tenancy, permissões, dados fiscais do produto) vêm antes do que depende delas.

## 2. Módulos por fase

### Fase 0 — Fundação

| ID | Módulo | Entrega principal | Depende de |
|---|---|---|---|
| **M01** | Fundação técnica | Monorepo, NestJS + React, PostgreSQL via Docker Compose, migrations, logging, health checks, testes, CI. **Sem negócio** | — |
| **M02** | Autenticação e Identidade | Usuários (provisionados por CLI), login/logout, sessões e dispositivos, troca de senha, CSRF, rate limit, eventos de segurança. Recuperação de senha por e-mail **movida** para depois do M04 (D1) | M01 |
| **M03** | Empresas e Filiais | Tenancy (RLS), cadastro de empresa (dados fiscais) e filiais (fuso, endereço), empresa ativa na sessão | M02 |
| **M04** | Usuários, Papéis e Permissões | Vínculos, convites, RBAC, escopo por filial, auditoria | M02, M03 |

### Fase 1 — Catálogo e cadastros

| ID | Módulo | Entrega principal | Depende de |
|---|---|---|---|
| **M05** | Produtos e Categorias | Produtos, categorias, variações, **adicionais/modificadores** (essencial para hamburgueria), campos fiscais (NCM, CEST, origem) | M04 |
| **M06** | Insumos e Ficha Técnica | Insumos, unidades e conversões, ficha técnica, custo teórico | M05 |
| **M07** | Cardápio | Cardápios por filial e canal, preço por canal, disponibilidade, horários | M05 |
| **M08** | Clientes | Cadastro de clientes e endereços, base de dados pessoais com regras LGPD | M04 |

### Fase 2 — Vendas e operação

| ID | Módulo | Entrega principal | Depende de |
|---|---|---|---|
| **M09** | Pedidos | Núcleo de pedidos (balcão, mesa, delivery), itens com modificadores, status, cancelamento auditado | M05, M07 (M08 opcional) |
| **M10** | Caixa e Pagamentos | Sessão de caixa (abertura, sangria, suprimento, fechamento), formas de pagamento, pagamentos de pedido | M04, M09 |
| **M11** | PDV | Interface de venda rápida sobre Pedidos + Caixa | M09, M10 |
| **M12** | Mesas e Comandas | Mapa de mesas, comandas, transferência, divisão de conta | M09 (integra M10/M11) |
| **M13** | Cozinha / KDS | Fila de produção por estação, tempos e status em tempo real | M09 |
| **M14** | Fiscal (NFC-e) | Emissão de documento fiscal de consumidor via provedor homologado | M03, M05, M10 |

### Fase 3 — Retaguarda

| ID | Módulo | Entrega principal | Depende de |
|---|---|---|---|
| **M15** | Estoque | Saldos por filial, entradas/compras, baixa automática por ficha técnica, inventário, perdas | M06, M09 |
| **M16** | Delivery | Áreas e taxas de entrega, entregadores, despacho, rastreio de status | M08, M09 |
| **M17** | Financeiro | Contas a pagar e a receber, categorias, fluxo de caixa, conciliação | M10 (M15 para compras) |
| **M18** | Relatórios | Vendas, CMV, desempenho por filial/canal/produto. Relatórios básicos entram em cada módulo; este consolida | M09, M10, M15, M17 |

### Fase 4 — Expansão

| ID | Módulo | Entrega principal | Depende de |
|---|---|---|---|
| **M19** | CRM / Fidelidade | Segmentação, campanhas, programa de pontos, consentimento de marketing | M08, M09 |
| **M20** | Integrações | Marketplaces de delivery, gateways de pagamento e maquininhas (via outbox/webhooks) | M07, M09, M10, M16 |
| **M21** | API pública | Chaves de API, escopos, webhooks, documentação pública | M04 + módulos expostos |
| **M22** | IA | Previsão de demanda, sugestão de compras, insights | M18 (dados históricos) |

## 3. Grafo de dependências

```text
M01 Fundação
 └─► M02 Autenticação
      └─► M03 Empresas/Filiais
           └─► M04 Usuários/RBAC/Auditoria
                ├─► M05 Produtos ──┬─► M06 Insumos/Ficha ──────────────┐
                │                  └─► M07 Cardápio ─┐                 │
                └─► M08 Clientes ──────────────┐     │                 │
                                               ▼     ▼                 │
                                            M09 Pedidos ◄──────────────┤
                    ┌──────────┬──────────┬──────┼──────────┐          │
                    ▼          ▼          ▼      ▼          ▼          ▼
               M10 Caixa   M12 Mesas  M13 KDS  M16 Delivery M19 CRM  M15 Estoque
                    │                                                  │
          ┌─────────┼──────────┐                                       │
          ▼         ▼          ▼                                       │
       M11 PDV  M14 Fiscal  M17 Financeiro ◄───────────────────────────┘
                               │
                               ▼
                         M18 Relatórios ──► M22 IA

M20 Integrações ← M07, M09, M10, M16        M21 API pública ← M04 + módulos estáveis
```

## 4. Marco MVP sugerido

Primeira versão utilizável por uma hamburgueria real:

```text
M01 → M02 → M03 → M04 → M05 → M07 → M09 → M10 → M11 → M13   (+ M14 se a emissão fiscal for obrigatória no piloto)
```

M06 (ficha técnica), M08 (clientes) e M12 (mesas) podem entrar antes do MVP se o cliente-piloto precisar.

## 5. Mapeamento com a lista de referência do bootstrap

| Referência | Proposta | Mudança |
|---|---|---|
| M01 Fundação / Autenticação | M01 + M02 | Separados: infraestrutura técnica ≠ identidade |
| M02 Empresas e Filiais | M03 | — |
| M03 Usuários e Permissões | M04 | Auditoria incluída aqui (transversal) |
| M04 Produtos e Categorias | M05 | Inclui modificadores e campos fiscais |
| M05 Insumos e Ficha Técnica | M06 | — |
| M06 Cardápio | M07 | — |
| M07 Clientes | M08 | — |
| M08 Pedidos | M09 | — |
| M10 PDV / M11 Caixa | M10 Caixa → M11 PDV | **Invertidos:** o PDV depende do Caixa |
| M09 Mesas e Comandas | M12 | Depois do PDV; dependem só de Pedidos |
| M12 Cozinha / KDS | M13 | — |
| — | **M14 Fiscal (NFC-e)** | **Novo:** requisito legal para vender no varejo no Brasil |
| M13 Estoque | M15 | — |
| M14 Delivery | M16 | — |
| M15 Financeiro | M17 | — |
| M16 CRM / Fidelidade | M19 | Movido para Expansão |
| M17 Relatórios | M18 | — |
| M18 Integrações | M20 | — |
| M19 API | M21 | — |
| M20 IA | M22 | — |
