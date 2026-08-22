import { type Board, type Move, type Player, boardKey, findTurn, formatTurn } from '@bg/rules';
import { type RankedTurn, type SearchOptions, rankTurns } from '@bg/ai';
import {
  CONCEPT_LABELS,
  type Concept,
  type Severity,
  classifyEquityLoss,
  conceptsOf,
  explainDifference,
} from '@bg/coach';
import { type LoadedProblem, matchesBest } from './problem.js';

/**
 * Search depth for grading. Matches the review depth used elsewhere, so a play
 * the coach calls best in a game is not called an error in the trainer.
 */
export const TRAINER_SEARCH: SearchOptions = { plies: 2, candidateWidth: 12 };

/**
 * Equity within which a play counts as solving the problem even though it is
 * not the stored answer. Below this the two plays are indistinguishable to the
 * evaluator, so failing the player would be measuring its noise.
 */
export const NEAR_MISS = 0.02;

export interface AttemptResult {
  readonly kind: 'checker';
  readonly problemId: string;
  /** Whether the play is the stored answer or within `NEAR_MISS` of it. */
  readonly solved: boolean;
  /** Whether it is exactly the stored answer. */
  readonly exact: boolean;
  readonly played: string;
  readonly best: string;
  readonly equityLoss: number;
  readonly severity: Severity;
  readonly explanation: string;
  /** Concepts the answer realises that the played turn does not. */
  readonly missed: readonly Concept[];
  readonly concepts: readonly Concept[];
}

const DOWNSIDES = new Set<Concept>([
  'leavesBlot',
  'leavesBlotInOpponentHome',
  'breaksAnchor',
  'breaksHomeBoardPoint',
  'stacksCheckers',
]);

/** Why a correct play is correct, in the same concept vocabulary as the coach. */
function praise(before: Board, best: Board, player: Player): string {
  const gains = [...conceptsOf(before, best, player)].filter((c) => !DOWNSIDES.has(c));
  if (gains.length === 0) return 'Correct — this keeps the strongest structure available.';
  const labels = gains.slice(0, 2).map((c) => CONCEPT_LABELS[c]);
  return `Correct — this play ${labels.join(' and ')}.`;
}

function equityOf(ranked: readonly RankedTurn[], board: Board): number | null {
  const key = boardKey(board);
  return ranked.find((r) => boardKey(r.turn.board) === key)?.equity ?? null;
}

/**
 * Grade an attempt against the problem's stored answer.
 *
 * Equity is measured against the *stored* answer rather than whatever the
 * search likes today: on a consensus problem the engine may well disagree with
 * the expert play, and in that case the player should be marked against the
 * expert, not against the engine.
 */
export function gradeAttempt(
  problem: LoadedProblem,
  moves: readonly Move[],
  options: SearchOptions = TRAINER_SEARCH,
): AttemptResult | null {
  const playedTurn = findTurn(problem.board, problem.player, problem.dice, moves);
  if (playedTurn === null) return null;

  const ranked = rankTurns(problem.board, problem.player, problem.dice, options);
  const answer = problem.bestTurns[0];
  const answerEquity = equityOf(ranked, answer.board) ?? 0;
  const playedEquity = equityOf(ranked, playedTurn.board) ?? answerEquity;

  const exact = matchesBest(problem, playedTurn.board);
  const equityLoss = exact ? 0 : Math.max(0, answerEquity - playedEquity);
  const difference = explainDifference(problem.board, playedTurn.board, answer.board, problem.player);

  return {
    kind: 'checker',
    problemId: problem.id,
    solved: exact || equityLoss <= NEAR_MISS,
    exact,
    played: formatTurn(problem.player, playedTurn.moves),
    best: formatTurn(problem.player, answer.moves),
    equityLoss,
    severity: classifyEquityLoss(equityLoss),
    explanation: exact ? praise(problem.board, answer.board, problem.player) : difference.text,
    missed: difference.gains,
    concepts: problem.concepts,
  };
}
