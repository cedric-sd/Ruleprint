import { parseApprovals, PR_COMMENT_MARKER } from '@ruleprint/core';

/** What `ruleprint pr` does with a GitHub event (ADR-0008). */
export type PrAction =
  | {
      readonly kind: 'report';
      readonly number: number;
      readonly headSha: string;
      readonly headRef: string;
      /** The head lives in another repository: the token cannot comment or push. */
      readonly fork: boolean;
    }
  | {
      readonly kind: 'approve';
      readonly number: number;
      readonly commentId: number;
      readonly all: boolean;
      readonly ids: readonly string[];
      /** Who ticked the box. */
      readonly login: string;
    }
  | { readonly kind: 'skip'; readonly reason: string };

const REPORT_ACTIONS = new Set(['opened', 'synchronize', 'reopened', 'ready_for_review']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pullRequestAction(payload: Record<string, unknown>): PrAction {
  const action = typeof payload['action'] === 'string' ? payload['action'] : '';
  if (!REPORT_ACTIONS.has(action))
    return { kind: 'skip', reason: `pull_request ${action} is not handled` };
  const pull = payload['pull_request'];
  const repository = payload['repository'];
  if (!isRecord(pull) || !isRecord(pull['head']) || !isRecord(repository)) {
    return { kind: 'skip', reason: 'malformed pull_request payload' };
  }
  const head = pull['head'];
  const number = typeof pull['number'] === 'number' ? pull['number'] : payload['number'];
  const headSha = head['sha'];
  const headRef = head['ref'];
  if (typeof number !== 'number' || typeof headSha !== 'string' || typeof headRef !== 'string') {
    return { kind: 'skip', reason: 'malformed pull_request payload' };
  }
  const headRepo = isRecord(head['repo']) ? head['repo']['full_name'] : undefined;
  const fork = typeof headRepo !== 'string' || headRepo !== repository['full_name'];
  return { kind: 'report', number, headSha, headRef, fork };
}

function issueCommentAction(payload: Record<string, unknown>): PrAction {
  if (payload['action'] !== 'edited') {
    return { kind: 'skip', reason: `issue_comment ${String(payload['action'])} is not handled` };
  }
  const issue = payload['issue'];
  const comment = payload['comment'];
  const sender = payload['sender'];
  if (!isRecord(issue) || !isRecord(comment) || !isRecord(sender)) {
    return { kind: 'skip', reason: 'malformed issue_comment payload' };
  }
  if (!isRecord(issue['pull_request'])) return { kind: 'skip', reason: 'comment on an issue' };
  const body = comment['body'];
  const commentId = comment['id'];
  const number = issue['number'];
  const login = sender['login'];
  if (
    typeof body !== 'string' ||
    typeof commentId !== 'number' ||
    typeof number !== 'number' ||
    typeof login !== 'string'
  ) {
    return { kind: 'skip', reason: 'malformed issue_comment payload' };
  }
  if (!body.includes(PR_COMMENT_MARKER))
    return { kind: 'skip', reason: 'not the ruleprint comment' };
  if (sender['type'] === 'Bot' || login.endsWith('[bot]')) {
    return { kind: 'skip', reason: `edited by ${login}` };
  }
  const approvals = parseApprovals(body);
  if (!approvals.all && approvals.ids.length === 0)
    return { kind: 'skip', reason: 'nothing ticked' };
  return { kind: 'approve', number, commentId, all: approvals.all, ids: approvals.ids, login };
}

/** Pure: reads a webhook payload and says whether to report, approve or do nothing. */
export function decidePrAction(eventName: string, payload: unknown): PrAction {
  if (!isRecord(payload)) return { kind: 'skip', reason: 'payload is not an object' };
  switch (eventName) {
    case 'pull_request':
      return pullRequestAction(payload);
    case 'issue_comment':
      return issueCommentAction(payload);
    default:
      return { kind: 'skip', reason: `event ${eventName} is not handled` };
  }
}
