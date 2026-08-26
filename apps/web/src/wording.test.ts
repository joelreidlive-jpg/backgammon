import { describe, expect, it } from 'vitest';
import { costInWords, reason } from './wording.js';

describe('plain-language grading', () => {
  it('describes a mistake by size rather than by equity', () => {
    expect(costInWords(0.4)).toBe('this one was costly');
    expect(costInWords(0.12)).toBe('this one was costly');
    expect(costInWords(0.08)).toBe('it gave up a clear edge');
    expect(costInWords(0.03)).toBe('it gave up a little');
    expect(costInWords(0)).toBe('the difference is tiny');
  });

  it('never puts a number in front of the player', () => {
    expect(costInWords(0.31)).not.toMatch(/\d/);
  });

  it('keeps the coach to two sentences', () => {
    expect(reason('The better play hits. Your play leaves a blot. And a third thing.')).toBe(
      'The better play hits. Your play leaves a blot.',
    );
    expect(reason('One sentence only.')).toBe('One sentence only.');
    expect(reason('No full stop')).toBe('No full stop');
  });
});
