import { MAX_GENERATED_TIER, type Tier } from './problem.js';

export interface AttemptRecord {
  readonly problemId: string;
  readonly tier: Tier;
  readonly solved: boolean;
  /** Epoch milliseconds. Records are supplied newest first. */
  readonly at: number;
}

/** Attempts at a tier that count towards unlocking the next one. */
export const LADDER_WINDOW = 10;
/** Share of that window that must be solved. */
export const LADDER_PASS_RATE = 0.7;

export interface TierProgress {
  readonly tier: Tier;
  readonly attempts: number;
  readonly solved: number;
  /** Solved within the most recent `LADDER_WINDOW` attempts at this tier. */
  readonly recentSolved: number;
  readonly recentAttempts: number;
  readonly passed: boolean;
}

function progressAt(records: readonly AttemptRecord[], tier: Tier): TierProgress {
  const atTier = records.filter((record) => record.tier === tier);
  const recent = atTier.slice(0, LADDER_WINDOW);
  const recentSolved = recent.filter((record) => record.solved).length;
  return {
    tier,
    attempts: atTier.length,
    solved: atTier.filter((record) => record.solved).length,
    recentSolved,
    recentAttempts: recent.length,
    passed: recent.length >= LADDER_WINDOW && recentSolved / recent.length >= LADDER_PASS_RATE,
  };
}

export interface LadderState {
  /** The hardest tier unlocked, and the one problems are served from. */
  readonly tier: Tier;
  readonly maxTier: Tier;
  readonly byTier: readonly TierProgress[];
  /** Attempts still needed at the current tier before it can be judged. */
  readonly attemptsToDecide: number;
  /** Solved attempts still needed in the current window to unlock the next tier. */
  readonly solvesToUnlock: number;
}

/**
 * Where the player is on the ladder.
 *
 * Unlocking is by recent form rather than lifetime totals: ten attempts at a
 * tier with seven solved moves you up. There is no demotion — a bad run at a
 * harder tier is the point of the harder tier, and taking a level away for it
 * would make the ladder punish the exact behaviour it exists to encourage.
 */
export function ladderState(
  records: readonly AttemptRecord[],
  maxTier: Tier = MAX_GENERATED_TIER,
): LadderState {
  const tiers = Array.from({ length: maxTier }, (_, index) => (index + 1) as Tier);
  const byTier = tiers.map((tier) => progressAt(records, tier));

  let tier: Tier = 1;
  for (const progress of byTier) {
    if (!progress.passed) break;
    if (progress.tier < maxTier) tier = (progress.tier + 1) as Tier;
  }

  const current = byTier[tier - 1];
  const needed = Math.ceil(LADDER_WINDOW * LADDER_PASS_RATE);
  return {
    tier,
    maxTier,
    byTier,
    attemptsToDecide: Math.max(0, LADDER_WINDOW - current.recentAttempts),
    solvesToUnlock: Math.max(0, needed - current.recentSolved),
  };
}
