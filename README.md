# RulePrint

**RulePrint generates a browsable book of business rules from your repository, without asking
anyone to write documentation.**

Think Swagger for business rules, or [log4brains](https://github.com/thomvaill/log4brains) for
the rules your tests and code already encode. Point it at a repository and it drafts the rule book;
your team's only job is to approve.

```sh
npx ruleprint init   # coming in M3 — see docs/ROADMAP.md
```

## Status

Pre-alpha. The repository is at **M0 (skeleton)**: monorepo, tooling and CI only. There is no
product logic yet. Follow the milestones in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## How it works

```
code in the repo → collectors (tests, config, annotations, AST) → RuleCandidate[]
                 → core (merge · dedup · precedence · fingerprint · diff) → ruleprint.json
                 → dev server · static build · check / CI
```

Every rule carries a confidence level:

| Level      | Origin                                       |
| ---------- | -------------------------------------------- |
| `declared` | written by a human in `.ruleprint/rules/`    |
| `derived`  | inferred from an automated test              |
| `inferred` | inferred from the code's AST, never verified |

The specification (`ruleprint.schema.json`) is the product. CLI, UI and collectors are
interchangeable implementations on top of it. See [`docs/SPEC.md`](docs/SPEC.md).

## Packages

| Package                            | Role                                              |
| ---------------------------------- | ------------------------------------------------- |
| `@ruleprint/spec`                  | JSON Schema and generated TypeScript types        |
| `@ruleprint/core`                  | Pure engine: merge, precedence, fingerprint, diff |
| `ruleprint` (`packages/cli`)       | CLI: `init`, `scan`, `serve`, `build`, `check`    |
| `@ruleprint/ui`                    | Web app that renders `ruleprint.json`             |
| `@ruleprint/collector-tests`       | vitest/jest test trees → rules                    |
| `@ruleprint/collector-config`      | `.ruleprint/rules/*.md` → rules                   |
| `@ruleprint/collector-annotations` | `@rule` comments → rules                          |
| `@ruleprint/collector-ast`         | tree-sitter + domain heuristics → rules           |

## Development

Requires Node 20.19+ and [pnpm](https://pnpm.io) 10 (`corepack enable` picks the pinned version).

```sh
pnpm install
pnpm test          # vitest, all packages
pnpm test:watch
pnpm lint          # eslint
pnpm format        # prettier --write
pnpm typecheck     # tsc --noEmit in every package
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for conventions.

## License

[Apache-2.0](LICENSE)
