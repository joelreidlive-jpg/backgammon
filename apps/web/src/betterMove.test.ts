import { describe, expect, it } from 'vitest';
import { initialBoard } from '@bg/rules';
import type { TurnAnalysis } from '@bg/protocol';
import {
  type BetterMoveState,
  isPreviewing,
  nextBetterMoveState,
  previewBoard,
  previewDestinations,
} from './betterMove.js';

function run(from: BetterMoveState, events: readonly Parameters<typeof nextBetterMoveState>[1][]) {
  return events.reduce(nextBetterMoveState, from);
}

describe('the better-move conversation', () => {
  it('reveals the play, then goes back to the played one', () => {
    expect(run('hidden', ['show'])).toBe('shown');
    expect(run('hidden', ['show', 'revert'])).toBe('hidden');
  });

  it('does not preview until asked', () => {
    expect(run('hidden', ['revert', 'settled', 'rejected'])).toBe('hidden');
    expect(isPreviewing('hidden')).toBe(false);
  });

  it('plays the better move only from the preview', () => {
    expect(run('hidden', ['play'])).toBe('hidden');
    expect(run('hidden', ['show', 'play'])).toBe('playing');
  });

  it('ignores everything but the server while a turn is in flight', () => {
    expect(run('playing', ['play', 'show', 'revert'])).toBe('playing');
    expect(run('playing', ['settled'])).toBe('played');
    expect(run('playing', ['rejected'])).toBe('failed');
  });

  it('keeps showing the coach board until the server answers', () => {
    expect(isPreviewing('shown')).toBe(true);
    expect(isPreviewing('playing')).toBe(true);
    expect(isPreviewing('played')).toBe(false);
  });

  it('lets a refused attempt be retried', () => {
    expect(run('failed', ['play'])).toBe('playing');
    expect(run('failed', ['show'])).toBe('shown');
  });

  it('will not replay a turn that has already been replaced', () => {
    expect(run('played', ['show', 'play', 'revert'])).toBe('played');
  });

  it('drops the advice when the position moves on', () => {
    for (const state of ['hidden', 'shown', 'playing', 'played', 'failed'] as const) {
      expect(nextBetterMoveState(state, 'reset')).toBe('hidden');
    }
  });
});

describe('the preview position', () => {
  const analysis: TurnAnalysis = {
    player: 'white',
    dice: [3, 1],
    played: '13/10 24/23',
    best: '8/5 6/5',
    boardBefore: initialBoard(),
    playedMoves: [
      { from: 13, to: 10, hit: false },
      { from: 24, to: 23, hit: false },
    ],
    bestMoves: [
      { from: 8, to: 5, hit: false },
      { from: 6, to: 5, hit: false },
    ],
    playedEquity: -0.05,
    bestEquity: 0.1,
    equityLoss: 0.15,
    severity: 'blunder',
    phase: 'opening',
    explanation: 'The better play makes a home board point.',
    missed: [],
    incurred: [],
  };

  it('shows the coach play rather than the one that was made', () => {
    const board = previewBoard(analysis);
    expect(board.points[5]).toBe(2);
    expect(board.points[8]).toBe(2);
    expect(board.points[6]).toBe(4);
    // The played move is not applied on top of it.
    expect(board.points[13]).toBe(5);
  });

  it('leaves the analysed position untouched', () => {
    previewBoard(analysis);
    expect(analysis.boardBefore.points[5]).toBe(0);
  });

  it('marks where the coach play lands', () => {
    expect([...previewDestinations(analysis)]).toEqual([5]);
  });
});
