# @ruleprint/collector-ast

## 0.1.0

### Minor Changes

- ca3d244: Opt-in AST collector: `.ruleprint/config.json` (`ast.include`, `ast.exclude`, `ast.glossary`,
  validated by `validateConfig()`) turns on rules inferred from `if`/ternary/`switch` conditionals
  that carry a domain signal. Parser, literal and normalisation helpers move to
  `@ruleprint/tree-sitter-utils`, shared by the tests and AST collectors.
- 26c09a0: Rules carry an optional `group` (top-level `describe`, enclosing function or front-matter
  `group`) and the UI lists them as collapsible groups. `ruleprint describe <id> <text>` and the
  editor in the served UI (`PUT /api/rules/<id>`) save a description as a declared rule.

### Patch Changes

- Updated dependencies [ca3d244]
- Updated dependencies [befa5f8]
- Updated dependencies [7e23210]
- Updated dependencies [26c09a0]
- Updated dependencies [33fed49]
- Updated dependencies [12d54b9]
  - @ruleprint/spec@0.1.0
  - @ruleprint/tree-sitter-utils@0.1.0
  - @ruleprint/core@0.1.0
