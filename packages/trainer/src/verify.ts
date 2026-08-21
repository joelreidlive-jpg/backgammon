import { formatTurn, parseXgid } from '@bg/rules';
import { TRUNCATE_PLIES, type RolloutOptions, pointsEstimator, rolloutTurns } from '@bg/ai';
import { conceptsOf, phaseOf } from '@bg/coach';
import { type Problem, type Tier } from './problem.js';

/**
 * Trial budget used to answer a trainer problem. Deliberately larger than
 * anything the app does at request time: this runs once, offline, and its
 * output is committed.
 */
export const VERIFY_ROLLOUT: RolloutOptions = {
  maxTrials: 5184,
  minTrials: 288,
  checkEvery: 72,
  confidence: 2.5,
  candidates: 6,
  truncate: TRUNCATE_PLIES,
  estimate: pointsEstimator,
};

/**
 * Smallest rolled-out margin worth drilling, in points of equity.
 *
 * Below this the two plays are close enough that "wrong" is not a useful
 * verdict for a learner, however statistically clean the separation is.
 */
export const MIN_ROLLOUT_MARGIN = 0.02;

/**
 * Tiers in rolled-out points, which are not the units the heuristic search
 * reports: a rollout scores real gammons and backgammons, so the same position
 * separates by a very different number. Boundaries are set from the observed
 * distribution of margins over the generated set rather than carried over.
 */
export function rolloutTier(margin: number): Tier {
  if (margin >= 0.24) return 1;
  if (margin >= 0.14) return 2;
  if (margin >= 0.08) return 3;
  if (margin >= 0.04) return 4;
  return 5;
}

export interface VerifiedProblem extends Problem {
  /** Standard error of the margin: how firmly the rollout holds its answer. */
  readonly marginStderr: number;
  readonly trials: number;
  /** The answer the position previously carried, when the rollout overruled it. */
  readonly overruled?: string;
}

/**
 * Re-answer a problem by rolling it out.
 *
 * Returns `null` when the rollout declines the position — either no play
 * separated from the field within the trial budget, or the winner's margin is
 * too small to drill. Both are answers in their own right: a position the
 * engine was confident about and the rollout cannot separate is precisely the
 * kind of problem that should never have been in the set.
 */
export function verifyProblem(
  problem: Problem,
  options: RolloutOptions = VERIFY_ROLLOUT,
): VerifiedProblem | null {
  const parsed = parseXgid(problem.xgid);
  if (!parsed.dice) throw new Error(`${problem.id}: XGID has no roll`);

  const result = rolloutTurns(parsed.board, parsed.turn, parsed.dice, options);
  if (!result.decisive || result.candidates.length < 2) return null;
  if (result.margin < MIN_ROLLOUT_MARGIN) return null;

  const winner = result.candidates[0];
  const best = formatTurn(parsed.turn, winner.turn.moves);

  return {
    ...problem,
    best: [best],
    tier: rolloutTier(result.margin),
    provenance: 'rollout',
    concepts: [...conceptsOf(parsed.board, winner.turn.board, parsed.turn)],
    phase: phaseOf(parsed.board, parsed.turn),
    margin: result.margin,
    marginStderr: result.marginStderr,
    trials: result.trials,
    ...(problem.best[0] === best ? {} : { overruled: problem.best[0] }),
  };
}
