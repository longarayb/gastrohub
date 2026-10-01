# ADR-003 — Multi-tenancy: schema compartilhado + `company_id` + RLS

- Status: Aceito
- Data: 2026-10-01
- Aceito em: 2026-10-01, pelo responsável do projeto (com todos os pontos detalhados abaixo)

## Contexto

O GastroHub é um SaaS com hierarquia **Empresa → Filial → Usuários → Operações**. Devem caber muitas empresas pequenas (uma hamburgueria com uma filial) e algumas redes maiores. Vazamento de dados entre empresas é o risco mais grave do produto.

## Problema

Como isolar os dados entre empresas de forma segura, barata de operar e simples de evoluir (migrations), sem depender só da disciplina do código?

## Alternativas consideradas

| Alternativa | Isolamento | Custo operacional | Migrations | Observação |
|---|---|---|---|---|
| **Schema compartilhado + `company_id` + RLS** | Bom (app + banco) | Baixo | Uma vez só | Padrão de mercado para SaaS B2B de PMEs |
| Schema compartilhado só com filtro na aplicação | Fraco: um `WHERE` esquecido vaza dados | Baixo | Uma vez só | Descartado |
| Schema por empresa | Forte | Médio/alto | N vezes (uma por schema) | Degrada com milhares de tenants |
| Banco por empresa | Máximo | Alto | N vezes | Justificável só para clientes enterprise com exigência contratual |

## Decisão

- Toda tabela de tenant tem `company_id uuid NOT NULL`. Tabelas operacionais também têm `branch_id`.
- RLS com `ENABLE` + `FORCE ROW LEVEL SECURITY` e policy `company_id = current_setting('app.company_id', true)::uuid`.
- A aplicação conecta com um papel **sem** `BYPASSRLS` e que **não** é dono das tabelas.
- O contexto vem da sessão autenticada e é aplicado por transação (`set_config(..., true)`).
- O isolamento **por filial** é regra de autorização (RBAC + escopo de filial) aplicada pela aplicação, não por RLS. Pode virar RLS no futuro, se necessário.
- Testes automatizados de isolamento são obrigatórios para cada tabela.

## Consequências

- **Positivas:** defesa em profundidade (um bug na aplicação não vaza dados de outra empresa); uma única migration por mudança; custo de infraestrutura baixo.
- **Negativas:**
  - toda requisição precisa de transação com `set_config`, com overhead pequeno;
  - pools de conexão em modo transação (ex.: PgBouncer) são compatíveis porque o contexto é `SET LOCAL`, mas isso precisa ser validado no M03;
  - consultas cross-tenant (administração da plataforma) precisam de um caminho explícito e auditado.
- **Evolução:** se um cliente exigir isolamento físico, um banco dedicado pode ser oferecido sem mudar o modelo, porque o `company_id` continua presente.
