import { type Turn, boardKey, formatTurn } from '@bg/rules';
import { type RankedTurn, type SearchOptions, rankTurns } from '@bg/ai';
import type { Concept } from '@bg/coach';
import type { BenchmarkPosition, LoadedPosition } from './schema.js';
import { load } from './schema.js';

export interface PositionResult {
  readonly id: string;
  readonly tags: readonly Concept[];
  readonly enginePlay: string;
  readonly reference: string;
  readonly correct: boolean;
  /**
   * How much equity the engine believes its own play gains over the reference
   * play. Since the reference is right by assumption, this is the size of the
   * engine's misjudgement in its own units — a large value means it is not
   * merely undecided, it is confidently wrong.
   */
  readonly equityGap: number;
  /** Rank the engine gave the reference play; 0 when it agreed. */
  readonly referenceRank: number;
  /** Equity between the best and second-best play: how discriminating the problem is. */
  readonly discrimination: number;
  readonly difficulty: Difficulty;
}

export interface BenchmarkReport {
  readonly positions: number;
  /** Share of positions where the engine's first choice is an accepted play. */
  readonly accuracy: number;
  /** Share where an accepted play is in the engine's top three. */
  readonly top3: number;
  readonly meanEquityGap: number;
  readonly worst: readonly PositionResult[];
  readonly byTag: Readonly<Partial<Record<Concept, { positions: number; accuracy: number }>>>;
  readonly results: readonly PositionResult[];
}

export type Difficulty = 1 | 2 | 3 | 4 | 5;

/**
 * How hard a problem is, graded by the engine rather than by an author.
 *
 * A problem is hard when the plays are close: if the best play beats the
 * runner-up by a large margin the position is obvious, and if they are nearly
 * tied it takes real judgement. This is what makes a tiered ladder possible
 * from any set of positions, and it re-grades automatically as the evaluator
 * improves.
 */
export function difficultyOf(discrimination: number): Difficulty {
  if (discrimination >= 0.15) return 1;
  if (discrimination >= 0.08) return 2;
  if (discrimination >= 0.04) return 3;
  if (discrimination >= 0.015) return 4;
  return 5;
}

function rankOf(ranked: readonly RankedTurn[], turns: readonly Turn[]): number {
  const keys = new Set(turns.map((turn) => boardKey(turn.board)));
  const index = ranked.findIndex((r) => keys.has(boardKey(r.turn.board)));
  return index < 0 ? ranked.length : index;
}

export const BENCH_SEARCH: SearchOptions = { plies: 2, candidateWidth: 12 };

export function gradePosition(
  position: LoadedPosition,
  options: SearchOptions = BENCH_SEARCH,
): PositionResult {
  const ranked = rankTurns(position.board, position.player, position.dice, options);
  if (ranked.length === 0) throw new Error(`${position.id}: no legal turns`);

  const referenceRank = rankOf(ranked, position.bestTurns);
  const reference = ranked[Math.min(referenceRank, ranked.length - 1)];
  const discrimination = ranked.length > 1 ? ranked[0].equity - ranked[1].equity : Infinity;

  return {
    id: position.id,
    tags: position.tags,
    enginePlay: formatTurn(position.player, ranked[0].turn.moves),
    reference: position.best[0],
    correct: referenceRank === 0,
    equityGap: ranked[0].equity - reference.equity,
    referenceRank,
    discrimination,
    difficulty: difficultyOf(discrimination),
  };
}

export function runBenchmark(
  positions: readonly BenchmarkPosition[],
  options: SearchOptions = BENCH_SEARCH,
): BenchmarkReport {
  const results = positions.map((position) => gradePosition(load(position), options));

  const byTag: Partial<Record<Concept, { positions: number; accuracy: number }>> = {};
  for (const tag of new Set(results.flatMap((r) => r.tags))) {
    const tagged = results.filter((r) => r.tags.includes(tag));
    byTag[tag] = {
      positions: tagged.length,
      accuracy: tagged.filter((r) => r.correct).length / tagged.length,
    };
  }

  return {
    positions: results.length,
    accuracy: results.filter((r) => r.correct).length / results.length,
    top3: results.filter((r) => r.referenceRank < 3).length / results.length,
    meanEquityGap: results.reduce((sum, r) => sum + r.equityGap, 0) / results.length,
    worst: [...results].sort((a, b) => b.equityGap - a.equityGap).slice(0, 5),
    byTag,
    results,
  };
}

export function formatReport(report: BenchmarkReport): string {
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  const lines = [
    `${report.positions} positions · agreement ${pct(report.accuracy)} · reference in top 3 ${pct(report.top3)}`,
    `mean equity gap on disagreement ${report.meanEquityGap.toFixed(3)}`,
    '',
    'By concept:',
    ...Object.entries(report.byTag).map(
      ([tag, stat]) => `  ${tag.padEnd(24)} ${pct(stat.accuracy).padStart(4)}  (${stat.positions})`,
    ),
    '',
    'Worst disagreements:',
    ...report.worst.map(
      (r) => `  ${r.id.padEnd(18)} played ${r.enginePlay.padEnd(16)} want ${r.reference.padEnd(16)} −${r.equityGap.toFixed(3)}`,
    ),
  ];
  return lines.join('\n');
}
