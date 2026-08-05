import {
  type Board,
  type Player,
  checkersAt,
  distanceToOff,
  homeSlots,
  isRace,
  opponent,
  pipCount,
  winnerOf,
} from '@bg/rules';
import { type Evaluator } from './evaluator.js';
import { shotsAgainst } from './shots.js';

const WEIGHTS = {
  /** Equity per pip of lead, before the sigmoid. */
  pipLead: 0.028,
  /** Penalty per expected pip lost to being hit. */
  blotDanger: 0.030,
  homeBoardPoint: 0.10,
  primeLength: 0.11,
  anchorInOpponentHome: 0.16,
  checkerOnBar: 0.55,
  borneOff: 0.07,
  /** Penalty for checkers stuck deep in the opponent's home board. */
  trappedBackChecker: 0.05,
  /** Penalty per checker beyond three on a single point. */
  stack: 0.03,
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

/** Points held with two or more checkers inside the opponent's home board. */
function anchors(board: Board, player: Player): number {
  let count = 0;
  for (const slot of homeSlots(opponent(player))) {
    if (checkersAt(board, player, slot) >= 2) count += 1;
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
function positionalScore(board: Board, player: Player): number {
  return (
    WEIGHTS.homeBoardPoint * homeBoardPoints(board, player) +
    WEIGHTS.primeLength * Math.max(0, longestPrime(board, player) - 2) +
    WEIGHTS.anchorInOpponentHome * anchors(board, player) +
    WEIGHTS.borneOff * board.off[player] -
    WEIGHTS.blotDanger * blotExposure(board, player) -
    WEIGHTS.checkerOnBar * board.bar[player] -
    WEIGHTS.trappedBackChecker * trappedBackCheckers(board, player) -
    WEIGHTS.stack * stackWaste(board, player)
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
function raceEquity(board: Board, player: Player): number {
  const mine = pipCount(board, player);
  const theirs = pipCount(board, opponent(player));
  const lead = theirs - mine;
  const scale = Math.max(20, (mine + theirs) / 4);
  return squash((lead / scale) * 1.6 + WEIGHTS.borneOff * (board.off[player] - board.off[opponent(player)]));
}

/**
 * Tier-1 hand-tuned evaluator. Fast, allocation-light and good enough for a
 * strong club-level opponent once wrapped in the 2-ply search.
 */
export const heuristicEvaluator: Evaluator = (board, player) => {
  const winner = winnerOf(board);
  if (winner !== null) {
    const loser = opponent(winner);
    const multiplier = board.off[loser] > 0 ? 1 : 2;
    return winner === player ? multiplier : -multiplier;
  }

  if (isRace(board)) return raceEquity(board, player);

  const foe = opponent(player);
  const pipLead = pipCount(board, foe) - pipCount(board, player);
  const score =
    WEIGHTS.pipLead * pipLead + positionalScore(board, player) - positionalScore(board, foe);

  return squash(score);
};

/** Rough win probability implied by a cubeless equity. Used for cube decisions. */
export function winProbability(equity: number): number {
  return Math.min(1, Math.max(0, (equity + 1) / 2));
}
