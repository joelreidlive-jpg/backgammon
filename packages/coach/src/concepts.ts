import {
  type Board,
  type Player,
  checkersAt,
  homeSlots,
  isBearingIn,
  isHomeSlot,
  opponent,
} from '@bg/rules';

/**
 * Named ideas a backgammon player already thinks in. Comparing the concepts a
 * play realises against those of the best play is what turns an equity number
 * into advice.
 */
export type Concept =
  | 'hitsOpponent'
  | 'makesHomeBoardPoint'
  | 'makesPoint'
  | 'buildsPrime'
  | 'escapesBackChecker'
  | 'anchorsInOpponentHome'
  | 'leavesBlot'
  | 'leavesBlotInOpponentHome'
  | 'breaksAnchor'
  | 'breaksHomeBoardPoint'
  | 'stacksCheckers'
  | 'bringsCheckersHome'
  | 'bearsOff';

export const CONCEPT_LABELS: Readonly<Record<Concept, string>> = {
  hitsOpponent: 'hits',
  makesHomeBoardPoint: 'makes a home board point',
  makesPoint: 'makes a new point',
  buildsPrime: 'extends your prime',
  escapesBackChecker: 'escapes a back checker',
  anchorsInOpponentHome: 'makes an anchor in their home board',
  leavesBlot: 'leaves a blot',
  leavesBlotInOpponentHome: 'leaves a blot in their home board',
  breaksAnchor: 'gives up an anchor',
  breaksHomeBoardPoint: 'breaks a home board point',
  stacksCheckers: 'stacks checkers',
  bringsCheckersHome: 'brings a checker home',
  bearsOff: 'bears off',
};

function madePointSet(board: Board, player: Player): Set<number> {
  const points = new Set<number>();
  for (let slot = 1; slot <= 24; slot++) {
    if (checkersAt(board, player, slot) >= 2) points.add(slot);
  }
  return points;
}

function blotSet(board: Board, player: Player): Set<number> {
  const blots = new Set<number>();
  for (let slot = 1; slot <= 24; slot++) {
    if (checkersAt(board, player, slot) === 1) blots.add(slot);
  }
  return blots;
}

function longestPrime(board: Board, player: Player): number {
  let longest = 0;
  let run = 0;
  for (let slot = 1; slot <= 24; slot++) {
    if (checkersAt(board, player, slot) >= 2) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  return longest;
}

function backCheckerCount(board: Board, player: Player): number {
  let count = board.bar[player];
  for (const slot of homeSlots(opponent(player))) count += checkersAt(board, player, slot);
  return count;
}

function maxStack(board: Board, player: Player): number {
  let max = 0;
  for (let slot = 1; slot <= 24; slot++) max = Math.max(max, checkersAt(board, player, slot));
  return max;
}

/** Checkers still outside the home board, the bar included. */
function outsideHome(board: Board, player: Player): number {
  let count = board.bar[player];
  for (let slot = 1; slot <= 24; slot++) {
    if (!isHomeSlot(player, slot)) count += checkersAt(board, player, slot);
  }
  return count;
}

/** Which concepts describe the transition from `before` to `after`. */
export function conceptsOf(before: Board, after: Board, player: Player): Set<Concept> {
  const foe = opponent(player);
  const concepts = new Set<Concept>();

  if (after.bar[foe] > before.bar[foe]) concepts.add('hitsOpponent');
  if (after.off[player] > before.off[player]) concepts.add('bearsOff');

  const pointsBefore = madePointSet(before, player);
  const pointsAfter = madePointSet(after, player);

  for (const slot of pointsAfter) {
    if (pointsBefore.has(slot)) continue;
    concepts.add('makesPoint');
    if (isHomeSlot(player, slot)) concepts.add('makesHomeBoardPoint');
    if (isHomeSlot(foe, slot)) concepts.add('anchorsInOpponentHome');
  }

  for (const slot of pointsBefore) {
    if (pointsAfter.has(slot)) continue;
    if (isHomeSlot(player, slot)) concepts.add('breaksHomeBoardPoint');
    if (isHomeSlot(foe, slot)) concepts.add('breaksAnchor');
  }

  if (longestPrime(after, player) > longestPrime(before, player)) concepts.add('buildsPrime');
  if (backCheckerCount(after, player) < backCheckerCount(before, player)) {
    concepts.add('escapesBackChecker');
  }

  const blotsBefore = blotSet(before, player);
  for (const slot of blotSet(after, player)) {
    if (blotsBefore.has(slot)) continue;
    concepts.add('leavesBlot');
    if (isHomeSlot(foe, slot)) concepts.add('leavesBlotInOpponentHome');
  }

  // Concentration is only a fault while there are still points to make with
  // those checkers. Once nothing stands between the player and their home board
  // they are bearing in, and a tall point is what that looks like.
  const bearingIn = isBearingIn(after, player);
  if (bearingIn && outsideHome(after, player) < outsideHome(before, player)) {
    concepts.add('bringsCheckersHome');
  }
  if (!bearingIn && maxStack(after, player) > Math.max(4, maxStack(before, player))) {
    concepts.add('stacksCheckers');
  }

  return concepts;
}
