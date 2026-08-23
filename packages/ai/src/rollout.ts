import {
  type Board,
  type Dice,
  type Player,
  type Turn,
  legalTurns,
  opponent,
  scoreGame,
  winnerOf,
} from '@bg/rules';
import type { ResultDistribution } from './cubeful.js';
import { type Evaluator } from './evaluator.js';
import { heuristicEvaluator } from './heuristic.js';
import { type SearchOptions, rankTurns } from './search.js';

/**
 * A rollout plays the position out to the end many times and averages the
 * points actually won, so its verdict does not depend on the evaluator being
 * right about anything except how to move the checkers.
 *
 * Two properties make that affordable. Every candidate play is rolled out
 * against the *same* dice sequences, so the comparison is paired and most of
 * the variance cancels; and trials stop as soon as the leader is clear, which
 * is usually long before the trial cap.
 *
 * Note the units: a rollout returns true cubeless equity in points, ranging
 * over ±3, while `heuristicEvaluator` returns a squashed score over ±2. The
 * two are not comparable and thresholds calibrated on one do not transfer.
 */
export interface RolloutOptions {
  /** Upper bound on trials per candidate. */
  readonly maxTrials?: number;
  /** Trials before the stopping rule is allowed to fire. */
  readonly minTrials?: number;
  /** Trials between stopping checks. */
  readonly checkEvery?: number;
  /** How many standard errors must separate the leader from the runner-up. */
  readonly confidence?: number;
  /** How many of the search's top plays are rolled out. */
  readonly candidates?: number;
  readonly seed?: number;
  /** Search used to pick the candidates that get rolled out. */
  readonly search?: SearchOptions;
  /** Policy both sides play during a trial. Cheap on purpose. */
  readonly policy?: SearchOptions;
  readonly evaluator?: Evaluator;
  /** Safety valve for a playout that will not terminate. */
  readonly maxPlies?: number;
  /**
   * Stop each trial after this many plies and estimate the rest with
   * `estimate`, instead of playing to the end.
   *
   * This is the difference between a rollout that can separate two plays and
   * one that cannot. A full playout carries the variance of every dice roll to
   * the end of the game, which swamps the tenth of a point that usually
   * divides the best play from the second best. Truncating trades a little
   * bias — the estimate's error — for a large cut in variance, and costs about
   * an eighth as much. Zero plays to the end.
   */
  readonly truncate?: number;
  /**
   * Points `player` is expected to win from a position, used when a trial is
   * truncated. Must be in points, not evaluator units.
   */
  readonly estimate?: Evaluator;
}

export interface RolloutCandidate {
  readonly turn: Turn;
  /** Mean points won, from the mover's side. */
  readonly equity: number;
  /** Standard error of that mean. */
  readonly stderr: number;
  readonly trials: number;
}

export interface RolloutResult {
  /** Best first, by rolled-out equity. */
  readonly candidates: readonly RolloutCandidate[];
  readonly trials: number;
  /** Equity the best play gains over the runner-up. */
  readonly margin: number;
  /**
   * Standard error of that margin, computed from the paired per-trial
   * differences rather than from the two means, which is what makes common
   * random numbers pay: the sequences cancel and only the plays differ.
   */
  readonly marginStderr: number;
  /**
   * Whether the margin cleared `confidence` standard errors. A rollout that
   * ends undecided has not found a best play, it has found a tie.
   */
  readonly decisive: boolean;
}

export const DEFAULT_ROLLOUT: Required<
  Omit<RolloutOptions, 'evaluator' | 'search' | 'policy' | 'estimate'>
> = {
  maxTrials: 1296,
  minTrials: 144,
  checkEvery: 36,
  confidence: 2.5,
  candidates: 6,
  seed: 1,
  maxPlies: 400,
  truncate: 0,
};

/**
 * Plies to play before handing over to the estimator.
 *
 * Long enough that the tactics the candidate plays differ over — hits,
 * returns, points made — have happened and been answered, short enough that
 * the estimator is not asked to judge a position the checkers have barely
 * moved from.
 */
export const TRUNCATE_PLIES = 11;

const ROLLOUT_SEARCH: SearchOptions = { plies: 2, candidateWidth: 12 };
const ROLLOUT_POLICY: SearchOptions = { plies: 1 };

