import { describe, expect, it } from 'vitest';
import {
  CHECKERS_PER_SIDE,
  allCheckersHome,
  blots,
  boardKey,
  checkersAt,
  initialBoard,
  isRace,
  pipCount,
} from './board.js';
import { applyMove, movesForDie } from './moves.js';
import { legalTurns, findTurn } from './legalTurns.js';
import { scoreGame, winKind, winnerOf } from './matchScore.js';
import { canDouble, newGame, newMatch, offerDouble, playTurn, respondToDouble, roll } from './match.js';
import { formatTurn } from './notation.js';
import { makeBoard } from './testing.js';

describe('board', () => {
  it('starts with 167 pips and 15 checkers per side', () => {
    const board = initialBoard();
    expect(pipCount(board, 'white')).toBe(167);
    expect(pipCount(board, 'black')).toBe(167);

    let white = 0;
    let black = 0;
    for (let slot = 1; slot <= 24; slot++) {
      white += checkersAt(board, 'white', slot);
      black += checkersAt(board, 'black', slot);
    }
    expect(white).toBe(CHECKERS_PER_SIDE);
    expect(black).toBe(CHECKERS_PER_SIDE);
  });

  it('mirrors the two sides in the starting position', () => {
    const board = initialBoard();
    for (let slot = 1; slot <= 24; slot++) {
      expect(checkersAt(board, 'white', slot)).toBe(checkersAt(board, 'black', 25 - slot));
    }
  });

  it('detects a race only once contact is impossible', () => {
    expect(isRace(initialBoard())).toBe(false);
    expect(isRace(makeBoard({ white: { 5: 2 }, black: { 20: 2 } }))).toBe(true);
    expect(isRace(makeBoard({ white: { 20: 1 }, black: { 5: 1 } }))).toBe(false);
    expect(isRace(makeBoard({ white: { 5: 2 }, black: { 20: 2 }, bar: { white: 1 } }))).toBe(false);
  });
});

describe('single moves', () => {
  it('offers only unblocked destinations from the opening position', () => {
    // White is on 24, 13, 8 and 6; a 1 reaches 23, 12, 7 and 5, but black owns 12.
    const moves = movesForDie(initialBoard(), 'white', 1);
    expect(moves.map((m) => m.to).sort((a, b) => a - b)).toEqual([5, 7, 23]);
  });

  it('forces entry from the bar before anything else', () => {
    const board = makeBoard({ white: { 13: 3 }, black: { 20: 2, 21: 2 }, bar: { white: 1 } });
    expect(movesForDie(board, 'white', 5)).toEqual([]);
    expect(movesForDie(board, 'white', 4)).toEqual([]);
    expect(movesForDie(board, 'white', 6)).toEqual([{ from: 25, to: 19, hit: false }]);
  });

  it('reports no play when every entry point is blocked', () => {
    const board = makeBoard({ white: {}, black: { 20: 2, 21: 2 }, bar: { white: 1 } });
    const turns = legalTurns(board, 'white', [4, 5]);
    expect(turns).toHaveLength(1);
    expect(turns[0].moves).toHaveLength(0);
  });

  it('hits a lone opponent checker and sends it to the bar', () => {
    const board = makeBoard({ white: { 10: 1 }, black: { 8: 1 } });
    const move = movesForDie(board, 'white', 2)[0];
    expect(move).toEqual({ from: 10, to: 8, hit: true });

    const after = applyMove(board, 'white', move);
    expect(after.bar.black).toBe(1);
    expect(checkersAt(after, 'white', 8)).toBe(1);
    expect(checkersAt(after, 'black', 8)).toBe(0);
  });

  it('cannot land on a point held by two or more opponent checkers', () => {
    const board = makeBoard({ white: { 10: 1 }, black: { 8: 2 } });
    expect(movesForDie(board, 'white', 2)).toEqual([]);
  });

  it('mirrors direction for black', () => {
    const board = makeBoard({ black: { 10: 1 } });
    expect(movesForDie(board, 'black', 3)).toEqual([{ from: 10, to: 13, hit: false }]);
  });
});

