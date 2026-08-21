import { scoreAtWinProbability, winProbabilityFromScore } from './calibration.js';

export type CubeAction = 'no-double' | 'double' | 'too-good';
export type CubeResponse = 'take' | 'drop';

/**
 * Cubeless win probability at which the opponent should refuse a double. The
 * textbook cubeless take point is 25%; owning the cube afterwards is worth a
 * couple of points of equity, hence the slightly lower figure.
 */
export const TAKE_POINT = 0.23;
/** Below this it is not yet worth turning the cube. */
export const DOUBLE_POINT = 0.68;
/** Above this, playing on for a gammon usually beats cashing. */
export const TOO_GOOD_POINT = 0.88;

/**
 * Inverse of the win-probability mapping. Cube thresholds are stated as win
 * probabilities but have to be compared against equities, which is the only
 * place the two scales need to meet.
 */
export function equityAtWinProbability(p: number): number {
  return scoreAtWinProbability(p);
}

export interface CubeDecision {
  readonly action: CubeAction;
  readonly winProbability: number;
}

/**
 * Approximate cube handling from a cubeless equity.
 *
 * The win probability comes from the calibration table — measured by rolling
 * sampled positions out to the end — rather than from reading the evaluator's
 * score as a probability, which overstated a modest lead badly enough to make
 * these thresholds meaningless.
 *
 * This is still a threshold model, not a match-equity table: it ignores match
 * score, gammon rates and recube vantage. It plays a sane cube, but replacing it with
 * a real match-equity table is the single biggest strength upgrade available
 * after the checker-play evaluator.
 */
export function decideDouble(equity: number): CubeDecision {
  const p = winProbabilityFromScore(equity);
  if (p >= TOO_GOOD_POINT) return { action: 'too-good', winProbability: p };
  if (p >= DOUBLE_POINT) return { action: 'double', winProbability: p };
  return { action: 'no-double', winProbability: p };
}

/** `equity` is the responding side's cubeless equity before the cube is turned. */
export function decideTake(equity: number): { response: CubeResponse; winProbability: number } {
  const p = winProbabilityFromScore(equity);
  return { response: p >= TAKE_POINT ? 'take' : 'drop', winProbability: p };
}
