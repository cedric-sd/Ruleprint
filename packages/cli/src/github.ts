/** The handful of GitHub REST calls `ruleprint pr` needs, on the platform `fetch` (ADR-0008). */

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export interface GitHubClientOptions {
  /** `https://api.github.com` or `GITHUB_API_URL`. */
  readonly baseUrl: string;
  readonly token: string;
  /** `owner/name`. */
  readonly repo: string;
  readonly userAgent?: string;
  readonly fetch?: typeof fetch;
}

export interface IssueComment {
  readonly id: number;
  readonly body: string;
}

export interface PullRequestInfo {
  readonly number: number;
  readonly head: {
    readonly ref: string;
    readonly sha: string;
    readonly repo: { readonly full_name: string } | null;
  };
}

export type Permission = 'admin' | 'write' | 'read' | 'none' | (string & {});

export interface GitHubClient {
  listIssueComments(number: number): Promise<IssueComment[]>;
  createIssueComment(number: number, body: string): Promise<IssueComment>;
  updateIssueComment(commentId: number, body: string): Promise<IssueComment>;
  getPullRequest(number: number): Promise<PullRequestInfo>;
  getPermission(login: string): Promise<Permission>;
}

const NEXT_LINK = /<([^>]+)>;\s*rel="next"/;

export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const base = options.baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetch ?? fetch;
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${options.token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': options.userAgent ?? 'ruleprint',
  };

  async function request<T>(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<{ data: T; next?: string }> {
    const response = await doFetch(url, {
      method,
      headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok) {
      let message = text;
      try {
        const parsed = JSON.parse(text) as { message?: unknown };
        if (typeof parsed.message === 'string') message = parsed.message;
      } catch {
        // keep the raw body
      }
      const path = url.startsWith(base) ? url.slice(base.length) : url;
      throw new GitHubError(response.status, `${method} ${path} → ${response.status}: ${message}`);
    }
    const next = NEXT_LINK.exec(response.headers.get('link') ?? '')?.[1];
    return { data: (text === '' ? undefined : JSON.parse(text)) as T, ...(next && { next }) };
  }

  const repo = `${base}/repos/${options.repo}`;

  return {
    async listIssueComments(number) {
      const comments: IssueComment[] = [];
      let url: string | undefined = `${repo}/issues/${number}/comments?per_page=100`;
      while (url !== undefined) {
        const page: { data: IssueComment[]; next?: string } = await request<IssueComment[]>(
          'GET',
          url,
        );
        comments.push(...page.data.map((c) => ({ id: c.id, body: c.body })));
        url = page.next;
      }
      return comments;
    },
    async createIssueComment(number, body) {
      const { data } = await request<IssueComment>('POST', `${repo}/issues/${number}/comments`, {
        body,
      });
      return { id: data.id, body: data.body };
    },
    async updateIssueComment(commentId, body) {
      const { data } = await request<IssueComment>(
        'PATCH',
        `${repo}/issues/comments/${commentId}`,
        { body },
      );
      return { id: data.id, body: data.body };
    },
    async getPullRequest(number) {
      const { data } = await request<PullRequestInfo>('GET', `${repo}/pulls/${number}`);
      return {
        number: data.number,
        head: {
          ref: data.head.ref,
          sha: data.head.sha,
          repo: data.head.repo ? { full_name: data.head.repo.full_name } : null,
        },
      };
    },
    async getPermission(login) {
      const { data } = await request<{ permission: string }>(
        'GET',
        `${repo}/collaborators/${encodeURIComponent(login)}/permission`,
      );
      return data.permission;
    },
  };
}
