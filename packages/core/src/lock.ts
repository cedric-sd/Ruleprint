/** One approved rule, as remembered by `ruleprint.lock` (ADR-0005). */
export interface LockEntry {
  readonly title: string;
  readonly collector: string;
  readonly fingerprint: string;
  /** RFC 3339 timestamp of the approval. */
  readonly approvedAt: string;
  /** Who approved, e.g. `git:maria@empresa.com`. */
  readonly approvedBy?: string;
}

export interface LockFile {
  readonly lockVersion: 1;
  /** Approved rules by id. Pending and drifted rules are never written here. */
  readonly rules: Readonly<Record<string, LockEntry>>;
}

export const LOCK_VERSION = 1 as const;
export const LOCK_FILE_NAME = 'ruleprint.lock';

const ID_PATTERN = /^RP-[0-9]{4,}$/;
const FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function emptyLock(): LockFile {
  return { lockVersion: LOCK_VERSION, rules: {} };
}

function fail(message: string): never {
  throw new Error(`${LOCK_FILE_NAME}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEntry(id: string, value: unknown): LockEntry {
  if (!isRecord(value)) fail(`entry ${id} must be an object`);
  const { title, collector, fingerprint, approvedAt, approvedBy } = value;
  if (typeof title !== 'string' || title === '') fail(`entry ${id} needs a title`);
  if (typeof collector !== 'string' || collector === '') fail(`entry ${id} needs a collector`);
  if (typeof fingerprint !== 'string' || !FINGERPRINT_PATTERN.test(fingerprint)) {
    fail(`entry ${id} has an invalid fingerprint`);
  }
  if (typeof approvedAt !== 'string' || approvedAt === '') fail(`entry ${id} needs approvedAt`);
  if (approvedBy !== undefined && typeof approvedBy !== 'string') {
    fail(`entry ${id} has an invalid approvedBy`);
  }
  const entry: LockEntry = { title, collector, fingerprint, approvedAt };
  return approvedBy === undefined ? entry : { ...entry, approvedBy };
}

/** Parses and validates the text of a `ruleprint.lock`; throws with a message naming the file. */
export function parseLock(text: string): LockFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('not valid JSON');
  }
  if (!isRecord(parsed)) fail('must be a JSON object');
  if (parsed['lockVersion'] !== LOCK_VERSION) {
    fail(`unsupported lockVersion ${String(parsed['lockVersion'])} (expected ${LOCK_VERSION})`);
  }
  const rules = parsed['rules'];
  if (!isRecord(rules)) fail('rules must be an object');
  const entries: Record<string, LockEntry> = {};
  for (const [id, value] of Object.entries(rules)) {
    if (!ID_PATTERN.test(id)) fail(`invalid rule id ${id}`);
    entries[id] = parseEntry(id, value);
  }
  return { lockVersion: LOCK_VERSION, rules: entries };
}

/** Stable text form: ids sorted, two-space indent, trailing newline. Diffs stay readable. */
export function serializeLock(lock: LockFile): string {
  const rules: Record<string, LockEntry> = {};
  for (const id of Object.keys(lock.rules).sort()) {
    const entry = lock.rules[id];
    if (entry) rules[id] = entry;
  }
  return `${JSON.stringify({ lockVersion: lock.lockVersion, rules }, null, 2)}\n`;
}
