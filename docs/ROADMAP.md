# RulePrint — Roadmap

> Resumo do plano de início. Fonte de verdade para escopo e ordem dos milestones.
> Leia junto com `docs/SPEC.md` antes de qualquer tarefa.

## 0. Decisões travadas

| Decisão                 | Escolha                                        | Motivo                                                      |
| ----------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| Nome                    | `ruleprint`                                    | livre no npm em 04/09/2026                                  |
| Licença                 | Apache-2.0                                     | mesma do log4brains; concede patente, aceita em empresa     |
| Linguagem do core       | TypeScript                                     | velocidade de MVP; ecossistema de AST maduro                |
| Parsing multi-linguagem | tree-sitter (WASM)                             | uma API, dezenas de gramáticas                              |
| Gerenciador             | pnpm workspaces (monorepo)                     | pacotes independentes desde o dia 1                         |
| Testes                  | vitest                                         | rápido; o próprio projeto vira dogfood do coletor de testes |
| Versionamento           | changesets + semantic release (adiado; ver M3) | publicar múltiplos pacotes sem dor                          |
| Node mínimo             | 20 LTS                                         | CI roda em 20 e 22                                          |

Detalhes e versões de tooling em `docs/adr/0001-decisoes-iniciais.md`.

**Regra de ouro:** a especificação (`ruleprint.schema.json`) é o produto. CLI, UI e coletores são
implementações intercambiáveis em cima dela.

## 1. Princípio norteador: zero disciplina

1. `npx ruleprint init` deve produzir um livro de regras útil num repositório que nunca ouviu
   falar da ferramenta. Sem anotação, sem config, sem plugin.
2. O trabalho humano é aprovar, não escrever.
3. Tudo é automatizável: headless, exit code significativo, `--json`. O CLI é feito para CI antes
   de ser feito para humano.

Teste de sanidade permanente: _se o dev não fizer nada além de rodar um comando no CI, a
ferramenta ainda entrega valor?_ Se não, corte a feature.

## 2. Arquitetura

```
código do repo → COLETORES (tests · config · ast · annotations) → RuleCandidate[]
              → CORE (merge · dedup · precedência · fingerprint · diff vs lock) → ruleprint.json
              → dev server (hot reload) · build estático (GH Pages) · check / CI (exit code + PR bot)
```

Invariantes:

- **`core` é puro.** Sem `fs`, sem `process`, sem rede. Recebe arquivos como entrada abstrata,
  devolve estrutura de dados. Imposto por ESLint (`eslint.config.js`).
- **Coletor é um contrato, não uma classe.**
  `{ name, match(file): boolean, collect(file, ctx): RuleCandidate[] }`.
- **Renderer só consome `ruleprint.json`.** Nunca lê código-fonte diretamente.

## 3. Estrutura do repositório

```
ruleprint/
├── packages/
│   ├── spec/                  # ruleprint.schema.json + tipos TS gerados
│   ├── core/                  # merge, precedência, fingerprint, diff (PURO)
│   ├── cli/                   # commander + comandos init/scan/serve/build/check (npm: `ruleprint`)
│   ├── ui/                    # app web (Vite + React), consome ruleprint.json
│   ├── collector-tests/       # vitest/jest → regras
│   ├── collector-config/      # .ruleprint/rules/*.md → regras
│   ├── collector-annotations/ # comentários @rule → regras
│   └── collector-ast/         # tree-sitter + heurísticas de domínio
├── examples/
│   ├── fixture-express-api/   # repo de brinquedo para testes e2e
│   └── golden/                # ruleprint.json esperados (snapshot tests)
├── docs/
│   ├── SPEC.md                # explicação humana do formato
│   ├── ROADMAP.md             # este arquivo
│   └── adr/                   # decisões arquiteturais
├── .github/workflows/
├── CLAUDE.md
├── CONTRIBUTING.md
└── LICENSE
```

