import { describe, expect, it } from 'vitest';
import { cubeVerdict } from './cubeVerdict.js';

describe('cubeVerdict', () => {
  it('names the decision the player took, and the one that was right', () => {
    expect(cubeVerdict({ choice: 'drop', best: 'take', mistake: 'wrong-drop' })).toBe(
      'You dropped — taking was right.',
    );
    expect(cubeVerdict({ choice: 'no-double', best: 'double', mistake: 'missed-double' })).toBe(
      'You kept the cube — doubling was right.',
    );
  });

  it('says so when the decision was correct', () => {
    expect(cubeVerdict({ choice: 'double', best: 'double', mistake: 'none' })).toBe(
      'You doubled — correct.',
    );
  });

  it('does not call an ungradeable decision wrong', () => {
    expect(cubeVerdict({ choice: 'double', best: 'double', mistake: 'undecided' })).toBe(
      'You doubled — either way is defensible.',
    );
  });
});
