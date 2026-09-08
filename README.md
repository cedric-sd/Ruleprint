# RulePrint

**RulePrint generates a browsable book of business rules from your repository, without asking
anyone to write documentation.**

Think Swagger for business rules, or [log4brains](https://github.com/thomvaill/log4brains) for
the rules your tests and code already encode. Point it at a repository and it drafts the rule book;
your team's only job is to approve.

```sh
npx ruleprint init           # scan the repo, write ruleprint.json, tell you what's next
npx ruleprint serve          # browse the rule book at http://localhost:4141, hot reload
npx ruleprint approve --all  # say "yes" to what you saw: writes ruleprint.lock
npx ruleprint check          # in CI: exit 1 when a rule changed without approval
npx ruleprint promote RP-…   # make a rule official: writes .ruleprint/rules/<slug>.md
npx ruleprint build          # static site in ruleprint-site/, ready for GitHub Pages
```

## Status

Pre-alpha. **M0–M5** are done and **M6 (AST collector)** is in progress: `ruleprint` scans a
repository with three collectors (vitest/jest `describe`/`it` trees, `.ruleprint/rules/*.md`
declarations, `@rule` comments) plus an opt-in, experimental fourth one that infers rules from
the code's conditionals (see below), merges them with precedence
`declared > derived > inferred`, assembles a valid `ruleprint.json`, serves or builds a searchable
web UI, and remembers what was approved in `ruleprint.lock` so `check` fails when a rule changes
without a "yes". Fingerprints are hashes of the normalised test AST: reformatting or renaming a
local variable is not drift, changing a condition is. Not published to npm yet: in this workspace
use `pnpm build && node packages/cli/dist/bin.js <command>`. Follow the milestones in
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Commands

| Command                                               | What it does                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ruleprint init [dir]`                                | scans, writes `ruleprint.json`, prints the next steps                                                        |
| `ruleprint scan [dir] [--out file] [--json]`          | the same scan for CI; `--json` prints a machine-readable summary                                             |
| `ruleprint serve [dir] [--port 4141] [--no-watch]`    | serves the UI; rescans and reloads the browser on every change                                               |
| `ruleprint build [dir] [--out ruleprint-site]`        | writes UI + `ruleprint.json` as a static site                                                                |
| `ruleprint check [dir] [--json]`                      | compares the scan with `ruleprint.lock`; exit `1` on added, changed, renamed or removed rules; lists orphans |
| `ruleprint approve [dir] [ids...] [--all] [--by who]` | approves changes (interactive in a terminal), writes `ruleprint.lock`, refreshes `ruleprint.json`            |
| `ruleprint promote <id> [-C dir]`                     | writes `.ruleprint/rules/<slug>.md` so the rule becomes `declared` on the next scan                          |

Exit codes: `0` ok, `1` (`check` only) changes waiting for approval, `2` error. Every command is
headless and CI-friendly.

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

### Experimental: rules inferred from code

The AST collector reads `if`/`else if`, ternaries and `switch` cases inside named functions and
keeps only the ones that carry a domain signal: a comparison with a meaningful literal, a
`SCREAMING_CASE` constant, an enum member, or a glossary term in a predicate-like name. Null
checks, emptiness guards, `typeof`, environment checks and loop headers are dropped. It is off
until you create `.ruleprint/config.json`:

```json
{
  "ast": {
    "include": ["src/domain/**"],
    "exclude": ["src/domain/legacy/**"],
    "glossary": ["freight", "coupon", "refund"]
  }
}
```

The rules come out as `inferred`, titled like
`calcFreight: when subtotal >= FREE_SHIPPING_THRESHOLD and isSoutheast(address), returns 0`, and
tagged with the glossary terms they match. Start with one domain directory and a glossary of 10
to 20 terms; the glossary is the precision lever. The collector stays experimental until the
noise measured on three open-source repositories (`docs/noise/`) is below 30% (ADR-0007).

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
| `@ruleprint/collector-ast`         | tree-sitter + domain heuristics → rules (opt-in)  |
| `@ruleprint/tree-sitter-utils`     | shared WASM parser, literals and AST normaliser   |

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
