import type { Player } from '@bg/rules';

/** The subset of a `moves` row that decides what the client is shown and what a take-back undoes. */
export interface LoggedTurn {
  readonly seq: number;
  readonly game: number;
  readonly player: string;
  readonly notation: string;
}

/**
 * Selection over the move log. Both functions are scoped to a single game:
 * the log spans a whole match, and a finished game's turns must not leak into
 * the next one — as the opponent's apparent reply, or as something a take-back
 * could unwind.
 *
 * `rows` are newest first, as the queries return them.
 */
export function lastTurnBy<T extends LoggedTurn>(
  rows: readonly T[],
  player: Player,
  game: number,
): T | null {
  return rows.find((row) => row.game === game && row.player === player) ?? null;
}

/** The opponent's turns since the player's last one, oldest first. */
export function opponentTurnsSince(
  rows: readonly LoggedTurn[],
  player: Player,
  game: number,
): string[] {
  const plays: string[] = [];
  for (const row of rows) {
    if (row.game !== game) break;
    if (row.player === player) break;
    plays.unshift(row.notation);
  }
  return plays;
}
