import { type RankedTurn, type SearchOptions } from './search.js';

export type Difficulty = 'beginner' | 'casual' | 'intermediate' | 'advanced' | 'expert';

export interface DifficultyProfile extends SearchOptions {
  /** Probability of deliberately not playing the best turn. */
  readonly blunderRate: number;
  /** How far down the ranking a deliberate mistake may reach. */
  readonly blunderDepth: number;
}

/**
 * Weaker levels search less and make deliberate mistakes; the evaluator itself
 * is never degraded. A weakened evaluator produces an opponent that plays
 * incoherently, whereas an occasional second-best choice looks like a weaker
 * human.
 */
export const DIFFICULTY_PROFILES: Readonly<Record<Difficulty, DifficultyProfile>> = {
  beginner: { plies: 1, candidateWidth: 4, blunderRate: 0.45, blunderDepth: 6 },
  casual: { plies: 1, candidateWidth: 6, blunderRate: 0.25, blunderDepth: 4 },
  intermediate: { plies: 1, candidateWidth: 8, blunderRate: 0.1, blunderDepth: 3 },
  advanced: { plies: 2, candidateWidth: 6, blunderRate: 0.04, blunderDepth: 2 },
  expert: { plies: 2, candidateWidth: 10, blunderRate: 0, blunderDepth: 0 },
};

export type Random = () => number;

/** Pick from a best-first ranking according to the profile's error rate. */
export function selectTurn(
  ranked: readonly RankedTurn[],
  profile: DifficultyProfile,
  random: Random = Math.random,
): RankedTurn {
  if (ranked.length === 0) throw new Error('no turns to select from');
  if (ranked.length === 1 || profile.blunderRate === 0) return ranked[0];
  if (random() >= profile.blunderRate) return ranked[0];

  const depth = Math.min(profile.blunderDepth, ranked.length - 1);
  if (depth <= 0) return ranked[0];
  return ranked[1 + Math.floor(random() * depth)];
}
