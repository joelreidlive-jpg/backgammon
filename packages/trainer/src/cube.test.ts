import { describe, expect, it } from 'vitest';
import { EMPTY_PROGRESS, type PlayerProgress } from '@bg/coach';
import { initialBoard, formatXgid } from '@bg/rules';
import type { ResultDistribution } from '@bg/ai';
import { type CubeProblem, cubePrompt, gradeCube, loadCube } from './cube.js';
import { cubeTier, stability } from './cube-generate.js';
import { BASE_CUBE_SHARE, MAX_CUBE_SHARE, cubeShare, selectProblem } from './select.js';
import { CUBE_PROBLEMS } from './cube-problems.js';

/** A clear double and a clear take: 70% wins, no gammons either way. */
const CLEAR_DOUBLE: ResultDistribution = {
  winSingle: 0.7,
  winGammon: 0,
  winBackgammon: 0,
  loseSingle: 0.3,
  loseGammon: 0,
  loseBackgammon: 0,
};

const XGID = formatXgid({
  board: initialBoard(),
  turn: 'white',
  dice: null,
  cube: { value: 1, owner: null },
  score: { white: 0, black: 0 },
  matchLength: 0,
  crawford: false,
});

function problem(overrides: Partial<CubeProblem> = {}): CubeProblem {
  return {
    id: 'cube-test',
    xgid: XGID,
    question: 'offer',
    answer: 'double',
    tier: 2,
    provenance: 'rollout',
    phase: 'middlegame',
    margin: 0.2,
    distribution: CLEAR_DOUBLE,
    ...overrides,
  };
}

describe('cube problems', () => {
  it('never sends the answer to the client', () => {
    const sent = cubePrompt(loadCube(problem()));
    expect(Object.keys(sent)).not.toContain('answer');
    expect(Object.keys(sent)).not.toContain('margin');
    expect(Object.keys(sent)).not.toContain('distribution');
    // The options are listed, so the answer cannot be told apart by looking:
    // two problems differing only in their answer must serialise identically.
    expect(JSON.stringify(cubePrompt(loadCube(problem({ answer: 'no-double' }))))).toBe(
      JSON.stringify(sent),
    );
  });

  it('offers the answers the question actually has', () => {
    expect(cubePrompt(loadCube(problem())).answers).toEqual(['no-double', 'double', 'too-good']);
    expect(cubePrompt(loadCube(problem({ question: 'respond', answer: 'take' }))).answers).toEqual([
      'take',
      'drop',
    ]);
  });

  it('asks a response question of the side that did not double', () => {
    expect(loadCube(problem()).player).toBe('white');
    expect(loadCube(problem({ question: 'respond', answer: 'take' })).player).toBe('black');
  });

  it('prices a response from the doubler, and reports it to the responder', () => {
    // Stored from the side being asked: this responder wins 30% of the time,
    // which against no gammons is a take.
    const responder = problem({
      question: 'respond',
      answer: 'take',
      distribution: {
        winSingle: 0.3,
        winGammon: 0,
        winBackgammon: 0,
        loseSingle: 0.7,
        loseGammon: 0,
        loseBackgammon: 0,
      },
    });
    const loaded = loadCube(responder);
    expect(loaded.advice.reply).toBe('take');
    // The advice belongs to the doubler, so it reads as a 70% favourite while
    // the feedback the responder sees quotes their own 30%.
    expect(loaded.advice.doubleTake).toBeLessThan(loaded.advice.doublePass);
    expect(gradeCube(loaded, 'take')?.winProbability).toBeCloseTo(0.3, 10);
    expect(gradeCube(loaded, 'take')?.explanation).toContain('30%');

    const hopeless = loadCube({
      ...responder,
      answer: 'drop',
      distribution: { ...responder.distribution, winSingle: 0.15, loseSingle: 0.85 },
    });
    expect(hopeless.advice.reply).toBe('drop');
  });

  it('grades a right answer as solved and costs the margin for a wrong one', () => {
    const loaded = loadCube(problem());
    const right = gradeCube(loaded, 'double');
    expect(right?.solved).toBe(true);
    expect(right?.equityLoss).toBe(0);

    const wrong = gradeCube(loaded, 'no-double');
    expect(wrong?.solved).toBe(false);
    expect(wrong?.equityLoss).toBeCloseTo(0.2, 10);
    expect(wrong?.explanation).toContain('double');
  });

  it('rejects an answer to a different question', () => {
    expect(gradeCube(loadCube(problem()), 'take')).toBeNull();
    expect(gradeCube(loadCube(problem({ question: 'respond', answer: 'take' })), 'double')).toBeNull();
  });

  it('reports the gammon rate, which is what the answer turned on', () => {
    const gammonish = problem({
      distribution: {
        winSingle: 0.35,
        winGammon: 0.35,
        winBackgammon: 0,
        loseSingle: 0.3,
        loseGammon: 0,
        loseBackgammon: 0,
      },
    });
    const result = gradeCube(loadCube(gammonish), 'double');
    expect(result?.winProbability).toBeCloseTo(0.7, 10);
    expect(result?.gammonRate).toBeCloseTo(0.5, 10);
    expect(result?.explanation).toContain('50%');
  });

  it('grades the same answer for every problem in the shipped set', () => {
    for (const entry of CUBE_PROBLEMS) {
      const loaded = loadCube(entry);
      const advice = loaded.question === 'offer' ? loaded.advice.offer : loaded.advice.reply;
      expect(advice).toBe(entry.answer);
      expect(gradeCube(loaded, entry.answer)?.solved).toBe(true);
    }
  });
});

