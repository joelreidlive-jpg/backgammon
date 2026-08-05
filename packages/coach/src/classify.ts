export type Severity = 'fine' | 'inaccuracy' | 'error' | 'blunder';

/** Equity-loss bands. Conventional thresholds used by backgammon analysis tools. */
export const SEVERITY_THRESHOLDS: Readonly<Record<Exclude<Severity, 'fine'>, number>> = {
  inaccuracy: 0.02,
  error: 0.06,
  blunder: 0.12,
};

export function classifyEquityLoss(equityLoss: number): Severity {
  if (equityLoss >= SEVERITY_THRESHOLDS.blunder) return 'blunder';
  if (equityLoss >= SEVERITY_THRESHOLDS.error) return 'error';
  if (equityLoss >= SEVERITY_THRESHOLDS.inaccuracy) return 'inaccuracy';
  return 'fine';
}

export function isMistake(severity: Severity): boolean {
  return severity !== 'fine';
}
