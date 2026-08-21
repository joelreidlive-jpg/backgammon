import { type Turn, boardKey, formatTurn } from '@bg/rules';
import {
  TRUNCATE_PLIES,
  type RolloutOptions,
  type RolloutResult,
  pointsEstimator,
  rolloutTurns,
} from '@bg/ai';
import type { BenchmarkPosition, LoadedPosition } from './schema.js';
import { load } from './schema.js';

export interface RolloutGrade {
  readonly id: string;
  /** The play the rollout preferred. */
  readonly play: string;
  readonly reference: string;
  readonly correct: boolean;
  /** Points the rollout's play gains over the runner-up. */
  readonly margin: number;
  readonly marginStderr: number;
  /** Points the rollout's play gains over the reference play, if it disagreed. */
  readonly referenceLoss: number;
  readonly trials: number;
  /** False when no play separated from the field: the position has no answer. */
  readonly decisive: boolean;
}

/**
 * Trial budget for grading a position. Generous, because the whole point of a
 * rollout is that it is run once, offline, and then trusted.
 */
export const BENCH_ROLLOUT: RolloutOptions = {
  maxTrials: 5184,
  minTrials: 288,
  checkEvery: 72,
  truncate: TRUNCATE_PLIES,
  estimate: pointsEstimator,
  confidence: 2.5,
  candidates: 6,
};

function matches(result: RolloutResult, turns: readonly Turn[]): boolean {
  const keys = new Set(turns.map((turn) => boardKey(turn.board)));
  return keys.has(boardKey(result.candidates[0].turn.board));
}

/** Equity the rollout's own play gains over the best accepted play it rolled out. */
function lossAgainst(result: RolloutResult, turns: readonly Turn[]): number {
  const keys = new Set(turns.map((turn) => boardKey(turn.board)));
  const reference = result.candidates.find((candidate) => keys.has(boardKey(candidate.turn.board)));
  // The reference play may not have made the shortlist at all, in which case
  // the search rejected it before the rollout ever saw it.
  if (!reference) return Infinity;
  return result.candidates[0].equity - reference.equity;
}

export function rolloutPosition(
  position: LoadedPosition,
  options: RolloutOptions = BENCH_ROLLOUT,
): RolloutGrade {
  const result = rolloutTurns(position.board, position.player, position.dice, options);
  if (result.candidates.length === 0) throw new Error(`${position.id}: no legal turns`);

  return {
    id: position.id,
    play: formatTurn(position.player, result.candidates[0].turn.moves),
    reference: position.best[0],
    correct: matches(result, position.bestTurns),
    margin: result.margin,
    marginStderr: result.marginStderr,
    referenceLoss: lossAgainst(result, position.bestTurns),
    trials: result.trials,
    decisive: result.decisive,
  };
}

export interface RolloutReport {
  readonly positions: number;
  readonly accuracy: number;
  /** Share of positions where the rollout found no clear best play. */
  readonly undecided: number;
  readonly meanTrials: number;
  readonly grades: readonly RolloutGrade[];
}

export function runRolloutBenchmark(
  positions: readonly BenchmarkPosition[],
  options: RolloutOptions = BENCH_ROLLOUT,
): RolloutReport {
  const grades = positions.map((position) => rolloutPosition(load(position), options));
  return {
    positions: grades.length,
    accuracy: grades.filter((grade) => grade.correct).length / grades.length,
    undecided: grades.filter((grade) => !grade.decisive).length / grades.length,
    meanTrials: grades.reduce((sum, grade) => sum + grade.trials, 0) / grades.length,
    grades,
  };
}

export function formatRolloutReport(report: RolloutReport): string {
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  const finite = (value: number) => (Number.isFinite(value) ? value.toFixed(3) : 'not rolled out');
  return [
    `${report.positions} positions · rollout agreement ${pct(report.accuracy)} · undecided ${pct(report.undecided)}`,
    `mean trials ${report.meanTrials.toFixed(0)}`,
    '',
    'Disagreements:',
    ...report.grades
      .filter((grade) => !grade.correct)
      .map(
        (grade) =>
          `  ${grade.id.padEnd(14)} rolled ${grade.play.padEnd(16)} want ${grade.reference.padEnd(16)} by ${finite(grade.referenceLoss)} ± ${grade.marginStderr.toFixed(3)}`,
      ),
  ].join('\n');
}