describe('bearing off', () => {
  it('requires every checker to be home', () => {
    const nearlyHome = makeBoard({ white: { 6: 2, 5: 2, 4: 2, 3: 2, 2: 2, 1: 4, 7: 1 } });
    expect(allCheckersHome(nearlyHome, 'white')).toBe(false);
    expect(movesForDie(nearlyHome, 'white', 6).some((m) => m.to === 0)).toBe(false);
  });

  it('bears off with an exact die', () => {
    const board = makeBoard({ white: { 6: 2, 5: 2, 4: 2, 3: 2, 2: 2, 1: 5 } });
    expect(allCheckersHome(board, 'white')).toBe(true);
    expect(movesForDie(board, 'white', 6)).toContainEqual({ from: 6, to: 0, hit: false });
  });

  it('allows a larger die only when no checker is farther back', () => {
    const clear = makeBoard({ white: { 2: 2 }, off: { white: 13 } });
    expect(movesForDie(clear, 'white', 5)).toContainEqual({ from: 2, to: 0, hit: false });

    const blocked = makeBoard({ white: { 2: 2, 4: 1 }, off: { white: 12 } });
    expect(movesForDie(blocked, 'white', 5).some((m) => m.from === 2 && m.to === 0)).toBe(false);
    // The rearmost checker may still use the oversized die.
    expect(movesForDie(blocked, 'white', 5)).toContainEqual({ from: 4, to: 0, hit: false });
  });

  it('bears black off past slot 25', () => {
    const board = makeBoard({ black: { 23: 2 }, off: { black: 13 } });
    expect(movesForDie(board, 'black', 3)).toContainEqual({ from: 23, to: 25, hit: false });
  });
});

describe('turn generation', () => {
  it('must use both dice when a sequence exists that does', () => {
    const board = makeBoard({ white: { 10: 1 } });
    const turns = legalTurns(board, 'white', [2, 5]);
    // 10/8/3 and 10/5/3 reach the same position, so they collapse to one turn.
    expect(turns).toHaveLength(1);
    expect(turns[0].moves).toHaveLength(2);
    expect(checkersAt(turns[0].board, 'white', 3)).toBe(1);
  });

  it('plays a double four times', () => {
    const board = makeBoard({ white: { 10: 1 } });
    const turns = legalTurns(board, 'white', [2, 2]);
    expect(turns).toHaveLength(1);
    expect(turns[0].moves).toHaveLength(4);
    expect(checkersAt(turns[0].board, 'white', 2)).toBe(1);
  });

  it('must play the higher die when only one die can be played', () => {
    // Either die is legal alone, but point 3 is blocked so the second never is.
    const board = makeBoard({ white: { 10: 1 }, black: { 3: 2 } });
    const turns = legalTurns(board, 'white', [2, 5]);
    expect(turns).toHaveLength(1);
    expect(turns[0].moves).toEqual([{ from: 10, to: 5, hit: false }]);
  });

  it('keeps distinct positions as distinct turns', () => {
    const board = makeBoard({ white: { 10: 1, 20: 1 } });
    const turns = legalTurns(board, 'white', [2, 5]);
    const keys = new Set(turns.map((t) => boardKey(t.board)));
    expect(keys.size).toBe(turns.length);
    expect(turns.length).toBeGreaterThan(1);
    expect(turns.every((t) => t.moves.length === 2)).toBe(true);
  });

  it('accepts a client sequence submitted in a different order', () => {
    const board = makeBoard({ white: { 10: 1, 20: 1 } });
    const forwards = findTurn(board, 'white', [2, 5], [
      { from: 20, to: 18, hit: false },
      { from: 10, to: 5, hit: false },
    ]);
    const backwards = findTurn(board, 'white', [2, 5], [
      { from: 10, to: 5, hit: false },
      { from: 20, to: 18, hit: false },
    ]);
    expect(forwards).not.toBeNull();
    expect(backwards).not.toBeNull();
    expect(boardKey(forwards!.board)).toBe(boardKey(backwards!.board));
  });

  it('rejects an illegal sequence', () => {
    const board = makeBoard({ white: { 10: 1 }, black: { 8: 2 } });
    expect(findTurn(board, 'white', [2, 5], [{ from: 10, to: 8, hit: false }])).toBeNull();
  });

  it('rejects a sequence that leaves a playable die unused', () => {
    const board = makeBoard({ white: { 10: 1 } });
    expect(findTurn(board, 'white', [2, 5], [{ from: 10, to: 8, hit: false }])).toBeNull();
  });
});

describe('scoring', () => {
  const bearOffBoard = (spec: Parameters<typeof makeBoard>[0]) => makeBoard(spec);

  it('awards a single game when the loser has borne off', () => {
    const board = bearOffBoard({ off: { white: 15, black: 3 }, black: { 20: 12 } });
    expect(winnerOf(board)).toBe('white');
    expect(winKind(board, 'white')).toBe('single');
    expect(scoreGame(board, 'white', 2).points).toBe(2);
  });

  it('awards a gammon when the loser has borne off nothing', () => {
    const board = bearOffBoard({ off: { white: 15 }, black: { 20: 15 } });
    expect(winKind(board, 'white')).toBe('gammon');
    expect(scoreGame(board, 'white', 1).points).toBe(2);
  });

  it('awards a backgammon for a checker left in the winner home board', () => {
    const board = bearOffBoard({ off: { white: 15 }, black: { 20: 14, 3: 1 } });
    expect(winKind(board, 'white')).toBe('backgammon');
    expect(scoreGame(board, 'white', 1).points).toBe(3);
  });

  it('awards a backgammon for a checker still on the bar', () => {
    const board = bearOffBoard({ off: { white: 15 }, black: { 20: 14 }, bar: { black: 1 } });
    expect(winKind(board, 'white')).toBe('backgammon');
  });
});

