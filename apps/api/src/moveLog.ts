import type { Board, Dice, MatchState, Player } from '@bg/rules';
import { boardKey, legalTurns } from '@bg/rules';
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

/** A logged turn with the positions it ran between, as stored: JSON states. */
export interface LoggedPlay extends LoggedTurn {
  readonly state_before: string;
  readonly state_after: string;
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
export function opponentTurnsSince<T extends LoggedTurn>(
  rows: readonly T[],
  player: Player,
  game: number,
): T[] {
  const turns: T[] = [];
  for (const row of rows) {
    if (row.game !== game) break;
    if (row.player === player) break;
    turns.unshift(row);
  }
  return turns;
}

function boardOf(stored: string): Board {
  return (JSON.parse(stored) as MatchState).board;
}

/**
 * A logged AI turn as the client replays it. The individual moves are
 * recovered by finding the legal turn that reaches the position the log says
 * was reached, so the log does not have to carry them: any order producing
 * that position animates the same play.
 */
export function replayedPlay(row: LoggedPlay, ai: Player): AiPlay {
  const dice = parseDice(row.dice);
  const board = boardOf(row.state_before);
  const reached = boardKey(boardOf(row.state_after));
  const played = legalTurns(board, ai, dice).find((turn) => boardKey(turn.board) === reached);
  return { dice, notation: row.notation, board, moves: played?.moves ?? [] };
}
