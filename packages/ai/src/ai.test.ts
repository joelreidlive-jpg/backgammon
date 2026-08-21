import { describe, expect, it } from 'vitest';
import { initialBoard, legalTurns, makeBoard, newMatch, playTurn, roll, formatTurn } from '@bg/rules';
import { heuristicEvaluator, winProbability } from './heuristic.js';
import { shotsAgainst, shotsFrom } from './shots.js';
import { ROLLS, bestTurn, rankTurns } from './search.js';
import { DIFFICULTY_PROFILES, selectTurn } from './difficulty.js';
import {
  DOUBLE_POINT,
  TAKE_POINT,
  TOO_GOOD_POINT,
  decideDouble,
  decideTake,
  equityAtWinProbability,
} from './cubeDecision.js';
import { decideTurn } from './engine.js';

describe('shot counting', () => {
  it('matches the standard combination counts for direct shots', () => {
    const board = makeBoard({ white: { 10: 1 }, black: { 4: 1 } });
    // Black is on 4 and moves upwards, so a white blot on 10 is six pips away.
    expect(shotsFrom(board, 'black', 4, 10)).toBe(17);
    expect(shotsFrom(board, 'black', 9, 10)).toBe(11);
  });

  it('counts nothing in the wrong direction', () => {
    const board = makeBoard({ white: { 10: 1 }, black: { 14: 2 } });
    expect(shotsFrom(board, 'black', 14, 10)).toBe(0);
  });

  it('discounts indirect shots blocked at the intermediate point', () => {
    const open = makeBoard({ white: { 10: 1 }, black: { 2: 1 } });
    const blockedRoutes = makeBoard({ white: { 10: 1, 4: 2, 5: 2, 6: 2, 7: 2 }, black: { 2: 1 } });
    expect(shotsFrom(open, 'black', 2, 10)).toBe(6);
    expect(shotsFrom(blockedRoutes, 'black', 2, 10)).toBeLessThan(6);
  });

  it('only counts checkers on the bar when the attacker has one', () => {
    const board = makeBoard({ white: { 20: 1 }, black: { 2: 1 }, bar: { black: 1 } });
    // Black must enter from the bar (slot 0), five pips from a blot on 20 is
    // out of range, so the blot on 20 is only reachable indirectly from there.
    expect(shotsAgainst(board, 'white', 20)).toBe(shotsFrom(board, 'black', 0, 20));
  });
});

describe('evaluator', () => {
  it('is antisymmetric', () => {
    const boards = [
      initialBoard(),
      makeBoard({ white: { 6: 3, 5: 2 }, black: { 20: 2, 13: 1 } }),
      makeBoard({ white: { 2: 2 }, black: { 23: 2 }, off: { white: 13, black: 13 } }),
    ];
    for (const board of boards) {
      expect(heuristicEvaluator(board, 'white')).toBeCloseTo(-heuristicEvaluator(board, 'black'), 10);
    }
  });

  it('is neutral in the symmetric starting position', () => {
    expect(heuristicEvaluator(initialBoard(), 'white')).toBeCloseTo(0, 10);
  });

  it('prefers a large pip lead in a race', () => {
    const board = makeBoard({ white: { 3: 2 }, black: { 22: 2 }, off: { white: 13, black: 5 } });
    expect(heuristicEvaluator(board, 'white')).toBeGreaterThan(0.3);
  });

  it('dislikes being on the bar against a strong home board', () => {
    const board = makeBoard({
      white: { 13: 5, 8: 3, 6: 5 },
      black: { 20: 2, 21: 2, 22: 2, 23: 2, 19: 2 },
      bar: { white: 2 },
    });
    expect(heuristicEvaluator(board, 'white')).toBeLessThan(-0.2);
  });

  it('scores a completed game at the win value', () => {
    const gammon = makeBoard({ black: { 20: 15 }, off: { white: 15 } });
    expect(heuristicEvaluator(gammon, 'white')).toBe(2);
    expect(heuristicEvaluator(gammon, 'black')).toBe(-2);
  });
});

