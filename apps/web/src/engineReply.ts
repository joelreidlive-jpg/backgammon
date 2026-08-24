import type { MatchView, TurnAnalysis } from '@bg/protocol';
import { type BetterMoveState, betterMoveOffered, isPreviewing } from './betterMove.js';

export type ReplyTiming =
  /** The engine owes no reply. */
  | { readonly reply: 'none' }
  /** Held until the player has answered the coach, one way or another. */
  | { readonly reply: 'hold' }
  /** Asked for after this long. */
  | { readonly reply: 'after'; readonly ms: number };

/**
 * When to ask the engine for its reply.
 *
 * The reply is no longer part of submitting a turn, because a turn the coach
 * is about to offer to replace cannot have been answered yet: the engine's
 * dice would have to be un-rolled to allow the replacement. So the browser
 * decides when the answer is due. Whenever the coach has something to say the
 * reply is held outright rather than merely delayed: a coaching game that
 * moves on while you are still reading its advice has not coached you.
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

  return betterMoveOffered(analysis, view.policy) ? { reply: 'hold' } : { reply: 'after', ms: 0 };
}

/**
 * Asks for the reply once per position, at the moment it falls due.
 *
 * A position stops counting as answered when its wait is cancelled — asking to
 * see the coach's play does exactly that — because otherwise going back to
 * your own move would leave the reply owed and never requested, and the game
 * with nobody to move.
 */
export class ReplyScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private position = '';

  /** Wait `ms` and then ask, unless this position has already been asked for. */
  schedule(position: string, ms: number, ask: () => void): void {
    if (this.position === position) return;
    this.cancel();
    this.position = position;
    this.timer = setTimeout(() => {
      this.timer = null;
      ask();
    }, ms);
  }

  /** Abandon a wait that has not yet asked. */
  cancel(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.position = '';
  }
}
