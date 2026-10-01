# 00 — Projeto GastroHub

## 1. Visão

O GastroHub é uma plataforma SaaS modular de gestão para food service. O foco inicial é em **restaurantes e hamburguerias**, mas o modelo de dados e os módulos devem permitir atender futuramente outros formatos: pizzarias, cafeterias, dark kitchens, bares, food trucks e redes com várias unidades.

## 2. Público-alvo inicial

- Hamburguerias e restaurantes de pequeno e médio porte.
- Operações com salão, balcão e delivery próprio ou via marketplace.
- Empresas com uma ou mais filiais.

## 3. Escopo

### Dentro do escopo do produto (por fases, ver [roadmap](06-ROADMAP.md))

Identidade e acesso, empresas e filiais, catálogo (produtos, insumos, ficha técnica e cardápio), clientes, pedidos, caixa, PDV, mesas e comandas, cozinha (KDS), estoque, delivery, financeiro, relatórios, fiscal, CRM e fidelidade, integrações, API pública e recursos de IA.

### Fora do escopo da etapa atual (bootstrap)

Qualquer módulo de negócio. Esta etapa entrega somente: análise, arquitetura, documentação e versionamento.

## 4. Princípios

1. **Módulo por módulo.** Um módulo só começa depois que suas dependências estiverem concluídas e testadas.
2. **Simplicidade antes de escala.** Usar monólito modular e banco único até que haja evidência concreta de necessidade de outra abordagem.
3. **Segurança e isolamento por padrão.** Nenhum dado de uma empresa pode ser acessível por outra. O isolamento é aplicado na aplicação **e** no banco.
4. **Documentação como parte da entrega.** Um módulo não está concluído sem sua especificação, ADRs relevantes, testes e entrada no CHANGELOG.
5. **Testes antes de avançar.** Cada módulo entrega testes unitários e de integração contra um PostgreSQL real.
6. **Backlog disciplinado.** Ideias fora do módulo atual vão para o [backlog](backlog.md), não para o código.

## 5. Hierarquia do domínio

```text
Empresa (tenant)
   ↓
Filial (unidade operacional)
   ↓
Usuários (vínculo com a empresa + papéis + filiais permitidas)
   ↓
Operações (pedidos, caixa, estoque, financeiro… sempre com empresa e filial)
```

Detalhamento em [02-BANCO-DE-DADOS.md](02-BANCO-DE-DADOS.md).

## 6. Convenções

| Item | Convenção |
|---|---|
| Idioma do código | Inglês (nomes de tabelas, classes, variáveis, rotas) |
| Idioma da documentação e da interface | Português (Brasil) |
| Commits | Conventional Commits |
| Branches | `main` estável; `feat/<modulo>-<descricao>`, `fix/<descricao>`, `docs/<descricao>` |
| Versionamento | SemVer, com o histórico registrado no `CHANGELOG.md` |
| Decisões | ADR em `docs/decisions/ADR-NNN-nome.md` |
| Módulos | Especificação em `docs/modules/MNN-nome.md` antes de implementar |

### Glossário mínimo

| Termo (PT) | Termo no código | Significado |
|---|---|---|
| Empresa | `company` | Cliente do SaaS (tenant) |
| Filial | `branch` | Unidade operacional de uma empresa |
| Usuário | `user` | Identidade de login (global) |
| Vínculo | `membership` | Relação usuário ↔ empresa, com papéis |
| Papel | `role` | Conjunto de permissões |
| Permissão | `permission` | Ação autorizável (ex.: `orders.cancel`) |
| Dia operacional | `business_day` | Período de operação da filial, que pode atravessar a meia-noite |

## 7. Uso de referências externas (ex.: Suitable)

Produtos de mercado, como o Suitable, podem ser usados **somente como referência funcional**: entender que problemas existem e que fluxos o usuário espera.

**Proibido copiar:** código, identidade visual, textos proprietários, implementação ou estrutura interna não pública.

Quando uma funcionalidade for inspirada em referência externa, a especificação do módulo deve registrar:

```text
REFERÊNCIA          O que foi observado (comportamento público, nível funcional)
Nossa decisão       O que o GastroHub fará e por quê
Nossa implementação Como será feito, com nosso próprio modelo e design
```

## 8. Definição de pronto (por módulo)

- [ ] Especificação em `docs/modules/` aprovada
- [ ] Migrations com RLS aplicada às novas tabelas de tenant
- [ ] Permissões RBAC declaradas
- [ ] Testes unitários e de integração passando (incluindo testes de isolamento entre empresas)
- [ ] Lint e typecheck sem erros
- [ ] Endpoints documentados no OpenAPI
- [ ] Ações sensíveis auditadas
- [ ] CHANGELOG atualizado
- [ ] Commit(s) em Conventional Commits
