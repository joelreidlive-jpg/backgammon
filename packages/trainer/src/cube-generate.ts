import {
  type Board,
  type Dice,
  type Player,
  formatXgid,
  initialBoard,
  opponent,
  winnerOf,
} from '@bg/rules';
import {
  type ResultDistribution,
  type SearchOptions,
  cubeAdvice,
  expectedEquity,
  invert,
  rankTurns,
  rolloutDistribution,
  selectTurn,
  winProbabilityFromScore,
} from '@bg/ai';
import { phaseOf } from '@bg/coach';
import { type CubeAnswer, type CubeProblem, type CubeQuestion } from './cube.js';
import type { Tier } from './problem.js';

export interface CubeGenerateOptions {
  readonly games: number;
  readonly seed: number;
  /** Trials per harvested position. Full playouts: gammon rates need results. */
  readonly trials: number;
  /** Resamples used to decide whether an answer survives the rollout's noise. */
  readonly resamples: number;
  /** Share of resamples that must agree before an answer is published. */
  readonly agreement: number;
  /** Below this the two actions are worth the same and there is nothing to teach. */
  readonly minMargin: number;
  /**
   * Problems wanted per answer.
   *
   * A quota rather than a total, because the answers are not equally easy to
   * find: quiet positions are everywhere and "no double, take" falls out of
   * them immediately, while a clear double sits in a narrow band. Harvesting
   * to a total would return a set that is almost all no-doubles.
   */
  readonly quota: Readonly<Record<CubeAnswer, number>>;
  /** Problems taken from any one game, so a set is not one game's plies in a row. */
  readonly maxPerGame: number;
  /** Ceiling on rollouts, since each one costs minutes and quotas may be unfillable. */
  readonly maxRollouts: number;
  /**
   * Win-rate band a position's probe must fall in to earn a full rollout.
   *
   * Narrowing it aims a pass at one kind of answer: a clear double lives
   * between roughly 70% and 82%, a band far narrower than the one producing
   * no-doubles, so a harvest that takes positions as they come finds none.
   */
  readonly window: readonly [number, number];
  /**
   * Trials in the probe that decides whether to pay for the full rollout.
   *
   * The heuristic cannot do this job: it reads the opening position at 62%
   * when the truth is 50%, so filtering on it aims at the wrong band. A short
   * rollout is off by a few points rather than a dozen, and costs a twentieth
   * of the real one.
   */
  readonly probeTrials: number;
  /** Ceiling on probes, which bounds the time a shard spends finding nothing. */
  readonly maxProbes: number;
  /** Called once per rolled-out position. A harvest takes hours; this says how it is going. */
  readonly onPosition?: (rolledOut: number, kept: number) => void;
}

/**
 * Heuristic win-rate band a position must fall in to be worth rolling out.
 *
 * Cube decisions only exist in a window: far below it every answer is "no
 * double, take", far above it "double, drop", and neither teaches anything.
 * The band is deliberately wide because the heuristic that filters is much
 * worse than the rollout that decides.
 */
const WINDOW: readonly [number, number] = [0.5, 0.97];

/** Band in which the heuristic thinks nobody would turn the cube yet. */
const QUIET: readonly [number, number] = [0.5, 0.62];

export const DEFAULT_CUBE_GENERATE: CubeGenerateOptions = {
  games: 240,
  seed: 90210,
  trials: 160,
  resamples: 200,
  agreement: 0.95,
  minMargin: 0.05,
  quota: { 'no-double': 8, double: 8, 'too-good': 8, take: 8, drop: 8 },
  maxPerGame: 2,
  maxRollouts: 64,
  window: [0.4, 0.97],
  probeTrials: 24,
  maxProbes: 160,
};

const PLAY_SEARCH: SearchOptions = { plies: 1, candidateWidth: 8 };
const PLAY_PROFILE = { ...PLAY_SEARCH, blunderRate: 0.2, blunderDepth: 4 };

/**
 * Policy both sides play during a trial. Two ply, which is expensive, and the
 * expense is not optional.
 *
 * Cube decisions turn on how often a win is a gammon, so a rollout only prices
 * the cube if its playouts gammon at a plausible rate. Measured from the
 * opening: a one-ply policy ends 24% of games in a gammon and 28% in a
 * backgammon, which is nonsense — it stacks its ace point and abandons
 * stragglers once it is losing. Two ply at width 3 still gives 20% and 13%;
 * only width 8 lands near the published figures for real play, 9% and 3%.
 * Pricing a cube off a policy that gammons twice as often as real play would
 * teach the wrong answer on exactly the positions where gammons decide it.
 *
 * The bill is 3.4s a trial, which is why the harvest is sharded and why the
 * set is deliberately small.
 */
const ROLLOUT_POLICY: SearchOptions = { plies: 2, candidateWidth: 8 };

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollDice(random: () => number): Dice {
  return [1 + Math.floor(random() * 6), 1 + Math.floor(random() * 6)];
}

