# RulePrint — Especificação do formato (`ruleprint.json`)

> Explicação humana de `packages/spec/ruleprint.schema.json` (v0.1). O schema é o contrato;
> mudanças nele exigem ADR em `docs/adr/`. Decisões desta versão: `docs/adr/0002-schema-v0-1.md`.

## Visão

`ruleprint.json` é o "OpenAPI das regras de negócio": um artefato versionado (`specVersion`),
gerado a partir do repositório e consumido pela UI, pelo `check` e por integrações. O schema é
publicado em `https://ruleprint.dev/schema/v0.json`. O pacote `@ruleprint/spec` exporta o schema,
os tipos TS gerados dele e `validate()`.

## Exemplo

```jsonc
{
  "specVersion": "0.1",
  "project": { "name": "checkout-service", "commit": "a1b2c3d" },
  "generatedAt": "2026-09-04T12:00:00Z",
  "rules": [
    {
      "id": "RP-0042",
      "title": "Pedido acima de R$300 tem frete grátis",
      "description": "Aplicado apenas para CEPs da região Sudeste.",
      "tags": ["frete", "checkout"],
      "origin": {
        "collector": "tests",
        "confidence": "derived", // declared | derived | inferred
        "sources": [
          { "file": "src/shipping.ts", "line": 88, "symbol": "calcFreight" },
          { "file": "test/shipping.spec.ts", "line": 12, "kind": "test" },
        ],
      },
      "evidence": {
        "tests": ["shipping > frete grátis > acima de 300 reais"],
        "lastRunStatus": "passed", // passed | failed | unknown
        "coveredLines": 14,
      },
      "fingerprint": "sha256:88e27ad7…", // 64 hex; hash da AST normalizada da origem
      "status": "approved", // approved | pending | drifted | orphan
      "approvedAt": "2026-08-30T09:11:00Z",
      "approvedBy": "git:maria@empresa.com",
    },
  ],
}
```

Exemplos completos e válidos em `examples/golden/`.

## Campos

Todos os objetos são fechados: propriedade desconhecida é erro.

### Documento

| Campo            | Tipo               | Obrigatório | Descrição                     |
| ---------------- | ------------------ | ----------- | ----------------------------- |
| `specVersion`    | `"0.1"`            | sim         | versão da especificação       |
| `project.name`   | string não vazia   | sim         | nome do projeto               |
| `project.commit` | hex, 7 a 40 chars  | não         | commit de origem              |
| `generatedAt`    | RFC 3339 date-time | sim         | quando o documento foi gerado |
| `rules`          | `Rule[]`           | sim         | pode ser vazio; ids únicos    |

### `Rule`

| Campo         | Tipo                                       | Obrigatório | Descrição                                     |
| ------------- | ------------------------------------------ | ----------- | --------------------------------------------- |
| `id`          | `RP-` + 4+ dígitos                         | sim         | identificador estável; único no documento     |
| `title`       | string não vazia                           | sim         | a regra em uma frase, em linguagem de negócio |
| `description` | string                                     | não         | condições, exceções, contexto                 |
| `tags`        | string[] sem repetição                     | não         |                                               |
| `origin`      | `RuleOrigin`                               | sim         | de onde a regra veio                          |
| `evidence`    | `RuleEvidence`                             | não         | evidência automatizada                        |
| `fingerprint` | `sha256:` + 64 hex                         | sim         | hash da AST normalizada da origem             |
| `status`      | `approved \| pending \| drifted \| orphan` | sim         | estado em relação ao lock                     |
| `approvedAt`  | RFC 3339 date-time                         | não         |                                               |
| `approvedBy`  | `<provider>:<identidade>`                  | não         | ex.: `git:maria@empresa.com`                  |

### `RuleOrigin`

| Campo        | Tipo                              | Obrigatório | Descrição                                                                       |
| ------------ | --------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| `collector`  | string não vazia                  | sim         | nativos: `tests`, `config`, `annotations`, `ast`; terceiros usam o próprio nome |
| `confidence` | `declared \| derived \| inferred` | sim         | ver abaixo                                                                      |
| `sources`    | `RuleSource[]`, ≥ 1               | sim         |                                                                                 |

### `RuleSource`

| Campo    | Tipo                                   | Obrigatório | Descrição                       |
| -------- | -------------------------------------- | ----------- | ------------------------------- |
| `file`   | caminho relativo à raiz, com `/`       | sim         |                                 |
| `line`   | inteiro ≥ 1                            | não         |                                 |
| `symbol` | string não vazia                       | não         | função, classe ou nome do teste |
| `kind`   | `code \| test \| config \| annotation` | não         |                                 |

### `RuleEvidence`

| Campo           | Tipo                          | Obrigatório | Descrição                  |
| --------------- | ----------------------------- | ----------- | -------------------------- |
| `tests`         | string[]                      | não         | nomes completos dos testes |
| `lastRunStatus` | `passed \| failed \| unknown` | não         |                            |
| `coveredLines`  | inteiro ≥ 0                   | não         |                            |

## Níveis de confiança

| Nível      | Origem                                     | Na UI                                   |
| ---------- | ------------------------------------------ | --------------------------------------- |
| `declared` | humano escreveu em `.ruleprint/rules/*.md` | selo verde, "regra oficial"             |
| `derived`  | inferida de teste automatizado             | selo azul + link para o teste e status  |
| `inferred` | inferida da AST do código                  | selo cinza, "não verificado", revisável |

Precedência no merge: `declared > derived > inferred`. Uma regra `inferred` confirmada por um
humano vira `declared` (a ferramenta escreve o markdown). Esse é o loop de valor: a ferramenta
rascunha, o time promove.

## Status

| Status     | Significado                                                   |
| ---------- | ------------------------------------------------------------- |
| `pending`  | nunca aprovada, ou aprovada e ainda sem entrada no lock       |
| `approved` | fingerprint atual igual ao do lock                            |
| `drifted`  | fingerprint atual diferente do aprovado no lock               |
| `orphan`   | declarada sem nenhuma evidência (teste ou código) que a cubra |

## Fingerprint e drift

`fingerprint` é o hash SHA-256 da **AST normalizada** do trecho de origem, não do texto.
Reformatar, renomear variável local ou trocar aspas não gera drift; mudar uma condição gera. Para
regras `declared`, é o hash do conteúdo normalizado do markdown.

## `ruleprint.lock`

Arquivo commitado, análogo ao `package-lock.json`: `ruleId → fingerprint + status + approvedAt`.

- `ruleprint check` compara o estado atual com o lock. Divergência sem aprovação → exit code 1.
- `ruleprint approve` atualiza o lock (interativo ou `--all` para CI).

O formato do lock e a atribuição estável de `id` entre execuções são definidos no M4.

## Validação

```ts
import { validate } from '@ruleprint/spec';

const result = validate(JSON.parse(text));
if (!result.valid) {
  for (const issue of result.issues) console.error(issue.path, issue.message);
}
```

`validate()` nunca lança. Além do schema, rejeita ids repetidos (`keyword: "uniqueRuleId"`).
Cada issue traz `path` (JSON pointer; para campo faltante ou desconhecido aponta para o próprio
campo), `keyword` e `message`.
