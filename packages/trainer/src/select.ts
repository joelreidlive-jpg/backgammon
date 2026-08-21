import type { Concept } from '@bg/coach';
import type { AttemptRecord } from './ladder.js';
import type { Problem, Tier } from './problem.js';

/** Problems seen this recently are not served again unless nothing else is left. */
export const RECENT_MEMORY = 20;

export interface SelectionInput {
  readonly problems: readonly Problem[];
  /** Newest first. */
  readonly attempts: readonly AttemptRecord[];
  /** Concepts the player leaks equity on, worst first. */
  readonly weakConcepts: readonly Concept[];
  readonly tier: Tier;
  readonly random?: () => number;
}

/**
 * A problem is worth serving in proportion to how directly it attacks a known
 * weakness, and unseen problems beat repeats. Weakness weighting is ordered:
 * the worst concept counts for more than the third-worst, so a player who
 * leaks on hitting sees hitting problems rather than an even spread.
 */
function score(problem: Problem, weakConcepts: readonly Concept[], seen: boolean): number {
  let value = seen ? 0 : 1;
  weakConcepts.forEach((concept, index) => {
    if (problem.concepts.includes(concept)) value += weakConcepts.length - index;
  });
  return value;
}

/**
 * Choose the next problem: hardest unlocked tier first, targeting the player's
 * weakest concepts, avoiding anything answered recently.
 *
 * Falls back down the tiers when the requested one has no problems, so a thin
 * set never leaves the trainer with nothing to show.
 */
export function selectProblem(input: SelectionInput): Problem | null {
  const { problems, attempts, weakConcepts, tier, random = Math.random } = input;

  let pool: Problem[] = [];
  for (let candidate = tier; candidate >= 1 && pool.length === 0; candidate--) {
    pool = problems.filter((problem) => problem.tier === candidate);
  }
  if (pool.length === 0) return null;

  const recent = new Set(attempts.slice(0, RECENT_MEMORY).map((attempt) => attempt.problemId));
  const everSeen = new Set(attempts.map((attempt) => attempt.problemId));

  const fresh = pool.filter((problem) => !recent.has(problem.id));
  const candidates = fresh.length > 0 ? fresh : pool;

  let best: Problem | null = null;
  let bestScore = -Infinity;
  let ties = 0;
  for (const problem of candidates) {
    const value = score(problem, weakConcepts, everSeen.has(problem.id));
    if (value > bestScore) {
      best = problem;
      bestScore = value;
      ties = 1;
    } else if (value === bestScore) {
      // Reservoir sampling over the tied problems keeps the choice uniform
      // without shuffling the whole pool on every request.
      ties += 1;
      if (random() < 1 / ties) best = problem;
    }
  }
  return best;
}
