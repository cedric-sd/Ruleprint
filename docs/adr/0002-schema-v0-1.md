# ADR-0002: Schema v0.1 do `ruleprint.json`

- **Status:** aceito
- **Data:** 2026-09-04

## Contexto

O M1 formaliza o formato descrito em `docs/SPEC.md` como JSON Schema em `packages/spec`, com
tipos TS gerados e um `validate()` exportado. O rascunho deixava três pendências: campos
obrigatórios vs opcionais, formato e atribuição de `id`, e se `collector` é enum fechado ou
string livre. Além disso era preciso escolher o draft do JSON Schema, o validador e como gerar os
tipos.

## Decisão

**Draft e publicação.** JSON Schema draft-07, `$id` `https://ruleprint.dev/schema/v0.json`.
Draft-07 é o que `json-schema-to-typescript` e a maioria dos editores suportam melhor; 2020-12
não traz nada que o formato precise.

**Campos obrigatórios.**

| Objeto     | Obrigatórios                                     | Opcionais                                                     |
| ---------- | ------------------------------------------------ | ------------------------------------------------------------- |
| documento  | `specVersion`, `project`, `generatedAt`, `rules` | —                                                             |
| `project`  | `name`                                           | `commit`                                                      |
| `rule`     | `id`, `title`, `origin`, `fingerprint`, `status` | `description`, `tags`, `evidence`, `approvedAt`, `approvedBy` |
| `origin`   | `collector`, `confidence`, `sources` (≥ 1)       | —                                                             |
| `source`   | `file`                                           | `line`, `symbol`, `kind`                                      |
| `evidence` | —                                                | `tests`, `lastRunStatus`, `coveredLines`                      |

`fingerprint` é obrigatório mesmo para regras `declared`: o lock e o `check` dependem dele para
toda regra, e para markdown ele é o hash do conteúdo normalizado.

**Todo objeto é fechado** (`additionalProperties: false`). Campo desconhecido é erro. Extensões
entram por mudança de `specVersion`, não por chaves soltas.

**`id`.** `RP-` seguido de quatro ou mais dígitos (`^RP-[0-9]{4,}$`). Unicidade dentro do
documento é verificada pelo `validate()`, não pelo schema (JSON Schema não expressa isso). A regra
de atribuição estável entre execuções é responsabilidade do core e fica para o M4, junto com o
lock.

**`collector` é string livre** (`minLength: 1`). Os nomes dos coletores nativos são `tests`,
`config`, `annotations` e `ast`, mas coletores de terceiros são um objetivo explícito do projeto;
um enum fechado exigiria mudar o schema a cada plugin.

**`fingerprint`** segue `^sha256:[0-9a-f]{64}$`. O prefixo do algoritmo permite trocar o hash no
futuro sem ambiguidade.

**Enums fechados:** `confidence` (`declared | derived | inferred`), `status`
(`approved | pending | drifted | orphan`), `evidence.lastRunStatus` (`passed | failed | unknown`),
`source.kind` (`code | test | config | annotation`).

**Datas** (`generatedAt`, `approvedAt`) em RFC 3339 via `format: date-time`.

**Validador:** Ajv 8 com `ajv-formats`, `allErrors: true` e modo estrito. `validate()` nunca
lança; devolve `{ valid: true, document }` ou `{ valid: false, issues }`, onde cada issue tem
`path` (JSON pointer apontando para a propriedade faltante ou desconhecida, não só para o pai),
`keyword` e `message`.

**Tipos:** gerados por `json-schema-to-typescript` em `src/types.generated.ts`, commitados. O CI
regenera e falha se o arquivo divergir do schema. Commitar evita um passo de build para quem
consome o pacote no monorepo e mantém o diff dos tipos visível no PR.

## Consequências

- Adicionar campo é mudança de schema com ADR, mesmo que opcional, por causa de
  `additionalProperties: false`.
- Um documento com dois `RP-0001` passa no schema puro; só o `validate()` deste pacote o rejeita.
  Consumidores que validem apenas com o JSON Schema precisam saber disso.
- O padrão de `id` reserva o prefixo `RP-`; mudar exige nova versão do spec.
- `json-schema-to-typescript` puxa `prettier` e `lodash` como dependências de desenvolvimento
  do pacote `spec`; `ajv` e `ajv-formats` são as únicas dependências de runtime.
