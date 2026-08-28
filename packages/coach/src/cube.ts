import { type Board, type Player, opponent } from '@bg/rules';
import {
  DOUBLE_POINT,
  TAKE_POINT,
  TOO_GOOD_POINT,
  equityAtWinProbability,
  expectedEquity,
  winProbabilityFromScore,
} from '@bg/ai';
import { type Severity, classifyEquityLoss } from './classify.js';
import { type GamePhase, phaseOf } from './phase.js';

/** What the player did with the cube. */
export type CubeChoice = 'no-double' | 'double' | 'take' | 'drop';

export type CubeMistake =
  | 'none'
  | 'missed-double'
  | 'premature-double'
  | 'too-good-to-double'
  /** Cash or play on, with no gammon estimate to separate them. */
  | 'undecided'
  | 'wrong-take'
  | 'wrong-drop';

/** Whether a graded cube decision was actually wrong. */
export function isCubeMistake(mistake: CubeMistake): boolean {
  return mistake !== 'none' && mistake !== 'undecided';
}

export interface CubeAnalysis {
  readonly choice: CubeChoice;
  readonly best: CubeChoice;
  readonly mistake: CubeMistake;
  readonly equityLoss: number;
  readonly severity: Severity;
  readonly winProbability: number;
  readonly phase: GamePhase;
  readonly explanation: string;
}

/** Cubeless equity at the threshold where turning the cube becomes correct. */
const DOUBLE_POINT_EQUITY = equityAtWinProbability(DOUBLE_POINT);
/** Cubeless equity, from the responder's side, at their take point. */
const TAKE_POINT_EQUITY = equityAtWinProbability(TAKE_POINT);

/** How far below the doubling threshold still counts as a live cube decision. */
const CUBE_WINDOW = 0.04;

/**
 * Cube equity.
 *
 * `equity` is the doubler's cubeless equity in points at the current cube
 * value. The naive model — a take is worth `2 · equity`, so double whenever you
 * are ahead — is wrong, because it ignores that the taker now *owns* the cube.
 * That option has value, and it is exactly why doubling at a small edge loses
 * money.
 *
 * So the cost of handing over the cube is priced as `DOUBLE_POINT_EQUITY`,
 * which makes doubling break even precisely at the engine's doubling threshold
 * and improve from there:
 *
 *     double − noDouble = (2E − E_dp) − E = E − E_dp
 *
 * Above the opponent's take point they drop instead, and the double is worth
 * exactly one point — which is also what makes a position *too good* to double
 * once playing on is worth more than that.
 */
function cubeEquities(equity: number): { noDouble: number; double: number; opponentTakes: boolean } {
  const opponentWinChance = 1 - winProbabilityFromScore(equity);
  const opponentTakes = opponentWinChance >= TAKE_POINT;
  return {
    noDouble: equity,
    double: opponentTakes ? 2 * equity - DOUBLE_POINT_EQUITY : 1,
    opponentTakes,
  };
}

/**
 * How strong the position is, in words. A percentage would read as a precise
 * number: the mapping from score to win chance is calibrated against rollouts,
 * but the score being mapped is still the heuristic's.
 */
const STRENGTH: readonly { readonly upTo: number; readonly text: string }[] = [
  // The take point is a band edge on purpose: "well behind" must not straddle
  // it, or the coach reads as contradicting its own verdict.
  { upTo: TAKE_POINT, text: 'well behind' },
  { upTo: 0.45, text: 'behind' },
  { upTo: 0.55, text: 'about level' },
  { upTo: 0.68, text: 'ahead' },
  { upTo: 0.8, text: 'well ahead' },
  { upTo: 1, text: 'winning comfortably' },
];

