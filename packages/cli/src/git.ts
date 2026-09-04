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

/** Browsable URL of the `origin` remote, or `undefined`. */
export function repositoryUrl(dir: string): string | undefined {
  const raw = git(dir, ['remote', 'get-url', 'origin']);
  return raw ? normalizeRepositoryUrl(raw) : undefined;
}
