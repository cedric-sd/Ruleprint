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

| Campo                | Tipo               | Obrigatório | Descrição                                          |
| -------------------- | ------------------ | ----------- | -------------------------------------------------- |
| `specVersion`        | `"0.1"`            | sim         | versão da especificação                            |
| `project.name`       | string não vazia   | sim         | nome do projeto                                    |
| `project.commit`     | hex, 7 a 40 chars  | não         | commit de origem                                   |
| `project.repository` | URL http(s)        | não         | repositório web, base dos links para arquivo/linha |
| `generatedAt`        | RFC 3339 date-time | sim         | quando o documento foi gerado                      |
| `rules`              | `Rule[]`           | sim         | pode ser vazio; ids únicos                         |

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

## Regras declaradas e anotações

Uma regra `declared` vive em `.ruleprint/rules/*.md` (ADR-0006):

```md
---
id: RP-088272
title: Pedido acima de R$300 tem frete grátis no Sudeste
tags: [frete, checkout]
---

Aplicado apenas para CEPs da região Sudeste.
```

- Front-matter mínimo: `id`, `title`, `tags` (`chave: valor`, lista inline `[a, b]` ou em bloco
  `- item`). Sem `title`, vale o primeiro `# Título` do corpo e, na falta, o nome do arquivo. O
  corpo é a `description`.
- Com `id`, o arquivo se funde com a regra desse id: título, descrição e tags do markdown vencem,
  as fontes e a evidência do teste se somam, `confidence` passa a `declared`. Sem `id`, é uma regra
  nova; sem nenhuma evidência ela fica `orphan`.
- `// @rule RP-088272` (ou `#`, `*`, `/* */`) num arquivo de código acrescenta aquele arquivo e
  linha como fonte `annotation` da regra. Não cria regra; id desconhecido gera aviso.
- `ruleprint promote <id>` escreve o markdown de uma regra existente para ela virar declarada.

## Configuração: `.ruleprint/config.json`

Opcional. Hoje só liga o coletor AST (ADR-0007), que fica desligado sem ele:

```json
{
  "ast": {
    "include": ["src/domain/**"],
    "exclude": ["src/domain/legacy/**"],
    "glossary": ["freight", "coupon", "refund"]
  }
}
```

- `ast.include` (obrigatório dentro de `ast`, ao menos um glob relativo à raiz escaneada; `**`,
  `*` e `?`) diz onde o coletor pode inferir regras de condicionais. Arquivos de teste nunca
  entram.
- `ast.exclude` remove caminhos do `include`.
- `ast.glossary` são termos de domínio (case-insensitive, casados contra as palavras dos
  identificadores) que contam como sinal e viram `tags` das regras inferidas.
- Chaves desconhecidas são erro. O schema é `ruleprint.config.schema.json` em `@ruleprint/spec`,
  validado por `validateConfig()`.

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

| Status     | Significado                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `pending`  | nunca aprovada, ou aprovada e ainda sem entrada no lock                                           |
| `approved` | fingerprint atual igual ao do lock                                                                |
| `drifted`  | fingerprint atual diferente do aprovado no lock                                                   |
| `orphan`   | declarada sem nenhuma evidência (teste ou `@rule`) que a cubra; informada pelo `check`, não falha |

## Fingerprint e drift

`fingerprint` é o hash SHA-256 da **AST normalizada** do trecho de origem, não do texto.
Reformatar, renomear variável local ou trocar aspas não gera drift; mudar uma condição, uma
asserção ou um literal gera. Coletores sem forma normalizada (por ora, todos exceto o de testes)
usam um material provisório baseado no título e nas fontes (ADR-0004).

## `ruleprint.lock`

Arquivo commitado na raiz escaneada, análogo ao `package-lock.json`: a memória do que foi
aprovado. Guarda **só regras aprovadas**; `pending` e `drifted` são calculados a cada scan
(`docs/adr/0005-lock-fingerprint-e-check.md`).

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

Como o scan é comparado ao lock:

| Situação                                              | Status no documento                        | Mudança reportada pelo `check` |
| ----------------------------------------------------- | ------------------------------------------ | ------------------------------ |
| mesmo coletor + título, mesmo fingerprint             | `approved` (com `approvedAt`/`approvedBy`) | nenhuma                        |
| mesmo coletor + título, fingerprint diferente         | `drifted`                                  | `changed`                      |
| mesmo fingerprint, título diferente (sem ambiguidade) | `drifted`, id preservado                   | `renamed`                      |
| regra nova                                            | `pending`                                  | `added`                        |
| entrada do lock sem regra no scan                     | —                                          | `removed`                      |

- `ruleprint check` compara o estado atual com o lock. Qualquer mudança → exit code 1; erro → 2.
- `ruleprint approve` grava o lock (`--all`, lista de ids, ou interativo num terminal) e
  regrava `ruleprint.json` com os status novos.

O `fingerprint` é o hash da AST normalizada do teste (só nós nomeados, strings por conteúdo,
variáveis locais renomeadas por posição, sem comentários); arquivo e linha ficam de fora.

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
campo), `keyword` e `message`. `validateConfig()` faz o mesmo para `.ruleprint/config.json`.
