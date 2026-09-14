# @ruleprint/spec

## 0.1.0

### Minor Changes

- ca3d244: Opt-in AST collector: `.ruleprint/config.json` (`ast.include`, `ast.exclude`, `ast.glossary`,
  validated by `validateConfig()`) turns on rules inferred from `if`/ternary/`switch` conditionals
  that carry a domain signal. Parser, literal and normalisation helpers move to
  `@ruleprint/tree-sitter-utils`, shared by the tests and AST collectors.
- 7e23210: First usable slice: `ruleprint.json` spec v0.1 with `validate()`, the `Collector` contract, the
  tests collector on tree-sitter, and the CLI (`init`, `scan`, `serve`, `build`) with the minimal
  web UI.
- 26c09a0: Rules carry an optional `group` (top-level `describe`, enclosing function or front-matter
  `group`) and the UI lists them as collapsible groups. `ruleprint describe <id> <text>` and the
  editor in the served UI (`PUT /api/rules/<id>`) save a description as a declared rule.
