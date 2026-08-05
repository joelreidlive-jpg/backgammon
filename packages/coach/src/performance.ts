import { type Severity } from './classify.js';
import { type GamePhase } from './phase.js';

export interface DecisionRecord {
  readonly equityLoss: number;
  readonly severity: Severity;
  readonly phase: GamePhase;
  readonly kind: 'checker' | 'cube';
}

export interface PhaseBreakdown {
  readonly decisions: number;
  readonly totalEquityLoss: number;
  /** Millipoints of equity lost per decision. Lower is better. */
  readonly errorRate: number;
}

export interface PerformanceSummary {
  readonly decisions: number;
  readonly errorRate: number;
  readonly checkerErrorRate: number;
  readonly cubeErrorRate: number;
  readonly byPhase: Readonly<Partial<Record<GamePhase, PhaseBreakdown>>>;
  readonly counts: Readonly<Record<Severity, number>>;
  /** The phase costing the most total equity, if there were any mistakes. */
  readonly weakestPhase: GamePhase | null;
}

function rate(records: readonly DecisionRecord[]): number {
  if (records.length === 0) return 0;
  const total = records.reduce((sum, r) => sum + r.equityLoss, 0);
  return (total / records.length) * 1000;
}

/**
 * Aggregate equity loss into an error rate, split by phase and by checker play
 * versus cube handling. The split is the useful part: it tells the player what
 * to study rather than just how well they did.
 */
export function summarise(records: readonly DecisionRecord[]): PerformanceSummary {
  const counts: Record<Severity, number> = { fine: 0, inaccuracy: 0, error: 0, blunder: 0 };
  const phases = new Map<GamePhase, DecisionRecord[]>();

  for (const record of records) {
    counts[record.severity] += 1;
    const bucket = phases.get(record.phase);
    if (bucket) bucket.push(record);
    else phases.set(record.phase, [record]);
  }

  const byPhase: Partial<Record<GamePhase, PhaseBreakdown>> = {};
  let weakestPhase: GamePhase | null = null;
  let worstLoss = 0;

  for (const [phase, bucket] of phases) {
    const totalEquityLoss = bucket.reduce((sum, r) => sum + r.equityLoss, 0);
    byPhase[phase] = { decisions: bucket.length, totalEquityLoss, errorRate: rate(bucket) };
    if (totalEquityLoss > worstLoss) {
      worstLoss = totalEquityLoss;
      weakestPhase = phase;
    }
  }

  return {
    decisions: records.length,
    errorRate: rate(records),
    checkerErrorRate: rate(records.filter((r) => r.kind === 'checker')),
    cubeErrorRate: rate(records.filter((r) => r.kind === 'cube')),
    byPhase,
    counts,
    weakestPhase,
  };
}
