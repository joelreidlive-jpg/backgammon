import { describe, expect, it } from 'vitest';
import { applyMove, boardKey, legalTurns, newMatch, playTurn } from '@bg/rules';
import { type LoggedTurn, lastTurnBy, opponentTurnsSince, replayedPlay } from './moveLog.js';

/** Newest first, as the queries return them. */
function log(...turns: [number, number, string, string, [number, number]?][]): LoggedTurn[] {
  return turns.map(([seq, game, player, notation, dice]) => ({
    seq,
    game,
    player,
    notation,
    dice: JSON.stringify(dice ?? [3, 1]),
  }));
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
      [5, 1, 'black', '13/9 13/10', [4, 3]],
      [4, 1, 'black', '24/18', [6, 5]],
      [3, 1, 'white', '8/5 6/5'],
      [2, 1, 'black', '13/11'],
    );
    expect(opponentTurnsSince(rows, 'white', 1).map((row) => row.seq)).toEqual([4, 5]);
  });

  it('stops at the previous game, so its plays are not shown as a reply', () => {
    const rows = log([4, 2, 'black', '24/18', [6, 5]], [3, 1, 'black', '13/9'], [2, 1, 'white', '8/5']);
    expect(opponentTurnsSince(rows, 'white', 2).map((row) => row.seq)).toEqual([4]);
  });

  it('is empty when the player has just played', () => {
    const rows = log([3, 1, 'white', '8/5 6/5'], [2, 1, 'black', '13/11']);
    expect(opponentTurnsSince(rows, 'white', 1)).toEqual([]);
  });
});

describe('replayedPlay', () => {
  /** An opening 6-5 played by black, as the log would hold it. */
  function opening(): { row: Parameters<typeof replayedPlay>[0]; after: string } {
    const before = newMatch(1, 'black', [6, 5]);
    const turn = legalTurns(before.board, 'black', [6, 5])[0];
    const after = JSON.stringify(playTurn(before, turn.moves));
    return {
      row: {
        seq: 1,
        game: 1,
        player: 'black',
        dice: JSON.stringify([6, 5]),
        notation: '24/18 18/13',
        state_before: JSON.stringify(before),
        state_after: after,
      },
      after,
    };
  }

  it('recovers moves that replay to the position the log recorded', () => {
    const { row, after } = opening();
    const play = replayedPlay(row, 'black');

    expect(play.dice).toEqual([6, 5]);
    expect(play.notation).toBe('24/18 18/13');
    expect(play.moves).toHaveLength(2);

    const reached = play.moves.reduce((board, move) => applyMove(board, 'black', move), play.board);
    expect(boardKey(reached)).toBe(boardKey(JSON.parse(after).board));
  });

  it('has no moves for a turn the log says changed nothing', () => {
    const { row } = opening();
    expect(replayedPlay({ ...row, state_after: row.state_before }, 'black').moves).toEqual([]);
  });
});