describe('doubling cube', () => {
  const start = () => ({ ...newMatch(7, 'white', [3, 1]), dice: null, phase: 'roll' as const });

  it('is available to either side while centred', () => {
    const state = start();
    expect(canDouble(state, 'white')).toBe(true);
    expect(canDouble(state, 'black')).toBe(false);
  });

  it('doubles the cube and passes ownership on a take', () => {
    const taken = respondToDouble(offerDouble(start(), 'white'), 'take');
    expect(taken.cube).toEqual({ value: 2, owner: 'black' });
    expect(taken.phase).toBe('roll');
    expect(canDouble(taken, 'white')).toBe(false);
  });

  it('ends the game at the pre-double value on a drop', () => {
    const state = { ...start(), cube: { value: 2, owner: 'white' as const } };
    const dropped = respondToDouble(offerDouble(state, 'white'), 'drop');
    expect(dropped.score.white).toBe(2);
    expect(dropped.phase).toBe('game-over');
  });

  it('is unavailable during the Crawford game', () => {
    const state = {
      ...newMatch(5, 'white', [3, 1]),
      dice: null,
      phase: 'roll' as const,
      score: { white: 4, black: 2 },
    };
    const crawford = newGame(state, 'white', [3, 1]);
    expect(crawford.crawfordGame).toBe(true);
    expect(canDouble({ ...crawford, dice: null, phase: 'roll' }, 'white')).toBe(false);

    const post = newGame(crawford, 'white', [3, 1]);
    expect(post.crawfordGame).toBe(false);
    expect(post.crawfordPlayed).toBe(true);
  });
});

describe('match flow', () => {
  it('passes the turn and clears the dice after a move', () => {
    const state = newMatch(1, 'white', [3, 1]);
    const next = playTurn(state, [
      { from: 8, to: 5, hit: false },
      { from: 6, to: 5, hit: false },
    ]);
    expect(next.turn).toBe('black');
    expect(next.dice).toBeNull();
    expect(next.phase).toBe('roll');
    expect(checkersAt(next.board, 'white', 5)).toBe(2);
  });

  it('rejects moves outside the move phase', () => {
    const state = { ...newMatch(1, 'white', [3, 1]), phase: 'roll' as const, dice: null };
    expect(() => playTurn(state, [])).toThrow();
  });

  it('ends the match when the score is reached', () => {
    const board = makeBoard({ white: { 1: 1 }, black: { 20: 15 }, off: { white: 14 } });
    const state = {
      ...newMatch(1, 'white', [1, 2]),
      board,
      dice: [1, 2] as const,
      phase: 'move' as const,
    };
    const done = playTurn(state, [{ from: 1, to: 0, hit: false }]);
    expect(done.phase).toBe('match-over');
    expect(done.matchWinner).toBe('white');
    expect(done.result?.kind).toBe('gammon');
  });
});

describe('notation', () => {
  it('formats bar, off, hits and repeats', () => {
    expect(formatTurn('white', [{ from: 8, to: 5, hit: false }, { from: 6, to: 5, hit: false }])).toBe('8/5 6/5');
    expect(formatTurn('white', [{ from: 25, to: 20, hit: true }])).toBe('bar/20*');
    expect(formatTurn('white', [{ from: 3, to: 0, hit: false }])).toBe('3/off');
    expect(
      formatTurn('white', [
        { from: 6, to: 4, hit: false },
        { from: 6, to: 4, hit: false },
      ]),
    ).toBe('6/4(2)');
    expect(formatTurn('white', [])).toBe('(no play)');
  });
});

describe('self-play invariants', () => {
  it('always reaches a winner with checker counts preserved', () => {
    let seed = 12345;
    const nextInt = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const die = () => nextInt(6) + 1;

    for (let game = 0; game < 20; game++) {
      let state = newMatch(1, 'white', [die(), die()]);
      let plies = 0;

      while (state.phase === 'move' || state.phase === 'roll') {
        if (state.phase === 'roll') {
          state = roll(state, [die(), die()]);
          continue;
        }
        const turns = legalTurns(state.board, state.turn, state.dice!);
        const chosen = turns[nextInt(turns.length)];
        state = playTurn(state, chosen.moves);

        const total = (p: 'white' | 'black') => {
          let n = state.board.bar[p] + state.board.off[p];
          for (let slot = 1; slot <= 24; slot++) n += checkersAt(state.board, p, slot);
          return n;
        };
        expect(total('white')).toBe(CHECKERS_PER_SIDE);
        expect(total('black')).toBe(CHECKERS_PER_SIDE);
        expect(blots(state.board, 'white').every((s) => checkersAt(state.board, 'white', s) === 1)).toBe(true);

        plies += 1;
        expect(plies).toBeLessThan(1000);
      }

      expect(state.matchWinner).not.toBeNull();
    }
  });
});
