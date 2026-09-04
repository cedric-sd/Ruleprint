# ADR-0001: Decisões iniciais e tooling do monorepo

- **Status:** aceito
- **Data:** 2026-09-04

## Contexto

Antes da primeira linha de código, o brief travou um conjunto de decisões para evitar retrabalho
(nome, licença, linguagem, parser, gerenciador, testes, versionamento, Node mínimo). O M0 precisa
materializar essas decisões em tooling que passe no CI em Node 20 **e** 22.

## Decisão

Decisões de produto (do brief):

| Decisão                 | Escolha                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| Nome                    | `ruleprint` (CLI publica como `ruleprint`; demais pacotes como `@ruleprint/*`) |
| Licença                 | Apache-2.0                                                                     |
| Linguagem do core       | TypeScript                                                                     |
| Parsing multi-linguagem | tree-sitter (WASM)                                                             |
| Gerenciador             | pnpm workspaces                                                                |
| Testes                  | vitest                                                                         |
| Versionamento           | changesets + semantic release, adiado para o M3 (quando houver o que publicar) |
| Node mínimo             | 20 LTS (`engines.node >= 20.19.0`, piso imposto pelo ESLint 10)                |

Tooling do M0, com as restrições que definiram cada versão:

| Pacote                                | Versão                              | Motivo                                                          |
| ------------------------------------- | ----------------------------------- | --------------------------------------------------------------- |
| `typescript`                          | 5.9.x                               | 7.x está fora do range suportado por typescript-eslint (`<6.1`) |
| `vitest`                              | 4.1.x                               | 5.x exige Node ≥ 22.12 e quebraria o CI em Node 20              |
| `eslint`                              | 10.x (flat config)                  | exige Node ≥ 20.19                                              |
| `typescript-eslint`                   | 8.69.x                              | `recommendedTypeChecked` com `projectService`                   |
| `prettier` + `eslint-config-prettier` | 3.9.x / 10.1.x                      | Prettier formata; ESLint não opina sobre estilo                 |
| `@types/node`                         | 20.x                                | tipar contra o Node mínimo, não contra o mais novo              |
| pnpm                                  | 10.33.x, pinado em `packageManager` | CI e devs usam a mesma versão via corepack                      |

Outras escolhas de estrutura:

- `tsconfig.base.json` com `strict`, `NodeNext`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`.
  Cada pacote só faz `tsc --noEmit`; build/dist entra quando houver publicação.
- Um único `vitest.config.ts` na raiz incluindo `packages/*/src/**/*.test.ts`.
- A invariante "core é puro" é imposta por ESLint (`no-restricted-imports` para `fs`, `path`,
  `process`, `os`, `child_process`, `http(s)`, `net`, `url` e as formas `node:*`;
  `no-restricted-globals` para `process`) apenas em `packages/core`.
- `examples/` fica fora do workspace pnpm: são fixtures, não pacotes.

## Consequências

- Atualizar vitest para 5.x ou changesets para 3.x exige antes abandonar Node 20 no CI. Node 20
  chegou ao fim de vida em abril de 2026, mas o brief o mantém como mínimo; revisitar quando
  suportá-lo deixar de custar zero.
- Atualizar TypeScript para 7.x depende do suporte em typescript-eslint.
- A regra de pureza do core é sintática: cobre imports e o global `process`, não injeção indireta
  por dependência. Revisões de PR continuam responsáveis por isso.
