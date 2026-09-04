import type { Confidence, RuleEvidence, RuleSource } from '@ruleprint/spec';

/**
 * A file handed to collectors. Core never touches the filesystem: whoever drives the pipeline
 * (CLI, tests) reads the file and passes its content in.
 */
export interface SourceFile {
  /** Path relative to the repository root, with forward slashes. */
  readonly path: string;
  readonly content: string;
}

/**
 * A rule as a collector sees it: everything the spec needs except what only core can decide
 * (`id`, `fingerprint`, `status`, approval metadata).
 */
export interface RuleCandidate {
  readonly title: string;
  readonly description?: string;
  /**
   * Normalised representation of the origin (e.g. the S-expression of a test body with
   * formatting and local names abstracted away). It is the fingerprint material; collectors that
   * cannot provide one get a fingerprint based on the title and sources instead (ADR-0005).
   */
  readonly normalized?: string;
  readonly tags?: readonly string[];
  readonly origin: {
    readonly collector: string;
    readonly confidence: Confidence;
    readonly sources: readonly [RuleSource, ...RuleSource[]];
  };
  readonly evidence?: RuleEvidence;
}

/** What a collector can ask of its host while collecting. */
export interface CollectContext {
  /** Report something worth showing the user without aborting the scan (e.g. a file that could not be parsed). */
  warn(message: string): void;
}

/**
 * The collector contract. A collector is a plain object: no base class, no registration.
 *
 * `collect` may be asynchronous because some collectors load a parser lazily on first use.
 */
export interface Collector {
  /** Stable name, also written to `origin.collector` of every candidate. */
  readonly name: string;
  /** Cheap check on the path alone; `collect` is only called for files that match. */
  match(path: string): boolean;
  collect(file: SourceFile, ctx: CollectContext): RuleCandidate[] | Promise<RuleCandidate[]>;
}
