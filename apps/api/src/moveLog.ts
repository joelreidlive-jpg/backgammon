import type { Dice, Player } from '@bg/rules';
import type { AiPlay } from '@bg/protocol';

/** The subset of a `moves` row that decides what the client is shown and what a take-back undoes. */
export interface LoggedTurn {
  readonly seq: number;
  readonly game: number;
  readonly player: string;
  /** The roll as stored: a JSON pair. */
  readonly dice: string;
  readonly notation: string;
}

function parseDice(stored: string): Dice {
  const parsed: unknown = JSON.parse(stored);
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== 'number' ||
    typeof parsed[1] !== 'number'
  ) {
    throw new Error('malformed dice in the move log');
  }
  return [parsed[0], parsed[1]];
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
): AiPlay[] {
  const plays: AiPlay[] = [];
  for (const row of rows) {
    if (row.game !== game) break;
    if (row.player === player) break;
    plays.unshift({ dice: parseDice(row.dice), notation: row.notation });
  }
  return plays;
}
