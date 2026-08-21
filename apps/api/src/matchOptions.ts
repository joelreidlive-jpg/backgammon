import type { Player } from '@bg/rules';
import { DIFFICULTY_PROFILES, type Difficulty } from '@bg/ai';
import type { CreateMatchRequest } from '@bg/protocol';

export interface MatchOptions {
  readonly matchLength: number;
  readonly seat: Player;
  readonly aiLevel: Difficulty;
  readonly coaching: boolean;
}

export const MAX_MATCH_LENGTH = 25;

const DEFAULTS: MatchOptions = {
  matchLength: 1,
  seat: 'white',
  aiLevel: 'intermediate',
  coaching: true,
};

/**
 * Normalise a match request from the network.
 *
 * The body is untrusted, so every field falls back to its default rather than
 * reaching the engine: an unknown difficulty has no profile to search with, an
 * unknown seat leaves nobody able to move, and a non-numeric match length
 * produces a target score of `NaN` that no result can ever reach.
 */
export function matchOptions(request: CreateMatchRequest | null | undefined): MatchOptions {
  if (!request || typeof request !== 'object') return DEFAULTS;

  const length = Math.trunc(Number(request.matchLength));
  return {
    matchLength: Number.isFinite(length) ? Math.min(MAX_MATCH_LENGTH, Math.max(1, length)) : 1,
    seat: request.seat === 'black' || request.seat === 'white' ? request.seat : DEFAULTS.seat,
    aiLevel:
      typeof request.aiLevel === 'string' && request.aiLevel in DIFFICULTY_PROFILES
        ? request.aiLevel
        : DEFAULTS.aiLevel,
    coaching: typeof request.coaching === 'boolean' ? request.coaching : DEFAULTS.coaching,
  };
}
