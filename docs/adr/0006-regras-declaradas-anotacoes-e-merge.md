# ADR-0006: Regras declaradas, anotações `@rule` e merge com precedência

- **Status:** aceito
- **Data:** 2026-09-07

## Contexto

Até o M4 toda regra vem do coletor de testes (`derived`). O M5 fecha o loop de valor do brief: o
time promove uma regra rascunhada pela ferramenta a regra oficial (`declared`), liga código a
regras com `@rule`, e o core precisa fundir fontes com precedência `declared > derived > inferred`.
Decisões de produto tomadas antes deste ADR: a ligação entre markdown e regra existente é pelo
`id` no front-matter; `@rule` só liga código a regra existente; regra declarada sem evidência é
`orphan`, informada pelo `check` sem falhar.

## Decisão

### Regras declaradas: `.ruleprint/rules/*.md`

```md
---
id: RP-088272
title: Pedido acima de R$300 tem frete grátis
tags: [frete, checkout]
---

Aplicado apenas para CEPs da região Sudeste. Fora dela vale a tabela cheia.
```

- **Front-matter** é um subconjunto de YAML parseado pelo próprio coletor, sem dependência:
  `chave: valor` (aspas opcionais), listas inline `[a, b]` e listas em bloco `- item`. Chaves
  reconhecidas: `id`, `title`, `tags`. Qualquer outra coisa gera aviso e o arquivo é ignorado.
- `title` cai para o primeiro `# Título` do corpo e, na falta, para o nome do arquivo. O corpo
  (sem o H1) é a `description`, em markdown cru.
- **`id` presente** → o arquivo se funde com a regra desse id (venha ela de teste ou de outro
  coletor). **`id` ausente** → o arquivo define uma regra nova, com id por hash de
  `config:título` como qualquer candidato.
- `origin.collector = "config"`, `confidence = "declared"`, fonte `{ file, line: 1, kind: "config" }`.
- Forma normalizada (material do fingerprint): `title`, `description` com espaços colapsados e
  `tags` ordenadas. Reflow do markdown não é drift; mudar o texto é.

### Anotações `@rule`

`// @rule RP-088272`, `# @rule RP-088272`, `* @rule RP-088272` ou `/* @rule RP-088272 */`, em
qualquer arquivo de código (ts, js, py, java, go, rb, php, cs, kt, rs, swift, c, cpp, …).
Cada ocorrência vira um candidato **de ligação** (`attachTo: "RP-088272"`): acrescenta
`{ file, line, kind: "annotation" }` às fontes da regra e não cria regra. Id que não existe no
scan vira aviso (`unknown @rule RP-… in file:line`). Vários ids na mesma linha são aceitos.

### Contrato `RuleCandidate`

Dois campos opcionais novos: `id` (id declarado pela fonte; a regra usa exatamente esse id) e
`attachTo` (o candidato só contribui fontes para a regra desse id). Coletores existentes não
mudam.

### Merge com precedência (core, `reconcile`)

1. Candidatos são agrupados: os que têm `id` ficam no grupo desse id; os demais formam um grupo
   cada (não há casamento por título entre coletores: a ligação é explícita, pelo id).
2. Dentro de um grupo, a confiança mais alta manda: `declared > derived > inferred`. `title`,
   `description` e `tags` vêm do membro de maior confiança (empate: primeiro na ordem
   determinística); fontes são concatenadas em ordem de confiança, sem repetição; `evidence.tests`
   é a união; `confidence` é a mais alta; `collector` é o do membro vencedor.
3. Fingerprint do grupo: com um membro, o dele; com vários, `sha256` dos fingerprints dos membros
   ordenados. Assim, mudar o teste que evidencia uma regra declarada continua sendo drift.
4. Ids: grupos com `id` explícito ficam com ele e o reservam; os demais passam pelo casamento com
   o lock do ADR-0005 (título, depois fingerprint, depois hash), evitando os ids reservados.
5. Ligações (`attachTo`) são aplicadas depois dos ids: fonte adicionada à regra alvo; alvo
   inexistente vira nota no resultado (`notes`), que o CLI imprime como aviso.
6. **`orphan`**: regra cuja confiança é `declared` e cujas fontes são só `config` (nenhum teste,
   nenhuma anotação). Sobrepõe o status derivado do lock na exibição; para o lock ela é uma
   regra como outra qualquer (`added` até ser aprovada). O `check` lista órfãs numa seção própria
   e no `--json` (`orphans`), sem alterar o exit code.

### `ruleprint promote <id>`

Escreve `.ruleprint/rules/<slug-do-título>.md` com `id`, `title`, `tags` e a `description`
atual (ou um corpo vazio com um comentário guia), e imprime o caminho. Falha se o id não existe
no scan ou se já há um arquivo declarando esse id. Depois do `promote`, o próximo scan mostra a
regra como `declared`, fundida com a evidência do teste.

### Varredura

`.ruleprint/` deixa de ser ignorado pelo scan (era reservado no M3): o coletor de config aceita
`.ruleprint/rules/**/*.md`; o resto do diretório continua sem coletor.

## Consequências

- O fixture ganha `.ruleprint/rules/` (uma regra ligada por id ao teste de frete, uma órfã) e um
  `@rule` em `src/shipping.ts`; o lock do fixture e o golden são regenerados.
- Uma regra declarada com `id` de teste que some fica `orphan` e o teste some como `removed` do
  lock só se a regra inteira sumir; como o id continua existindo pela declaração, o lock a vê
  como `changed` (fingerprint mudou). É o comportamento desejado: perder a evidência é mudança.
- O parser de front-matter é deliberadamente pequeno; se surgir demanda por YAML completo, a
  troca por `yaml` é local ao coletor.
- `@rule` não cria regra. Se isso fizer falta, é uma extensão do coletor de anotações, não do core.
