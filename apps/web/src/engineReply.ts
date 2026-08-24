import type { MatchView, TurnAnalysis } from '@bg/protocol';
import { type BetterMoveState, betterMoveOffered, isPreviewing } from './betterMove.js';

/**
 * How long the engine is held back after a turn the coach has something to say
 * about — long enough to reach for "show me the better move", short enough not
 * to feel like the game has stalled.
 */
export const COACH_PAUSE_MS = 2000;

export type ReplyTiming =
  /** The engine owes no reply. */
  | { readonly reply: 'none' }
  /** Held until the player has answered the coach's offer. */
  | { readonly reply: 'hold' }
  /** Asked for after this long. */
  | { readonly reply: 'after'; readonly ms: number };

/**
 * When to ask the engine for its reply.
 *
 * The reply is no longer part of submitting a turn, because a turn the coach
 * is about to offer to replace cannot have been answered yet: the engine's
 * dice would have to be un-rolled to allow the replacement. So the browser
 * decides when the answer is due, and the pause exists to give the player time
 * to ask for the better move before the game moves on.
 */
export function replyTiming(
  view: MatchView,
  betterMove: BetterMoveState,
  /** True once the player has taken the coach's move or kept their own. */
  decided: boolean,
  analysis: TurnAnalysis | null = view.lastAnalysis,
): ReplyTiming {
  const { turn, phase } = view.state;
  if (turn === view.seat) return { reply: 'none' };
  // A double is the engine's move, but it is waiting on the player, not on us.
  if (phase === 'game-over' || phase === 'match-over' || phase === 'respond-to-double') {
    return { reply: 'none' };
  }

  if (isPreviewing(betterMove)) return { reply: 'hold' };
  if (decided || betterMove === 'played') return { reply: 'after', ms: 0 };

  return {
    reply: 'after',
    ms: betterMoveOffered(analysis, view.policy) ? COACH_PAUSE_MS : 0,
  };
}
