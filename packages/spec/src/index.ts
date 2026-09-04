export { default as schema } from './ruleprint.schema.json' with { type: 'json' };
export type * from './types.generated.js';
export { SPEC_VERSION, validate } from './validate.js';
export type { ValidationIssue, ValidationResult } from './validate.js';
