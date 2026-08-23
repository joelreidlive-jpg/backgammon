import { type Board, type Player, opponent, parseXgid } from '@bg/rules';
import {
  type CubeAdvice,
  type CubeOffer,
  type CubeReply,
  type ResultDistribution,
  cubeAdvice,
  invert,
  shapeOf,
} from '@bg/ai';
import { type GamePhase, type Severity, classifyEquityLoss } from '@bg/coach';
import type { Provenance, Tier } from './problem.js';

/**
 * Which cube question is being asked. `offer` is the player's own decision
 * with the cube available; `respond` is the answer to a double already made.
 */
export type CubeQuestion = 'offer' | 'respond';

export type CubeAnswer = CubeOffer | CubeReply;

export const OFFER_ANSWERS: readonly CubeAnswer[] = ['no-double', 'double', 'too-good'];
export const REPLY_ANSWERS: readonly CubeAnswer[] = ['take', 'drop'];

export function answersFor(question: CubeQuestion): readonly CubeAnswer[] {
  return question === 'offer' ? OFFER_ANSWERS : REPLY_ANSWERS;
}

export interface CubeProblem {
  readonly id: string;
  /** Position and cube state. Carries no roll: the cube is decided before it. */
  readonly xgid: string;
  readonly question: CubeQuestion;
  readonly answer: CubeAnswer;
  readonly tier: Tier;
  readonly provenance: Provenance;
  readonly phase: GamePhase;
  /** Points the wrong answer costs, which is also what makes it hard. */
  readonly margin: number;
  /**
   * Rolled-out results from the side the question is put to. Kept with the
   * problem because the whole point of a cube exercise is to see afterwards
   * *why* it was a take — the gammon rate, not just the win rate.
   */
  readonly distribution: ResultDistribution;
}

export interface LoadedCubeProblem extends CubeProblem {
  readonly board: Board;
  /** The side being asked, which is not always the side on roll. */
  readonly player: Player;
  readonly cubeValue: number;
  readonly advice: CubeAdvice;
}

/**
 * A cube problem's stored answer is graded against the same model that
 * produced it, so loading recomputes the advice rather than storing equities
 * that could drift out of step with the model.
 *
 * For a `respond` problem the advice is computed from the doubler's side —
 * that is whose double is being priced — and the answer is their opponent's
 * reply to it.
 */
export function loadCube(problem: CubeProblem): LoadedCubeProblem {
  const parsed = parseXgid(problem.xgid);
  const player = problem.question === 'offer' ? parsed.turn : opponent(parsed.turn);
  const doubler = problem.question === 'offer' ? problem.distribution : invert(problem.distribution);

  return {
    ...problem,
    board: parsed.board,
    player,
    cubeValue: parsed.cube.value,
    advice: cubeAdvice(doubler, parsed.cube.owner === null ? 'centre' : 'player'),
  };
}

/** What the client may see before answering: everything except the answer. */
export interface CubePrompt {
  readonly kind: 'cube';
  readonly id: string;
  readonly question: CubeQuestion;
  readonly tier: Tier;
  readonly provenance: Provenance;
  readonly phase: GamePhase;
  readonly board: Board;
  readonly player: Player;
  readonly cubeValue: number;
  readonly answers: readonly CubeAnswer[];
}

export function cubePrompt(problem: LoadedCubeProblem): CubePrompt {
  return {
    kind: 'cube',
    id: problem.id,
    question: problem.question,
    tier: problem.tier,
    provenance: problem.provenance,
    phase: problem.phase,
    board: problem.board,
    player: problem.player,
    cubeValue: problem.cubeValue,
    answers: answersFor(problem.question),
  };
}

export interface CubeAttemptResult {
  readonly kind: 'cube';
  readonly problemId: string;
  readonly solved: boolean;
  readonly chosen: CubeAnswer;
  readonly best: CubeAnswer;
  /** Points the chosen answer gives up. Zero when it is right. */
  readonly equityLoss: number;
  readonly severity: Severity;
  readonly explanation: string;
  /** Win rate the rollout measured, from the side being asked. */
  readonly winProbability: number;
  /** Share of wins that are gammons or better, which is what prices the cube. */
  readonly gammonRate: number;
}

export const ANSWER_LABELS: Readonly<Record<CubeAnswer, string>> = {
  'no-double': 'no double',
  double: 'double',
  'too-good': 'too good to double',
  take: 'take',
  drop: 'drop',
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Why the answer is the answer, in the numbers that decided it.
 *
 * Deliberately quotes the rolled-out gammon rate rather than only the win
 * rate: a player who only ever looks at how often they win will get exactly
 * the cube decisions wrong that this exercise exists to teach.
 */
function explain(problem: LoadedCubeProblem, correct: boolean): string {
  const asked = shapeOf(problem.distribution);
  const { advice } = problem;
  const wins = percent(asked.winProbability);
  const gammons = percent(
    asked.winProbability > 0
      ? (problem.distribution.winGammon + problem.distribution.winBackgammon) /
          asked.winProbability
      : 0,
  );
  const lead = correct ? 'Correct.' : `The answer is ${ANSWER_LABELS[problem.answer]}.`;
  const shape = `You win ${wins} of the time here, and ${gammons} of those wins are gammons.`;

  if (problem.question === 'respond') {
    // The advice is priced from the doubler's side, so the responder's equity
    // for taking is the negative of it.
    const take = (-advice.doubleTake).toFixed(2);
    return `${lead} ${shape} Taking is worth ${take} against the −1.00 a drop concedes, so ${ANSWER_LABELS[problem.answer]} is the cheaper answer.`;
  }

  const hold = advice.noDouble.toFixed(2);
  const turned = Math.min(advice.doubleTake, advice.doublePass).toFixed(2);
  const reply = `Your opponent should ${ANSWER_LABELS[advice.reply]}.`;
  if (problem.answer === 'too-good') {
    return `${lead} ${shape} Cashing collects one point, but playing on is worth ${hold} — too good to double.`;
  }
  return `${lead} ${shape} Holding the cube is worth ${hold} and turning it ${turned}. ${reply}`;
}

/** Grade a cube answer against the problem's stored answer. */
export function gradeCube(problem: LoadedCubeProblem, chosen: CubeAnswer): CubeAttemptResult | null {
  if (!answersFor(problem.question).includes(chosen)) return null;

  const asked = shapeOf(problem.distribution);
  const solved = chosen === problem.answer;
  // Every wrong answer to a cube question costs the same thing — the margin
  // between the right action and the best of the rest — because there are only
  // ever two live alternatives once the position is priced.
  const equityLoss = solved ? 0 : problem.margin;

  return {
    kind: 'cube',
    problemId: problem.id,
    solved,
    chosen,
    best: problem.answer,
    equityLoss,
    severity: classifyEquityLoss(equityLoss),
    explanation: explain(problem, solved),
    winProbability: asked.winProbability,
    gammonRate:
      asked.winProbability > 0
        ? (problem.distribution.winGammon + problem.distribution.winBackgammon) /
          asked.winProbability
        : 0,
  };
}
