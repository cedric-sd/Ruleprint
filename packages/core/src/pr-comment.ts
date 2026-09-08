import type { Change, ChangeKind } from './reconcile.js';

/** First line of the bot comment; how `ruleprint pr` finds its own comment again (ADR-0008). */
export const PR_COMMENT_MARKER = '<!-- ruleprint -->';
export const PR_COMMENT_DEFAULT_LIMIT = 50;

export interface PrCommentSource {
  readonly file: string;
  readonly line?: number;
}

export interface PrCommentInput {
  readonly changes: readonly Change[];
  readonly orphans: readonly { readonly id: string; readonly title: string }[];
  readonly approved: number;
  /** Rule id → primary source, for `file:line` locations. */
  readonly sources?: Readonly<Record<string, PrCommentSource>>;
  /** `https://github.com/o/r/blob/<sha>`; without it locations are plain `file:line`. */
  readonly blobUrl?: string;
  /** False on fork pull requests: no checkboxes, a hint instead. */
  readonly canApprove: boolean;
  /** Scanned subdirectory, shown when it is not the repository root. */
  readonly directory?: string;
  /** Transient message (approval result, refusal), rendered as a blockquote. */
  readonly note?: string;
  /** Maximum listed changes; the rest is summarised. */
  readonly limit?: number;
  /** CLI version and scanned commit, for the footer. */
  readonly version?: string;
  readonly commit?: string;
}

export interface PrApprovals {
  /** The "Approve all" box is ticked. */
  readonly all: boolean;
  /** Ticked rule ids, in document order, without duplicates. */
  readonly ids: readonly string[];
}

const CHECKBOX_LINE = /^\s*[-*]\s+\[([ xX])\]\s+\*\*(RP-\d{4,})\*\*/;
const APPROVE_ALL_LINE = /^\s*[-*]\s+\[([ xX])\]\s+\*\*Approve all\*\*/;
const FENCE = /^\s*(```|~~~)/;

const KIND_ORDER: readonly ChangeKind[] = ['added', 'changed', 'renamed', 'removed'];
const HEADINGS: Record<ChangeKind, string> = {
  added: 'New rules',
  changed: 'Changed rules',
  renamed: 'Renamed rules',
  removed: 'Removed rules',
};

function plural(count: number, noun: string, verb?: [string, string]): string {
  const word = count === 1 ? noun : `${noun}s`;
  if (!verb) return `${count} ${word}`;
  return `${count} ${word} ${count === 1 ? verb[0] : verb[1]}`;
}

function location(id: string, input: PrCommentInput): string {
  const source = input.sources?.[id];
  if (!source) return '';
  const label = source.line === undefined ? source.file : `${source.file}:${source.line}`;
  if (input.blobUrl === undefined) return ` (\`${label}\`)`;
  const anchor = source.line === undefined ? '' : `#L${source.line}`;
  return ` ([${label}](${input.blobUrl}/${source.file}${anchor}))`;
}

function itemTitle(change: Change): string {
  return change.kind === 'renamed' && change.previousTitle !== undefined
    ? `~~${change.previousTitle}~~ → ${change.title}`
    : change.title;
}

function bullet(id: string, text: string, input: PrCommentInput, box: boolean): string {
  const prefix = box && input.canApprove ? '- [ ] ' : '- ';
  return `${prefix}**${id}** ${text}${location(id, input)}`;
}

/** The markdown body of the pull request comment (ADR-0008). Deterministic, ends with a newline. */
export function renderPrComment(input: PrCommentInput): string {
  const { changes, orphans, approved } = input;
  const lines: string[] = [PR_COMMENT_MARKER, '', '## RulePrint', ''];

  if (changes.length === 0) {
    lines.push(`✔ All ${plural(approved, 'rule')} approved. Nothing to review.`);
  } else {
    const header = [`**${plural(changes.length, 'change', ['needs', 'need'])} approval**`];
    header.push(`${approved} approved`);
    if (orphans.length > 0) header.push(plural(orphans.length, 'orphan'));
    if (input.directory !== undefined && input.directory !== '' && input.directory !== '.') {
      header.push(`in \`${input.directory}\``);
    }
    lines.push(header.join(' · '));
  }
  if (input.note !== undefined && input.note !== '') lines.push('', `> ${input.note}`);

  if (changes.length > 0) {
    lines.push('');
    if (input.canApprove) {
      lines.push(
        'Tick a box to approve; the bot commits `ruleprint.lock` to this branch.',
        '',
        `- [ ] **Approve all** (${plural(changes.length, 'change')})`,
      );
    } else {
      lines.push(
        'Checkbox approval works only for branches of this repository. Run `npx ruleprint approve` locally and push `ruleprint.lock`.',
      );
    }

    const limit = input.limit ?? PR_COMMENT_DEFAULT_LIMIT;
    let listed = 0;
    for (const kind of KIND_ORDER) {
      const ofKind = changes.filter((change) => change.kind === kind);
      if (ofKind.length === 0 || listed >= limit) continue;
      lines.push('', `### ${HEADINGS[kind]} (${ofKind.length})`, '');
      if (kind === 'removed') lines.push('Approving removes the rule from `ruleprint.lock`.', '');
      for (const change of ofKind) {
        if (listed >= limit) break;
        lines.push(bullet(change.id, itemTitle(change), input, true));
        listed += 1;
      }
    }
    if (listed < changes.length) {
      lines.push(
        '',
        `_…and ${changes.length - listed} more. Run \`npx ruleprint check\` locally to see everything._`,
      );
    }
  }

  if (orphans.length > 0) {
    lines.push(
      '',
      `### Orphans (${orphans.length})`,
      '',
      'Declared rules without evidence. Never blocking; link code with `@rule RP-…` or delete the declaration.',
      '',
    );
    for (const orphan of orphans) lines.push(bullet(orphan.id, orphan.title, input, false));
  }

  const footer: string[] = [];
  if (input.version !== undefined) footer.push(`ruleprint ${input.version}`);
  if (input.commit !== undefined) footer.push(`scanned ${input.commit.slice(0, 7)}`);
  footer.push('`npx ruleprint check` reproduces this locally.');
  lines.push('', `<sub>${footer.join(' · ')}</sub>`);
  return `${lines.join('\n')}\n`;
}

/** Ticked boxes in a comment body written by `renderPrComment()`; nothing without the marker. */
export function parseApprovals(body: string): PrApprovals {
  if (!body.includes(PR_COMMENT_MARKER)) return { all: false, ids: [] };
  const ids: string[] = [];
  let all = false;
  let inFence = false;
  for (const line of body.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const approveAll = APPROVE_ALL_LINE.exec(line);
    if (approveAll?.[1] !== undefined && approveAll[1] !== ' ') all = true;
    const box = CHECKBOX_LINE.exec(line);
    if (box?.[2] !== undefined && box[1] !== ' ' && !ids.includes(box[2])) ids.push(box[2]);
  }
  return { all, ids };
}
