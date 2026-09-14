# @ruleprint/ui

## 0.1.0

### Minor Changes

- 7e23210: First usable slice: `ruleprint.json` spec v0.1 with `validate()`, the `Collector` contract, the
  tests collector on tree-sitter, and the CLI (`init`, `scan`, `serve`, `build`) with the minimal
  web UI.
- 26c09a0: Rules carry an optional `group` (top-level `describe`, enclosing function or front-matter
  `group`) and the UI lists them as collapsible groups. `ruleprint describe <id> <text>` and the
  editor in the served UI (`PUT /api/rules/<id>`) save a description as a declared rule.

### Patch Changes

- `ruleprint` ships a README for its npm page. `@ruleprint/ui` no longer installs `react` and
  `react-dom` at runtime: Vite already bundles them into `dist`, which is all the CLI serves.
