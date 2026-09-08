# ADR-0008: GitHub Action e bot de PR com aprovação por checkbox

- **Status:** aceito
- **Data:** 2026-09-08

## Contexto

O M7 fecha o loop do brief no lugar onde o dev já revisa código: o pull request. O bot deve
comentar regras novas, regras que sofreram drift e regras órfãs, e oferecer um botão de aprovação
que gera commit em `ruleprint.lock`. O DoD é dogfood: o próprio repositório do RulePrint usa o
bot nos seus PRs. O sinal de parada do brief vale aqui mais do que em qualquer outro milestone:
se o comentário virar ruído que ninguém aprova, a extração precisa ficar mais conservadora.

Decisões de produto tomadas antes deste ADR: a aprovação é por **checkboxes** no comentário do
bot; a distribuição é uma **`action.yml` composta** na raiz do repositório
(`uses: cedric-sd/Ruleprint@v1`) que roda `npx ruleprint@<version>`; a lógica de falar com o
GitHub vive num **comando `ruleprint pr`** no CLI, com o `fetch` nativo do Node, sem dependência
nova. O CLI ainda não está publicado no npm (pendência do dono desde o M3), então o dogfood roda o
build local.

Fatos que moldam o desenho:

- `Change` (ADR-0005) carrega só `kind`, `id`, `title` e `previousTitle`. Para linkar
  `arquivo:linha` o comentário faz join com `document.rules[].origin.sources[0]`.
- No evento `issue_comment`, `comment.author_association` descreve o **autor** do comentário,
  que é o bot. Quem marcou a caixa é `sender`, sem associação no payload. A permissão de quem
  edita vem de `GET /repos/{r}/collaborators/{login}/permission`.
- Eventos produzidos com `GITHUB_TOKEN` não disparam outros workflows. Isso evita loops (o PATCH
  do bot no próprio comentário não reexecuta o job), mas também significa que o push do lock não
  dispara o `ci.yml` no novo commit.
- `examples/fixture-express-api/ruleprint.json` não é versionado; o golden embute `approvedAt`.
- `scanProject` já prefixa as fontes com `git rev-parse --show-prefix`, então um scan em
  subdiretório produz caminhos relativos à raiz do repositório.

## Decisão

### Comando `ruleprint pr`

Um único comando, guiado por `GITHUB_EVENT_NAME` e `GITHUB_EVENT_PATH`:

| Evento                                                                   | Ação                                                                 |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `pull_request` (`opened`, `synchronize`, `reopened`, `ready_for_review`) | escaneia, compara com o lock e cria/atualiza **um** comentário       |
| `issue_comment` (`edited`) num PR, comentário com o marcador do bot      | lê as caixas marcadas, aprova, comita o lock e atualiza o comentário |
| qualquer outro                                                           | não faz nada e sai com 0                                             |

Tudo que é puro fica em `@ruleprint/core` (`renderPrComment()`, `parseApprovals()`,
`PR_COMMENT_MARKER`) ou em módulos puros do CLI (`decidePrAction()`); só `pr.ts` (env, fetch,
git) e `github.ts` (cliente REST mínimo) são impuros. `--dry-run` imprime o markdown sem tocar
na rede. Variáveis lidas: `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `GITHUB_API_URL`,
`GITHUB_SERVER_URL`, `GITHUB_EVENT_NAME`, `GITHUB_EVENT_PATH`.

### Formato do comentário

Um comentário por PR, encontrado pelo marcador `<!-- ruleprint -->` na primeira linha. Exemplo
com links (`canApprove: true`):

```markdown
<!-- ruleprint -->

## RulePrint

**5 changes need approval** · 20 approved · 1 orphan · in `examples/fixture-express-api`

> Approved RP-000123, RP-000456 (commit abc1234).

Tick a box to approve; the bot commits `ruleprint.lock` to this branch.

- [ ] **Approve all** (5 changes)

### New rules (2)

