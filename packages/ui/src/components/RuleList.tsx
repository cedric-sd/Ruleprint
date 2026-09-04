import type { Confidence, Rule } from '@ruleprint/spec';

import {
  allTags,
  CONFIDENCES,
  countByConfidence,
  filterRules,
  type RuleFilter,
} from '../lib/filter.js';
import { ruleHash } from '../lib/route.js';
import { ConfidenceBadge, StatusBadge } from './Badge.js';

interface Props {
  readonly rules: readonly Rule[];
  readonly filter: RuleFilter;
  readonly onFilter: (filter: RuleFilter) => void;
}

export function RuleList({ rules, filter, onFilter }: Props) {
  const visible = filterRules(rules, filter);
  const tags = allTags(rules);
  const counts = countByConfidence(rules);

  const toggle = <T,>(list: readonly T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  return (
    <div className="layout">
      <aside className="sidebar">
        <label className="search">
          <span className="visually-hidden">Search rules</span>
          <input
            type="search"
            placeholder="Search rules…"
            value={filter.query}
            onChange={(event) => onFilter({ ...filter, query: event.target.value })}
            autoFocus
          />
        </label>

        <h2>Confidence</h2>
        <ul className="chips">
          {CONFIDENCES.map((confidence: Confidence) => (
            <li key={confidence}>
              <button
                type="button"
                className={`chip chip-${confidence}${filter.confidence.includes(confidence) ? ' active' : ''}`}
                onClick={() =>
                  onFilter({ ...filter, confidence: toggle(filter.confidence, confidence) })
                }
              >
                {confidence} <small>{counts[confidence]}</small>
              </button>
            </li>
          ))}
        </ul>

        {tags.length > 0 && (
          <>
            <h2>Tags</h2>
            <ul className="chips">
              {tags.map(({ tag, count }) => (
                <li key={tag}>
                  <button
                    type="button"
                    className={`chip${filter.tags.includes(tag) ? ' active' : ''}`}
                    onClick={() => onFilter({ ...filter, tags: toggle(filter.tags, tag) })}
                  >
                    {tag} <small>{count}</small>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>

      <section className="results">
        <p className="count">
          {visible.length} of {rules.length} rules
        </p>
        {visible.length === 0 ? (
          <p className="empty">No rule matches. Try fewer filters.</p>
        ) : (
          <ol className="rules">
            {visible.map((rule) => (
              <li key={rule.id}>
                <a className="rule" href={ruleHash(rule.id)}>
                  <span className="rule-id">{rule.id}</span>
                  <span className="rule-title">{rule.title}</span>
                  <span className="rule-meta">
                    <ConfidenceBadge confidence={rule.origin.confidence} />
                    <StatusBadge status={rule.status} />
                    {(rule.tags ?? []).map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
