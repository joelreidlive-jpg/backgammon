import {
  type Board,
  type Player,
  checkersAt,
  direction,
  distanceToOff,
  homeSlots,
  isRace,
  opponent,
  pipCount,
  winnerOf,
} from '@bg/rules';
import { type Evaluator } from './evaluator.js';
import { shotsAgainst } from './shots.js';

export interface HeuristicWeights {
  pipLead: number;
  blotDanger: number;
  homeBoardPoint: number;
  primeLength: number;
  checkerOnBar: number;
  borneOff: number;
  trappedBackChecker: number;
  stack: number;
  builder: number;
}

/**
 * Tuned against `@bg/bench`: every value here is a claim that can be checked
 * by running the benchmark, not a matter of taste.
 */
export const DEFAULT_WEIGHTS: HeuristicWeights = {
  /** Equity per pip of lead, before the sigmoid. */
  pipLead: 0.025,
  /** Penalty per expected pip lost to being hit. */
  blotDanger: 0.020,
  homeBoardPoint: 0.10,
  primeLength: 0.11,
  checkerOnBar: 0.14,
  borneOff: 0.07,
  /** Penalty for checkers stuck deep in the opponent's home board. */
  trappedBackChecker: 0.05,
  /** Penalty per checker beyond three on a single point. */
  stack: 0.04,
  /** Reward per spare checker bearing on a point worth making. */
  builder: 0.035,
};

function longestPrime(board: Board, player: Player): number {
  let longest = 0;
  let run = 0;
  for (let slot = 1; slot <= 24; slot++) {
    if (checkersAt(board, player, slot) >= 2) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  return longest;
}

function homeBoardPoints(board: Board, player: Player): number {
  let made = 0;
  for (const slot of homeSlots(player)) {
    if (checkersAt(board, player, slot) >= 2) made += 1;
  }
  return made;
}

/**
 * Anchors are worth what they block and how much of the board they leave to
 * play with, so their value peaks on the opponent's five point and falls away
 * sharply towards their ace point. A flat bonus made the starting 24-point
 * "anchor" as valuable as the golden one, which is why the engine would never
 * split: it was paid to sit still.
 *
 * Indexed by pips from the opponent's ace point: their 1 point ... 6 point.
 */
const ANCHOR_VALUE: readonly number[] = [0.02, 0.05, 0.10, 0.15, 0.20, 0.16];

function anchorValue(board: Board, player: Player): number {
  let value = 0;
  for (const slot of homeSlots(opponent(player))) {
    if (checkersAt(board, player, slot) < 2) continue;
    // distanceToOff for the *opponent* names the point as they would: 1..6.
    value += ANCHOR_VALUE[distanceToOff(opponent(player), slot) - 1] ?? 0;
  }
  return value;
}

/**
 * Spare checkers that bear on a point worth making, counted once per spare.
 *
 * Without this the evaluator only ever saw the downside of unstacking — the
 * blot — and never the upside, so it buried both dice in one safe checker and
 * left itself nothing to play with. A spare in range of the five point is the
 * reason to accept a shot in the opening.
 */
function builders(board: Board, player: Player): number {
  const targets = homeSlots(player)
    .concat(player === 'white' ? [7, 8] : [18, 17])
    .filter((slot) => checkersAt(board, player, slot) < 2);
  if (targets.length === 0) return 0;

  let count = 0;
  for (let slot = 1; slot <= 24; slot++) {
    const here = checkersAt(board, player, slot);
    // A lone checker in the outfield is a builder as much as a spare is; the
    // risk it runs is already priced by `blotExposure`.
    const spares = here === 1 ? 1 : here - 2;
    if (spares <= 0) continue;
    const reaches = targets.some((target) => {
      const pips = (slot - target) * -direction(player);
      return pips >= 1 && pips <= 6;
    });
    if (reaches) count += Math.min(spares, 2);
  }
  return count;
}

/** Expected pips lost this exchange to blots being hit. */
function blotExposure(board: Board, player: Player): number {
  let exposure = 0;
  for (let slot = 1; slot <= 24; slot++) {
    if (checkersAt(board, player, slot) !== 1) continue;
    const shots = shotsAgainst(board, player, slot);
    if (shots === 0) continue;
    const pipsLost = 25 - distanceToOff(player, slot);
    exposure += (shots / 36) * pipsLost;
  }
  return exposure;
}

function trappedBackCheckers(board: Board, player: Player): number {
  let count = 0;
  for (const slot of homeSlots(opponent(player))) {
    count += checkersAt(board, player, slot);
  }
  return count + board.bar[player];
}

function stackWaste(board: Board, player: Player): number {
  let waste = 0;
  for (let slot = 1; slot <= 24; slot++) {
    const n = checkersAt(board, player, slot);
    if (n > 3) waste += n - 3;
  }
  return waste;
}

/** One-sided positional score; the evaluator uses the difference of two. */
function positionalScore(board: Board, player: Player, weights: HeuristicWeights): number {
  return (
    weights.homeBoardPoint * homeBoardPoints(board, player) +
    weights.primeLength * Math.max(0, longestPrime(board, player) - 2) +
    anchorValue(board, player) +
    weights.builder * builders(board, player) +
    weights.borneOff * board.off[player] -
    weights.blotDanger * blotExposure(board, player) -
    weights.checkerOnBar * board.bar[player] -
    weights.trappedBackChecker * trappedBackCheckers(board, player) -
    weights.stack * stackWaste(board, player)
  );
}

/** Squash an unbounded score into a plausible cubeless equity. */
function squash(score: number): number {
  return Math.tanh(score);
}

/**
 * Pure race positions are decided by pips alone, so evaluate them directly
 * rather than through the contact features, which are meaningless once the
 * sides have passed each other.
 */
function raceEquity(board: Board, player: Player, weights: HeuristicWeights): number {
  const mine = pipCount(board, player);
  const theirs = pipCount(board, opponent(player));
  const lead = theirs - mine;
  const scale = Math.max(20, (mine + theirs) / 4);
  return squash((lead / scale) * 1.6 + weights.borneOff * (board.off[player] - board.off[opponent(player)]));
}

/**
 * Tier-1 hand-tuned evaluator. Fast, allocation-light and good enough for a
 * strong club-level opponent once wrapped in the 2-ply search.
 *
 * Built from a weight set so the benchmark can sweep candidate weights without
 * editing the source.
 */
export function createHeuristicEvaluator(
  overrides: Partial<HeuristicWeights> = {},
): Evaluator {
  const weights = { ...DEFAULT_WEIGHTS, ...overrides };
  return (board, player) => {
    const winner = winnerOf(board);
    if (winner !== null) {
      const loser = opponent(winner);
      const multiplier = board.off[loser] > 0 ? 1 : 2;
      return winner === player ? multiplier : -multiplier;
    }

    if (isRace(board)) return raceEquity(board, player, weights);

    const foe = opponent(player);
    const pipLead = pipCount(board, foe) - pipCount(board, player);
    const score =
      weights.pipLead * pipLead +
      positionalScore(board, player, weights) -
      positionalScore(board, foe, weights);

    return squash(score);
  };
}

export const heuristicEvaluator: Evaluator = createHeuristicEvaluator();

/** Rough win probability implied by a cubeless equity. Used for cube decisions. */
export function winProbability(equity: number): number {
  return Math.min(1, Math.max(0, (equity + 1) / 2));
}