Pacotes publicam como `@ruleprint/<nome>`, exceto `packages/cli`, que publica como `ruleprint`
para viabilizar `npx ruleprint`.

## 4. Milestones

Cada milestone é uma branch, um PR e algo demonstrável. Nada de "semana de infraestrutura".

### M0 — Esqueleto (concluído)

Monorepo pnpm, TS strict, vitest, ESLint/Prettier, CI de lint+test em Node 20 e 22, Apache-2.0,
README com a promessa em uma frase.
**DoD:** `pnpm test` verde no CI num PR.

Fica para depois: changesets, `CODE_OF_CONDUCT.md`, build/dist dos pacotes, e os scripts
`pnpm dev` e `pnpm check:golden` citados no `CLAUDE.md` (dependem de M2/M3).

### M1 — A especificação (concluído)

`ruleprint.schema.json` v0.1, tipos TS gerados via `json-schema-to-typescript` (commitados;
`pnpm generate` regenera e o CI confere), validador exportado, três `ruleprint.json` de exemplo em
`examples/golden/`. Decisões do formato em `docs/adr/0002-schema-v0-1.md`.
**DoD:** validador rejeita os casos inválidos de fixture e aceita os golden.

### M2 — Coletor de testes (em andamento; aqui o produto nasce)

Lê `*.spec.ts` / `*.test.ts`, monta a árvore `describe`/`it` via AST (tree-sitter em WASM,
ver `docs/adr/0003-parser-do-coletor-de-testes.md`), converte cada folha em uma regra `derived`
herdando o contexto dos `describe` pais. Opcionalmente cruza com o reporter do vitest para
`lastRunStatus`. Exige zero trabalho novo do dev.
**DoD:** rodar contra `examples/fixture-express-api` e contra o próprio repo do ruleprint com saída
legível. Se a saída for ruim aqui, pare e reformule antes de investir em UI.

### M3 — CLI + UI mínima

`ruleprint scan`, `ruleprint serve` (porta 4141, hot reload), `ruleprint build` (estático).
UI: lista pesquisável, filtro por tag e confiança, detalhe com link para arquivo/linha.
Changesets e publish no npm entram aqui.
**DoD:** GIF de 20s no README mostrando `npx ruleprint init` num repo real.

### M4 — Lockfile, drift e `check`

Fingerprint de AST normalizada, `ruleprint.lock`, `ruleprint check` (0 ok, 1 drift não aprovado,
2 erro), `ruleprint approve`.
**DoD:** alterar uma condição no fixture quebra o `check`; reformatar não quebra.

### M5 — Coletor de config e anotações

`.ruleprint/rules/*.md` com front-matter (`declared`), `@rule RP-0042` em comentário,
`ruleprint promote <id>`.
**DoD:** precedência `declared > derived > inferred` coberta por testes de merge.

### M6 — Coletor AST (o arriscado)

Opt-in por diretório. Filtros agressivos: descarta null checks, guard clauses, early returns,
loops. Só promove condicionais com literais nomeados, constantes de domínio ou identificadores do
glossário.
**DoD:** ruído medido à mão em 3 repos OSS. Mais de 30% de lixo → não libere.

### M7 — GitHub Action + bot de PR

Comenta regras novas, drift e órfãs; aprovação gera commit no lock.
**DoD:** dogfood no próprio repo.

### M8 — Multi-linguagem e distribuição

tree-sitter para Python e Java, coletores pytest e JUnit, imagem Docker, binários em Releases.
**DoD:** `docker run` funciona num projeto Python sem Node.

### Pós-1.0 — Enriquecimento por LLM (opcional, BYO key)

Sempre `inferred`, cacheado, commitado, desligado por padrão. O LLM é tradutor, nunca fonte de
verdade.

## 5. Sinais de parada

1. **M2 gera output ruim.** A premissa central está errada.
2. **Ninguém aprova.** O bot virou ruído; a extração precisa ser mais conservadora.
3. **Só devs olham a UI.** O produto real é análise de código, não documentação. Reposicione.
