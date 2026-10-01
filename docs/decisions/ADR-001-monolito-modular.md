# ADR-001 — Monólito modular

- Status: Aceito
- Data: 2026-10-01
- Aceito em: 2026-10-01, pelo responsável do projeto (com todos os pontos detalhados abaixo)

## Contexto

O GastroHub começa do zero, com equipe pequena, e deve crescer para mais de 20 módulos de negócio (pedidos, caixa, estoque, financeiro…) atendendo várias empresas e filiais. Os módulos têm forte acoplamento transacional: um pedido afeta caixa, estoque e cozinha.

## Problema

Qual estilo arquitetural permite evoluir módulo por módulo, com baixo custo operacional, sem virar um monólito acoplado e difícil de manter?

## Alternativas consideradas

| Alternativa | Prós | Contras |
|---|---|---|
| **Monólito modular** | Um deploy, transações ACID entre módulos, depuração simples, baixo custo de infraestrutura | Exige disciplina e ferramentas para manter as fronteiras |
| Microserviços | Deploy e escala independentes | Transações distribuídas (pedido → estoque → caixa), observabilidade complexa, custo alto, prematuro para o tamanho da equipe |
| Monólito tradicional (em camadas, sem módulos) | Mais simples no primeiro dia | Acoplamento cresce rápido e a extração futura fica cara |
| Serverless (funções) | Escala automática | Cold start ruim para PDV/KDS, conexões com Postgres complicadas, lógica espalhada |

## Decisão

Adotar **monólito modular**: uma aplicação backend (NestJS) com módulos de fronteiras explícitas:

- cada módulo é dono das suas tabelas;
- comunicação apenas por interface pública ou eventos em processo;
- grafo de dependências acíclico, conforme o roadmap;
- fronteiras verificadas no CI.

## Consequências

- **Positivas:** velocidade de entrega, consistência transacional, um único pipeline e um único banco para operar.
- **Negativas:** escala do sistema inteiro como unidade. Mitigação: API stateless e escala horizontal.
- **Risco:** erosão das fronteiras com o tempo. Mitigação: verificação automatizada no CI e revisão de código.
- **Reversibilidade:** um módulo com fronteira limpa pode ser extraído para um serviço se surgir justificativa concreta, registrada em novo ADR.
