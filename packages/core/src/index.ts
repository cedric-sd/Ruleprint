export const PACKAGE_NAME = '@ruleprint/core' as const;

export type { CollectContext, Collector, RuleCandidate, SourceFile } from './collector.js';
export { assembleDocument, type AssembleOptions } from './document.js';
export { fingerprintCandidate } from './fingerprint.js';
export { assignIds, fnv1a32, idForKey } from './ids.js';
export { collectFromFiles } from './pipeline.js';
