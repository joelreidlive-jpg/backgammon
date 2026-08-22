/**
 * Cube pricing from a rolled-out result distribution, using Janowski's model.
 *
 * The threshold model in `cubeDecision.ts` asks one question — how likely am I
 * to win — which is not enough to price a cube. Two positions with the same win
 * rate take differently if one of them wins half its games by gammon, and both
 * take differently again depending on how much the cube is worth to whoever
 * owns it afterwards.
 *
 * Janowski's answer is to bracket the truth. A *dead* cube can never be turned
 * again, which understates a taker's chances; a *perfectly live* cube is always
 * turned at the exact moment the opponent becomes indifferent, which overstates
 * them. Real cubes sit between, at a cube-life index x, and the equities below
 * interpolate with that index. They reproduce the figures XG reports for money
 * play to within a few thousandths.
 *
 * All equities are normalised to a cube of 1: multiply by the cube value for
 * the real number.
 */

/** How often each result occurs, from one player's point of view. Sums to 1. */
export interface ResultDistribution {
  readonly winSingle: number;
  readonly winGammon: number;
  readonly winBackgammon: number;
  readonly loseSingle: number;
  readonly loseGammon: number;
  readonly loseBackgammon: number;
}

export type CubePosition = 'centre' | 'player' | 'opponent';

/**
 * Cube-life index: 0 is a cube that can never be turned again, 1 a cube always
 * turned at the perfect moment. Long races measure at about 0.7, which is the
 * figure XG and GNU Backgammon use as a default.
 */
export const CUBE_LIFE = 0.7;

export interface CubeShape {
  /** Win probability, gammons and backgammons included. */
  readonly winProbability: number;
  /** Average points won in the games that are won. */
  readonly averageWin: number;
  /** Average points lost in the games that are lost. */
  readonly averageLoss: number;
  /** Cubeless equity in points. */
  readonly cubeless: number;
}

export function shapeOf(distribution: ResultDistribution): CubeShape {
  const { winSingle, winGammon, winBackgammon, loseSingle, loseGammon, loseBackgammon } =
    distribution;

  const wins = winSingle + winGammon + winBackgammon;
  const losses = loseSingle + loseGammon + loseBackgammon;
  const winPoints = winSingle + 2 * winGammon + 3 * winBackgammon;
  const lossPoints = loseSingle + 2 * loseGammon + 3 * loseBackgammon;

  return {
    winProbability: wins,
    // A side that never wins has no average win to speak of; 1 keeps the
    // equities finite and is the value the limit approaches anyway.
    averageWin: wins > 0 ? winPoints / wins : 1,
    averageLoss: losses > 0 ? lossPoints / losses : 1,
    cubeless: winPoints - lossPoints,
  };
}

export function invert(distribution: ResultDistribution): ResultDistribution {
  return {
    winSingle: distribution.loseSingle,
    winGammon: distribution.loseGammon,
    winBackgammon: distribution.loseBackgammon,
    loseSingle: distribution.winSingle,
    loseGammon: distribution.winGammon,
    loseBackgammon: distribution.winBackgammon,
  };
}

/**
 * Cubeful equity on a cube of 1, from the point of view of the player whose
 * distribution this is.
 *
 * From Janowski's cube formulae: with p the cubeless win probability, W and L
 * the average win and loss, and x the cube-life index,
 *
 *   owned by player   p(W + L + x/2) − L
 *   owned by opponent p(W + L + x/2) − L − x/2
 *   centred           4/(4 − x) · (p(W + L + x/2) − L − x/4)
 */
export function cubefulEquity(
  distribution: ResultDistribution,
  cube: CubePosition,
  cubeLife: number = CUBE_LIFE,
): number {
  const { winProbability: p, averageWin: w, averageLoss: l } = shapeOf(distribution);
  const half = cubeLife / 2;
  const base = p * (w + l + half) - l;

  const equity =
    cube === 'player'
      ? base
      : cube === 'opponent'
        ? base - half
        : (4 / (4 - cubeLife)) * (base - cubeLife / 4);

  // The interpolation is linear in p and so runs past what the game can
  // actually pay at the extremes.
  return Math.max(-l, Math.min(w, equity));
}

export type CubeOffer = 'no-double' | 'double' | 'too-good';
export type CubeReply = 'take' | 'drop';

export interface CubeAdvice {
  readonly offer: CubeOffer;
  /** How the opponent should answer if the cube is turned. */
  readonly reply: CubeReply;
  /** Equity of holding the cube and playing on. */
  readonly noDouble: number;
  /** Equity of turning the cube and being taken. */
  readonly doubleTake: number;
  /** Equity of turning the cube and being dropped: one point, always. */
  readonly doublePass: number;
  /** What the best action gains over the second best, in points. */
  readonly offerMargin: number;
  /** What the right answer to a double gains over the wrong one, in points. */
  readonly replyMargin: number;
}

/**
 * Price every cube action available from a rolled-out distribution.
 *
 * `distribution` belongs to the player considering the double, and `cube` is
 * where the cube sits before they turn it.
 */
export function cubeAdvice(
  distribution: ResultDistribution,
  cube: 'centre' | 'player' = 'centre',
  cubeLife: number = CUBE_LIFE,
): CubeAdvice {
  const noDouble = cubefulEquity(distribution, cube, cubeLife);

  // After a take the doubler no longer owns the cube, and the stake is 2.
  const doubleTake = 2 * cubefulEquity(distribution, 'opponent', cubeLife);
  const doublePass = 1;

  // The opponent picks whichever is worse for the doubler.
  const reply: CubeReply = doubleTake <= doublePass ? 'take' : 'drop';
  const doubled = Math.min(doubleTake, doublePass);

  // Playing on for the gammon only beats cashing when the cube would be
  // dropped anyway — otherwise "too good" is just a double the opponent takes.
  const tooGood = reply === 'drop' && noDouble > doublePass;
  const offer: CubeOffer = tooGood ? 'too-good' : doubled > noDouble ? 'double' : 'no-double';

  return {
    offer,
    reply,
    noDouble,
    doubleTake,
    doublePass,
    offerMargin: Math.abs(doubled - noDouble),
    replyMargin: Math.abs(doubleTake - doublePass),
  };
}
