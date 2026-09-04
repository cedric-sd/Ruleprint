# Contributing to RulePrint

Thanks for taking a look. RulePrint is early: right now the repository is a skeleton and the
roadmap in [`docs/ROADMAP.md`](docs/ROADMAP.md) is the best map of what is coming and when.

## Setup

- Node 20.19 or newer (CI runs on Node 20 and 22).
- pnpm 10. The exact version is pinned in `package.json` (`packageManager`), so
  `corepack enable` is enough.

```sh
pnpm install
pnpm test
```

## Commands

| Command             | What it does                                      |
| ------------------- | ------------------------------------------------- |
| `pnpm test`         | runs vitest once across all packages              |
| `pnpm test:watch`   | vitest in watch mode                              |
| `pnpm lint`         | ESLint (type-aware) on the whole repo             |
| `pnpm format`       | Prettier, writes changes                          |
| `pnpm format:check` | Prettier, fails on unformatted files (used in CI) |
| `pnpm typecheck`    | `tsc --noEmit` in every package                   |

CI runs lint, format check, typecheck and tests on every pull request.

## Ground rules

- **`packages/core` is pure.** No `fs`, `path`, `process`, no network. ESLint enforces this
  (`no-restricted-imports` / `no-restricted-globals` in `eslint.config.js`); the rule exists so the
  core stays trivially testable and portable.
- **Collectors are a contract, not a class.** Every collector implements the `Collector`
  interface and ships a snapshot test against a fixture in `examples/`.
- **Tests first.** Write the test before the implementation. No exceptions for collectors.
- **No new dependency without a justification in the PR.**
- **Schema changes need an ADR** in `docs/adr/`. The schema in `packages/spec` is the contract.
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, …). Release tooling will depend on
  it.

## Writing your first collector

The `Collector` interface lands with the first collector in M2 (`packages/collector-tests`). Once
it exists this section becomes a 30-line walkthrough; until then, the shape to expect is:

```ts
interface Collector {
  name: string;
  match(file: SourceFile): boolean;
  collect(file: SourceFile, ctx: CollectContext): RuleCandidate[];
}
```

## Pull requests

One milestone or one focused change per PR. Describe what changed and why, list any new
dependency with its justification, and make sure `pnpm lint && pnpm typecheck && pnpm test` is
green locally before opening it.
