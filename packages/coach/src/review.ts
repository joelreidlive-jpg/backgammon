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
import { CONCEPT_LABEL, CUBE_ADVICE, conceptAdvice, phaseAdvice } from './strategy.js';

/**
 * A phase is reported as a score, not a lecture. Which phase to do something
 * about is one decision, and it is made once, in `focus`; guidance on every
 * phase played buries it in text the player has read before.
 */
export interface PhaseReport {
  readonly phase: GamePhase;
  readonly decisions: number;
  readonly errorRate: number;
}

export interface LeakReport {
  readonly concept: Concept;
  readonly occurrences: number;
  readonly equityLoss: number;
  /** The leak in a few words. The cure, where it is warranted, is in `focus`. */
  readonly label: string;
}

export interface CubeReport {
  readonly decisions: number;
  readonly errorRate: number;
  readonly mistakes: Readonly<Partial<Record<CubeMistake, number>>>;
  /**
   * The cube decisions of this game, in the order they were taken. A game
   * settled by a double is settled here and nowhere in the checker play, so the
   * debrief has to be able to talk about the actual decisions.
   */
  readonly moments: readonly CubeAnalysis[];
}

export interface GameReview {
  readonly decisions: number;
  readonly errorRate: number;
  readonly tier: SkillTier;
  readonly headline: string;
  readonly standing: string;
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
 * Three things to work on is already more than anyone acts on in one game, and
 * every line past the first competes with it.
 */
const MAX_FOCUS = 3;
const MAX_CUBE_MOMENTS = 3;

const ASSESSMENT: Readonly<Record<SkillTier, string>> = {
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

const PHASE_NAMES: Readonly<Record<GamePhase, string>> = {
  opening: 'opening',
  middlegame: 'middlegame',
  holding: 'holding game',
  race: 'race',
  bearoff: 'bear-off',
};

function standingFor(tier: SkillTier, standing: Tally): string {
  // Say so while the grade rests mostly on the prior, or a player who wins one
  // clean game reads a confident verdict drawn from barely any evidence.
  const caveat = isProvisional(standing)
    ? ` Your grade is still settling — it is based on ${standing.decisions} decision${standing.decisions === 1 ? '' : 's'} so far, and will move as you play more.`
    : '';
  return `${ASSESSMENT[tier]}${caveat}`;
}

function headlineFor(
  rate: number,
  history: PlayerProgress,
  turns: readonly TurnAnalysis[],
  cubes: readonly CubeAnalysis[],
  delta: PlayerProgress,
  levelledUp: boolean,
  tier: SkillTier,
): string {
  const sentences = [`This game cost ${Math.round(rate)} millipoints per decision.`];
  const errorRateHistory = history.errorRateHistory ?? [];
  if (errorRateHistory.length >= 1) {
    const recentEntries = errorRateHistory.slice(-5);
    const recent = recentEntries.reduce((sum, value) => sum + value, 0) / recentEntries.length;
    const difference = rate - recent;
    const tolerance = Math.max(5, 0.15 * recent);
    if (Math.abs(difference) < tolerance) {
      sentences.push(`In line with your recent ${Math.round(recent)}.`);
    } else if (difference < 0) {
      sentences.push(`Better than your recent ${Math.round(recent)}.`);
    } else {
      sentences.push(`Worse than your recent ${Math.round(recent)}.`);
    }
  }

  const decisions = [...turns, ...cubes];
  const totalLoss = delta.checker.equityLoss + delta.cube.equityLoss;
  if (!decisions.some((decision) => decision.severity !== 'fine')) {
    sentences.push('Nothing above an inaccuracy all game.');
  } else {
    const worst = [...decisions].sort((a, b) => b.equityLoss - a.equityLoss)[0];
    if (worst !== undefined && worst.equityLoss >= 0.4 * totalLoss) {
      sentences.push(`One ${worst.severity} in the ${PHASE_NAMES[worst.phase]} accounted for most of it.`);
    } else {
      const phase = Object.entries(delta.byPhase)
        .filter((entry): entry is [GamePhase, Tally] => entry[1] !== undefined)
        .sort((a, b) => b[1].equityLoss - a[1].equityLoss)[0];
      if (phase !== undefined) {
        sentences.push(
          `Most of it went in the ${PHASE_NAMES[phase[0]]}: ${Math.round(phase[1].equityLoss * 1000)} of ${Math.round(totalLoss * 1000)} millipoints.`,
        );
      }
    }
  }

  if (levelledUp) sentences.push(`That moves you up to ${tier}.`);
  return sentences.join(' ');
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
  const progressWithoutAdvice = mergeProgress(history, delta);

  const combined: Tally = {
    decisions: delta.checker.decisions + delta.cube.decisions,
    equityLoss: delta.checker.equityLoss + delta.cube.equityLoss,
  };
  const rate = errorRate(combined);
  const tier = tierFor(progressWithoutAdvice.checker);
  const levelledUp = tierRank(tier) > tierRank(tierFor(history.checker));
  const advisedHistory = history.advised ?? {};

  const byPhase: PhaseReport[] = Object.entries(delta.byPhase)
    .filter((entry): entry is [string, Tally] => entry[1] !== undefined)
    .map(([phase, tally]) => ({
      phase: phase as GamePhase,
      decisions: tally.decisions,
      errorRate: errorRate(tally),
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
      label: CONCEPT_LABEL[concept as Concept],
    }));

  const cubeAdvice = Object.keys(delta.cubeMistakes)
    .filter((mistake): mistake is CubeMistake => isCubeMistake(mistake as CubeMistake))
    .map((mistake) => ({
      key: `cube:${mistake}`,
      advice: CUBE_ADVICE[mistake],
    }))
    .filter(({ advice }) => advice.length > 0);

  const worstMoments = [...turns]
    .filter((turn) => turn.severity !== 'fine')
    .sort((a, b) => b.equityLoss - a.equityLoss)
    .slice(0, WORST_MOMENTS);

  // Focus is drawn from the cumulative record rather than this one game, so a
  // single clean game does not erase a habit and one bad game does not become
  // the whole curriculum.
  const focusPhase = weakestPhase(progressWithoutAdvice);
  // Advice that has already been given once reads as a stuck record unless it
  // says that it is a repeat, which is itself the point: the leak survived.
  // Cube advice comes before the second leak: a mishandled cube costs whole
  // points, and the list is cut short deliberately.
  const focusCandidates: readonly { key: string; text: string }[] = [
    ...(focusPhase
      ? [
          {
            key: `phase:${focusPhase}`,
            text:
              focusPhase === weakestPhase(history)
                ? `Still your costliest phase. ${phaseAdvice(focusPhase, advisedHistory[`phase:${focusPhase}`] ?? 0)}`
                : phaseAdvice(focusPhase, advisedHistory[`phase:${focusPhase}`] ?? 0),
          },
        ]
      : []),
    ...cubeAdvice.slice(0, 1).map(({ key, advice }) => ({ key, text: advice })),
    ...weakestConcepts(progressWithoutAdvice, 2).map((concept) => ({
      key: `concept:${concept}`,
      text:
        (history.byConcept[concept]?.missed ?? 0) > 0
          ? `This keeps recurring. ${conceptAdvice(concept, advisedHistory[`concept:${concept}`] ?? 0)}`
          : conceptAdvice(concept, advisedHistory[`concept:${concept}`] ?? 0),
    })),
  ];
  const focus = [
    ...new Set(focusCandidates.map(({ text }) => text)),
  ].slice(0, MAX_FOCUS);
  const advisedThisReview = new Set(
    focusCandidates.filter(({ text }) => focus.includes(text)).map(({ key }) => key),
  );

  const progress = mergeProgress(history, {
    ...delta,
    advised: Object.fromEntries([...advisedThisReview].map((key) => [key, 1])),
  });

  return {
    decisions: combined.decisions,
    errorRate: rate,
    tier,
    headline: headlineFor(rate, history, turns, cubes, delta, levelledUp, tier),
    standing: standingFor(tier, progress.checker),
    byPhase,
    leaks,
    cube: {
      decisions: delta.cube.decisions,
      errorRate: errorRate(delta.cube),
      mistakes: delta.cubeMistakes,
      moments: cubes.filter((cube) => cube.mistake !== 'undecided').slice(-MAX_CUBE_MOMENTS),
    },
    worstMoments,
    focus,
    progress,
    levelledUp,
    trend: trend(progress),
  };
}
