# ADR-0003: Parser para o coletor de testes (ts-morph vs tree-sitter)

- **Status:** aceito
- **Data:** 2026-09-04

## Contexto

O coletor de testes (M2) precisa transformar `*.spec.ts` / `*.test.ts` na árvore
`describe`/`it` e emitir uma regra `derived` por folha, herdando os títulos dos `describe` pais.
A tarefa é puramente sintática: localizar chamadas a `describe`, `it`, `test` (e as formas
`.skip`, `.only`, `.todo`, `.each`), ler o primeiro argumento e seguir o aninhamento dos
callbacks. Não precisa de tipos, resolução de módulos nem checagem semântica.

O brief deixou a escolha em aberto entre `ts-morph` e `tree-sitter`, mas já travou
`tree-sitter (WASM)` como estratégia multi-linguagem (ADR-0001) e prevê no M8 coletores de
`pytest` e `JUnit`, que fazem exatamente o mesmo trabalho em Python e Java. O M4 também precisa de
um fingerprint de AST normalizada, e o M6 (coletor AST) usa tree-sitter por definição.

Dados verificados no npm em 2026-09-04:

| Opção                                                  | Tamanho instalado                                                                           | O que traz                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ts-morph` 28                                          | ~14 MB (`@ts-morph/common` embute uma cópia do TypeScript)                                  | API ergonômica sobre o compilador TS; só TS/JS; síncrono                                                                                    |
| `web-tree-sitter` 0.27 + `tree-sitter-typescript` 0.23 | ~0,5 MB runtime + 39 MB do pacote da gramática (fontes C, binding nativo, `node-gyp-build`) | os `.wasm` existem, mas o pacote é pensado para o binding nativo e arrasta toolchain                                                        |
| `@vscode/tree-sitter-wasm` 0.3                         | ~22 MB, só `.wasm` e um `.js`                                                               | runtime `web-tree-sitter` + gramáticas pré-compiladas e ABI-compatíveis: typescript, tsx, javascript, python, java, go, c#, php, ruby, rust |

Um protótipo com `@vscode/tree-sitter-wasm` em Node 22 confirmou: `Parser.init()`,
`Language.load(caminho.wasm)`, parse síncrono após o init, `Query` com captures, e a árvore expõe
`describe('x', () => {...})` como `call_expression` (`function` = `identifier` ou
`member_expression`, título em `string`/`template_string`) e `it.each([...])('t %s')` como
`call_expression` cujo `function` é outro `call_expression`.

## Decisão

**tree-sitter, via `@vscode/tree-sitter-wasm`**, para o coletor de testes e para todo parsing
de código-fonte do projeto.

Por quê:

1. **Uma infraestrutura de parsing, não uma por linguagem.** A mesma dependência atende M2
   (TS/JS), M6 (AST) e M8 (Python, Java). Um coletor de `pytest` vira "a mesma caminhada, outra
   gramática", que é a promessa da secção 4 do brief.
2. **Não embutir o compilador TypeScript no CLI.** `ts-morph` colocaria ~14 MB e uma versão fixa
   do TS como dependência de runtime de `npx ruleprint`, para um problema que não precisa de tipos.
3. **Tolerância a erro.** tree-sitter produz árvore parcial para arquivos com erro de sintaxe; o
   coletor segue coletando o que consegue em vez de abortar o scan.
4. **Runtime e gramáticas na mesma versão.** O pacote da VS Code publica `web-tree-sitter` e os
   `.wasm` compilados juntos, eliminando o risco de incompatibilidade de ABI entre runtime e
   gramática que existe ao combinar `web-tree-sitter` com gramáticas de fontes diversas. É
   mantido pela Microsoft para o próprio VS Code e licenciado em MIT.

Como fica no código:

- `@vscode/tree-sitter-wasm` é dependência de runtime de `@ruleprint/collector-tests`, com versão
  **exata** (sem `^`): uma atualização de gramática pode renomear tipos de nó, e isso deve ser
  uma mudança deliberada acompanhada dos testes de snapshot.
- O contrato `Collector` fica em `packages/core` (puro) e admite `collect()` assíncrono:
  o carregamento do `.wasm` é assíncrono e acontece uma vez, sob demanda; o parse é síncrono.
- O coletor caminha a árvore com a API de nós (`namedChildren`, `childForFieldName`) em vez de
  depender só de `Query`, porque o aninhamento `describe > it` exige seguir os callbacks.

Alternativas descartadas:

- **`ts-morph`**: melhor ergonomia e tipos, mas só TS/JS e 14 MB de runtime. Voltaria a ser
  opção se o coletor precisasse de informação semântica (por exemplo, resolver `describe`
  importado sob outro nome), o que não está no roadmap.
- **API do compilador TypeScript direto**: mesmo custo de runtime do `ts-morph`, sem a
  ergonomia.
- **`web-tree-sitter` + `tree-sitter-typescript`**: funciona, mas o pacote da gramática declara
  `node-gyp-build`, `node-addon-api` e peer em `tree-sitter` nativo, o que o pnpm bloqueia por
  padrão e polui a instalação de quem só quer o WASM.
- **`tree-sitter-wasms`**: só gramáticas, sem runtime casado; 52 MB.

## Consequências

- O coletor reconhece `describe`/`it`/`test` pelo nome do identificador, não por origem do import.
  Um `import { it as spec }` não é detectado. Aceito: é raro e o custo de resolver imports é o
  compilador inteiro.
- Init assíncrono obriga o contrato `Collector` a aceitar `Promise<RuleCandidate[]>`; o core
  precisa lidar com isso desde já.
- 22 MB de `.wasm` na `node_modules` do CLI, dos quais o M2 usa 3 MB (typescript + tsx). Se
  virar problema de tamanho de instalação, o caminho é publicar as gramáticas em pacotes
  opcionais por linguagem, não trocar de parser.
- Node 20 carrega `.wasm` via `fs` sem flags; nenhum requisito novo de runtime.
- O fingerprint de AST normalizada (M4) é construído sobre a mesma árvore, o que garante que
  "reformatar não gera drift" vale igual para todas as linguagens.
