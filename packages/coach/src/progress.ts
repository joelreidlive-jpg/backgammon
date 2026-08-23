import type { Difficulty } from '@bg/ai';
import type { TurnAnalysis } from './analyse.js';
import type { Concept } from './concepts.js';
import { type CubeAnalysis, type CubeMistake, isCubeMistake } from './cube.js';
import type { HintLevel } from './hints.js';
import type { GamePhase } from './phase.js';

export interface Tally {
  readonly decisions: number;
  /** Total equity given away, in points. */
  readonly equityLoss: number;
}

export interface ConceptTally {
  /** Times the best play used this concept and the player's did not. */
  readonly missed: number;
  /** Equity given away on those turns. */
  readonly equityLoss: number;
}

/**
 * A player's cumulative record. Deliberately additive: a game's contribution is
 * merged in with `mergeProgress`, so history survives without keeping every
 * turn ever played.
 */
export interface PlayerProgress {
  readonly games: number;
  readonly matches: number;
  readonly checker: Tally;
  readonly cube: Tally;
  readonly byPhase: Readonly<Partial<Record<GamePhase, Tally>>>;
  readonly byConcept: Readonly<Partial<Record<Concept, ConceptTally>>>;
  readonly cubeMistakes: Readonly<Partial<Record<CubeMistake, number>>>;
  /** Error rate after each completed game, oldest first. Capped in length. */
  readonly errorRateHistory: readonly number[];
}

export const EMPTY_PROGRESS: PlayerProgress = {
  games: 0,
  matches: 0,
  checker: { decisions: 0, equityLoss: 0 },
  cube: { decisions: 0, equityLoss: 0 },
  byPhase: {},
  byConcept: {},
  cubeMistakes: {},
  errorRateHistory: [],
};

const HISTORY_LIMIT = 200;

/** Millipoints of equity lost per decision. The standard way to compare players. */
export function errorRate(tally: Tally): number {
  return tally.decisions === 0 ? 0 : (tally.equityLoss / tally.decisions) * 1000;
}

export type SkillTier = 'novice' | 'improver' | 'intermediate' | 'strong' | 'expert';

/**
 * Error-rate bands, in millipoints per decision. Roughly aligned with how
 * bots grade humans: under 20 is serious tournament strength, over 120 is
 * someone still learning the shapes.
 */
export const TIER_CEILINGS: readonly { tier: SkillTier; ceiling: number }[] = [
  { tier: 'expert', ceiling: 20 },
  { tier: 'strong', ceiling: 40 },
  { tier: 'intermediate', ceiling: 70 },
  { tier: 'improver', ceiling: 120 },
  { tier: 'novice', ceiling: Infinity },
];

/** Until there is enough evidence, assume the player is still learning. */
const MIN_DECISIONS_FOR_TIER = 30;

export function tierFor(tally: Tally): SkillTier {
  if (tally.decisions < MIN_DECISIONS_FOR_TIER) return 'novice';
  const rate = errorRate(tally);
  return TIER_CEILINGS.find((band) => rate < band.ceiling)?.tier ?? 'novice';
}

const TIER_ORDER: readonly SkillTier[] = ['novice', 'improver', 'intermediate', 'strong', 'expert'];

export function tierRank(tier: SkillTier): number {
  return TIER_ORDER.indexOf(tier);
}

/**
 * How loudly to coach. This is the "levelling up": as a player's error rate in
 * a phase falls, alerts get rarer and hints get less explicit, so the coach
 * stops explaining things they have already mastered.
 */
export interface CoachingPolicy {
  readonly tier: SkillTier;
  /** Equity loss above which a live alert fires. */
  readonly alertThreshold: number;
  /** Hint level a plain "help me" request produces. */
  readonly defaultHintLevel: HintLevel;
  /** Whether take-backs are still offered. */
  readonly offerTakeback: boolean;
  readonly suggestedDifficulty: Difficulty;
}

const POLICIES: Readonly<Record<SkillTier, Omit<CoachingPolicy, 'tier'>>> = {
  novice: { alertThreshold: 0.06, defaultHintLevel: 4, offerTakeback: true, suggestedDifficulty: 'beginner' },
  improver: { alertThreshold: 0.08, defaultHintLevel: 3, offerTakeback: true, suggestedDifficulty: 'casual' },
  intermediate: { alertThreshold: 0.12, defaultHintLevel: 2, offerTakeback: true, suggestedDifficulty: 'intermediate' },
  strong: { alertThreshold: 0.16, defaultHintLevel: 1, offerTakeback: false, suggestedDifficulty: 'advanced' },
  expert: { alertThreshold: 0.2, defaultHintLevel: 1, offerTakeback: false, suggestedDifficulty: 'expert' },
};

/**
 * Coaching is calibrated per phase, not globally: a player can be sound in the
 * race and still leak badly on cube decisions, and should be coached
 * accordingly in each.
 */
export function coachingPolicy(progress: PlayerProgress, phase?: GamePhase): CoachingPolicy {
  const scope = phase ? (progress.byPhase[phase] ?? progress.checker) : progress.checker;
  const tier = tierFor(scope.decisions >= MIN_DECISIONS_FOR_TIER ? scope : progress.checker);
  return { tier, ...POLICIES[tier] };
}

