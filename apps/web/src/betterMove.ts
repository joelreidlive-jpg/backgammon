import type { Board, Move } from '@bg/rules';
import { applyMove } from '@bg/rules';
import type { CoachingPolicy, TurnAnalysis } from '@bg/protocol';

/**
 * Where the player is in the "show me the better move" conversation.
 *
 * `shown` is a preview only: nothing has been sent to the server, so going
 * back to the played move is a local step. `played` is terminal for the turn —
 * the board has already moved on.
 */
export type BetterMoveState = 'hidden' | 'shown' | 'playing' | 'played' | 'failed';

export type BetterMoveEvent =
  /** The player asked to see the coach's play. */
  | 'show'
  /** The player went back to their own move. */
  | 'revert'
  /** The player waved the coach away without looking at its move. */
  | 'dismiss'
  /** The player asked to play the coach's move instead. */
  | 'play'
  /** The server accepted the replacement turn. */
  | 'settled'
  /** The server refused it, so the played move still stands. */
  | 'rejected'
  /** A new position arrived, which the previous advice does not describe. */
  | 'reset';

/**
 * Deliberately not a free-for-all: once a replacement turn is in flight the
 * preview cannot be dismissed or re-sent, which is what stops a double click
 * from replaying two turns.
 */
export function nextBetterMoveState(
  state: BetterMoveState,
  event: BetterMoveEvent,
): BetterMoveState {
  if (event === 'reset') return 'hidden';

  switch (state) {
    case 'hidden':
      return event === 'show' ? 'shown' : state;
    case 'shown':
      if (event === 'revert') return 'hidden';
      if (event === 'play') return 'playing';
      return state;
    case 'playing':
      if (event === 'settled') return 'played';
      if (event === 'rejected') return 'failed';
      return state;
    case 'failed':
      if (event === 'show') return 'shown';
      if (event === 'play') return 'playing';
      return state;
    case 'played':
      return state;
  }
}

/** True while the board should show the coach's play rather than the real one. */
export function isPreviewing(state: BetterMoveState): boolean {
  return state === 'shown' || state === 'playing';
}

/**
 * Whether the coach is offering a better move for the turn just played.
 *
 * Stronger players are only interrupted for bigger mistakes, which is what
 * "levelling up" means in practice. The engine's reply waits on this too: the
 * pause to consider the offer is only worth having when there is one.
 */
export function betterMoveOffered(
  analysis: TurnAnalysis | null,
  policy: CoachingPolicy,
): analysis is TurnAnalysis {
  return (
    analysis !== null &&
    analysis.equityLoss >= policy.alertThreshold &&
    analysis.played !== analysis.best
  );
}

export function applyMoves(board: Board, player: 'white' | 'black', moves: readonly Move[]): Board {
  return moves.reduce((next, move) => applyMove(next, player, move), board);
}

/** The position the coach's play would have produced, before any engine reply. */
export function previewBoard(analysis: TurnAnalysis): Board {
  return applyMoves(analysis.boardBefore, analysis.player, analysis.bestMoves);
}

/** Slots the coach's play lands on, so they can be picked out on the board. */
export function previewDestinations(analysis: TurnAnalysis): Set<number> {
  return new Set(analysis.bestMoves.map((move) => move.to));
}
