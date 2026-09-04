import type { Confidence, RuleStatus } from '@ruleprint/spec';

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  declared: 'declared · official',
  derived: 'derived · from tests',
  inferred: 'inferred · unverified',
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span className={`badge badge-${confidence}`} title={CONFIDENCE_LABEL[confidence]}>
      {confidence}
    </span>
  );
}

export function StatusBadge({ status }: { status: RuleStatus }) {
  return <span className={`status status-${status}`}>{status}</span>;
}
