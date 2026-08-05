import { type Board, type Player } from './board.js';
import { type Dice, diceToPlay, legalTurns } from './legalTurns.js';
import { type Move, applyMove, movesForDie } from './moves.js';

/**
 * Incremental turn construction for a UI: a player clicks one checker at a
 * time, but legality is a property of the whole turn. Every step is validated
 * against the full set of legal turns, so a partial sequence can never lead
 * into a dead end that the server would reject.
 */
export interface TurnBuilder {
  readonly origin: Board;
  readonly player: Player;
  readonly dice: Dice;
  readonly pending: readonly Move[];
  /** The position as it currently looks, with `pending` applied. */
  readonly board: Board;
  /** Single moves that keep at least one legal turn reachable. */
  readonly options: readonly Move[];
  /** True when `pending` is itself a complete legal turn. */
  readonly complete: boolean;
}

function moveKey(move: Move): string {
  return `${move.from}/${move.to}`;
}

/** Remove `pending` from `moves` by value, or return null if it is not contained. */
function subtract(moves: readonly Move[], pending: readonly Move[]): Move[] | null {
  const rest = [...moves];
  for (const move of pending) {
    const index = rest.findIndex((m) => m.from === move.from && m.to === move.to);
    if (index === -1) return null;
    rest.splice(index, 1);
  }
  return rest;
}

function build(origin: Board, player: Player, dice: Dice, pending: readonly Move[]): TurnBuilder {
  let board = origin;
  for (const move of pending) board = applyMove(board, player, move);

  const candidates = legalTurns(origin, player, dice)
    .map((turn) => ({ turn, rest: subtract(turn.moves, pending) }))
    .filter((entry): entry is { turn: (typeof entry)['turn']; rest: Move[] } => entry.rest !== null);

  const playableNow = new Map<string, Move>();
  for (const die of new Set(diceToPlay(dice))) {
    for (const move of movesForDie(board, player, die)) playableNow.set(moveKey(move), move);
  }

  const options = new Map<string, Move>();
  for (const { rest } of candidates) {
    for (const move of rest) {
      const playable = playableNow.get(moveKey(move));
      if (playable) options.set(moveKey(move), playable);
    }
  }

  return {
    origin,
    player,
    dice,
    pending,
    board,
    options: [...options.values()],
    complete: candidates.some(({ rest }) => rest.length === 0),
  };
}

export function startTurn(board: Board, player: Player, dice: Dice): TurnBuilder {
  return build(board, player, dice, []);
}

/** Extend the turn. Returns the unchanged builder if the move is not an option. */
export function extendTurn(builder: TurnBuilder, move: Move): TurnBuilder {
  const option = builder.options.find((m) => m.from === move.from && m.to === move.to);
  if (!option) return builder;
  return build(builder.origin, builder.player, builder.dice, [...builder.pending, option]);
}

export function undoLastMove(builder: TurnBuilder): TurnBuilder {
  if (builder.pending.length === 0) return builder;
  return build(builder.origin, builder.player, builder.dice, builder.pending.slice(0, -1));
}

export function resetTurn(builder: TurnBuilder): TurnBuilder {
  return build(builder.origin, builder.player, builder.dice, []);
}

/** Destinations reachable from a given slot in the current partial turn. */
export function destinationsFrom(builder: TurnBuilder, from: number): Move[] {
  return builder.options.filter((move) => move.from === from);
}
