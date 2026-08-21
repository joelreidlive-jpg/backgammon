import { type Board, type Player, opponent } from '@bg/rules';
import { type Evaluator } from './evaluator.js';
import { heuristicEvaluator } from './heuristic.js';
import { CALIBRATION } from './calibration.generated.js';

/**
 * What the evaluator's score is worth in real points.
 *
 * The heuristic returns a squashed number in ±1 that is monotone in "how good
 * this looks" but is not an equity: it has no idea that winning a gammon pays
 * two. Everything downstream that treats it as points — truncated rollouts,
 * cube decisions, win probability — is wrong by however much that mapping is
 * wrong, and the error is worst exactly where the cube lives.
 *
 * So the mapping is measured rather than assumed: positions are sampled from
 * self-play, each is rolled out to the end, and the average points actually
 * won are recorded against the score the evaluator gave. The table below is
 * that measurement. Regenerate it with
 * `CALIBRATE=1 npx vitest run packages/bench/src/calibrate.test.ts`.
 */
export interface CalibrationPoint {
  /** Upper edge of the evaluator-score bin. */
  readonly score: number;
  /** Mean points won from positions scoring in this bin. */
  readonly points: number;
  /** Share of those positions that were won at all. */
  readonly winRate: number;
  readonly samples: number;
}

export { CALIBRATION };

/**
 * A dead-even score is worth nothing and wins half the time. That is not a
 * measurement, it is what "even" means, and anchoring the table there stops
 * the lowest bin's noise from being extrapolated down to zero.
 */
const ORIGIN: CalibrationPoint = { score: 0, points: 0, winRate: 0.5, samples: 0 };

function anchored(): readonly CalibrationPoint[] {
  return [ORIGIN, ...CALIBRATION];
}

function interpolate(score: number, read: (point: CalibrationPoint) => number): number {
  const table = anchored();
  if (CALIBRATION.length === 0) return score;
  if (score <= table[0].score) return read(table[0]);

  for (let index = 1; index < table.length; index++) {
    const previous = table[index - 1];
    const current = table[index];
    if (score > current.score) continue;
    const span = current.score - previous.score;
    const t = span === 0 ? 0 : (score - previous.score) / span;
    return read(previous) + t * (read(current) - read(previous));
  }
  return read(table[table.length - 1]);
}

/**
 * Points `player` is expected to win, from the evaluator's score.
 *
 * Antisymmetric by construction — the table is applied to the magnitude and
 * the sign is restored — so a calibration measured from one side cannot make
 * the two sides of a position disagree about who is ahead.
 */
export function pointsFromScore(score: number): number {
  const sign = score < 0 ? -1 : 1;
  return sign * interpolate(Math.abs(score), (point) => point.points);
}

/** Probability `player` wins the game at all, gammons included. */
export function winProbabilityFromScore(score: number): number {
  const sign = score < 0 ? -1 : 1;
  const magnitude = interpolate(Math.abs(score), (point) => point.winRate);
  return sign > 0 ? magnitude : 1 - magnitude;
}

/**
 * Inverse of `winProbabilityFromScore`: the evaluator score at which a
 * position wins with probability `p`.
 *
 * Cube thresholds are stated as win probabilities but have to be compared
 * against scores, and doing that conversion with the uncalibrated mapping is
 * what made an ordinary lead read as 92%.
 */
export function scoreAtWinProbability(p: number): number {
  if (p < 0.5) return -scoreAtWinProbability(1 - p);
  const table = anchored();
  if (CALIBRATION.length === 0) return 2 * p - 1;

  for (let index = 1; index < table.length; index++) {
    const previous = table[index - 1];
    const current = table[index];
    if (p > current.winRate) continue;
    const span = current.winRate - previous.winRate;
    const t = span === 0 ? 0 : (p - previous.winRate) / span;
    return previous.score + t * (current.score - previous.score);
  }
  return table[table.length - 1].score;
}

/**
 * Calibrated points estimator, in the shape of an `Evaluator` so it can be
 * dropped into a truncated rollout.
 */
export function calibratedPoints(evaluator: Evaluator = heuristicEvaluator): Evaluator {
  return (board: Board, player: Player) => pointsFromScore(evaluator(board, player));
}

export const pointsEstimator: Evaluator = calibratedPoints();

/** Win probability for `player`, calibrated against rolled-out outcomes. */
export function calibratedWinProbability(
  board: Board,
  player: Player,
  evaluator: Evaluator = heuristicEvaluator,
): number {
  // Averaging the two sides costs nothing and removes any asymmetry the
  // evaluator itself introduces.
  const mine = winProbabilityFromScore(evaluator(board, player));
  const theirs = 1 - winProbabilityFromScore(evaluator(board, opponent(player)));
  return (mine + theirs) / 2;
}
