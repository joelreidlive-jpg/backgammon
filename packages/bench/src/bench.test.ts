import { describe, expect, it } from 'vitest';
import { formatTurn } from '@bg/rules';
import { OPENING_ROLLS } from './positions/openings.js';
import { load } from './schema.js';
import { difficultyOf, gradePosition, runBenchmark } from './run.js';

describe('benchmark positions', () => {
  it('every reference play is legal in its position', () => {
    for (const position of OPENING_ROLLS) {
      const loaded = load(position);
      expect(loaded.bestTurns).toHaveLength(position.best.length);
      for (const [index, turn] of loaded.bestTurns.entries()) {
        // Round-tripping through notation proves the play we matched is the
        // play we wrote down, not merely some legal turn.
        const played = formatTurn(loaded.player, turn.moves).split(' ').sort();
        expect(played).toEqual(position.best[index].split(' ').sort());
      }
    }
  });

  it('rejects a play that is not legal in the position', () => {
    expect(() => load({ ...OPENING_ROLLS[0], best: ['13/7 8/7'] })).toThrow(/not a legal turn/);
  });
});

describe('difficultyOf', () => {
  it('grades a clear-cut position as easy and a close one as hard', () => {
    expect(difficultyOf(0.4)).toBe(1);
    expect(difficultyOf(0.005)).toBe(5);
  });
});

describe('evaluator agreement', () => {
  const report = runBenchmark(OPENING_ROLLS);

  // These thresholds are a ratchet, not a target: they exist so that a change
  // to the evaluator cannot quietly make its opening play worse. Raise them
  // when the engine improves; never lower them without saying why.
  it('agrees with the opening consensus at least half the time', () => {
    expect(report.accuracy).toBeGreaterThanOrEqual(0.5);
  });

  it('always ranks the consensus play in its top three', () => {
    expect(report.top3).toBe(1);
  });

  it('is never far wrong when it disagrees', () => {
    expect(report.meanEquityGap).toBeLessThanOrEqual(0.06);
  });

  it('makes the five point with 31, the one play no engine may miss', () => {
    const result = gradePosition(load(OPENING_ROLLS.find((p) => p.id === 'opening-31')!));
    expect(result.enginePlay).toBe('8/5 6/5');
    expect(result.difficulty).toBeLessThanOrEqual(2);
  });
});
