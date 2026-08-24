import type { MatchView } from '@bg/protocol';

/**
 * A stored match is resumed silently after a reload, which is the common case
 * and should not be interrupted. Left alone for longer than this, though, the
 * player has moved on: coming back to a board mid-game with no warning reads
 * as the game having played itself.
 */
export const RESUME_PROMPT_AFTER_MS = 2 * 60 * 60 * 1000;

/** Whether the restored match should be offered rather than simply resumed. */
export function shouldPromptResume(view: MatchView, idleMs: number | null): boolean {
  if (view.state.phase === 'game-over' || view.state.phase === 'match-over') return false;
  return idleMs === null || idleMs >= RESUME_PROMPT_AFTER_MS;
}

/** Names the stored match well enough to recognise it. */
export function describeResume(view: MatchView): string {
  const { state, seat } = view;
  const opponent = seat === 'white' ? 'black' : 'white';
  const length = state.matchLength > 1 ? `match to ${state.matchLength}` : 'single game';
  return `Game ${state.gameNumber} of a ${length}, you ${state.score[seat]} — ${state.score[opponent]}`;
}
