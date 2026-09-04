# ADR-0005: Fingerprint de AST normalizada, `ruleprint.lock`, `check` e `approve`

- **Status:** aceito
- **Data:** 2026-09-04

## Contexto

Até o M3, `id` vinha de `hash(collector, título)` e `fingerprint` de `título + arquivo:símbolo`
(ADR-0004, provisórios). O M4 entrega a memória do que foi aprovado: um fingerprint que
"reformatar não muda, mudar condição muda", o `ruleprint.lock`, `ruleprint check` com exit codes
e `ruleprint approve`. Três decisões de produto foram tomadas antes deste ADR: o lock guarda só
regras aprovadas; renomear um teste preserva o id mas exige nova aprovação; regra aprovada que
some do scan é reportada e exige aprovação para sair do lock.

## Decisão

### Normalização da AST (coletor de testes)

O coletor serializa a `call_expression` do `it`/`test` inteira (modificadores, tabela de `.each`,
parâmetros e corpo do callback), com o título trocado por `<title>`. Regras:

- Só nós **nomeados** entram; pontuação, `;`, vírgulas e parênteses de agrupamento sintático não
  existem na árvore nomeada. Comentários (`comment`) são descartados.
- Strings entram pelo **conteúdo** (`string_fragment` + escapes decodificados), não pelo texto com
  aspas; template strings pelas partes.
- Parâmetro único de arrow function sem parênteses (`a => …`) é serializado como
  `formal_parameters(required_parameter(identifier))`, igual a `(a) => …`.
- Identificadores **declarados localmente** no teste (parâmetros do callback, `variable_declarator`,
  `function_declaration`, padrões de destructuring, `catch`, `for…of/in`) são renomeados para
  `$0, $1, …` na ordem da primeira ocorrência. Identificadores livres (`expect`, `calcFreight`,
  constantes importadas) ficam literais: trocar `southeast` por `northeast` é mudança de regra.
- `property_identifier` fica literal: `toBe` → `toEqual` é mudança de asserção.
- Limitação aceita: `{ 'a': 1 }` e `{ a: 1 }` diferem (string vs `property_identifier`).

### Fingerprint

`fingerprint = "sha256:" + sha256(collector + "\n" + normalized)`. Arquivo e linha ficam fora:
mover o teste de arquivo ou de lugar não gera drift. Coletores que não fornecem `normalized`
(campo opcional em `RuleCandidate`) caem no material provisório do ADR-0004. Calculado no core
com Web Crypto, como antes.

### `ruleprint.lock`

JSON na raiz escaneada, chaves ordenadas, uma entrada por regra **aprovada**:

```json
{
  "lockVersion": 1,
  "rules": {
    "RP-088272": {
      "title": "shipping > frete grátis > acima de 300 reais no Sudeste",
      "collector": "tests",
      "fingerprint": "sha256:…",
      "approvedAt": "2026-09-04T12:00:00.000Z",
      "approvedBy": "git:maria@empresa.com"
    }
  }
}
```

`title` e `collector` existem para o diff do lock ser legível num PR e para o casamento por
título. `pending` e `drifted` nunca são gravados: são calculados a cada scan.

### Preservação de id e detecção de mudanças (`reconcile`)

Dado o conjunto de candidatos e o lock:

1. Candidato com `collector + título` iguais a uma entrada → recebe o id da entrada. Fingerprint
   igual → `approved` (com `approvedAt`/`approvedBy` copiados); diferente → `drifted`, mudança
   `changed`.
2. Candidato sem casamento por título cujo fingerprint é compartilhado por **exatamente uma**
   entrada ainda não casada, e ele é o **único** candidato órfão com esse fingerprint → recebe o id
   da entrada; status `drifted`, mudança `renamed` (o corpo é o mesmo, o texto da regra mudou).
   Ambiguidade (corpos idênticos) não casa: vira regra nova.
3. Demais candidatos → id por hash (ADR-0004), pulando ids já usados pelo lock; status `pending`,
   mudança `added`.
4. Entradas do lock sem candidato → mudança `removed` (não há regra no documento).

O enum `status` do schema **não muda**: `renamed` é uma espécie de drift no documento; o
relatório do `check` é quem distingue `changed`, `renamed` e `removed`.

### `check`

Rescan + reconcile, sem escrever nada. Imprime as mudanças agrupadas e um resumo; `--json`
imprime `{ approved, changes: [...] }`. Exit `0` sem mudanças, `1` com qualquer `added`,
`changed`, `renamed` ou `removed`, `2` em erro. Sem lock, tudo é `added` e o `check` falha
dizendo que nenhuma regra foi aprovada ainda: é o estado esperado de um repo recém-inicializado.

### `approve`

Rescan + reconcile; aplica aprovações e grava `ruleprint.lock` **e** `ruleprint.json` (com os
status novos). `added`/`changed`/`renamed` → upsert da entrada com fingerprint e título atuais;
`removed` → entrada apagada. Seleção: `--all`; lista de ids; ou, sem argumentos num TTY, uma
pergunta por mudança via `node:readline`. `approvedBy` = `--by <quem>` ou `git:<user.email>`;
sem e-mail configurado, o campo é omitido. `approvedAt` = agora (ISO).

### Escopo dos comandos existentes

`scan`, `init`, `serve` e `build` passam a ler o lock se existir, para que `ruleprint.json` e a UI
mostrem `approved`/`drifted`. Nenhum deles escreve o lock.

## Consequências

- O golden do fixture muda (fingerprints novos) e ganha os campos de aprovação quando o fixture
  tiver lock.
- Renomear uma regra aprovada custa um "sim" a mais no PR. Deliberado: o título é o que o time de
  produto lê.
- Dois testes com corpo idêntico e títulos diferentes têm o mesmo fingerprint; o casamento por
  fingerprint desiste nesse caso, então renomear um deles vira `removed` + `added`. Aceito.
- A normalização é específica do coletor de testes; o M6 (AST) e o M8 (pytest/JUnit) precisam da
  sua própria, com as mesmas regras de princípio (só nós nomeados, locais alfa-renomeados).
- O material do fingerprint inclui a tabela do `.each`: mudar um caso da tabela é drift, como deve.
