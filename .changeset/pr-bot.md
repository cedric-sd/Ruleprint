---
'@ruleprint/core': minor
'ruleprint': minor
---

`ruleprint pr` and the composite GitHub Action (`uses: cedric-sd/Ruleprint@v1`): one comment per
pull request listing new, changed, renamed, removed and orphan rules with checkboxes; ticking one
approves it as `github:<login>` and commits `ruleprint.lock` to the branch. Core gains
`renderPrComment()` and `parseApprovals()`.
