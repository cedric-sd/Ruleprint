# ruleprint

## 0.1.0

### Minor Changes

- ca3d244: Opt-in AST collector: `.ruleprint/config.json` (`ast.include`, `ast.exclude`, `ast.glossary`,
  validated by `validateConfig()`) turns on rules inferred from `if`/ternary/`switch` conditionals
  that carry a domain signal. Parser, literal and normalisation helpers move to
  `@ruleprint/tree-sitter-utils`, shared by the tests and AST collectors.
- befa5f8: Declared rules from `.ruleprint/rules/*.md` (front-matter `id`, `title`, `tags`), `@rule` comments
  linking code to rules, merge with precedence `declared > derived > inferred`, the `orphan` status
  for declared rules without evidence, and `ruleprint promote <id>`.
- 7e23210: First usable slice: `ruleprint.json` spec v0.1 with `validate()`, the `Collector` contract, the
  tests collector on tree-sitter, and the CLI (`init`, `scan`, `serve`, `build`) with the minimal
  web UI.
- 26c09a0: Rules carry an optional `group` (top-level `describe`, enclosing function or front-matter
  `group`) and the UI lists them as collapsible groups. `ruleprint describe <id> <text>` and the
  editor in the served UI (`PUT /api/rules/<id>`) save a description as a declared rule.
- 33fed49: Fingerprints are now hashes of the normalised test AST (formatting and local renames are not
  drift), `ruleprint.lock` remembers approved rules, `ruleprint check` exits 1 when rules were
  added, changed, renamed or removed without approval, and `ruleprint approve` records approvals.
- 12d54b9: `ruleprint pr` and the composite GitHub Action (`uses: cedric-sd/Ruleprint@v1`): one comment per
  pull request listing new, changed, renamed, removed and orphan rules with checkboxes; ticking one
  approves it as `github:<login>` and commits `ruleprint.lock` to the branch. Core gains
  `renderPrComment()` and `parseApprovals()`.

### Patch Changes

- `ruleprint` ships a README for its npm page. `@ruleprint/ui` no longer installs `react` and
  `react-dom` at runtime: Vite already bundles them into `dist`, which is all the CLI serves.
- Updated dependencies [ca3d244]
- Updated dependencies [befa5f8]
- Updated dependencies [7e23210]
- Updated dependencies [26c09a0]
- Updated dependencies [33fed49]
- Updated dependencies
- Updated dependencies [12d54b9]
  - @ruleprint/spec@0.1.0
  - @ruleprint/collector-ast@0.1.0
  - @ruleprint/collector-tests@0.1.0
  - @ruleprint/core@0.1.0
  - @ruleprint/collector-config@0.1.0
  - @ruleprint/collector-annotations@0.1.0
  - @ruleprint/ui@0.1.0