function xgidOf(board: Board, doubler: Player): string {
  return formatXgid({
    board,
    turn: doubler,
    // No roll: a cube decision is taken before the dice.
    dice: null,
    cube: { value: 1, owner: null },
    score: { white: 0, black: 0 },
    matchLength: 0,
    crawford: false,
  });
}

function distributionOf(samples: readonly number[]): ResultDistribution {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const points of samples) counts[points + 3] += 1;
  const share = (points: number): number => counts[points + 3] / samples.length;
  return {
    winSingle: share(1),
    winGammon: share(2),
    winBackgammon: share(3),
    loseSingle: share(-1),
    loseGammon: share(-2),
    loseBackgammon: share(-3),
  };
}

function answerOf(distribution: ResultDistribution, question: CubeQuestion): CubeAnswer {
  const advice = cubeAdvice(distribution);
  return question === 'offer' ? advice.offer : advice.reply;
}

/**
 * How often the answer survives resampling the rollout.
 *
 * A cube action is a threshold decision, so the usual standard error on the
 * mean says nothing useful: what matters is whether the *action* changes when
 * the same position is rolled out again. Bootstrapping the trials answers that
 * directly, and it is the filter that keeps borderline doubles — where this
 * engine is least trustworthy — out of the set.
 */
export function stability(
  samples: readonly number[],
  question: CubeQuestion,
  answer: CubeAnswer,
  resamples: number,
  random: () => number,
): number {
  let agreed = 0;
  const draw: number[] = new Array<number>(samples.length);
  for (let round = 0; round < resamples; round++) {
    for (let index = 0; index < samples.length; index++) {
      draw[index] = samples[Math.floor(random() * samples.length)];
    }
    if (answerOf(distributionOf(draw), question) === answer) agreed += 1;
  }
  return agreed / resamples;
}

/**
 * Difficulty from the points the wrong answer costs.
 *
 * A cube blunder is worth far more than a checker blunder, so these are
 * coarser than the checker-play tiers: giving up a tenth of a point on the
 * cube is a routine error, not an expert-level one.
 */
export function cubeTier(margin: number): Tier {
  if (margin >= 0.4) return 1;
  if (margin >= 0.24) return 2;
  if (margin >= 0.14) return 3;
  if (margin >= 0.07) return 4;
  return 5;
}

/**
 * Whether a short rollout puts the position in the band this pass is after.
 *
 * A position that fails is dropped for a twentieth of the cost of answering
 * it, which is what makes aiming a pass at the doubling band affordable: it
 * is a narrow slice of the positions self-play produces.
 */
function inBand(board: Board, doubler: Player, options: CubeGenerateOptions): boolean {
  let probe;
  try {
    probe = rolloutDistribution(board, doubler, doubler, {
      maxTrials: options.probeTrials,
      seed: options.seed,
      policy: ROLLOUT_POLICY,
    });
  } catch {
    return false;
  }

  const { winSingle, winGammon, winBackgammon } = probe.distribution;
  const win = winSingle + winGammon + winBackgammon;
  return win >= options.window[0] && win <= options.window[1];
}

export interface CubeCandidate {
  readonly problem: CubeProblem;
  readonly stability: number;
}

/**
 * Turn one position into the cube questions it can honestly support.
 *
 * Every position supports both. The second is asked even where doubling would
 * be a mistake, because opponents double too early all the time and answering
 * a premature double correctly is the skill being taught — those are also the
 * only positions in which the right answer is a clear take.
 */
export function cubeCandidates(
  board: Board,
  doubler: Player,
  options: CubeGenerateOptions,
  random: () => number,
): CubeCandidate[] {
  // A position whose playouts do not all finish cannot be priced, and one bad
  // position should not throw away the harvest around it.
  let rolled;
  try {
    rolled = rolloutDistribution(board, doubler, doubler, {
      maxTrials: options.trials,
      seed: options.seed,
      policy: ROLLOUT_POLICY,
    });
  } catch {
    return [];
  }

  const advice = cubeAdvice(rolled.distribution);
  const xgid = xgidOf(board, doubler);
  const phase = phaseOf(board, doubler);
  const found: CubeCandidate[] = [];

  const questions: readonly { question: CubeQuestion; answer: CubeAnswer; margin: number }[] = [
    { question: 'offer', answer: advice.offer, margin: advice.offerMargin },
    { question: 'respond', answer: advice.reply, margin: advice.replyMargin },
  ];

  for (const { question, answer, margin } of questions) {
    if (margin < options.minMargin) continue;
    const survived = stability(rolled.samples, question, answer, options.resamples, random);
    if (survived < options.agreement) continue;

    found.push({
      problem: {
        id: '',
        xgid,
        question,
        answer,
        tier: cubeTier(margin),
        provenance: 'rollout',
        // The distribution is stored from the side being asked, which for a
        // response is the side that did not roll it out.
        distribution: question === 'offer' ? rolled.distribution : invert(rolled.distribution),
        phase,
        margin,
      },
      stability: survived,
    });
  }

  return found;
}

