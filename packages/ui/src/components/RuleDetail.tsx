import type { Project, Rule } from '@ruleprint/spec';

import { sourceLabel, sourceUrl } from '../lib/links.js';
import { ConfidenceBadge, StatusBadge } from './Badge.js';

interface Props {
  readonly project: Project;
  readonly rule: Rule;
}

export function RuleDetail({ project, rule }: Props) {
  return (
    <article className="detail">
      <p>
        <a href="#/">← All rules</a>
      </p>
      <p className="rule-id">{rule.id}</p>
      <h1>{rule.title}</h1>
      <p className="rule-meta">
        <ConfidenceBadge confidence={rule.origin.confidence} />
        <StatusBadge status={rule.status} />
        {(rule.tags ?? []).map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </p>
      {rule.description && <p className="description">{rule.description}</p>}

      <h2>Origin</h2>
      <p>
        Collected by <code>{rule.origin.collector}</code>
      </p>
      <ul className="sources">
        {rule.origin.sources.map((source, index) => {
          const url = sourceUrl(project, source);
          const label = sourceLabel(source);
          return (
            <li key={`${source.file}:${source.line ?? index}`}>
              {url ? (
                <a href={url} target="_blank" rel="noreferrer">
                  {label}
                </a>
              ) : (
                <code>{label}</code>
              )}
              {source.symbol && <span className="symbol"> · {source.symbol}</span>}
              {source.kind && <span className="kind"> ({source.kind})</span>}
            </li>
          );
        })}
      </ul>

      {rule.evidence && (
        <>
          <h2>Evidence</h2>
          {rule.evidence.tests && rule.evidence.tests.length > 0 && (
            <ul>
              {rule.evidence.tests.map((test) => (
                <li key={test}>
                  <code>{test}</code>
                </li>
              ))}
            </ul>
          )}
          <p>
            Last run: <strong>{rule.evidence.lastRunStatus ?? 'unknown'}</strong>
            {rule.evidence.coveredLines !== undefined && (
              <> · {rule.evidence.coveredLines} lines covered</>
            )}
          </p>
        </>
      )}

      <h2>Approval</h2>
      {rule.approvedAt ? (
        <p>
          Approved {rule.approvedAt}
          {rule.approvedBy && <> by {rule.approvedBy}</>}
        </p>
      ) : (
        <p>Not approved yet.</p>
      )}
      <p className="fingerprint">
        fingerprint <code>{rule.fingerprint}</code>
      </p>
    </article>
  );
}