- [ ] **RP-000123** order validation > rejects an order above the maximum ([test/order.spec.ts:12](https://github.com/o/r/blob/abc/test/order.spec.ts#L12))

### Changed rules (1)

- [ ] **RP-088272** Pedido acima de R$300 tem frete grátis no Sudeste ([.ruleprint/rules/frete-sudeste.md:1](…))

### Renamed rules (1)

- [ ] **RP-018388** ~~título anterior~~ → título atual ([test/shipping.spec.ts:40](…))

### Removed rules (1)

Approving removes the rule from `ruleprint.lock`.

- [ ] **RP-064421** order validation > rejects an order below the minimum value

### Orphans (1)

Declared rules without evidence. Never blocking; link code with `@rule RP-…` or delete the declaration.

- **RP-000999** Cupom expirado é recusado no checkout ([.ruleprint/rules/cupom-expirado.md:1](…))

<sub>ruleprint 0.1.0 · scanned abc1234 · `npx ruleprint check` reproduces this locally.</sub>
```

- Seções na ordem `added → changed → renamed → removed → orphans`; seções vazias são omitidas.
- O blockquote só aparece com uma nota transitória (resultado de aprovação, recusa de permissão,
  ids descartados). `in \`dir\`` só aparece quando o scan não é na raiz.
- Lista limitada a 50 itens (`--limit`); acima disso, `_…and N more. Run \`npx ruleprint check\`
  locally to see everything._`. **Approve all** aprova também os itens escondidos.
- Sem mudanças pendentes o cabeçalho vira `✔ All N rules approved. Nothing to review.`; as órfãs
  continuam listadas quando existem.
- Em PR de fork (`canApprove: false`) não há caixas: o parágrafo vira `Checkbox approval works
only for branches of this repository. Run \`npx ruleprint approve\` locally and push
  \`ruleprint.lock\`.` e os itens são bullets simples.

O parser aceita `[x]` e `[X]`, bullets `-` ou `*`, indentação, ignora linhas dentro de cercas de
código e exige o id em negrito, exatamente como o renderizador escreve:

````ts
const CHECKBOX_LINE = /^\s*[-*]\s+\[([ xX])\]\s+\*\*(RP-\d{4,})\*\*/;
const APPROVE_ALL_LINE = /^\s*[-*]\s+\[([ xX])\]\s+\*\*Approve all\*\*/;
const FENCE = /^\s*(```|~~~)/;
````

### Quando comentar e com que exit code

- O comentário é **criado** só quando há mudanças pendentes. Uma vez criado, é **atualizado** a
  cada push (mesmo para o estado "tudo aprovado") e nunca apagado: o histórico do PR mostra o que
  foi revisado. Órfãs sozinhas não criam comentário: toda órfã nova também é um `added`, e órfãs
  antigas não são assunto deste PR (o fixture tem uma permanente).
- Em `pull_request`, o comando sai com `exitCodeFor(changes)`, igual ao `check`, salvo
  `--no-fail-on-changes` (input `fail-on-changes` da action, padrão `true`). O comentário é
  publicado antes de falhar.
- Em `issue_comment`, o comando sempre sai com 0: um job vermelho no sha da branch default não
  aparece no PR e só confunde. Recusas viram nota no comentário.

### Aprovação

1. `decidePrAction` só devolve `approve` quando o comentário tem o marcador, ao menos uma caixa
   marcada e o `sender` não é bot (`sender.type === 'Bot'` ou login terminado em `[bot]`).
2. `GET /repos/{r}/pulls/{n}` dá `head.ref`, `head.sha` e o repositório de origem. Fork →
   nota e fim.
3. `GET /repos/{r}/collaborators/{login}/permission` precisa devolver `admin` ou `write`. O
   GitHub já só deixa quem tem write editar comentário alheio; esta é a segunda linha de defesa.
4. `git fetch --depth=1 origin <head.ref>` e `git checkout -B <head.ref> FETCH_HEAD` (o job de
   `issue_comment` roda o código da branch default, com checkout da branch default).
5. Rescan; ids marcados que deixaram de ser pendentes são descartados com nota. Restando algo,
   `approveProject(dir, { all | ids, approvedBy: 'github:<login>' })`.
6. Commit apenas de `ruleprint.lock` (e `ruleprint.json` se estiver rastreado) com identidade
   `github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>` e mensagem
   `chore(ruleprint): approve N rule(s)`, corpo com os ids e `Approved-by: github:<login>`.
   `git push origin HEAD:refs/heads/<head.ref>` com as credenciais que o `actions/checkout`
   deixou no remote; um token próprio deve ser passado ao checkout também.
7. Rerender com a nota `Approved …, … (commit <sha7>).` e PATCH no mesmo comentário.

`--no-push` comita sem buscar nem publicar (testes e uso local).

### Modelo de ameaça

- **Forks:** o `GITHUB_TOKEN` de `pull_request` vindo de fork é somente-leitura. O comentário
  degrada para o relatório no log do job (mesmas linhas do `check`) e o exit code é preservado.
  Aprovação por caixa só funciona para branches do próprio repositório. Não se usa
  `pull_request_target`: rodar `pnpm install` de um fork com token de escrita é inaceitável.
- **Loops:** o PATCH do bot não dispara workflow. Com um PAT no lugar do token padrão, o guard
  de `sender` bot e a exigência de caixa marcada cortam o ciclo do mesmo jeito.
- **Corrida:** `concurrency` por número de PR sem `cancel-in-progress`; ids que já não são
  pendentes na hora da aprovação são descartados, nunca aprovados às cegas.
- **Código executado:** em `issue_comment` roda o workflow e o CLI da branch default; o PR só
  contribui com os arquivos escaneados.

### Limitação conhecida

O push feito com `GITHUB_TOKEN` não dispara o `ci.yml` no commit do bot. O PR fica sem checks
nesse sha até o próximo push humano; um PAT ou token de GitHub App no input `token` (e no
`actions/checkout`) resolve. Documentado no README.

### Distribuição e dogfood

- `action.yml` composta na raiz: inputs `directory` (`.`), `token` (`${{ github.token }}`),
  `version` (`latest`), `fail-on-changes` (`true`); passos `actions/setup-node@v4` e
  `npx --yes ruleprint@<version> pr --dir <directory>`. O chamador faz o `actions/checkout@v4` e
  concede `contents: write` e `pull-requests: write`. A tag móvel `v1` é criada pelo dono depois
  da primeira publicação no npm.
- Dogfood em `.github/workflows/ruleprint.yml` deste repositório, com o build local
  (`pnpm build` e `node packages/cli/dist/bin.js pr`) e `--dir examples/fixture-express-api`. Rodar
  na raiz exigiria aprovar as centenas de regras derivadas dos testes do próprio RulePrint e
  chamaria o bot a cada teste editado, exatamente o ruído que o sinal de parada proíbe. O fixture
  já tem lock e é o que os testes do CLI exercitam.

### Alternativas descartadas

- Comando `/ruleprint approve …` em comentário: exige `issue_comment.created` e parsing de texto
  livre; a caixa é o botão que o brief pede. Pode voltar como atalho.
- Um comentário por regra: ruído; some com a regra e perde o histórico.
- Apagar o comentário quando tudo está aprovado: perde o registro do que foi revisado.
- `@octokit/rest` ou `@actions/github`: três endpoints não justificam a dependência.
- Action JavaScript com bundle: obriga a versionar um `dist` e o WASM do tree-sitter.

## Consequências

- **Nenhuma mudança de schema.** `ruleprint.json`, `ruleprint.lock` e `.ruleprint/config.json`
  ficam como estão; o SPEC não muda.
- O formato do comentário passa a ser artefato de produto, como o lock: o parser depende do
  renderizador, e ambos vivem no core com testes de ida e volta.
- Uma aprovação pelo bot no fixture deixa o golden desatualizado (`approvedAt`); quem aprova pela
  caixa roda `pnpm update:golden` em seguida. Registrado no CONTRIBUTING.
- O renderizador e o parser são reaproveitáveis para GitLab ou outro host; só `github.ts` e o
  leitor de eventos são específicos do GitHub.
