import { type MatchState, type Turn, canDouble } from '@bg/rules';
import { type CubeDecision, type CubeResponse, decideDouble, decideTake } from './cubeDecision.js';
import { DIFFICULTY_PROFILES, type Difficulty, type Random, selectTurn } from './difficulty.js';
import { type RankedTurn, expectedEquity, rankTurns } from './search.js';

export interface TurnDecision {
  readonly chosen: RankedTurn;
  /** Full best-first ranking; also what the coach consumes. */
  readonly ranked: readonly RankedTurn[];
}

export function decideTurn(state: MatchState, difficulty: Difficulty, random?: Random): TurnDecision {
  if (state.phase !== 'move' || state.dice === null) throw new Error('not a move phase');
  const profile = DIFFICULTY_PROFILES[difficulty];
  const ranked = rankTurns(state.board, state.turn, state.dice, profile);
  return { chosen: selectTurn(ranked, profile, random), ranked };
}

/** Whether the engine would turn the cube, given it is on roll. */
export function decideCubeAction(state: MatchState, difficulty: Difficulty): CubeDecision | null {
  if (!canDouble(state, state.turn)) return null;
  // Weaker levels do not use the cube aggressively.
  if (difficulty === 'beginner') return null;
  // Priced before the dice are known, like the decision itself: a static
  // evaluation of the position on roll systematically misprices the cube.
  return decideDouble(expectedEquity(state.board, state.turn));
}

/** How the engine answers a double it has been offered. */
export function decideCubeResponse(state: MatchState): CubeResponse {
  if (state.pendingDouble === null) throw new Error('no double pending');
  // The doubler is on roll, not the responder, so the position is valued from
  // the doubler's side and negated.
  return decideTake(-expectedEquity(state.board, state.pendingDouble)).response;
}

export type { Turn };
