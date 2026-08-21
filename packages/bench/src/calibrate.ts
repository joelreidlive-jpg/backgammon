import { type Board, type Dice, type Player, initialBoard, opponent, winnerOf } from '@bg/rules';
import {
  type CalibrationPoint,
  type Evaluator,
  type RolloutOptions,
  heuristicEvaluator,
  rankTurns,
  rolloutOutcome,
} from '@bg/ai';

export interface CalibrationSample {
  readonly score: number;
  readonly points: number;
  readonly winRate: number;
}

export interface CalibrateOptions {
  /** Positions to sample. */
  readonly positions: number;
  /** Full playouts per sampled position. */
  readonly trials: number;
  readonly seed: number;
  /** Bins the samples are averaged into, over the evaluator's ±1 range. */
  readonly bins: number;
}

export const DEFAULT_CALIBRATE: CalibrateOptions = {
  positions: 1200,
  trials: 120,
  seed: 4242,
  bins: 20,
};

const PLAY_SEARCH = { plies: 1 } as const;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollDice(random: () => number): Dice {
  return [1 + Math.floor(random() * 6), 1 + Math.floor(random() * 6)];
}

/**
 * Positions reached in self-play, sampled across the whole arc of a game so
 * the calibration is not fitted to opening positions alone.
 */
export function samplePositions(
  count: number,
  seed: number,
): { board: Board; onRoll: Player }[] {
  const random = mulberry32(seed);
  const sampled: { board: Board; onRoll: Player }[] = [];

  while (sampled.length < count) {
    let board = initialBoard();
    let onRoll: Player = random() < 0.5 ? 'white' : 'black';

    for (let ply = 0; ply < 300 && sampled.length < count; ply++) {
      if (random() < 0.15) sampled.push({ board, onRoll });

      const dice = rollDice(random);
      const best = rankTurns(board, onRoll, dice, PLAY_SEARCH)[0];
      if (best) board = best.turn.board;
      if (winnerOf(board) !== null) break;
      onRoll = opponent(onRoll);
    }
  }

  return sampled;
}

/**
 * Roll each sampled position out to the end and record what the evaluator said
 * against what actually happened.
 */
export function collectSamples(
  positions: readonly { board: Board; onRoll: Player }[],
  options: CalibrateOptions = DEFAULT_CALIBRATE,
  evaluator: Evaluator = heuristicEvaluator,
): CalibrationSample[] {
  const rollout: RolloutOptions = { maxTrials: options.trials, seed: options.seed };

  return positions.map(({ board, onRoll }, index) => {
    const outcome = rolloutOutcome(board, onRoll, onRoll, {
      ...rollout,
      seed: options.seed + index,
    });
    return {
      score: evaluator(board, onRoll),
      points: outcome.points,
      winRate: outcome.winRate,
    };
  });
}

/**
 * Average the samples into a lookup table over the magnitude of the score.
 *
 * Binning rather than fitting a curve: the shape of this relationship is not
 * known in advance, and a table cannot quietly extrapolate a wrong shape into
 * the range where the cube decisions live. Samples are folded onto the
 * positive side, since the mapping must be antisymmetric anyway.
 */
export function buildCalibration(
  samples: readonly CalibrationSample[],
  bins: number = DEFAULT_CALIBRATE.bins,
): CalibrationPoint[] {
  const folded = samples.map((sample) =>
    sample.score < 0
      ? { score: -sample.score, points: -sample.points, winRate: 1 - sample.winRate }
      : sample,
  );

  // Equal-count bins, not equal-width: self-play spends most of its time in
  // positions one side has already won, so equal-width bins put hundreds of
  // samples in the top bin and leave it too coarse to tell a won game from an
  // overwhelming one — which is exactly the range the cube cares about.
  const sorted = [...folded].sort((a, b) => a.score - b.score);
  const table: CalibrationPoint[] = [];

  for (let bin = 0; bin < bins; bin++) {
    const from = Math.floor((bin * sorted.length) / bins);
    const to = Math.floor(((bin + 1) * sorted.length) / bins);
    const inBin = sorted.slice(from, to);
    if (inBin.length === 0) continue;

    table.push({
      score: bin === bins - 1 ? 1 : inBin[inBin.length - 1].score,
      points: inBin.reduce((sum, s) => sum + s.points, 0) / inBin.length,
      winRate: inBin.reduce((sum, s) => sum + s.winRate, 0) / inBin.length,
      samples: inBin.length,
    });
  }

  return enforceMonotone(mergeTies(table));
}

/**
 * The evaluator's score saturates at 1, so the top few quantile bins can share
 * an edge. Two rows at the same score are not two data points the table can
 * interpolate between; they are one, and averaging them is the only reading
 * that does not silently discard the stronger positions.
 */
function mergeTies(table: readonly CalibrationPoint[]): CalibrationPoint[] {
  const merged: CalibrationPoint[] = [];
  for (const point of table) {
    const previous = merged[merged.length - 1];
    if (!previous || previous.score !== point.score) {
      merged.push(point);
      continue;
    }
    const samples = previous.samples + point.samples;
    merged[merged.length - 1] = {
      score: point.score,
      points: (previous.points * previous.samples + point.points * point.samples) / samples,
      winRate: (previous.winRate * previous.samples + point.winRate * point.samples) / samples,
      samples,
    };
  }
  return merged;
}

/**
 * A bin that reverses the order — a better-looking position worth fewer points
 * — is sampling noise, not a discovery. Left in, it would make the estimator
 * prefer worse positions.
 */
function enforceMonotone(table: readonly CalibrationPoint[]): CalibrationPoint[] {
  const result: CalibrationPoint[] = [];
  for (const point of table) {
    const previous = result[result.length - 1];
    result.push(
      previous
        ? {
            ...point,
            points: Math.max(point.points, previous.points),
            winRate: Math.max(point.winRate, previous.winRate),
          }
        : point,
    );
  }
  return result;
}

export function formatCalibrationModule(table: readonly CalibrationPoint[]): string {
  return [
    '// Generated by `CALIBRATE=1 npx vitest run packages/bench/src/calibrate.test.ts`',
    '// — do not edit by hand.',
    '//',
    '// Each row: positions the evaluator scored up to `score` won `points` on',
    '// average when rolled out to the end, and were won outright `winRate` of',
    '// the time.',
    "import type { CalibrationPoint } from './calibration.js';",
    '',
    'export const CALIBRATION: readonly CalibrationPoint[] = [',
    ...table.map(
      (point) =>
        `  { score: ${point.score.toFixed(4)}, points: ${point.points.toFixed(4)}, winRate: ${point.winRate.toFixed(4)}, samples: ${point.samples} },`,
    ),
    '];',
    '',
  ].join('\n');
}
