import { describe, expect, it } from 'vitest';
import { formatTurn, initialBoard, makeBoard } from '@bg/rules';
import { rolloutTurns } from './rollout.js';

const FAST = { maxTrials: 72, minTrials: 36, checkEvery: 36, candidates: 3 };

describe('rollout', () => {
  it('is reproducible from its seed', () => {
    const board = makeBoard({ white: { 6: 2, 5: 2, 4: 2 }, black: { 20: 2, 19: 2, 18: 2 } });
    const first = rolloutTurns(board, 'white', [3, 1], { ...FAST, seed: 7 });
    const second = rolloutTurns(board, 'white', [3, 1], { ...FAST, seed: 7 });

    expect(second.candidates.map((c) => formatTurn('white', c.turn.moves))).toEqual(
      first.candidates.map((c) => formatTurn('white', c.turn.moves)),
    );
    expect(second.candidates.map((c) => c.equity)).toEqual(first.candidates.map((c) => c.equity));
  });

  it('reports equity in points, so a won game is worth more than the evaluator can score', () => {
    // White bears its last two checkers off this turn, and black has borne
    // off nothing and still sits in white's home board: a backgammon, worth
    // three points, which is off the scale the evaluator can even express.
    const board = makeBoard({
      white: { 2: 1, 1: 1 },
      black: { 3: 2 },
      off: { white: 13, black: 0 },
    });
    const result = rolloutTurns(board, 'white', [2, 1], { ...FAST, maxTrials: 36, minTrials: 36 });
    expect(formatTurn('white', result.candidates[0].turn.moves)).toBe('2/off 1/off');
    expect(result.candidates[0].equity).toBe(3);
  });

  it('takes the play that wins the race rather than the one that dawdles', () => {
    // A pure race white leads: bearing a checker off beats burying it.
    const board = makeBoard({
      white: { 6: 1, 3: 2 },
      black: { 22: 2, 21: 2 },
      off: { white: 12, black: 11 },
    });
    const result = rolloutTurns(board, 'white', [6, 2], { ...FAST, candidates: 4 });
    expect(formatTurn('white', result.candidates[0].turn.moves)).toContain('6/off');
  });

  it('does not claim a decision it cannot support', () => {
    // Symmetric-ish contact position rolled out a handful of times: the
    // stopping rule must not report a winner off six trials of noise.
    const board = makeBoard({ white: { 6: 2, 8: 2, 13: 2 }, black: { 19: 2, 17: 2, 12: 2 } });
    const result = rolloutTurns(board, 'white', [2, 1], {
      maxTrials: 6,
      minTrials: 6,
      checkEvery: 6,
      candidates: 3,
      confidence: 2.5,
    });
    expect(result.trials).toBe(6);
    expect(result.margin).toBeLessThanOrEqual(2.5 * result.marginStderr);
    expect(result.decisive).toBe(false);
  });

  it('stops early once the leader is clear', () => {
    const board = makeBoard({
      white: { 6: 1, 2: 2 },
      black: { 23: 2, 22: 2 },
      off: { white: 12, black: 11 },
    });
    const result = rolloutTurns(board, 'white', [6, 1], {
      maxTrials: 1296,
      minTrials: 36,
      checkEvery: 36,
      candidates: 3,
    });
    expect(result.decisive).toBe(true);
    expect(result.trials).toBeLessThan(1296);
  });

  it('truncates to an estimate instead of playing to the end', () => {
    const board = makeBoard({ white: { 6: 2, 8: 2, 13: 3 }, black: { 19: 2, 17: 2, 12: 3 } });
    // A flat estimator makes every truncated trial score the same, so any
    // spread that survives can only have come from games that really finished
    // inside the ply limit.
    const flat = () => 0.25;
    const result = rolloutTurns(board, 'white', [3, 1], {
      ...FAST,
      truncate: 4,
      estimate: flat,
    });

    for (const candidate of result.candidates) {
      expect(candidate.equity).toBeCloseTo(0.25, 10);
    }
    expect(result.decisive).toBe(false);
  });

  it('cuts the variance of a rolled-out margin', () => {
    // The point of truncating: the same position, same trials, tighter error
    // bars, because the coin-flips of the endgame are replaced by an estimate.
    const board = initialBoard();
    const budget = { maxTrials: 36, minTrials: 36, checkEvery: 36, candidates: 3, confidence: 99 };

    const full = rolloutTurns(board, 'white', [4, 2], budget);
    const truncated = rolloutTurns(board, 'white', [4, 2], { ...budget, truncate: 11 });

    expect(truncated.marginStderr).toBeLessThan(full.marginStderr);
  });

  it('needs no trials when the position plays itself', () => {
    // Bar entry with only one legal answer: there is nothing to compare.
    const board = makeBoard({
      white: { 13: 2 },
      black: { 20: 2, 21: 2, 22: 2, 23: 2, 24: 2, 19: 2 },
      bar: { white: 1 },
    });
    const result = rolloutTurns(board, 'white', [1, 2], FAST);
    expect(result.trials).toBe(0);
    expect(result.decisive).toBe(true);
    expect(result.candidates).toHaveLength(1);
  });
});
