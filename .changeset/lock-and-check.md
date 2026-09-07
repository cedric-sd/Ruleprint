---
'@ruleprint/core': minor
'@ruleprint/collector-tests': minor
'ruleprint': minor
---

Fingerprints are now hashes of the normalised test AST (formatting and local renames are not
drift), `ruleprint.lock` remembers approved rules, `ruleprint check` exits 1 when rules were
added, changed, renamed or removed without approval, and `ruleprint approve` records approvals.
