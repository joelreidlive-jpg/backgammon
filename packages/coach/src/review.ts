import type { TurnAnalysis } from './analyse.js';
import type { Concept } from './concepts.js';
import { type CubeAnalysis, type CubeMistake, isCubeMistake } from './cube.js';
import type { GamePhase } from './phase.js';
import {
  type PlayerProgress,
  type SkillTier,
  type Tally,
  errorRate,
  isProvisional,
  mergeProgress,
  progressFromGame,
  tierFor,
  tierRank,
  trend,
  weakestConcepts,
  weakestPhase,
} from './progress.js';
import { CONCEPT_ADVICE, CUBE_ADVICE, PHASE_GUIDANCE } from './strategy.js';

export interface PhaseReport {
  readonly phase: GamePhase;
  readonly decisions: number;
  readonly errorRate: number;
  readonly guidance: string;
}

export interface LeakReport {
  readonly concept: Concept;
  readonly occurrences: number;
  readonly equityLoss: number;
  readonly advice: string;
}

export interface CubeReport {
  readonly decisions: number;
  readonly errorRate: number;
  readonly mistakes: Readonly<Partial<Record<CubeMistake, number>>>;
  readonly advice: readonly string[];
}

export interface GameReview {
  readonly decisions: number;
  readonly errorRate: number;
  readonly tier: SkillTier;
  readonly headline: string;
  readonly byPhase: readonly PhaseReport[];
  readonly leaks: readonly LeakReport[];
  readonly cube: CubeReport;
  /** The turns that cost the most, worst first. */
  readonly worstMoments: readonly TurnAnalysis[];
  /** What to work on next, most valuable first. */
  readonly focus: readonly string[];
  /** Progress after this game is folded in. */
  readonly progress: PlayerProgress;
  readonly levelledUp: boolean;
  readonly trend: 'improving' | 'steady' | 'slipping';
}

const WORST_MOMENTS = 3;
const MAX_LEAKS = 3;

/**
 * The rate is this game's; the tier is the player's standing record. Keeping
 * them distinct matters, because one good or bad game should not read as a
 * change in the player's level.
 */
function headlineFor(tier: SkillTier, rate: number, standing: Tally): string {
  const rounded = Math.round(rate);
  const assessment: Readonly<Record<SkillTier, string>> = {
    expert:
      'Overall you are playing near-flawlessly; the remaining gains are in cube handling and match equity rather than checker play.',
    strong:
      'Overall your checker play is strong; what separates you from expert is consistency in the phases you find awkward.',
    intermediate:
      'Overall you are solid: you know the shapes, and lose equity by not applying them consistently under pressure.',
    improver:
      'Overall you are improving: the plans are mostly right and the execution slips in specific, fixable places.',
    novice:
      'Work on one idea at a time — the biggest single gain at this stage is making your 5-point whenever you can.',
  };
  // Say so while the grade rests mostly on the prior, or a player who wins one
  // clean game reads a confident verdict drawn from barely any evidence.
  const caveat = isProvisional(standing)
    ? ` Your grade is still settling — it is based on ${standing.decisions} decision${standing.decisions === 1 ? '' : 's'} so far, and will move as you play more.`
    : '';
  return `This game cost ${rounded} millipoints per decision. ${assessment[tier]}${caveat}`;
}

/**
 * A strategy debrief for one finished game.
 *
 * Everything here is derived from decisions the player actually made, ranked by
 * how much equity each pattern cost — so the advice is ordered by what would
 * gain the most, not by what is easiest to say.
 */
export function reviewGame(
  turns: readonly TurnAnalysis[],
  cubes: readonly CubeAnalysis[],
  history: PlayerProgress,
  matchCompleted = false,
): GameReview {
  const delta = progressFromGame(turns, cubes, matchCompleted);
  const progress = mergeProgress(history, delta);

  const combined: Tally = {
    decisions: delta.checker.decisions + delta.cube.decisions,
    equityLoss: delta.checker.equityLoss + delta.cube.equityLoss,
  };
  const rate = errorRate(combined);
  const tier = tierFor(progress.checker);

  const byPhase: PhaseReport[] = Object.entries(delta.byPhase)
    .filter((entry): entry is [string, Tally] => entry[1] !== undefined)
    .map(([phase, tally]) => ({
      phase: phase as GamePhase,
      decisions: tally.decisions,
      errorRate: errorRate(tally),
      guidance: PHASE_GUIDANCE[phase as GamePhase],
    }))
    .sort((a, b) => b.errorRate - a.errorRate);

  const leaks: LeakReport[] = Object.entries(delta.byConcept)
    .filter((entry) => entry[1] !== undefined && entry[1].equityLoss > 0)
    .sort((a, b) => (b[1]?.equityLoss ?? 0) - (a[1]?.equityLoss ?? 0))
    .slice(0, MAX_LEAKS)
    .map(([concept, tally]) => ({
      concept: concept as Concept,
      occurrences: tally?.missed ?? 0,
      equityLoss: tally?.equityLoss ?? 0,
      advice: CONCEPT_ADVICE[concept as Concept],
    }));

  const cubeAdvice = Object.keys(delta.cubeMistakes)
    .filter((mistake): mistake is CubeMistake => isCubeMistake(mistake as CubeMistake))
    .map((mistake) => CUBE_ADVICE[mistake])
    .filter((advice) => advice.length > 0);

  const worstMoments = [...turns]
    .filter((turn) => turn.severity !== 'fine')
    .sort((a, b) => b.equityLoss - a.equityLoss)
    .slice(0, WORST_MOMENTS);

  // Focus is drawn from the cumulative record rather than this one game, so a
  // single clean game does not erase a habit and one bad game does not become
  // the whole curriculum.
  const focusPhase = weakestPhase(progress);
  // Advice that has already been given once reads as a stuck record unless it
  // says that it is a repeat, which is itself the point: the leak survived.
  const focus = [
    ...(focusPhase
      ? [
          focusPhase === weakestPhase(history)
            ? `Still your costliest phase. ${PHASE_GUIDANCE[focusPhase]}`
            : PHASE_GUIDANCE[focusPhase],
        ]
      : []),
    ...weakestConcepts(progress, 2).map((concept) =>
      (history.byConcept[concept]?.missed ?? 0) > 0
        ? `This keeps recurring. ${CONCEPT_ADVICE[concept]}`
        : CONCEPT_ADVICE[concept],
    ),
    ...cubeAdvice.slice(0, 1),
  ];

  return {
    decisions: combined.decisions,
    errorRate: rate,
    tier,
    headline: headlineFor(tier, rate, progress.checker),
    byPhase,
    leaks,
    cube: {
      decisions: delta.cube.decisions,
      errorRate: errorRate(delta.cube),
      mistakes: delta.cubeMistakes,
      advice: cubeAdvice,
    },
    worstMoments,
    focus,
    progress,
    levelledUp: tierRank(tier) > tierRank(tierFor(history.checker)),
    trend: trend(progress),
  };
}