describe('search', () => {
  it('weights the 21 distinct rolls to a total probability of one', () => {
    expect(ROLLS).toHaveLength(21);
    expect(ROLLS.reduce((sum, r) => sum + r.weight, 0)).toBeCloseTo(1, 10);
  });

  it('returns every legal turn, best first', () => {
    const board = initialBoard();
    const ranked = rankTurns(board, 'white', [3, 1], { plies: 1 });
    expect(ranked).toHaveLength(legalTurns(board, 'white', [3, 1]).length);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].equity).toBeGreaterThanOrEqual(ranked[i].equity);
    }
  });

  it('plays the golden point with an opening 3-1', () => {
    // 8/5 6/5 is the one universally agreed best opening play.
    const best = bestTurn(initialBoard(), 'white', [3, 1]);
    expect(best).not.toBeNull();
    expect(formatTurn('white', best!.turn.moves)).toBe('8/5 6/5');
  });

  it('hits and covers rather than leaving a blot to a made board', () => {
    const board = makeBoard({
      white: { 13: 2, 10: 1, 6: 2 },
      black: { 5: 1, 20: 2, 22: 2 },
    });
    const best = bestTurn(board, 'white', [5, 3], { plies: 1 });
    expect(best!.turn.moves.some((m) => m.hit)).toBe(true);
  });

  it('never ranks a turn above a winning one', () => {
    const board = makeBoard({ white: { 1: 1, 2: 1 }, black: { 20: 15 }, off: { white: 13 } });
    const ranked = rankTurns(board, 'white', [2, 1], { plies: 1 });
    expect(ranked[0].equity).toBeGreaterThan(1.5);
  });
});

describe('difficulty', () => {
  it('always plays the best turn at expert level', () => {
    const ranked = rankTurns(initialBoard(), 'white', [3, 1], { plies: 1 });
    for (let i = 0; i < 20; i++) {
      expect(selectTurn(ranked, DIFFICULTY_PROFILES.expert, () => 0)).toBe(ranked[0]);
    }
  });

  it('picks a worse turn at beginner level when the roll says so', () => {
    const ranked = rankTurns(initialBoard(), 'white', [3, 1], { plies: 1 });
    const chosen = selectTurn(ranked, DIFFICULTY_PROFILES.beginner, () => 0);
    expect(chosen).not.toBe(ranked[0]);
    expect(chosen.equity).toBeLessThanOrEqual(ranked[0].equity);
  });

  it('never selects outside the ranking', () => {
    const ranked = rankTurns(initialBoard(), 'white', [6, 5], { plies: 1 });
    for (let i = 0; i < 50; i++) {
      expect(ranked).toContain(selectTurn(ranked, DIFFICULTY_PROFILES.casual));
    }
  });
});

describe('cube decisions', () => {
  it('maps equity to a win probability', () => {
    expect(winProbability(0)).toBeCloseTo(0.5, 10);
    expect(winProbability(5)).toBe(1);
    expect(winProbability(-5)).toBe(0);
  });

  it('does not double from an even position', () => {
    expect(decideDouble(0).action).toBe('no-double');
  });

  // Stated as win probabilities and converted, rather than as raw evaluator
  // scores: what a score is worth in wins is a measured, changeable thing, and
  // a test written in scores would only assert the calibration of the day.
  it('doubles when clearly ahead and plays on when overwhelming', () => {
    expect(decideDouble(equityAtWinProbability(DOUBLE_POINT + 0.02)).action).toBe('double');
    expect(decideDouble(equityAtWinProbability(TOO_GOOD_POINT + 0.02)).action).toBe('too-good');
  });

  it('does not double on the sort of lead that merely looks good', () => {
    expect(decideDouble(equityAtWinProbability(DOUBLE_POINT - 0.05)).action).toBe('no-double');
  });

  it('drops a double when far behind and takes when close', () => {
    expect(decideTake(equityAtWinProbability(TAKE_POINT - 0.05)).response).toBe('drop');
    expect(decideTake(equityAtWinProbability(TAKE_POINT + 0.05)).response).toBe('take');
  });
});

describe('engine self-play', () => {
  it('completes a full game between two levels', () => {
    let seed = 987654321;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const die = () => 1 + Math.floor(random() * 6);

    let state = newMatch(1, 'white', [die(), die()]);
    let plies = 0;

    while (state.phase === 'move' || state.phase === 'roll') {
      if (state.phase === 'roll') {
        state = roll(state, [die(), die()]);
        continue;
      }
      const { chosen } = decideTurn(state, state.turn === 'white' ? 'expert' : 'casual', random);
      state = playTurn(state, chosen.turn.moves);
      plies += 1;
      expect(plies).toBeLessThan(500);
    }

    expect(state.matchWinner).not.toBeNull();
  }, 30000);
});
