---
'@ruleprint/core': minor
'@ruleprint/collector-config': minor
'@ruleprint/collector-annotations': minor
'ruleprint': minor
---

Declared rules from `.ruleprint/rules/*.md` (front-matter `id`, `title`, `tags`), `@rule` comments
linking code to rules, merge with precedence `declared > derived > inferred`, the `orphan` status
for declared rules without evidence, and `ruleprint promote <id>`.
