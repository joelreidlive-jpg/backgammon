import { describe, expect, it } from 'vitest';
import { SEVERITY_HEADLINE, costInWords } from './wording.js';

describe('plain-language grading', () => {
  it('describes a mistake by size rather than by equity', () => {
    expect(costInWords(0.4)).toBe('this one was costly');
    expect(costInWords(0.12)).toBe('this one was costly');
    expect(costInWords(0.08)).toBe('it gave up a clear edge');
    expect(costInWords(0.03)).toBe('it gave up a little');
    expect(costInWords(0)).toBe('the difference is tiny');
  });

  it('never puts a number in front of the player', () => {
    const wordings = [...Object.values(SEVERITY_HEADLINE), costInWords(0.31)];
    for (const wording of wordings) expect(wording).not.toMatch(/\d/);
  });
});
