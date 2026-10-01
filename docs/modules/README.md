# Especificações de Módulos

Cada módulo recebe um arquivo `MNN-nome.md` **antes** de ser implementado (ex.: `M01-fundacao-tecnica.md`). A ordem segue o [roadmap](../06-ROADMAP.md).

## Template

```markdown
# MNN — Nome do Módulo

Status: Rascunho | Aprovado | Em desenvolvimento | Concluído

## Objetivo
O problema que o módulo resolve, para quem.

## Dependências
Módulos que precisam estar concluídos.

## Escopo
### Incluído
### Fora do escopo (vai para o backlog)

## Referência externa (se houver)
- REFERÊNCIA: comportamento observado (nível funcional, público)
- Nossa decisão:
- Nossa implementação:

## Modelo de dados
Tabelas, campos, índices, policies RLS.

## Regras de negócio
Invariantes numerados (RN-01, RN-02…).

## Permissões (RBAC)
| Permissão | Descrição | Papéis padrão |

## API
| Método | Rota | Permissão | Descrição |

## Auditoria
Ações registradas em audit_logs.

## Dados pessoais / LGPD
Dados coletados, finalidade, retenção.

## Testes
Unitários, integração, isolamento entre empresas, acesso negado.

## Critérios de aceite
- [ ] ...
```