/** Deterministic PRNG, so a rollout is reproducible from its seed alone. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollDice(random: () => number): Dice {
  return [1 + Math.floor(random() * 6), 1 + Math.floor(random() * 6)];
}

/**
 * Points `player` wins from `board`, with `onRoll` to play, using the dice the
 * trial's generator produces. Gammons and backgammons are scored, since they
 * are a large part of what separates two plays in the opening.
 */
function playOut(
  board: Board,
  onRoll: Player,
  player: Player,
  random: () => number,
  policy: SearchOptions,
  maxPlies: number,
  truncate: number,
  estimate: Evaluator,
): number {
  let current = board;
  let turn = onRoll;
  const limit = truncate > 0 ? Math.min(truncate, maxPlies) : maxPlies;

  for (let ply = 0; ply < limit; ply++) {
    const winner = winnerOf(current);
    if (winner !== null) {
      const result = scoreGame(current, winner, 1);
      return winner === player ? result.points : -result.points;
    }

    const dice = rollDice(random);
    const best = rankTurns(current, turn, dice, policy)[0];
    if (best) current = best.turn.board;
    turn = opponent(turn);
  }

  if (truncate > 0) return estimate(current, player);

  // A playout this long is a bug or a pathological loop; score it as a tie
  // rather than letting it bias the mean towards either side.
  return 0;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Sample standard error of the mean. */
function stderrOf(values: readonly number[]): number {
  if (values.length < 2) return Infinity;
  const average = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

function paired(a: readonly number[], b: readonly number[]): number[] {
  return a.map((value, index) => value - b[index]);
}

/**
 * Roll out the strongest plays for `player` and report which one actually
 * wins more points.
 */
export function rolloutTurns(
  board: Board,
  player: Player,
  dice: Dice,
  options: RolloutOptions = {},
): RolloutResult {
  const {
    maxTrials,
    minTrials,
    checkEvery,
    confidence,
    candidates,
    seed,
    maxPlies,
    truncate,
  } = { ...DEFAULT_ROLLOUT, ...options };
  const estimate = options.estimate ?? heuristicEvaluator;
  const search = options.search ?? ROLLOUT_SEARCH;
  const policy = { ...(options.policy ?? ROLLOUT_POLICY), evaluator: options.evaluator ?? heuristicEvaluator };

  const turns = legalTurns(board, player, dice);
  if (turns.length === 0) {
    return { candidates: [], trials: 0, margin: 0, marginStderr: 0, decisive: false };
  }

  const shortlist = rankTurns(board, player, dice, { ...search, evaluator: options.evaluator })
    .slice(0, Math.max(2, candidates))
    .map((ranked) => ranked.turn);

  if (shortlist.length === 1) {
    return {
      candidates: [{ turn: shortlist[0], equity: 0, stderr: 0, trials: 0 }],
      trials: 0,
      margin: Infinity,
      marginStderr: 0,
      decisive: true,
    };
  }

  const samples: number[][] = shortlist.map(() => []);
  const foe = opponent(player);
  let trials = 0;

  while (trials < maxTrials) {
    const batch = Math.min(checkEvery, maxTrials - trials);
    for (let trial = trials; trial < trials + batch; trial++) {
      // Same seed per trial for every candidate: the dice a play faces are the
      // dice its rivals face, so the difference between them is the play.
      const trialSeed = (seed ^ Math.imul(trial + 1, 0x9e3779b1)) >>> 0;
      shortlist.forEach((turn, index) => {
        samples[index].push(
          playOut(turn.board, foe, player, mulberry32(trialSeed), policy, maxPlies, truncate, estimate),
        );
      });
    }
    trials += batch;

    if (trials >= minTrials && separated(samples, confidence)) break;
  }

  return summarise(shortlist, samples, trials, confidence);
}

export interface RolloutOutcome {
  /** Mean points won by `player`. */
  readonly points: number;
  /** Share of trials `player` won, gammons included. */
  readonly winRate: number;
  readonly stderr: number;
  readonly trials: number;
}

export interface DistributionOutcome {
  readonly distribution: ResultDistribution;
  /**
   * Points won in each trial. Kept so a caller can resample them: whether a
   * cube action is safe to publish depends on whether it survives the noise in
   * this distribution, which cannot be recovered from the summary alone.
   */
  readonly samples: readonly number[];
  /** Mean points won by `player`. */
  readonly points: number;
  readonly stderr: number;
  readonly trials: number;
}

/**
 * Roll out a position rather than a choice of play: what is this worth, not
 * which move is best. Used to calibrate the evaluator against real outcomes.
 */
export function rolloutOutcome(
  board: Board,
  onRoll: Player,
  player: Player,
  options: RolloutOptions = {},
): RolloutOutcome {
  const { maxTrials, seed, maxPlies, truncate } = { ...DEFAULT_ROLLOUT, ...options };
  const policy = {
    ...(options.policy ?? ROLLOUT_POLICY),
    evaluator: options.evaluator ?? heuristicEvaluator,
  };
  const estimate = options.estimate ?? heuristicEvaluator;

  const samples: number[] = [];
  for (let trial = 0; trial < maxTrials; trial++) {
    const trialSeed = (seed ^ Math.imul(trial + 1, 0x9e3779b1)) >>> 0;
    samples.push(playOut(board, onRoll, player, mulberry32(trialSeed), policy, maxPlies, truncate, estimate));
  }

  return {
    points: mean(samples),
    winRate: samples.filter((value) => value > 0).length / samples.length,
    stderr: stderrOf(samples),
    trials: samples.length,
  };
}

/**
 * Roll a position out to the end and report how often each result actually
 * happened, rather than only their average.
 *
 * Pricing a cube needs the shape of the distribution, not just its mean: how
 * often the win is a gammon decides whether a double is too good, and how
 * often the loss is decides whether it is a take. Truncation cannot answer
 * that — an estimate is a number of points, not a result — so these trials
 * always play to the end and cost accordingly.
 */
export function rolloutDistribution(
  board: Board,
  onRoll: Player,
  player: Player,
  options: RolloutOptions = {},
): DistributionOutcome {
  const { maxTrials, seed, maxPlies } = { ...DEFAULT_ROLLOUT, ...options };
  const policy = {
    ...(options.policy ?? ROLLOUT_POLICY),
    evaluator: options.evaluator ?? heuristicEvaluator,
  };

  const counts = [0, 0, 0, 0, 0, 0, 0];
  const samples: number[] = [];
  for (let trial = 0; trial < maxTrials; trial++) {
    const trialSeed = (seed ^ Math.imul(trial + 1, 0x9e3779b1)) >>> 0;
    const points = playOut(
      board,
      onRoll,
      player,
      mulberry32(trialSeed),
      policy,
      maxPlies,
      0,
      heuristicEvaluator,
    );
    // A finished game is worth ±1, ±2 or ±3, so anything else is the maxPlies
    // valve firing. Counting it would quietly move mass into the wrong bucket
    // and mis-price the cube, so a distribution refuses to be built from it.
    if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 3) {
      throw new Error(`rollout did not finish within ${maxPlies} plies`);
    }
    samples.push(points);
    counts[points + 3] += 1;
  }

  const share = (points: number): number => counts[points + 3] / maxTrials;
  return {
    samples,
    distribution: {
      winSingle: share(1),
      winGammon: share(2),
      winBackgammon: share(3),
      loseSingle: share(-1),
      loseGammon: share(-2),
      loseBackgammon: share(-3),
    },
    points: mean(samples),
    stderr: stderrOf(samples),
    trials: maxTrials,
  };
}

function order(samples: readonly (readonly number[])[]): number[] {
  return samples
    .map((values, index) => ({ index, equity: mean(values) }))
    .sort((a, b) => b.equity - a.equity)
    .map((entry) => entry.index);
}

/**
 * Zero variance is decisive rather than undecided: if every trial agreed, the
 * plays did not tie, one of them won every time.
 */
function clear(margin: number, error: number, confidence: number): boolean {
  if (!Number.isFinite(error)) return false;
  return margin > confidence * error;
}

function separated(samples: readonly (readonly number[])[], confidence: number): boolean {
  const [best, second] = order(samples);
  const differences = paired(samples[best], samples[second]);
  return clear(mean(differences), stderrOf(differences), confidence);
}

function summarise(
  shortlist: readonly Turn[],
  samples: readonly (readonly number[])[],
  trials: number,
  confidence: number,
): RolloutResult {
  const ranking = order(samples);
  const candidates = ranking.map((index) => ({
    turn: shortlist[index],
    equity: mean(samples[index]),
    stderr: stderrOf(samples[index]),
    trials,
  }));

  const differences = paired(samples[ranking[0]], samples[ranking[1]]);
  const margin = mean(differences);
  const marginStderr = stderrOf(differences);

  return {
    candidates,
    trials,
    margin,
    marginStderr,
    decisive: clear(margin, marginStderr, confidence),
  };
}
