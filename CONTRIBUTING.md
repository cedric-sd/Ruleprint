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

| Command             | What it does                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm test`         | runs vitest once across all packages                                                        |
| `pnpm test:watch`   | vitest in watch mode                                                                        |
| `pnpm lint`         | ESLint (type-aware) on the whole repo                                                       |
| `pnpm format`       | Prettier, writes changes                                                                    |
| `pnpm format:check` | Prettier, fails on unformatted files (used in CI)                                           |
| `pnpm typecheck`    | `tsc --noEmit` in every package                                                             |
| `pnpm generate`     | regenerates `packages/spec/src/types.generated.ts` from the schema; CI fails if it is stale |

CI runs the generated-file check, lint, format check, typecheck and tests on every pull request.

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

A collector is a plain object that satisfies the `Collector` interface from `@ruleprint/core`
(`packages/core/src/collector.ts`). It receives files as `{ path, content }`, never touches the
filesystem itself, and returns `RuleCandidate[]`: everything a rule needs except what only core
decides (`id`, `fingerprint`, `status`). Here is a complete one that turns `// RULE: ...` comments
into rules:

```ts
import type { Collector, RuleCandidate, SourceFile, CollectContext } from '@ruleprint/core';

export const ruleCommentsCollector: Collector = {
  name: 'rule-comments',

  match(path) {
    return /\.[jt]sx?$/.test(path);
  },

  collect(file: SourceFile, _ctx: CollectContext): RuleCandidate[] {
    const candidates: RuleCandidate[] = [];
    file.content.split('\n').forEach((text, index) => {
      const match = /\/\/\s*RULE:\s*(.+)$/.exec(text);
      if (!match?.[1]) return;
      candidates.push({
        title: match[1].trim(),
        origin: {
          collector: 'rule-comments',
          confidence: 'inferred',
          sources: [{ file: file.path, line: index + 1, kind: 'annotation' }],
        },
      });
    });
    return candidates;
  },
};
```

Rules of the road:

- `match` is a cheap check on the path alone; `collect` runs only for files that match.
- `collect` may be `async` (the tests collector loads a WASM parser on first use).
- Never throw for bad input: report through `ctx.warn(message)` and return what you could get.
- Ship a snapshot test against a fixture in `examples/` before the implementation. See
  `packages/collector-tests/src/collector.test.ts` for the pattern.

## Pull requests

One milestone or one focused change per PR. Describe what changed and why, list any new
dependency with its justification, and make sure `pnpm lint && pnpm typecheck && pnpm test` is
green locally before opening it.
