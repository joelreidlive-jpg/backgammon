import { describe, expect, it } from 'vitest';
import { initialBoard } from '@bg/rules';
import {
  type ResultDistribution,
  CUBE_LIFE,
  cubeAdvice,
  cubefulEquity,
  invert,
  shapeOf,
} from './cubeful.js';
import { rolloutDistribution } from './rollout.js';

/**
 * The position Janowski's cube formulae are worked through in the reference
 * write-up: an opening 21 slot, whose cubeful equities XG reports as 0.181
 * owned, 0.002 centred and −0.344 for the opponent at cube 2. Matching those
 * to a few thousandths is the only external check this model gets.
 */
const OPENING_SLOT: ResultDistribution = {
  winSingle: 0.3571,
  winGammon: 0.1316,
  winBackgammon: 0.0102,
  loseSingle: 0.3654,
  loseGammon: 0.1285,
  loseBackgammon: 0.0072,
};

/** No gammons either way: the textbook 25% dead / 20% live take point case. */
function gammonless(p: number): ResultDistribution {
  return {
    winSingle: p,
    winGammon: 0,
    winBackgammon: 0,
    loseSingle: 1 - p,
    loseGammon: 0,
    loseBackgammon: 0,
  };
}

describe('cubeful equity', () => {
  it('reproduces the published figures for a known position', () => {
    const shape = shapeOf(OPENING_SLOT);
    expect(shape.averageWin).toBeCloseTo(1.3047, 3);
    expect(shape.averageLoss).toBeCloseTo(1.2852, 3);
    expect(shape.cubeless).toBeCloseTo(0.0069, 4);

    expect(cubefulEquity(OPENING_SLOT, 'player')).toBeCloseTo(0.181, 2);
    expect(cubefulEquity(OPENING_SLOT, 'centre')).toBeCloseTo(0.008, 2);
    expect(2 * cubefulEquity(OPENING_SLOT, 'opponent')).toBeCloseTo(-0.337, 2);
  });

  it('prices the cube between the dead and live take points', () => {
    // Dead cube: take at 25%. Perfectly live: take at 20%. At x = 0.7 the
    // boundary should land near the 21.5% long races actually measure.
    const takes = (p: number) => cubeAdvice(gammonless(1 - p)).reply === 'take';
    expect(takes(0.25)).toBe(true);
    expect(takes(0.22)).toBe(true);
    expect(takes(0.2)).toBe(false);
    expect(takes(0.15)).toBe(false);

    const dead = (p: number) => cubeAdvice(gammonless(1 - p), 'centre', 0).reply === 'take';
    expect(dead(0.26)).toBe(true);
    expect(dead(0.22)).toBe(false);
  });

  it('does not double an even position and cashes a won one', () => {
    expect(cubeAdvice(gammonless(0.5)).offer).toBe('no-double');
    expect(cubeAdvice(gammonless(0.6)).offer).toBe('no-double');

    const strong = cubeAdvice(gammonless(0.8));
    expect(strong.offer).toBe('double');
    expect(strong.reply).toBe('drop');
  });

  it('calls a gammonish position too good rather than doubling it', () => {
    // Wins nearly always, and half those wins are gammons: cashing one point
    // is worse than playing on.
    const blitz: ResultDistribution = {
      winSingle: 0.4,
      winGammon: 0.5,
      winBackgammon: 0.05,
      loseSingle: 0.05,
      loseGammon: 0,
      loseBackgammon: 0,
    };
    const advice = cubeAdvice(blitz);
    expect(advice.offer).toBe('too-good');
    expect(advice.reply).toBe('drop');
    expect(advice.noDouble).toBeGreaterThan(1);
  });

  it('gammon threat moves the take point, at the same win rate', () => {
    const plain = gammonless(0.3);
    const gammonish: ResultDistribution = {
      winSingle: 0.3,
      winGammon: 0,
      winBackgammon: 0,
      loseSingle: 0.35,
      loseGammon: 0.35,
      loseBackgammon: 0,
    };
    expect(shapeOf(plain).winProbability).toBeCloseTo(shapeOf(gammonish).winProbability, 10);
    expect(cubeAdvice(invert(plain)).reply).toBe('take');
    expect(cubeAdvice(invert(gammonish)).reply).toBe('drop');
  });

  it('waits longer to double with a cube it already owns', () => {
    // Owning the cube is worth something that turning it gives away, so the
    // action that is right from the centre can still be wrong when owned.
    const edge = gammonless(0.7);
    expect(cubeAdvice(edge, 'centre').offer).toBe('double');
    expect(cubeAdvice(edge, 'player').offer).toBe('no-double');
  });

  it('reports each margin as what the alternative action costs', () => {
    const clear = cubeAdvice(gammonless(0.8));
    expect(clear.offer).toBe('double');
    // Doubled out for a point, against playing on with the cube centred.
    expect(clear.offerMargin).toBeCloseTo(clear.doublePass - clear.noDouble, 10);
    expect(clear.reply).toBe('drop');
    expect(clear.replyMargin).toBeCloseTo(clear.doubleTake - clear.doublePass, 10);

    const quiet = cubeAdvice(gammonless(0.55));
    expect(quiet.offer).toBe('no-double');
    expect(quiet.offerMargin).toBeCloseTo(quiet.noDouble - quiet.doubleTake, 10);
  });

  it('holds the cube for the side that owns it rather than the centre', () => {
    const ahead = gammonless(0.65);
    expect(cubefulEquity(ahead, 'player', CUBE_LIFE)).toBeGreaterThan(
      cubefulEquity(ahead, 'centre', CUBE_LIFE),
    );
    expect(cubefulEquity(ahead, 'centre', CUBE_LIFE)).toBeGreaterThan(
      cubefulEquity(ahead, 'opponent', CUBE_LIFE),
    );
  });
});

describe('rolled-out distributions', () => {
  it('reports results rather than only their mean', () => {
    const outcome = rolloutDistribution(initialBoard(), 'white', 'white', {
      maxTrials: 24,
      policy: { plies: 1 },
    });

    const { distribution } = outcome;
    const total =
      distribution.winSingle +
      distribution.winGammon +
      distribution.winBackgammon +
      distribution.loseSingle +
      distribution.loseGammon +
      distribution.loseBackgammon;
    expect(total).toBeCloseTo(1, 10);
    expect(outcome.samples).toHaveLength(24);
    expect(shapeOf(distribution).cubeless).toBeCloseTo(outcome.points, 10);
  });
});

describe('rollout distributions refuse bad trials', () => {
  it('fails rather than mis-price a game that never finished', () => {
    // One ply is never enough to finish, so the safety valve always fires.
    expect(() =>
      rolloutDistribution(initialBoard(), 'white', 'white', { maxTrials: 1, maxPlies: 1 }),
    ).toThrow(/did not finish/);
  });
});
