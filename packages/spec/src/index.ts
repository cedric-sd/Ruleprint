export type * from './config.generated.js';
export { default as configSchema } from './ruleprint.config.schema.json' with { type: 'json' };
export { default as schema } from './ruleprint.schema.json' with { type: 'json' };
export type * from './types.generated.js';
export { SPEC_VERSION, validate, validateConfig } from './validate.js';
export type { ConfigValidationResult, ValidationIssue, ValidationResult } from './validate.js';
