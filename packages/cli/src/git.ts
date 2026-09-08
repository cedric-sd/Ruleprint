import { spawnSync } from 'node:child_process';

function git(dir: string, args: string[]): string | undefined {
  const result = spawnSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) return undefined;
  const out = result.stdout.trim();
  return out === '' ? undefined : out;
}

/** Full SHA of HEAD, or `undefined` outside a git work tree. */
export function currentCommit(dir: string): string | undefined {
  const sha = git(dir, ['rev-parse', 'HEAD']);
  return sha && /^[0-9a-f]{40}$/.test(sha) ? sha : undefined;
}

/**
 * Turns whatever `git remote get-url origin` returns into a browsable https URL, or
 * `undefined` when it is not a network remote.
 */
export function normalizeRepositoryUrl(raw: string): string | undefined {
  let url = raw.trim();
  if (url === '') return undefined;

  const scp = /^(?:[\w.-]+@)?([\w.-]+):(?!\/\/)([^/].*)$/.exec(url);
  if (scp?.[1] && scp[2]) {
    url = `https://${scp[1]}/${scp[2]}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (!['http:', 'https:', 'ssh:', 'git:', 'git+ssh:', 'git+https:'].includes(parsed.protocol)) {
    return undefined;
  }
  if (parsed.hostname === '') return undefined;

  const path = parsed.pathname.replace(/\/+$/, '').replace(/\.git$/, '');
  if (path === '' || path === '/') return undefined;
  return `https://${parsed.hostname}${path}`;
}

/**
 * Path of `dir` relative to the root of its git work tree, with a trailing slash, or '' when
 * `dir` is the root or not inside a repository. Source paths are prefixed with it so they stay
 * relative to the repository root, as the spec requires.
 */
export function pathPrefixInRepo(dir: string): string {
  return git(dir, ['rev-parse', '--show-prefix']) ?? '';
}

/** Browsable URL of the `origin` remote, or `undefined`. */
export function repositoryUrl(dir: string): string | undefined {
  const raw = git(dir, ['remote', 'get-url', 'origin']);
  return raw ? normalizeRepositoryUrl(raw) : undefined;
}

export interface GitIdentity {
  readonly name: string;
  readonly email: string;
}

/** Runs git and throws with its stderr on failure. */
export function gitOrThrow(dir: string, args: string[], identity?: GitIdentity): string {
  const identityArgs = identity
    ? ['-c', `user.name=${identity.name}`, '-c', `user.email=${identity.email}`]
    : [];
  const result = spawnSync('git', [...identityArgs, ...args], {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw new Error(`git ${args.join(' ')} failed: ${result.error.message}`, {
      cause: result.error,
    });
  }
  if (result.status !== 0) {
    const detail = (result.stderr ?? '').trim() || (result.stdout ?? '').trim();
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout.trim();
}

/** Whether `file` (relative to `dir`) is tracked by git. */
export function isTracked(dir: string, file: string): boolean {
  return git(dir, ['ls-files', '--error-unmatch', '--', file]) !== undefined;
}

/** Name of the current branch, or `undefined` when detached or outside a repository. */
export function currentBranch(dir: string): string | undefined {
  const name = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return name === 'HEAD' ? undefined : name;
}

/**
 * Fetches `ref` from `origin` and checks it out as a local branch of the same name. Not shallow:
 * `--depth` over a local transport trips a git bug, and the branch is fetched once per approval.
 */
export function fetchAndCheckout(dir: string, ref: string): void {
  gitOrThrow(dir, ['fetch', '--no-tags', 'origin', ref]);
  gitOrThrow(dir, ['checkout', '-q', '-B', ref, 'FETCH_HEAD']);
}

/**
 * Stages `paths` and commits them as `identity`. Returns the new commit's SHA, or `undefined`
 * when the paths carried no change.
 */
export function commitPaths(
  dir: string,
  paths: readonly string[],
  message: string,
  identity: GitIdentity,
): string | undefined {
  gitOrThrow(dir, ['add', '--', ...paths]);
  const staged = spawnSync('git', ['diff', '--cached', '--quiet', '--', ...paths], {
    cwd: dir,
    stdio: 'ignore',
  });
  if (staged.status === 0) return undefined;
  // A bot commit is never signed with the runner's key, whatever the local git config says.
  gitOrThrow(dir, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message], identity);
  return gitOrThrow(dir, ['rev-parse', 'HEAD']);
}

/** Pushes HEAD to `refs/heads/<ref>` on `origin`. */
export function pushBranch(dir: string, ref: string): void {
  gitOrThrow(dir, ['push', '-q', 'origin', `HEAD:refs/heads/${ref}`]);
}
