# ADR-0007: Coletor AST — heurísticas, filtros e medição de ruído

- **Status:** aceito
- **Data:** 2026-09-07

## Contexto

O M6 infere regras de condicionais do código. É o milestone que o brief chama de arriscado: sem
filtros, todo `if` vira "regra" e o livro vira lixo. O brief exige opt-in por diretório, filtros
agressivos e um DoD medido à mão em 3 repositórios de código aberto: acima de 30% de ruído, o
coletor não é liberado. Decisões de produto tomadas antes deste ADR: a configuração vive em
`.ruleprint/config.json`, validada por schema no pacote `spec`; o título é uma frase-modelo, não
um trecho de código literal; a medição usa medusa, vendure e cal.com; a entrega é uma planilha
por repositório com coluna para o dono marcar, mais o JSON cru.

## Decisão

### Escopo e opt-in

- TypeScript e JavaScript (gramáticas já presentes); Python e Java ficam para o M8.
- O coletor só roda quando `.ruleprint/config.json` tem `ast.include` (globs relativos à raiz
  escaneada). `ast.exclude` (globs) e `ast.glossary` (termos de domínio) são opcionais. Sem o
  arquivo, o scan é o de sempre. Arquivos de teste nunca entram, mesmo dentro do `include`.

```json
{
  "ast": {
    "include": ["src/domain/**"],
    "exclude": ["src/domain/legacy/**"],
    "glossary": ["freight", "coupon", "refund"]
  }
}
```

### Unidade de análise

Condicionais dentro de uma função nomeada (declaração, método, ou arrow/função atribuída a
`const`): `if` e cada `else if`, ternários e cada `case` de um `switch`. A função é o `symbol`
da fonte; condicionais fora de função (top-level) são ignoradas.

### Sinal de domínio (obrigatório)

Uma condicional só vira candidato se a condição tiver ao menos um sinal:

1. comparação (`< <= > >= === !== == !=`) com literal numérico ou string **não trivial** (não
   `0`, `1`, `-1`, `''`, `null`, `undefined`, `true`, `false`);
2. identificador ou membro em SCREAMING_SNAKE_CASE (`MAX_ITEMS_PER_ORDER`, `Limits.DAILY`);
3. membro enum-like: propriedade PascalCase ou SCREAMING de um objeto PascalCase
   (`Status.Active`, `OrderStatus.PAID`);
4. identificador (ou propriedade) cujo nome, quebrado em palavras (camelCase, snake_case),
   contém um termo do glossário (`isSoutheast`, `charge.disputed`), case-insensitive.

### Filtros de ruído (descartam mesmo com sinal)

- null/undefined checks: `x == null`, `x === undefined`, `!x` sozinho, `typeof x === …`,
  `x instanceof Y`, `Array.isArray(x)`, `Number.isNaN(x)`, `x?.y` como condição inteira;
- guardas de vazio: `.length`, `.size`, `.count` comparados a `0` ou `1`;
- configuração de ambiente: `process.env.*`, `NODE_ENV`;
- condições de `for`, `while`, `do…while`, e o corpo de `catch`;
- condição cujo único sinal é um literal comparado a `.length`/`.size`.

Guard clause ou early return **com** sinal de domínio fica:
`if (subtotal < MIN_ORDER_VALUE) throw new OrderError('below minimum')` é exatamente a regra
que o livro deve mostrar. O brief pedia descartar guard clauses; o critério real é a ausência de
sinal, não a forma.

### Título, descrição e tags

- Título: `<função>: when <condição>, <consequência>`. Na condição, `&&`→`and`, `||`→`or`,
  `!`→`not`, `===`/`==`→`is`, `!==`/`!=`→`is not`; comparações numéricas mantêm o símbolo;
  espaços normalizados. Consequência resumida da primeira instrução do bloco: `returns X`,
  `throws E: msg`, `sets a`, `calls f`, senão `then <primeira linha>`. Ternário:
  `returns X (otherwise Y)`. `case`: `when <discriminante> is <valor>, <consequência>`.
- `description`: o trecho de código (condição e até 5 linhas do bloco), para o revisor ver de
  onde veio. `tags`: termos do glossário casados. `confidence: inferred`, `collector: ast`,
  fonte `{ file, line, symbol: <função>, kind: "code" }`.
- Fingerprint: forma normalizada da condicional inteira (regras do ADR-0005), via utilitário
  compartilhado `@ruleprint/tree-sitter-utils`, extraído do coletor de testes.

### Metodologia de medição (DoD)

1. Para cada repo, clone raso e esparso de **um diretório de domínio**: medusa
   (`packages/modules/promotion/src`), vendure (`packages/core/src/service/helpers`), cal.com
   (`packages/features/bookings/lib` ou equivalente confirmado na hora).
2. `.ruleprint/config.json` com `include` desse diretório e um glossário de 10 a 20 termos
   tirados do próprio repositório (README, nomes de módulos), registrado na planilha.
3. `ruleprint scan` com o CLI buildado; o `ruleprint.json` cru vai para
   `docs/noise/<repo>.ruleprint.json`.
4. Planilha `docs/noise/<repo>.md`: uma linha por candidato (id, arquivo:linha, título), coluna
   `Regra?` vazia para o dono, coluna `Sugestão` com a leitura do agente (`regra` ou `ruído` e
   um motivo curto). O cabeçalho traz total e a taxa sugerida.
5. Taxa de ruído = candidatos marcados como ruído ÷ total, por repo e no agregado. Acima de 30%
   em qualquer repo, o coletor continua opt-in e marcado como experimental no README, e os
   filtros voltam ao ADR antes de qualquer liberação.

## Consequências

- Sem LLM (pós-1.0), os títulos são mecânicos; legíveis, mas não são frases de produto. O
  glossário é a alavanca de precisão do time: quanto melhor, menos ruído.
- Nada do M6 muda o schema de `ruleprint.json`; a config ganha schema próprio.
- O coletor produz muitos candidatos em código com constantes de domínio densas; o `check` os
  reporta como `added` até serem aprovados ou o `include` ser estreitado. É o comportamento
  esperado do opt-in.
- Extrair `@ruleprint/tree-sitter-utils` cria um pacote interno a mais; evita duplicar o loader
  WASM e a normalização entre os coletores de testes e AST (e os do M8).
