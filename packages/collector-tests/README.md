# @ruleprint/collector-tests

Derives `derived` rules from vitest/jest test files: every `it`/`test` becomes one rule whose
title is the chain of enclosing `describe` titles plus the test title, joined by `>`.

```ts
import { testsCollector } from '@ruleprint/collector-tests';

const candidates = await testsCollector.collect(
  { path: 'test/shipping.spec.ts', content },
  { warn: console.warn },
);
```

## What it recognises

| Shape                                                           | Result                                   |
| --------------------------------------------------------------- | ---------------------------------------- |
| `describe` / `suite` / `context`                                | a level in the title chain               |
| `it` / `test`                                                   | one rule                                 |
| `.skip`, `.only`, `.concurrent`, `.sequential`, `.fails`        | same as the plain call                   |
| `.each(...)('title %s')`, `.for`, `.runIf(...)`, `.skipIf(...)` | one rule, title kept raw (`%s`, `$name`) |
| `.todo('...')`                                                  | ignored: there is no body to derive from |
| template-literal titles                                         | kept raw, e.g. `exactly ${LIMIT} items`  |
| empty or non-literal titles                                     | ignored                                  |

Files are matched by name: `*.test.*`, `*.spec.*` and anything under `__tests__/`, with
`.js`, `.jsx`, `.ts`, `.tsx` and their `.cjs`/`.mjs` variants. `.tsx`/`.jsx` files use the TSX
grammar; everything else uses the TypeScript grammar.

## Limitations

- Detection is by identifier name. `import { it as spec }` is not followed (see ADR-0003).
- On a syntax error the file is still processed and `ctx.warn` is called once, but tree-sitter's
  recovery may drop the enclosing `describe`, leaving only the leaf title.
- `lastRunStatus` is not filled in; wiring the vitest reporter is a later milestone.

## Dogfooding

```sh
pnpm --filter @ruleprint/collector-tests dogfood <dir> [--json]
```

Walks `<dir>` (skipping `node_modules`, `dist`, `coverage`, `.git`) and prints every candidate,
grouped by file. `--json` prints the raw `RuleCandidate[]`.
