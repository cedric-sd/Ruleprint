import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { LOCK_FILE_NAME, parseLock, serializeLock, type LockFile } from '@ruleprint/core';

/** The lock at `<dir>/ruleprint.lock`, or `undefined` when there is none. Throws on a corrupt one. */
export function readLock(dir: string): LockFile | undefined {
  const path = join(dir, LOCK_FILE_NAME);
  if (!existsSync(path)) return undefined;
  return parseLock(readFileSync(path, 'utf8'));
}

export function writeLock(dir: string, lock: LockFile): void {
  writeFileSync(join(dir, LOCK_FILE_NAME), serializeLock(lock));
}
