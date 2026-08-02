import { type Board, type Dice, type Player, type Turn, legalTurns, opponent, winnerOf } from '@bg/rules';
import { type Evaluator } from './evaluator.js';
import { heuristicEvaluator } from './heuristic.js';

export interface RankedTurn {
  readonly turn: Turn;
  /** Cubeless equity for the side that played the turn. */
  readonly equity: number;
}

export interface SearchOptions {
  /** 1 = static evaluation of each turn, 2 = expectimax over the opponent's reply. */
  readonly plies?: 1 | 2;
  /** How many 1-ply candidates survive into the 2-ply pass. */
  readonly candidateWidth?: number;
  readonly evaluator?: Evaluator;
}

interface WeightedRoll {
  readonly dice: Dice;
  readonly weight: number;
}

/** The 21 distinct rolls; doubles occur half as often as mixed rolls. */
export const ROLLS: readonly WeightedRoll[] = (() => {
  const rolls: WeightedRoll[] = [];
  for (let high = 1; high <= 6; high++) {
    for (let low = 1; low <= high; low++) {
      rolls.push({ dice: [high, low], weight: high === low ? 1 / 36 : 2 / 36 });
    }
  }
  return rolls;
})();

/**
 * Expected equity for `player` after the opponent replies optimally, averaged
 * over every roll they might get.
 */
function expectedAfterReply(board: Board, player: Player, evaluate: Evaluator): number {
  if (winnerOf(board) !== null) return evaluate(board, player);

  const foe = opponent(player);
  let expected = 0;

  for (const { dice, weight } of ROLLS) {
    const replies = legalTurns(board, foe, dice);
    let bestForFoe = -Infinity;
    for (const reply of replies) {
      const value = evaluate(reply.board, foe);
      if (value > bestForFoe) bestForFoe = value;
    }
    expected += weight * (bestForFoe === -Infinity ? evaluate(board, foe) : bestForFoe);
  }

  // Zero-sum: what is good for the opponent is bad for the player.
  return -expected;
}

/**
 * Every legal turn, ranked best-first by equity for `player`.
 *
 * This is the single source of truth for both move selection and coaching —
 * the coach reads the same ranking the engine used to choose its own play.
 */
export function rankTurns(
  board: Board,
  player: Player,
  dice: Dice,
  options: SearchOptions = {},
): RankedTurn[] {
  const { plies = 2, candidateWidth = 8, evaluator = heuristicEvaluator } = options;

  const turns = legalTurns(board, player, dice);
  const shallow = turns
    .map((turn) => ({ turn, equity: evaluator(turn.board, player) }))
    .sort((a, b) => b.equity - a.equity);

  if (plies === 1 || shallow.length <= 1) return shallow;

  const searched = shallow
    .slice(0, candidateWidth)
    .map(({ turn }) => ({ turn, equity: expectedAfterReply(turn.board, player, evaluator) }))
    .sort((a, b) => b.equity - a.equity);

  // Candidates the 1-ply filter discarded keep their shallow scores and stay
  // ranked below the searched ones, so the list is still complete for coaching.
  const searchedTurns = new Set(searched.map((r) => r.turn));
  const rest = shallow.filter((r) => !searchedTurns.has(r.turn));
  const floor = searched.length > 0 ? searched[searched.length - 1].equity : 0;
  return [...searched, ...rest.map((r) => ({ turn: r.turn, equity: Math.min(r.equity, floor) }))];
}

export function bestTurn(board: Board, player: Player, dice: Dice, options?: SearchOptions): RankedTurn | null {
  const ranked = rankTurns(board, player, dice, options);
  return ranked[0] ?? null;
}
