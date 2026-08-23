import { describe, expect, it } from 'vitest';
import { facesOf, spentFaces } from './Dice.js';

describe('facesOf', () => {
  it('draws doubles as the four moves they are', () => {
    expect(facesOf([3, 3])).toEqual([3, 3, 3, 3]);
    expect(facesOf([6, 1])).toEqual([6, 1]);
  });
});

describe('spentFaces', () => {
  it('dims the die a move actually used, not the first one drawn', () => {
    expect([...spentFaces([6, 1], [{ from: 13, to: 12, hit: false }])]).toEqual([1]);
    expect([...spentFaces([6, 1], [{ from: 13, to: 7, hit: false }])]).toEqual([0]);
  });

  it('spends one die per move of a double', () => {
    expect(spentFaces([2, 2], [{ from: 13, to: 11, hit: false }, { from: 11, to: 9, hit: false }]).size).toBe(2);
  });

  it('lets a bear-off spend a die larger than the distance', () => {
    // 2/off with 6-5 must consume a die even though neither matches exactly,
    // and the smaller of the two oversized dice is the one it would use.
    expect([...spentFaces([6, 5], [{ from: 2, to: 0, hit: false }])]).toEqual([1]);
  });
});
