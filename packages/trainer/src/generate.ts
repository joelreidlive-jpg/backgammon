import {
  type Board,
  type Dice,
  type Player,
  formatTurn,
  formatXgid,
  initialBoard,
  legalTurns,
  opponent,
  winnerOf,
} from '@bg/rules';
import { type SearchOptions, rankTurns, selectTurn } from '@bg/ai';
import { conceptsOf, phaseOf } from '@bg/coach';
import { OPENING_ROLLS, difficultyOf, load as loadBenchmark } from '@bg/bench';
import { MAX_GENERATED_TIER, type Problem, type Tier } from './problem.js';

export interface GenerateOptions {
  readonly games: number;
  readonly seed: number;
  /** Share of positions offered to the (expensive) candidate test. */
  readonly sampleRate: number;
  /** Below this margin the engine cannot tell the plays apart, so neither problem nor answer is trustworthy. */
  readonly minMargin: number;
  /** A problem with two or three plays is a quiz, not an exercise. */
  readonly minLegalTurns: number;
  readonly maxProblems: number;
}

export const DEFAULT_GENERATE: GenerateOptions = {
  games: 60,
  seed: 20240817,
  sampleRate: 0.25,
  minMargin: 0.02,
  minLegalTurns: 6,
  maxProblems: 160,
};

/** Depth used to answer a candidate: deeper than the one that grades attempts. */
const ANSWER_SEARCH: SearchOptions = { plies: 2, candidateWidth: 20 };
/** The shallow view the answer has to survive to count as stable. */
const SHALLOW_SEARCH: SearchOptions = { plies: 1 };
/** Play during self-play, weak enough to wander into positions a human reaches. */
const PLAY_SEARCH: SearchOptions = { plies: 1, candidateWidth: 8 };
const PLAY_PROFILE = { ...PLAY_SEARCH, blunderRate: 0.2, blunderDepth: 4 };

/** Deterministic PRNG, so a generated set can be regenerated exactly. */
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

function xgidOf(board: Board, player: Player, dice: Dice): string {
  return formatXgid({
    board,
    turn: player,
    dice,
    cube: { value: 1, owner: null },
    score: { white: 0, black: 0 },
    matchLength: 0,
    crawford: false,
  });
}

/**
 * Test one position as a problem.
 *
 * Two filters do the real work. The margin has to be wide enough that the
 * answer is not inside the evaluator's own error, and the answer has to be the
 * same play at one ply and at two — an answer that changes with depth is one
 * the engine has not settled, and drilling it would teach a coin flip.
 */
export function candidate(board: Board, player: Player, dice: Dice, options: GenerateOptions): Problem | null {
  const legal = legalTurns(board, player, dice);
  if (legal.length < options.minLegalTurns) return null;

  const deep = rankTurns(board, player, dice, ANSWER_SEARCH);
  if (deep.length < 2) return null;

  const margin = deep[0].equity - deep[1].equity;
  if (margin < options.minMargin) return null;

  const tier = difficultyOf(margin) as Tier;
  if (tier > MAX_GENERATED_TIER) return null;

  const shallow = rankTurns(board, player, dice, SHALLOW_SEARCH)[0];
  const best = formatTurn(player, deep[0].turn.moves);
  if (!shallow || formatTurn(player, shallow.turn.moves) !== best) return null;

  return {
    id: '',
    xgid: xgidOf(board, player, dice),
    best: [best],
    tier,
    provenance: 'engine',
    concepts: [...conceptsOf(board, deep[0].turn.board, player)],
    phase: phaseOf(board, player),
    margin,
  };
}

/**
 * Harvest problems from engine self-play.
 *
 * Self-play rather than hand-built positions because the ladder needs hundreds
 * of positions that actually occur, and because every position it produces is
 * reachable — a hand-built position can be one no game would ever reach, which
 * teaches a shape the player will never meet.
 */
export function generateProblems(options: GenerateOptions = DEFAULT_GENERATE): Problem[] {
  const random = mulberry32(options.seed);
  const problems: Problem[] = [];
  const seen = new Set<string>();

  for (let game = 0; game < options.games && problems.length < options.maxProblems; game++) {
    let board: Board = initialBoard();
    let player: Player = random() < 0.5 ? 'white' : 'black';

    for (let ply = 0; ply < 300; ply++) {
      const dice = rollDice(random);
      const ranked = rankTurns(board, player, dice, PLAY_SEARCH);
      if (ranked.length === 0) {
        player = opponent(player);
        continue;
      }

      if (random() < options.sampleRate && problems.length < options.maxProblems) {
        const found = candidate(board, player, dice, options);
        if (found && !seen.has(found.xgid)) {
          seen.add(found.xgid);
          problems.push({ ...found, id: `sp-${game}-${ply}` });
        }
      }

      board = selectTurn(ranked, PLAY_PROFILE, random).turn.board;
      if (winnerOf(board) !== null) break;
      player = opponent(player);
    }
  }

  return problems;
}

/**
 * The benchmark's opening rolls as problems.
 *
 * These are the only positions in the set whose answer does not come from the
 * engine, so they are allowed to be tier 5: a narrow margin is a reason to
 * distrust an engine answer, not an expert one.
 */
export function consensusProblems(): Problem[] {
  return OPENING_ROLLS.map((position): Problem => {
    const loaded = loadBenchmark(position);
    const ranked = rankTurns(loaded.board, loaded.player, loaded.dice, ANSWER_SEARCH);
    const margin = ranked.length > 1 ? ranked[0].equity - ranked[1].equity : 1;

    return {
      id: position.id,
      xgid: position.xgid,
      best: position.best,
      tier: difficultyOf(margin) as Tier,
      provenance: 'consensus',
      concepts: [...conceptsOf(loaded.board, loaded.bestTurns[0].board, loaded.player)],
      phase: phaseOf(loaded.board, loaded.player),
      margin,
    };
  });
}

/** Render a generated set as the committed data module. */
export function formatProblemModule(problems: readonly Problem[]): string {
  const entries = problems.map((problem) =>
    [
      '  {',
      `    id: ${JSON.stringify(problem.id)},`,
      `    xgid: ${JSON.stringify(problem.xgid)},`,
      `    best: ${JSON.stringify(problem.best)},`,
      `    tier: ${problem.tier},`,
      `    provenance: ${JSON.stringify(problem.provenance)},`,
      `    concepts: ${JSON.stringify(problem.concepts)},`,
      `    phase: ${JSON.stringify(problem.phase)},`,
      `    margin: ${problem.margin.toFixed(4)},`,
      '  },',
    ].join('\n'),
  );

  return [
    '// Generated by `GENERATE_PROBLEMS=1 npx vitest run packages/trainer/src/build-problems.test.ts`',
    '// — do not edit by hand.',
    '//',
    "// 'consensus' entries are the benchmark's opening rolls, whose answers are",
    "// public expert agreement. 'engine' entries are positions harvested from",
    "// self-play, answered by this repository's own search.",
    "import type { Problem } from './problem.js';",
    '',
    'export const GENERATED_PROBLEMS: readonly Problem[] = [',
    ...entries,
    '];',
    '',
  ].join('\n');
}