/**
 * Harvest cube problems from self-play.
 *
 * Three filters, cheapest first: the heuristic rejects positions nowhere near
 * a cube decision, a short probe rollout says which band the position is
 * really in, and only then is the full rollout paid for. None of them answer
 * the position — that is the full rollout's job alone.
 */
export function generateCubeProblems(
  options: CubeGenerateOptions = DEFAULT_CUBE_GENERATE,
): CubeProblem[] {
  const random = mulberry32(options.seed);
  const problems: CubeProblem[] = [];
  const seen = new Set<string>();
  const perAnswer = new Map<CubeAnswer, number>();
  const full = (answer: CubeAnswer): boolean =>
    (perAnswer.get(answer) ?? 0) >= options.quota[answer];
  let probes = 0;
  let rollouts = 0;
  const done = (): boolean =>
    rollouts >= options.maxRollouts ||
    probes >= options.maxProbes ||
    (['no-double', 'double', 'too-good', 'take', 'drop'] as const).every(full);

  for (let game = 0; game < options.games && !done(); game++) {
    let board: Board = initialBoard();
    let player: Player = random() < 0.5 ? 'white' : 'black';
    let fromGame = 0;

    for (let ply = 0; ply < 300; ply++) {
      const dice = rollDice(random);
      const ranked = rankTurns(board, player, dice, PLAY_SEARCH);
      if (ranked.length === 0) {
        player = opponent(player);
        continue;
      }

      const p = winProbabilityFromScore(expectedEquity(board, player));
      const xgid = xgidOf(board, player);
      // Once the quiet positions are all used up, spending eight minutes
      // rolling out another one buys nothing, and the heuristic is good enough
      // to say which those are even though it is not good enough to answer them.
      const quiet = full('no-double') && full('take');
      const worthwhile = p >= (quiet ? QUIET[1] : WINDOW[0]) && p <= WINDOW[1];
      if (worthwhile && fromGame < options.maxPerGame && !seen.has(xgid)) {
        seen.add(xgid);
        probes += 1;
        if (inBand(board, player, options)) {
          rollouts += 1;
          const candidates = cubeCandidates(board, player, options, random);
          options.onPosition?.(rollouts, problems.length + candidates.length);
          for (const candidate of candidates) {
            const { answer } = candidate.problem;
            if (fromGame >= options.maxPerGame) break;
            if (full(answer)) continue;
            perAnswer.set(answer, (perAnswer.get(answer) ?? 0) + 1);
            fromGame += 1;
            problems.push({
              ...candidate.problem,
              id: `cube-${game}-${ply}-${candidate.problem.question === 'offer' ? 'd' : 'r'}`,
            });
          }
        }
      }
      if (done()) break;

      board = selectTurn(ranked, PLAY_PROFILE, random).turn.board;
      if (winnerOf(board) !== null) break;
      player = opponent(player);
    }
  }

  return problems;
}

function formatDistribution(distribution: ResultDistribution): string {
  const parts = [
    `winSingle: ${distribution.winSingle.toFixed(4)}`,
    `winGammon: ${distribution.winGammon.toFixed(4)}`,
    `winBackgammon: ${distribution.winBackgammon.toFixed(4)}`,
    `loseSingle: ${distribution.loseSingle.toFixed(4)}`,
    `loseGammon: ${distribution.loseGammon.toFixed(4)}`,
    `loseBackgammon: ${distribution.loseBackgammon.toFixed(4)}`,
  ];
  return `{ ${parts.join(', ')} }`;
}

/** Render a harvested set as the committed data module. */
export function formatCubeModule(problems: readonly CubeProblem[]): string {
  const entries = problems.map((problem) =>
    [
      '  {',
      `    id: ${JSON.stringify(problem.id)},`,
      `    xgid: ${JSON.stringify(problem.xgid)},`,
      `    question: ${JSON.stringify(problem.question)},`,
      `    answer: ${JSON.stringify(problem.answer)},`,
      `    tier: ${problem.tier},`,
      `    provenance: ${JSON.stringify(problem.provenance)},`,
      `    phase: ${JSON.stringify(problem.phase)},`,
      `    margin: ${problem.margin.toFixed(4)},`,
      `    distribution: ${formatDistribution(problem.distribution)},`,
      '  },',
    ].join('\n'),
  );

  return [
    '// Generated by `GENERATE_CUBE=1 npx vitest run packages/trainer/src/build-cube-problems.test.ts`',
    '// — do not edit by hand.',
    '//',
    '// Every answer here was priced from a full rollout of the position and kept',
    '// only where it survived resampling, so the set is small on purpose: cube',
    '// decisions near the doubling point cannot be certified by this engine.',
    "import type { CubeProblem } from './cube.js';",
    '',
    'export const GENERATED_CUBE_PROBLEMS: readonly CubeProblem[] = [',
    ...entries,
    '];',
    '',
  ].join('\n');
}
