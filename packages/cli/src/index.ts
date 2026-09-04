export const PACKAGE_NAME = 'ruleprint' as const;

export {
  approveProject,
  defaultApprover,
  type ApproveProjectOptions,
  type ApproveResult,
} from './approve.js';
export { buildSite, type BuildOptions, type BuildResult } from './build.js';
export { readLock, writeLock } from './lock-io.js';
export { countApproved, describeChange, summaryLine } from './report.js';
export { normalizeRepositoryUrl } from './git.js';
export {
  DEFAULT_COLLECTORS,
  scanProject,
  serializeDocument,
  type ScanOptions,
  type ScanResult,
} from './scan.js';
export { createRuleBookServer, type RuleBookServer, type ServerOptions } from './server.js';
export { resolveUiDist } from './ui.js';
