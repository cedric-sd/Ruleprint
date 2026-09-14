---
'@ruleprint/spec': minor
'@ruleprint/core': minor
'@ruleprint/collector-tests': minor
'@ruleprint/collector-config': minor
'@ruleprint/collector-ast': minor
'@ruleprint/ui': minor
'ruleprint': minor
---

Rules carry an optional `group` (top-level `describe`, enclosing function or front-matter
`group`) and the UI lists them as collapsible groups. `ruleprint describe <id> <text>` and the
editor in the served UI (`PUT /api/rules/<id>`) save a description as a declared rule.
