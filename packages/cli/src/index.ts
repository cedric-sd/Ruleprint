export const PACKAGE_NAME = 'ruleprint' as const;

export {
  approveProject,
  defaultApprover,
  type ApproveProjectOptions,
  type ApproveResult,
} from './approve.js';
export { buildSite, type BuildOptions, type BuildResult } from './build.js';
export { readLock, writeLock } from './lock-io.js';
export {
  promoteRule,
  renderDeclaration,
  slugify,
  type PromoteOptions,
  type PromoteResult,
} from './promote.js';
export { countApproved, describeChange, describeOrphan, summaryLine } from './report.js';
export { normalizeRepositoryUrl } from './git.js';
export {
  createGitHubClient,
  GitHubError,
  type GitHubClient,
  type GitHubClientOptions,
  type IssueComment,
  type PullRequestInfo,
} from './github.js';
export { decidePrAction, type PrAction } from './pr-event.js';
export { runPr, type PrOptions, type PrResult } from './pr.js';
export { collectorsFor, CONFIG_FILE, readConfig } from './config.js';
export { scanProject, serializeDocument, type ScanOptions, type ScanResult } from './scan.js';
export { createRuleBookServer, type RuleBookServer, type ServerOptions } from './server.js';
export { resolveUiDist } from './ui.js';
