import { describe, expect, it } from 'vitest';
import { checkersAt, initialBoard } from './board.js';
import { findTurn, legalTurns } from './legalTurns.js';
import { destinationsFrom, extendTurn, startTurn, undoLastMove } from './turnBuilder.js';
import { makeBoard } from './testing.js';

describe('turn builder', () => {
  it('starts incomplete with the opening options', () => {
    const builder = startTurn(initialBoard(), 'white', [3, 1]);
    expect(builder.complete).toBe(false);
    expect(builder.pending).toHaveLength(0);
    expect(builder.options.length).toBeGreaterThan(0);
  });

  it('completes a two-move turn and matches a legal turn', () => {
    let builder = startTurn(initialBoard(), 'white', [3, 1]);
    builder = extendTurn(builder, { from: 8, to: 5, hit: false });
    expect(builder.complete).toBe(false);
    builder = extendTurn(builder, { from: 6, to: 5, hit: false });

    expect(builder.complete).toBe(true);
    expect(checkersAt(builder.board, 'white', 5)).toBe(2);
    expect(builder.options).toHaveLength(0);
  });

  it('ignores a move that is not an option', () => {
    const builder = startTurn(initialBoard(), 'white', [3, 1]);
    expect(extendTurn(builder, { from: 24, to: 12, hit: false })).toBe(builder);
  });

  it('never offers a first move that cannot lead to a full turn', () => {
    // Point 3 is blocked, so only the 5 may be played and only from the 10.
    const board = makeBoard({ white: { 10: 1 }, black: { 3: 2 } });
    const builder = startTurn(board, 'white', [2, 5]);
    expect(builder.options).toEqual([{ from: 10, to: 5, hit: false }]);
  });

  it('undoes the last move', () => {
    let builder = startTurn(initialBoard(), 'white', [3, 1]);
    builder = extendTurn(builder, { from: 8, to: 5, hit: false });
    builder = undoLastMove(builder);

    expect(builder.pending).toHaveLength(0);
    expect(checkersAt(builder.board, 'white', 8)).toBe(3);
  });

  it('lists destinations for a slot', () => {
    // 24/18 then 18/13 is the only route off the 24 with a 6-5: black owns 19.
    const builder = startTurn(initialBoard(), 'white', [6, 5]);
    expect(destinationsFrom(builder, 24).map((m) => m.to)).toEqual([18]);
  });

  /**
   * 17/13 13/11* and 17/15 15/11* reach the same position, so only one of them
   * survives into the list of distinct plays. The player who took the other
   * route must still be able to finish it.
   */
  it('lets one checker play both dice by either route', () => {
    const board = makeBoard({ white: { 17: 1, 24: 2, 4: 2 }, black: { 11: 1 } });
    const builder = extendTurn(startTurn(board, 'white', [2, 4]), { from: 17, to: 13, hit: false });

    expect(destinationsFrom(builder, 13).map((m) => m.to)).toEqual([11]);
    expect(extendTurn(builder, { from: 13, to: 11, hit: true }).complete).toBe(true);
  });

  it('accepts the play by the route the player took', () => {
    const board = makeBoard({ white: { 17: 1, 24: 2, 4: 2 }, black: { 11: 1 } });
    const turn = findTurn(board, 'white', [2, 4], [
      { from: 17, to: 13, hit: false },
      { from: 13, to: 11, hit: true },
    ]);

    if (turn === null) throw new Error('the play was rejected');
    expect(checkersAt(turn.board, 'white', 11)).toBe(1);
    expect(turn.board.bar.black).toBe(1);
  });

  it('only ever completes into a turn the rules accept', () => {
    const board = makeBoard({ white: { 10: 1, 20: 1 } });
    const legal = new Set(
      legalTurns(board, 'white', [2, 5]).map((t) =>
        t.moves
          .map((m) => `${m.from}/${m.to}`)
          .sort()
          .join(' '),
      ),
    );

    let builder = startTurn(board, 'white', [2, 5]);
    while (!builder.complete) {
      builder = extendTurn(builder, builder.options[0]);
    }
    const played = builder.pending
      .map((m) => `${m.from}/${m.to}`)
      .sort()
      .join(' ');
    expect(legal.has(played)).toBe(true);
  });
});