function describe(mistake: CubeMistake, p: number): string {
  const standing = STRENGTH.find((band) => p <= band.upTo)?.text ?? 'about level';
  switch (mistake) {
    case 'missed-double':
      return `You are ${standing} — strong enough to turn the cube. Leaving it costs you the extra point when the game runs your way.`;
    case 'premature-double':
      return `You are ${standing}, but not by enough. Doubling now hands your opponent a comfortable take and doubles the stake on a game you may still lose.`;
    case 'too-good-to-double':
      return `You are ${standing} — too good to double: your opponent simply drops and you collect one point, when playing on wins a gammon often enough to be worth more.`;
    case 'undecided':
      return `You are ${standing}, so your opponent drops any double: cashing collects one point while playing on plays for a gammon. Which is right turns on how often this position gammons, which the coach cannot yet estimate, so neither choice is marked wrong.`;
    case 'wrong-take':
      return `You are ${standing} — under the one game in four a take has to win to pay for itself. Dropping costs one point; taking costs more than that on average.`;
    case 'wrong-drop':
      return `You are ${standing}, but a take only has to win about one game in four to be worth it, and you are above that line. Dropping concedes one point for certain, while taking loses two only sometimes and wins two often enough to cost you less in the long run.`;
    case 'none':
      return 'Correct cube decision.';
  }
}

/**
 * Grade a doubling decision by the player on roll.
 *
 * Cube errors are graded on the same equity scale as checker play, because
 * that is the only way a player can see that one bad take cost more than a
 * whole game's worth of small checker inaccuracies.
 */
export function analyseCubeDecision(board: Board, player: Player, choice: 'double' | 'no-double'): CubeAnalysis {
  const equity = expectedEquity(board, player);
  const { noDouble, double } = cubeEquities(equity);
  const p = winProbabilityFromScore(equity);

  // Once the position is strong enough to play on for a gammon, cashing and
  // playing on are both defensible, and separating them needs a gammon rate
  // the evaluator does not produce. Grading either as an error blames the
  // player for a judgement the engine cannot make — and the engine itself
  // plays on here, so the coach must not call that a missed double.
  if (p >= TOO_GOOD_POINT) {
    return {
      choice,
      best: choice,
      mistake: 'undecided',
      equityLoss: 0,
      severity: classifyEquityLoss(0),
      winProbability: p,
      phase: phaseOf(board, player),
      explanation: describe('undecided', p),
    };
  }

  const best: CubeChoice = double > noDouble ? 'double' : 'no-double';
  const equityLoss = Math.max(0, Math.max(noDouble, double) - (choice === 'double' ? double : noDouble));

  const mistake: CubeMistake =
    choice === best ? 'none' : best === 'double' ? 'missed-double' : 'premature-double';

  return {
    choice,
    best,
    mistake,
    equityLoss,
    severity: classifyEquityLoss(equityLoss),
    winProbability: p,
    phase: phaseOf(board, player),
    explanation: describe(mistake, p),
  };
}

/**
 * Whether a decision not to double was a real decision.
 *
 * Every roll with the cube available is technically a cube decision, but
 * counting all of them would bury the error rate under hundreds of trivially
 * correct no-doubles. Only positions inside the doubling window, plus outright
 * mistakes, are decisions the player could have got wrong.
 */
export function isCubeDecisionPoint(analysis: CubeAnalysis): boolean {
  return analysis.mistake !== 'none' || analysis.winProbability >= DOUBLE_POINT - CUBE_WINDOW;
}

/** Grade the answer to a double. `player` is the side being doubled. */
export function analyseCubeResponse(board: Board, player: Player, choice: 'take' | 'drop'): CubeAnalysis {
  // The responder is not on roll — the doubler is — so the position is valued
  // from the doubler's side and then negated.
  const equity = -expectedEquity(board, opponent(player));
  const p = winProbabilityFromScore(equity);

  // Symmetrically, taking is priced so that it breaks even against a drop
  // exactly at the take point rather than at even money.
  const take = 2 * (equity - TAKE_POINT_EQUITY) - 1;
  const drop = -1;
  const best: CubeChoice = take > drop ? 'take' : 'drop';
  const equityLoss = Math.max(0, Math.max(take, drop) - (choice === 'take' ? take : drop));

  const mistake: CubeMistake =
    choice === best ? 'none' : choice === 'take' ? 'wrong-take' : 'wrong-drop';

  return {
    choice,
    best,
    mistake,
    equityLoss,
    severity: classifyEquityLoss(equityLoss),
    winProbability: p,
    phase: phaseOf(board, player),
    explanation: describe(mistake, p),
  };
}
