import { type Board, type Player } from '@bg/rules';

/**
 * Cubeless equity for `player`, in points. Must be antisymmetric:
 * `evaluate(board, 'white') === -evaluate(board, 'black')`.
 *
 * Every strength tier implements this one function, so swapping a hand-tuned
 * heuristic for a trained network never touches search, the API or the coach.
 */
export type Evaluator = (board: Board, player: Player) => number;
