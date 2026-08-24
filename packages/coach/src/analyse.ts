import {
  type Board,
  type Dice,
  type Move,
  type Player,
  boardKey,
  findTurn,
  formatTurn,
} from '@bg/rules';
import { type RankedTurn, type SearchOptions, rankTurns } from '@bg/ai';
import { type Severity, classifyEquityLoss } from './classify.js';
import { type GamePhase, phaseOf } from './phase.js';
import type { Concept } from './concepts.js';
import { explainDifference } from './explain.js';

export interface TurnAnalysis {
  readonly player: Player;
  readonly dice: Dice;
  readonly played: string;
  readonly best: string;
  /** The position the turn was played from, so the better play can be shown. */
  readonly boardBefore: Board;
  readonly playedMoves: readonly Move[];
  readonly bestMoves: readonly Move[];
  readonly playedEquity: number;
  readonly bestEquity: number;
  readonly equityLoss: number;
  readonly severity: Severity;
  readonly phase: GamePhase;
  readonly explanation: string;
  /** Concepts the best play achieved and this one did not. */
  readonly missed: readonly Concept[];
  /** Downsides this play incurred that the best play avoided. */
  readonly incurred: readonly Concept[];
}

/** Analysis depth for review. Deeper than live play, because it is off the hot path. */
export const REVIEW_SEARCH: SearchOptions = { plies: 2, candidateWidth: 12 };

function findRanked(ranked: readonly RankedTurn[], board: Board): RankedTurn | undefined {
  const key = boardKey(board);
  return ranked.find((r) => boardKey(r.turn.board) === key);
}

/**
 * Compare a played turn against the engine's best.
 *
 * Returns null when the move sequence was not legal, which the caller should
 * treat as a bug rather than a coaching opportunity.
 */
export function analyseTurn(
  before: Board,
  player: Player,
  dice: Dice,
  moves: readonly Move[],
  options: SearchOptions = REVIEW_SEARCH,
): TurnAnalysis | null {
  const playedTurn = findTurn(before, player, dice, moves);
  if (playedTurn === null) return null;

  const ranked = rankTurns(before, player, dice, options);
  const best = ranked[0];
  if (best === undefined) return null;

  const played = findRanked(ranked, playedTurn.board) ?? { turn: playedTurn, equity: best.equity };
  const equityLoss = Math.max(0, best.equity - played.equity);

  const difference = explainDifference(before, playedTurn.board, best.turn.board, player);

  return {
    player,
    dice,
    played: formatTurn(player, playedTurn.moves),
    best: formatTurn(player, best.turn.moves),
    boardBefore: before,
    playedMoves: playedTurn.moves,
    bestMoves: best.turn.moves,
    playedEquity: played.equity,
    bestEquity: best.equity,
    equityLoss,
    severity: classifyEquityLoss(equityLoss),
    phase: phaseOf(before, player),
    explanation: difference.text,
    missed: difference.gains,
    incurred: difference.costs,
  };
}
