import { CHECKERS_PER_SIDE, type Board, type Player, checkersAt, homeSlots, opponent } from './board.js';

export type WinKind = 'single' | 'gammon' | 'backgammon';

export interface GameResult {
  readonly winner: Player;
  readonly kind: WinKind;
  /** Points awarded, cube included. */
  readonly points: number;
}

export function winnerOf(board: Board): Player | null {
  if (board.off.white === CHECKERS_PER_SIDE) return 'white';
  if (board.off.black === CHECKERS_PER_SIDE) return 'black';
  return null;
}

export function winKind(board: Board, winner: Player): WinKind {
  const loser = opponent(winner);
  if (board.off[loser] > 0) return 'single';

  if (board.bar[loser] > 0) return 'backgammon';
  for (const slot of homeSlots(winner)) {
    if (checkersAt(board, loser, slot) > 0) return 'backgammon';
  }
  return 'gammon';
}

const MULTIPLIER: Record<WinKind, number> = { single: 1, gammon: 2, backgammon: 3 };

export function scoreGame(board: Board, winner: Player, cubeValue: number): GameResult {
  const kind = winKind(board, winner);
  return { winner, kind, points: MULTIPLIER[kind] * cubeValue };
}

/** A dropped double scores the current cube value without doubling it. */
export function scoreDrop(winner: Player, cubeValue: number): GameResult {
  return { winner, kind: 'single', points: cubeValue };
}
