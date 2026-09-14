# @ruleprint/collector-config

## 0.1.0

### Minor Changes

- befa5f8: Declared rules from `.ruleprint/rules/*.md` (front-matter `id`, `title`, `tags`), `@rule` comments
  linking code to rules, merge with precedence `declared > derived > inferred`, the `orphan` status
  for declared rules without evidence, and `ruleprint promote <id>`.
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
  - @ruleprint/core@0.1.0
