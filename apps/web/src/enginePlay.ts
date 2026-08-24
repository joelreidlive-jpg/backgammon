import type { AiPlay } from '@bg/protocol';
import type { Board, Player } from '@bg/rules';
import { applyMove } from '@bg/rules';

/** How long a moved checker is held on the board, pulsing, before the next one goes. */
export const PULSE_MS = 1000;

/** One checker of the engine's reply, and the position it lands in. */
export interface ReplayStep {
  readonly board: Board;
  /** The slot the checker landed on, which pulses while the step is shown. */
  readonly pulse: number;
}

/**
 * The engine's reply broken into one position per checker it moved. Played out
 * in order, a multi-move turn reads as separate moves rather than the board
 * changing all at once. The last step is the position the server already sent,
 * so ending the replay does not move anything.
 */
export function enginePlaySteps(plays: readonly AiPlay[], engine: Player): ReplayStep[] {
  const steps: ReplayStep[] = [];
  for (const play of plays) {
    let board = play.board;
    for (const move of play.moves) {
      board = applyMove(board, engine, move);
      steps.push({ board, pulse: move.to });
    }
  }
  return steps;
}
