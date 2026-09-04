/**
 * GENERATED FILE. DO NOT EDIT.
 * Source: packages/spec/src/ruleprint.schema.json
 * Regenerate with: pnpm --filter @ruleprint/spec generate
 */

/**
 * Stable rule identifier: RP- followed by at least four digits.
 */
export type RuleId = string;
/**
 * How much a rule can be trusted: declared by a human, derived from a test, or inferred from code.
 */
export type Confidence = 'declared' | 'derived' | 'inferred';
/**
 * What kind of artifact a source location points at.
 */
export type SourceKind = 'code' | 'test' | 'config' | 'annotation';
/**
 * Outcome of the last known execution of the tests backing a rule.
 */
export type RunStatus = 'passed' | 'failed' | 'unknown';
/**
 * SHA-256 of the normalised AST of the rule's origin, prefixed with the algorithm.
 */
export type Fingerprint = string;
/**
 * Review status of the rule relative to ruleprint.lock.
 */
export type RuleStatus = 'approved' | 'pending' | 'drifted' | 'orphan';

/**
 * A ruleprint.json document: the book of business rules generated for one commit of a project.
 */
export interface RulePrintDocument {
  /**
   * Version of this specification the document conforms to.
   */
  specVersion: '0.1';
  project: Project;
  /**
   * When the document was generated (RFC 3339 date-time).
   */
  generatedAt: string;
  /**
   * All rules known for this commit. Rule ids must be unique within the document.
   */
  rules: Rule[];
}
export interface Project {
  /**
   * Human-readable project name, usually the repository or package name.
   */
  name: string;
  /**
   * Git commit the document was generated from (7 to 40 hex chars).
   */
  commit?: string;
  /**
   * Web URL of the repository, used to link sources to files and lines (e.g. https://github.com/owner/repo).
   */
  repository?: string;
}
/**
 * One business rule.
 */
export interface Rule {
  id: RuleId;
  /**
   * One-line statement of the rule in business language.
   */
  title: string;
  /**
   * Longer explanation, conditions and exceptions.
   */
  description?: string;
  tags?: string[];
  origin: RuleOrigin;
  evidence?: RuleEvidence;
  fingerprint: Fingerprint;
  status: RuleStatus;
  /**
   * When the current fingerprint was approved (RFC 3339 date-time).
   */
  approvedAt?: string;
  /**
   * Who approved it, as '<provider>:<identity>', e.g. git:maria@empresa.com.
   */
  approvedBy?: string;
}
/**
 * Where the rule came from and how much it can be trusted.
 */
export interface RuleOrigin {
  /**
   * Name of the collector that produced the rule (built-ins: tests, config, annotations, ast).
   */
  collector: string;
  confidence: Confidence;
  /**
   * @minItems 1
   */
  sources: [RuleSource, ...RuleSource[]];
}
/**
 * A location in the repository that contributes to a rule.
 */
export interface RuleSource {
  /**
   * Path relative to the repository root, with forward slashes.
   */
  file: string;
  /**
   * 1-based line number.
   */
  line?: number;
  /**
   * Function, class or test name at the location, when known.
   */
  symbol?: string;
  kind?: SourceKind;
}
/**
 * Automated evidence backing the rule.
 */
export interface RuleEvidence {
  /**
   * Full names of the tests that exercise the rule.
   */
  tests?: string[];
  lastRunStatus?: RunStatus;
  /**
   * Number of source lines covered by the tests listed above.
   */
  coveredLines?: number;
}
