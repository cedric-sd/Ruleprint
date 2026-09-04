# RulePrint

**RulePrint generates a browsable book of business rules from your repository, without asking
anyone to write documentation.**

Think Swagger for business rules, or [log4brains](https://github.com/thomvaill/log4brains) for
the rules your tests and code already encode. Point it at a repository and it drafts the rule book;
your team's only job is to approve.

```sh
npx ruleprint init      # scan the repo, write ruleprint.json, tell you what's next
npx ruleprint serve     # browse the rule book at http://localhost:4141, hot reload
npx ruleprint build     # static site in ruleprint-site/, ready for GitHub Pages
```

## Status

Pre-alpha. **M0–M2** are done and **M3 (CLI + minimal UI)** is in progress: `ruleprint`
scans a repository with the tests collector (vitest/jest `describe`/`it` trees), assembles a
valid `ruleprint.json` and serves or builds a searchable web UI with filters by tag and
confidence and links to file and line on GitHub. Not published to npm yet: in this workspace use
`pnpm build && node packages/cli/dist/bin.js <command>`. Follow the milestones in
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Commands

| Command                                            | What it does                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `ruleprint init [dir]`                             | scans, writes `ruleprint.json`, prints the next steps            |
| `ruleprint scan [dir] [--out file] [--json]`       | the same scan for CI; `--json` prints a machine-readable summary |
| `ruleprint serve [dir] [--port 4141] [--no-watch]` | serves the UI; rescans and reloads the browser on every change   |
| `ruleprint build [dir] [--out ruleprint-site]`     | writes UI + `ruleprint.json` as a static site                    |

Exit codes: `0` ok, `2` error. Every command is headless and CI-friendly.

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
pnpm build         # dist for every package (tsc) and the UI (vite)
pnpm dev           # build, then serve examples/fixture-express-api on :4141
pnpm check:golden  # scan the fixture and compare with examples/golden
pnpm generate      # regenerate files derived from the schema (CI checks they are current)
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for conventions.

## License

[Apache-2.0](LICENSE)
