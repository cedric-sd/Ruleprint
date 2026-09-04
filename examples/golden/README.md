# golden

Hand-written `ruleprint.json` documents that are valid against `packages/spec/ruleprint.schema.json`.
They serve two purposes: acceptance fixtures for the validator (M1) and, from M2 on, expected
outputs for collector snapshot tests.

| File | What it exercises |
| --- | --- |
| `minimal.ruleprint.json` | the smallest useful document: one `derived` rule with only required fields |
| `checkout-service.ruleprint.json` | the example from `docs/SPEC.md`: `declared`, `derived` and `inferred` rules side by side |
| `legacy-billing.ruleprint.json` | `drifted` and `orphan` statuses, failed/unknown test runs, multiple sources per rule |