describe('choosing cube problems', () => {
  it('serves them by tier and recency, like checker problems', () => {
    const pool = [problem({ id: 'a', tier: 1 }), problem({ id: 'b', tier: 1 })];
    const chosen = selectProblem({
      problems: pool,
      attempts: [{ problemId: 'a', tier: 1, solved: false, at: Date.now() }],
      weakConcepts: [],
      tier: 1,
      random: () => 0,
    });
    expect(chosen?.id).toBe('b');
  });

  it('asks more cube questions of a player who leaks on the cube', () => {
    const weak: PlayerProgress = {
      ...EMPTY_PROGRESS,
      checker: { decisions: 200, equityLoss: 2 },
      cube: { decisions: 40, equityLoss: 8 },
    };
    const sound: PlayerProgress = {
      ...EMPTY_PROGRESS,
      checker: { decisions: 200, equityLoss: 20 },
      cube: { decisions: 40, equityLoss: 0.2 },
    };

    expect(cubeShare(EMPTY_PROGRESS)).toBe(BASE_CUBE_SHARE);
    expect(cubeShare(weak)).toBeGreaterThan(BASE_CUBE_SHARE);
    expect(cubeShare(weak)).toBeLessThanOrEqual(MAX_CUBE_SHARE);
    // Never below the floor: cube practice is not optional for a player who
    // simply never turns the cube.
    expect(cubeShare(sound)).toBe(BASE_CUBE_SHARE);
  });
});

describe('certifying a cube answer', () => {
  it('is confident when the trials all point one way', () => {
    const samples = Array.from({ length: 400 }, (_, index) => (index < 320 ? 1 : -1));
    let seed = 1;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    expect(stability(samples, 'offer', 'double', 50, random)).toBeGreaterThan(0.95);
    // The same trials cannot certify the opposite action.
    expect(stability(samples, 'offer', 'no-double', 50, random)).toBeLessThan(0.05);
  });

  it('grades difficulty by what the wrong answer costs', () => {
    expect(cubeTier(0.6)).toBe(1);
    expect(cubeTier(0.3)).toBe(2);
    expect(cubeTier(0.05)).toBe(5);
    expect(cubeTier(0.2)).toBeLessThan(cubeTier(0.1));
  });
});
