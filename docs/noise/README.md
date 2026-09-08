# Medição de ruído do coletor AST

Planilhas do DoD do M6 (ADR-0007): o coletor AST só é liberado se, em três repositórios de
código aberto, menos de 30% dos candidatos inferidos forem ruído **segundo a leitura do dono do
projeto**. A coluna `Sugestão` de cada planilha é a leitura de quem preparou a medição; a coluna
`Regra?` está vazia de propósito.

| Repositório             | Escopo                                                 | Candidatos | Sugestão de ruído |
| ----------------------- | ------------------------------------------------------ | ---------- | ----------------- |
| [medusa](./medusa.md)   | `packages/modules/promotion/src`                       | 79         | 29 (36,7%)        |
| [vendure](./vendure.md) | `packages/core/src/service/helpers/order-*` e vizinhos | 16         | 6 (37,5%)         |
| [cal.com](./calcom.md)  | `packages/features/bookings/lib` (curado)              | 37         | 10 (27,0%)        |
| **Agregado**            |                                                        | **132**    | **45 (34,1%)**    |

## Como foi feito

1. Clone raso e esparso (`git clone --depth 1 --filter=blob:none --sparse`) de um diretório de
   domínio por repositório, no commit registrado no cabeçalho de cada planilha.
2. `.ruleprint/config.json` na raiz do clone com `ast.include` apontando para o diretório (e
   `ast.exclude` quando havia migrations), mais um glossário de 20 termos tirados do próprio
   repositório. Include e glossário estão reproduzidos no cabeçalho de cada planilha.
3. `node packages/cli/dist/bin.js scan .` com o CLI buildado deste PR.
4. `<repo>.ruleprint.json` é a saída do scan restrita às regras `inferred` (o coletor de testes
   também roda e suas regras não estão sob medição). `<repo>.md` lista as mesmas regras, uma por
   linha, com título, arquivo:linha e a sugestão.

## Como marcar

Preencha `Regra?` com `sim` ou `não` em cada linha. Uma regra vale `sim` quando um dev novo no
time gostaria de encontrá-la num livro de regras, mesmo com o título mecânico; vale `não` quando
é detalhe de implementação, plumbing, duplicata ou validação estrutural. Taxa de ruído = `não`
÷ total, por repositório e no agregado.

## O que a primeira rodada mudou no coletor

Os scans iniciais (183, 190 e 512 candidatos) mostraram padrões que o ADR não previa e que
viraram filtros antes desta planilha ser escrita: `.length`/`.size` nus como condição, checagens
de presença (`map.has(x)`, `order.items` sem predicado), termos do glossário só em argumentos de
chamada, e `typeof` dentro de um `||`. Os padrões que restaram e ainda parecem ruído (branches
que só preparam variáveis, `continue`/`break` que repetem a decisão da linha anterior,
duplicatas de um mesmo ternário, validação de enum) estão anotados na coluna `Sugestão` e são o
insumo da próxima rodada, caso o dono confirme a taxa acima de 30%.
