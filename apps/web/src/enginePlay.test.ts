import { describe, expect, it } from 'vitest';
import { checkersAt, initialBoard } from '@bg/rules';
import type { AiPlay } from '@bg/protocol';
import { enginePlaySteps } from './enginePlay.js';

const play: AiPlay = {
  dice: [6, 5],
  notation: '24/18 18/13',
  board: initialBoard(),
  moves: [
    { from: 24, to: 18, hit: false },
    { from: 18, to: 13, hit: false },
  ],
};

describe('enginePlaySteps', () => {
  it('shows one position per checker moved, pulsing where it landed', () => {
    const steps = enginePlaySteps([play], 'white');

    expect(steps.map((step) => step.pulse)).toEqual([18, 13]);
    expect(checkersAt(steps[0].board, 'white', 18)).toBe(1);
    expect(checkersAt(steps[1].board, 'white', 18)).toBe(0);
  });

  it('ends on the position the play reached, leaving the rest alone', () => {
    const last = enginePlaySteps([play], 'white').at(-1)!.board;

    expect(checkersAt(last, 'white', 24)).toBe(checkersAt(initialBoard(), 'white', 24) - 1);
    expect(checkersAt(last, 'white', 13)).toBe(checkersAt(initialBoard(), 'white', 13) + 1);
    expect(checkersAt(last, 'white', 6)).toBe(checkersAt(initialBoard(), 'white', 6));
  });

  it('replays consecutive turns in order', () => {
    const steps = enginePlaySteps([play, { ...play, board: initialBoard(), moves: [play.moves[0]] }], 'white');
    expect(steps).toHaveLength(3);
  });

  it('has nothing to show for a turn with no legal move', () => {
    expect(enginePlaySteps([{ ...play, moves: [] }], 'white')).toEqual([]);
  });
});