/** The concepts a player misses most, worst first. */
export function weakestConcepts(progress: PlayerProgress, limit = 3): Concept[] {
  return Object.entries(progress.byConcept)
    // Concepts that have never cost anything are not weaknesses, and offering
    // advice on them pushes the real leaks out of the list.
    .filter((entry): entry is [Concept, ConceptTally] => (entry[1]?.equityLoss ?? 0) > 0)
    .sort((a, b) => b[1].equityLoss - a[1].equityLoss)
    .slice(0, limit)
    .map(([concept]) => concept);
}

/** The phase costing the most equity, or null if nothing has been lost yet. */
export function weakestPhase(progress: PlayerProgress): GamePhase | null {
  let worst: GamePhase | null = null;
  let loss = 0;
  for (const [phase, tally] of Object.entries(progress.byPhase)) {
    if (tally && tally.equityLoss > loss) {
      loss = tally.equityLoss;
      worst = phase as GamePhase;
    }
  }
  return worst;
}

function addTally(a: Tally | undefined, b: Tally): Tally {
  return {
    decisions: (a?.decisions ?? 0) + b.decisions,
    equityLoss: (a?.equityLoss ?? 0) + b.equityLoss,
  };
}

/**
 * Turn one game's decisions into a progress delta. `matchCompleted` is true
 * when this game also ended the match, which is what `matches` counts.
 */
export function progressFromGame(
  turns: readonly TurnAnalysis[],
  cubes: readonly CubeAnalysis[],
  matchCompleted = false,
): PlayerProgress {
  const byPhase: Partial<Record<GamePhase, Tally>> = {};
  const byConcept: Partial<Record<Concept, ConceptTally>> = {};
  const cubeMistakes: Partial<Record<CubeMistake, number>> = {};

  let checker: Tally = { decisions: 0, equityLoss: 0 };
  for (const turn of turns) {
    checker = addTally(checker, { decisions: 1, equityLoss: turn.equityLoss });
    byPhase[turn.phase] = addTally(byPhase[turn.phase], { decisions: 1, equityLoss: turn.equityLoss });

    for (const concept of [...turn.missed, ...turn.incurred]) {
      const current = byConcept[concept];
      byConcept[concept] = {
        missed: (current?.missed ?? 0) + 1,
        equityLoss: (current?.equityLoss ?? 0) + turn.equityLoss,
      };
    }
  }

  let cube: Tally = { decisions: 0, equityLoss: 0 };
  for (const decision of cubes) {
    cube = addTally(cube, { decisions: 1, equityLoss: decision.equityLoss });
    byPhase[decision.phase] = addTally(byPhase[decision.phase], {
      decisions: 1,
      equityLoss: decision.equityLoss,
    });
    if (isCubeMistake(decision.mistake)) {
      cubeMistakes[decision.mistake] = (cubeMistakes[decision.mistake] ?? 0) + 1;
    }
  }

  return {
    games: 1,
    matches: matchCompleted ? 1 : 0,
    checker,
    cube,
    byPhase,
    byConcept,
    cubeMistakes,
    errorRateHistory: [errorRate(addTally(checker, cube))],
  };
}

export function mergeProgress(base: PlayerProgress, delta: PlayerProgress): PlayerProgress {
  const byPhase: Partial<Record<GamePhase, Tally>> = { ...base.byPhase };
  for (const [phase, tally] of Object.entries(delta.byPhase)) {
    if (tally) byPhase[phase as GamePhase] = addTally(byPhase[phase as GamePhase], tally);
  }

  const byConcept: Partial<Record<Concept, ConceptTally>> = { ...base.byConcept };
  for (const [concept, tally] of Object.entries(delta.byConcept)) {
    if (!tally) continue;
    const current = byConcept[concept as Concept];
    byConcept[concept as Concept] = {
      missed: (current?.missed ?? 0) + tally.missed,
      equityLoss: (current?.equityLoss ?? 0) + tally.equityLoss,
    };
  }

  const cubeMistakes: Partial<Record<CubeMistake, number>> = { ...base.cubeMistakes };
  for (const [mistake, count] of Object.entries(delta.cubeMistakes)) {
    cubeMistakes[mistake as CubeMistake] = (cubeMistakes[mistake as CubeMistake] ?? 0) + (count ?? 0);
  }

  return {
    games: base.games + delta.games,
    matches: base.matches + delta.matches,
    checker: addTally(base.checker, delta.checker),
    cube: addTally(base.cube, delta.cube),
    byPhase,
    byConcept,
    cubeMistakes,
    errorRateHistory: [...base.errorRateHistory, ...delta.errorRateHistory].slice(-HISTORY_LIMIT),
  };
}

/**
 * Whether the player's recent form is better than their record as a whole,
 * which is what deserves a "you are improving" rather than a raw number.
 */
export function trend(progress: PlayerProgress, window = 10): 'improving' | 'steady' | 'slipping' {
  const history = progress.errorRateHistory;
  if (history.length < window * 2) return 'steady';

  const recent = history.slice(-window);
  const earlier = history.slice(-window * 2, -window);
  const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const change = mean(recent) - mean(earlier);
  // Ten percent of a typical intermediate error rate; below that it is noise.
  if (change < -7) return 'improving';
  if (change > 7) return 'slipping';
  return 'steady';
}
