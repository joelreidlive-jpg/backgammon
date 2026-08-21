import { describe, expect, it } from 'vitest';
import { initialBoard } from './board.js';
import { makeBoard } from './testing.js';
import { formatXgid, parseXgid } from './xgid.js';

const OPENING = 'XGID=-b----E-C---eE---c-e----B-:0:0:1:63:0:0:0:0:10';

describe('parseXgid', () => {
  it('reads the starting position', () => {
    const position = parseXgid(OPENING);
    expect(position.board).toEqual(initialBoard());
    expect(position.turn).toBe('white');
    expect(position.dice).toEqual([6, 3]);
    expect(position.cube).toEqual({ value: 1, owner: null });
    expect(position.matchLength).toBe(0);
  });

  it('treats an unrolled or cube-action dice field as no dice', () => {
    expect(parseXgid(OPENING.replace(':63:', ':00:')).dice).toBeNull();
    expect(parseXgid(OPENING.replace(':63:', ':D:')).dice).toBeNull();
  });

  it('infers borne-off checkers from the missing ones', () => {
    const position = parseXgid('XGID=-BBBBB--------------------:0:0:1:00:0:0:0:0:10');
    expect(position.board.off.white).toBe(5);
    expect(position.board.off.black).toBe(15);
  });

  it('reads the bar, the cube and the match score', () => {
    const position = parseXgid('XGID=a-----E-C---eE---c-e-----A:1:-1:-1:00:2:3:1:5:10');
    expect(position.board.bar).toEqual({ white: 1, black: 1 });
    expect(position.turn).toBe('black');
    expect(position.cube).toEqual({ value: 2, owner: 'black' });
    expect(position.score).toEqual({ white: 2, black: 3 });
    expect(position.matchLength).toBe(5);
    expect(position.crawford).toBe(true);
  });

  it('rejects malformed records', () => {
    expect(() => parseXgid('XGID=-b-:0:0:1:63:0:0:0:0:10')).toThrow(/26 characters/);
    expect(() => parseXgid(OPENING.replace('-b----', 'Ab----'))).toThrow(/bar/);
    expect(() => parseXgid('XGID=-b----E-C---eE---c-e----B-')).toThrow(/malformed/);
  });
});

describe('formatXgid', () => {
  it('round-trips a position', () => {
    expect(formatXgid(parseXgid(OPENING))).toBe(OPENING);
  });

  it('round-trips checkers on the bar and off', () => {
    const original = {
      board: {
        ...makeBoard({ white: { 3: 2 }, black: { 20: 3 }, bar: { white: 1 } }),
        off: { white: 12, black: 12 },
      },
      turn: 'white' as const,
      dice: [5, 5] as const,
      cube: { value: 4, owner: 'white' as const },
      score: { white: 1, black: 0 },
      matchLength: 7,
      crawford: false,
    };
    expect(parseXgid(formatXgid(original)).board).toEqual(original.board);
    expect(parseXgid(formatXgid(original)).cube).toEqual(original.cube);
  });
});
