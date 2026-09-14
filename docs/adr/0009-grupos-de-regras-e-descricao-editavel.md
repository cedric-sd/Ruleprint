# ADR-0009: Grupos de regras e descrição editável na UI

- **Status:** aceito
- **Data:** 2026-09-14

## Contexto

Com 21 regras o livro já é uma lista longa e plana; num repositório real são centenas. O dono
pediu três coisas: (1) cada `describe` com o mesmo nome vira um grupo com as suas condições
(`it`) dentro; (2) na UI o grupo é uma linha que colapsa e expande, aberta por padrão, como o
Swagger faz com as tags; (3) quem lê o livro pode descrever melhor uma regra na própria UI e a
descrição fica salva, não some no próximo scan.

Decisões de produto tomadas antes deste ADR: o grupo é o `describe` de **primeiro nível** (o
resto do caminho fica com a regra); a descrição escrita na UI vira uma **regra declarada** em
`.ruleprint/rules/<slug>.md`, pelo mesmo mecanismo do `promote` (ADR-0006), e não um formato
novo de override.

`ruleprint.json` é regenerado a cada scan, então nada escrito só nele sobrevive; a fonte de
verdade tem de ser um arquivo do repositório. `serve` hoje serve o documento da memória e o
watcher ignora `.ruleprint/` (ADR-0004), portanto uma escrita feita pelo servidor precisa
disparar o rescan explicitamente.

## Decisão

### `group`: um campo novo e opcional em `Rule`

```json
{
  "id": "RP-088272",
  "title": "shipping > frete grátis > acima de 300 reais no Sudeste",
  "group": "shipping"
}
```

- **Schema:** `Rule.group` é string não vazia, opcional. Mudança aditiva no schema
  (`specVersion` continua `0.1`); `RuleCandidate` ganha o mesmo campo.
- **Quem preenche:**
  - coletor `tests`: o primeiro `describe` do caminho (`titlePath[0]`) quando há pelo menos um
    `describe` acima do `it`; um `it` solto no módulo não tem grupo;
  - coletor `config`: chave `group` no front-matter (a lista de chaves conhecidas passa a
    `id`, `title`, `tags`, `group`); entra no material do fingerprint da declaração, como
    título, descrição e tags;
  - coletor `ast`: a função que contém a condicional (`symbol`), que já é o prefixo do título.
- **Merge:** o grupo de uma regra fundida é o do primeiro membro que tem um, na ordem de
  precedência `declared > derived > inferred`. Assim o markdown pode reagrupar uma regra sem
  mexer no teste, e sem markdown vale o `describe`.
- **Ids e fingerprints não mudam.** O grupo é derivado do título ou de metadado declarado; a
  identidade da regra continua sendo `collector + título` (ADR-0004) e o fingerprint continua
  vindo do corpo normalizado (ADR-0005). Nenhuma aprovação é perdida ao atualizar.
- **Mesmo nome = mesmo grupo**, entre arquivos e coletores: a UI agrupa pelo texto exato do
  campo; não há normalização de caixa ou acentos, porque o `describe` é escrito pelo dev com a
  grafia que ele quer ver no livro.

### UI: grupos colapsáveis

- A lista vira uma sequência de grupos ordenados alfabeticamente; regras sem grupo ficam no fim,
  sob "Ungrouped". Cada grupo é um `<details open>` com uma linha de resumo: nome, quantidade
  de regras e quantas estão pendentes. Colapsar/expandir é estado local da página.
- Dentro do grupo, a regra mostra o título **sem** o prefixo `<grupo> > ` quando o título
  começa por ele; o título completo continua no detalhe e no JSON.
- Busca e filtros continuam valendo por regra; um grupo sem regra visível não aparece; a busca
  também casa com o nome do grupo.
- A lógica de agrupamento e de título exibido é pura (`packages/ui/src/lib/groups.ts`) e
  testada; os componentes só renderizam.

### Descrição editável: `ruleprint describe` e `PUT /api/rules/:id`

- **CLI:** `ruleprint describe <id> <text> [-C dir]` (ou `--from-file`) escreve a descrição.
  Regra ainda não declarada: cria `.ruleprint/rules/<slug>.md` com `id`, título, tags e a
  descrição (o `renderDeclaration` do `promote`). Regra já declarada: reescreve só o corpo do
  markdown que a declara, preservando o front-matter byte a byte. Id desconhecido é erro
  (exit 2), como no `promote`.
- **Servidor (`serve`):** `PUT /api/rules/<id>` com corpo `{ "description": "…" }` chama a
  mesma função, força o rescan e responde `{ "id", "path", "rule" }`; a mesma sessão SSE
  recebe `reload`. `GET /api/status` responde `{ "editable": true }`. Erros: 400 (JSON ou id
  inválidos), 404 (regra inexistente), 409 (arquivo já existe com outro id).
- **UI:** no detalhe da regra, a descrição vira um `textarea` com "Save" quando
  `GET /api/status` responde; num `build` estático o endpoint não existe e a UI mostra a
  descrição só para leitura, com a dica de rodar `ruleprint serve` para editar.
- **Consequência de produto:** ao descrever, a regra sobe para `declared` no próximo scan e o
  arquivo aparece no `git status` para ser revisado num PR. É a tese do brief: humano escreveu,
  regra é oficial. Uma descrição que não promove a regra (override) fica fora deste ADR.

### Alternativas descartadas

- Grupo = caminho completo de `describe`s: muitos grupos com uma regra cada; o dono preferiu o
  modelo de tags do Swagger.
- Agrupar só na UI, quebrando o título em `>`: falha para títulos declarados que contêm `>`
  e não deixa o markdown reagrupar. O campo no JSON custa uma linha por regra e serve a qualquer
  consumidor (bot, site estático).
- Override de descrição em `.ruleprint/notes.json`: formato novo, schema de config, e uma
  descrição humana que não vira regra declarada contradiz o modelo de confiança.
- Escrever direto em `ruleprint.json`: some no próximo scan.

## Consequências

- Schema: campo opcional `group` em `Rule` (spec 0.1 continua válida para documentos antigos).
  Golden e snapshots ganham o campo; `ruleprint.lock` e os ids não mudam.
- O servidor de desenvolvimento passa a escrever no repositório (só em `.ruleprint/rules/`), a
  pedido explícito da UI. `build` continua estático e somente leitura.
- Coletores de outras linguagens (M8) preenchem `group` com a classe de teste ou o primeiro
  nível equivalente; o campo já existe para eles.
