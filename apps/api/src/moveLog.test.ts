import { describe, expect, it } from 'vitest';
import { type LoggedTurn, lastTurnBy, opponentTurnsSince } from './moveLog.js';

/** Newest first, as the queries return them. */
function log(...turns: [number, number, string, string][]): LoggedTurn[] {
  return turns.map(([seq, game, player, notation]) => ({ seq, game, player, notation }));
}

describe('lastTurnBy', () => {
  it('finds the player’s most recent turn', () => {
    const rows = log([4, 2, 'black', '13/9'], [3, 2, 'white', '8/5 6/5'], [2, 2, 'black', '24/18']);
    expect(lastTurnBy(rows, 'white', 2)?.seq).toBe(3);
  });

  it('ignores turns from an earlier game', () => {
    const rows = log([5, 2, 'black', '13/9'], [4, 1, 'white', '6/off'], [3, 1, 'black', '13/9']);
    expect(lastTurnBy(rows, 'white', 2)).toBeNull();
  });
});

describe('opponentTurnsSince', () => {
  it('returns the replies since your last turn, oldest first', () => {
    const rows = log(
      [5, 1, 'black', '13/9 13/10'],
      [4, 1, 'black', '24/18'],
      [3, 1, 'white', '8/5 6/5'],
      [2, 1, 'black', '13/11'],
    );
    expect(opponentTurnsSince(rows, 'white', 1)).toEqual(['24/18', '13/9 13/10']);
  });

  it('stops at the previous game, so its plays are not shown as a reply', () => {
    const rows = log([4, 2, 'black', '24/18'], [3, 1, 'black', '13/9'], [2, 1, 'white', '8/5']);
    expect(opponentTurnsSince(rows, 'white', 2)).toEqual(['24/18']);
  });

  it('is empty when the player has just played', () => {
    const rows = log([3, 1, 'white', '8/5 6/5'], [2, 1, 'black', '13/11']);
    expect(opponentTurnsSince(rows, 'white', 1)).toEqual([]);
  });
});
