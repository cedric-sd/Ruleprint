# RulePrint — Especificação do formato (`ruleprint.json`)

> **Rascunho.** Este documento é a explicação humana de `ruleprint.schema.json`. O schema formal
> (v0.1), os tipos gerados e o validador chegam no M1 em `packages/spec`. Até lá, este texto é a
> referência; mudanças no schema exigem ADR em `docs/adr/`.

## Visão

`ruleprint.json` é o "OpenAPI das regras de negócio": um artefato versionado (`specVersion`),
gerado a partir do repositório e consumido pela UI, pelo `check` e por integrações. O schema será
publicado em URL estável (`https://ruleprint.dev/schema/v0.json`).

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
      "fingerprint": "sha256:9f2c…", // hash da AST normalizada da origem
      "status": "approved", // approved | pending | drifted | orphan
      "approvedAt": "2026-08-30T09:11:00Z",
      "approvedBy": "git:maria@empresa.com",
    },
  ],
}
```

## Níveis de confiança

| Nível      | Origem                                     | Na UI                                   |
| ---------- | ------------------------------------------ | --------------------------------------- |
| `declared` | humano escreveu em `.ruleprint/rules/*.md` | selo verde, "regra oficial"             |
| `derived`  | inferida de teste automatizado             | selo azul + link para o teste e status  |
| `inferred` | inferida da AST do código                  | selo cinza, "não verificado", revisável |

Precedência no merge: `declared > derived > inferred`. Uma regra `inferred` confirmada por um
humano vira `declared` (a ferramenta escreve o markdown). Esse é o loop de valor: a ferramenta
rascunha, o time promove.

## Fingerprint e drift

`fingerprint` é o hash da **AST normalizada** do trecho de origem, não do texto. Reformatar,
renomear variável local ou trocar aspas não gera drift; mudar uma condição gera.

## `ruleprint.lock`

Arquivo commitado, análogo ao `package-lock.json`: `ruleId → fingerprint + status + approvedAt`.

- `ruleprint check` compara o estado atual com o lock. Divergência sem aprovação → exit code 1.
- `ruleprint approve` atualiza o lock (interativo ou `--all` para CI).

## Pendências para o M1

- Campos obrigatórios vs opcionais de `rule`, `origin`, `evidence`.
- Formato de `id` (`RP-NNNN`) e regra de atribuição estável entre execuções.
- Enum fechado para `collector` ou string livre com registro.
