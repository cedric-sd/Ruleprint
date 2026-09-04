import AjvModule, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormatsModule from 'ajv-formats';

import schema from '../ruleprint.schema.json' with { type: 'json' };
import type { RulePrintDocument } from './types.generated.js';

/** Version of the specification this package validates against. */
export const SPEC_VERSION = schema.properties.specVersion.const;

export interface ValidationIssue {
  /** JSON pointer to the offending value (or to the missing/unknown property). */
  path: string;
  /** JSON Schema keyword that failed, or a RulePrint-specific keyword such as `uniqueRuleId`. */
  keyword: string;
  /** Human-readable explanation. */
  message: string;
}

export type ValidationResult =
  { valid: true; document: RulePrintDocument } | { valid: false; issues: ValidationIssue[] };

// ajv and ajv-formats ship CommonJS with `exports.default`; under NodeNext the default import
// is the module object, so the class and the plugin live on `.default`.
const Ajv = AjvModule.default;
const addFormats = addFormatsModule.default;

let compiled: ValidateFunction<RulePrintDocument> | undefined;

function getValidator(): ValidateFunction<RulePrintDocument> {
  if (compiled) {
    return compiled;
  }
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  const validator = ajv.compile<RulePrintDocument>(schema);
  compiled = validator;
  return validator;
}

function readString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

function toIssue(error: ErrorObject): ValidationIssue {
  const params = error.params as Record<string, unknown>;
  let path = error.instancePath;
  let message = error.message ?? 'is invalid';

  if (error.keyword === 'required') {
    path += `/${readString(params, 'missingProperty') ?? ''}`;
  } else if (error.keyword === 'additionalProperties') {
    path += `/${readString(params, 'additionalProperty') ?? ''}`;
    message = 'is not a known property';
  } else if (error.keyword === 'enum' && Array.isArray(params['allowedValues'])) {
    message += ` (${params['allowedValues'].map(String).join(', ')})`;
  }

  return { path: path || '/', keyword: error.keyword, message };
}

function findDuplicateIds(document: RulePrintDocument): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  document.rules.forEach((rule, index) => {
    if (seen.has(rule.id)) {
      issues.push({
        path: `/rules/${index}/id`,
        keyword: 'uniqueRuleId',
        message: `rule id ${rule.id} is used more than once`,
      });
    }
    seen.add(rule.id);
  });
  return issues;
}

/**
 * Validates an arbitrary value against the RulePrint schema.
 *
 * Never throws: any input, including `null` or a primitive, yields a result. Beyond the JSON
 * Schema, rule ids must be unique within the document.
 */
export function validate(input: unknown): ValidationResult {
  const validator = getValidator();
  if (!validator(input)) {
    return { valid: false, issues: (validator.errors ?? []).map(toIssue) };
  }

  const duplicates = findDuplicateIds(input);
  if (duplicates.length > 0) {
    return { valid: false, issues: duplicates };
  }

  return { valid: true, document: input };
}
