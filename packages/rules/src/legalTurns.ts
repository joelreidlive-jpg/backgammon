import { type Board, type Player, boardKey } from './board.js';
import { type Move, applyMove, movesForDie } from './moves.js';

/** A complete turn: the sequence of checker moves plus the resulting position. */
export interface Turn {
  readonly moves: readonly Move[];
  readonly board: Board;
}

export type Dice = readonly [number, number];

/** Doubles are played four times. */
export function diceToPlay(dice: Dice): number[] {
  return dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
}

interface Candidate {
  moves: Move[];
  board: Board;
  usedDice: number[];
}

function explore(
  board: Board,
  player: Player,
  remaining: number[],
  moves: Move[],
  usedDice: number[],
  out: Candidate[],
): void {
  let extended = false;
  const tried = new Set<number>();

  for (let i = 0; i < remaining.length; i++) {
    const die = remaining[i];
    if (tried.has(die)) continue;
    tried.add(die);

    const options = movesForDie(board, player, die);
    if (options.length === 0) continue;
    extended = true;

    const rest = remaining.slice(0, i).concat(remaining.slice(i + 1));
    for (const move of options) {
      moves.push(move);
      usedDice.push(die);
      explore(applyMove(board, player, move), player, rest, moves, usedDice, out);
      moves.pop();
      usedDice.pop();
    }
  }

  if (!extended) out.push({ moves: moves.slice(), board, usedDice: usedDice.slice() });
}

/**
 * Every legal turn for a roll, with the two rules that make backgammon turn
 * generation non-obvious applied:
 *
 *   1. You must play as many dice as possible.
 *   2. If exactly one die can be played and the dice differ, you must play the
 *      higher one when doing so is legal.
 *
 * Every ordering is kept, including ones that reach a position another
 * ordering also reaches: a player building a turn a click at a time takes one
 * particular route to a position, and only the route they took tells you what
 * they may click next.
 */
export function legalTurnSequences(board: Board, player: Player, dice: Dice): Turn[] {
  const candidates: Candidate[] = [];
  explore(board, player, diceToPlay(dice), [], [], candidates);

  const maxMoves = candidates.reduce((max, c) => Math.max(max, c.moves.length), 0);
  if (maxMoves === 0) return [{ moves: [], board }];

  let viable = candidates.filter((c) => c.moves.length === maxMoves);

  if (maxMoves === 1 && dice[0] !== dice[1]) {
    const higher = Math.max(dice[0], dice[1]);
    const playsHigher = viable.filter((c) => c.usedDice[0] === higher);
    if (playsHigher.length > 0) viable = playsHigher;
  }

  return viable.map((c) => ({ moves: c.moves, board: c.board }));
}

/**
 * The distinct plays available: turns reaching an identical position are
 * collapsed into one, so a chooser (the engine, the coach) sees each play once.
 */
export function legalTurns(board: Board, player: Player, dice: Dice): Turn[] {
  const viable = legalTurnSequences(board, player, dice);

  const seen = new Set<string>();
  const turns: Turn[] = [];
  for (const candidate of viable) {
    const key = boardKey(candidate.board);
    if (seen.has(key)) continue;
    seen.add(key);
    turns.push(candidate);
  }
  return turns;
}

function moveSequence(moves: readonly Move[]): string {
  return moves.map((m) => `${m.from}/${m.to}`).join(' ');
}

function moveMultiset(moves: readonly Move[]): string {
  return moves
    .map((m) => `${m.from}/${m.to}`)
    .sort()
    .join(' ');
}

/**
 * Resolve a client-submitted move sequence to a legal turn, or null if it is
 * not legal. Clients may submit the moves in any equivalent order, and by any
 * route: 17/13 13/11 is the same play as 17/15 15/11.
 */
export function findTurn(board: Board, player: Player, dice: Dice, moves: readonly Move[]): Turn | null {
  const legal = legalTurnSequences(board, player, dice);
  const ordered = moveSequence(moves);
  const exact = legal.find((t) => moveSequence(t.moves) === ordered);
  if (exact) return exact;

  const multiset = moveMultiset(moves);
  return legal.find((t) => moveMultiset(t.moves) === multiset) ?? null;
}
