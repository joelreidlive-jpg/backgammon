import { type Board, type Dice, type Player, type Turn, formatTurn, legalTurns, parseXgid } from '@bg/rules';
import type { Concept, GamePhase } from '@bg/coach';

/**
 * One benchmark problem: a position, a roll, and the play an authority says is
 * best. Only facts are stored — position, roll, play, and our own tags. No
 * third-party prose, so a set can be assembled from any source and still be
 * ours to ship.
 */
export interface BenchmarkPosition {
  readonly id: string;
  readonly xgid: string;
  /** Plays that count as correct, in standard notation, best first. */
  readonly best: readonly string[];
  /**
   * Where the answer comes from, so a disputed problem can be traced back.
   * `computed` means this repository derived it exactly rather than copying it.
   */
  readonly source: 'consensus' | 'computed' | 'engine' | 'user';
  readonly tags: readonly Concept[];
  /** Free-text note in our own words. Never an excerpt. */
  readonly note?: string;
}

export interface LoadedPosition extends BenchmarkPosition {
  readonly board: Board;
  readonly player: Player;
  readonly dice: Dice;
  readonly legal: readonly Turn[];
  /** The legal turns matching `best`, resolved from notation. */
  readonly bestTurns: readonly Turn[];
  readonly phase?: GamePhase;
}

/**
 * Notation is ambiguous on its own — "13/11 24/23" and "24/23 13/11" are the
 * same play — so plays are matched by normalising both sides through
 * `formatTurn` on the enumerated legal turns rather than by parsing text.
 */
function canonical(play: string): string {
  return play.trim().split(/\s+/).sort().join(' ');
}

export function load(position: BenchmarkPosition): LoadedPosition {
  const parsed = parseXgid(position.xgid);
  if (!parsed.dice) throw new Error(`${position.id}: XGID has no roll`);

  const legal = legalTurns(parsed.board, parsed.turn, parsed.dice);
  const byNotation = new Map<string, Turn>();
  for (const turn of legal) byNotation.set(canonical(formatTurn(parsed.turn, turn.moves)), turn);

  const bestTurns = position.best.map((play) => {
    const turn = byNotation.get(canonical(play));
    if (!turn) {
      throw new Error(
        `${position.id}: "${play}" is not a legal turn. Legal plays: ${[...byNotation.keys()].join(', ')}`,
      );
    }
    return turn;
  });

  return {
    ...position,
    board: parsed.board,
    player: parsed.turn,
    dice: parsed.dice,
    legal,
    bestTurns,
  };
}
