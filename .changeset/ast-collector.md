---
'@ruleprint/spec': minor
'@ruleprint/collector-ast': minor
'@ruleprint/tree-sitter-utils': minor
'@ruleprint/collector-tests': patch
'ruleprint': minor
---

Opt-in AST collector: `.ruleprint/config.json` (`ast.include`, `ast.exclude`, `ast.glossary`,
validated by `validateConfig()`) turns on rules inferred from `if`/ternary/`switch` conditionals
that carry a domain signal. Parser, literal and normalisation helpers move to
`@ruleprint/tree-sitter-utils`, shared by the tests and AST collectors.
