export const REFUND_WINDOW_DAYS = 7;

export interface Charge {
  chargedAt: Date;
  amount: number;
  disputed: boolean;
}

export function canRefund(charge: Charge, now: Date): boolean {
  if (charge.disputed) {
    return false;
  }
  const ageMs = now.getTime() - charge.chargedAt.getTime();
  return ageMs <= REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
