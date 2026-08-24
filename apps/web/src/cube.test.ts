import { describe, expect, it } from 'vitest';
import { cubeFace, cubeLabel, cubeSide } from './cube.js';

describe('cubeFace', () => {
  it('rests on 64 while the cube is unused', () => {
    expect(cubeFace(1)).toBe(64);
  });

  it('shows the stake once the cube has been turned', () => {
    expect(cubeFace(2)).toBe(2);
    expect(cubeFace(64)).toBe(64);
  });
});

describe('cubeSide', () => {
  it('is centred while nobody owns it', () => {
    expect(cubeSide(null, 'white')).toBe('centre');
  });

  it('sits with whoever owns it, from the player’s point of view', () => {
    expect(cubeSide('white', 'white')).toBe('yours');
    expect(cubeSide('black', 'white')).toBe('theirs');
    expect(cubeSide('black', 'black')).toBe('yours');
  });
});

describe('cubeLabel', () => {
  it('says who holds it', () => {
    expect(cubeLabel(2, 'white', 'white', false)).toBe('doubling cube at 2, yours');
    expect(cubeLabel(1, null, 'white', false)).toBe('doubling cube at 1, centred');
  });

  it('says what is being asked when a double is on the table', () => {
    expect(cubeLabel(2, 'black', 'white', true)).toBe('doubling cube offered at 4');
  });
});
