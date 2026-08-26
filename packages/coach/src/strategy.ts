import type { Concept } from './concepts.js';
import type { CubeMistake } from './cube.js';
import type { GamePhase } from './phase.js';

/**
 * What actually decides games in each phase. Tactics change completely between
 * them — a blot in the opening is a normal cost of building, the same blot in
 * a bear-off is usually a lost game — so advice that ignores phase is noise.
 */
export const PHASE_GUIDANCE: Readonly<Record<GamePhase, string>> = {
  opening:
    'Openings are about building, not safety. Make your 5-point and bar-point when you can, bring builders down from the midpoint, and accept blots that buy you a point.',
  middlegame:
    'This is where games are won. Decide which game you are playing — priming, blitzing or holding — and make every checker serve it rather than drifting between plans.',
  holding:
    'You are behind in the race, so you need a shot. Keep your anchor, keep your home board intact for when you hit, and do not break the anchor early to save a couple of pips.',
  race:
    'No contact left, so structure stops mattering and pips are everything. Cross quadrants, avoid wasting pips on the ace point, and keep an even distribution.',
  bearoff:
    'Minimise wastage: fill gaps rather than taking checkers off from the back, and keep an even number on each point so you never have to break a point unnecessarily.',
};

/** How to fix a leak, phrased as a habit rather than a rule about one position. */
export const CONCEPT_ADVICE: Readonly<Record<Concept, string>> = {
  hitsOpponent:
    'You are passing up hits. Hitting gains tempo and pips at once — when in doubt in the early game, hit.',
  makesHomeBoardPoint:
    'You are missing chances to make home board points. Every point you own makes a future hit more valuable, and the 5-point is the single most valuable point on the board.',
  makesPoint:
    'You are leaving builders unused. Look for plays that convert two loose checkers into a made point.',
  buildsPrime:
    'You are not extending your prime. Consecutive made points trap back checkers; four in a row is worth far more than four scattered points.',
  escapesBackChecker:
    'Your back checkers stay back too long. A checker still on the 24-point in the middlegame is usually the thing that loses you the game.',
  anchorsInOpponentHome:
    'You are missing anchors. An advanced anchor gives you a safe landing spot and the freedom to play aggressively everywhere else.',
  leavesBlot:
    'You leave more blots than you need to. Before playing, count how many numbers hit you — if the play gains little, take the safe one.',
  leavesBlotInOpponentHome:
    'You leave blots deep in your opponent\u2019s home board, where a hit costs you the most and is hardest to recover from.',
  breaksAnchor:
    'You give up anchors too readily. An anchor is your insurance; break it only when you have a concrete plan that does not need it.',
  breaksHomeBoardPoint:
    'You break home board points too early. A strong home board is what makes hitting worthwhile later.',
  stacksCheckers:
    'You stack checkers. Six on a point is five checkers doing nothing — spread them into builders.',
  bearsOff:
    'You are not taking checkers off when you safely could. In a pure race, off is always progress.',
};

/**
 * The same leak in a few words. The review lists what went wrong and advises on
 * it once, at the end; naming a leak is not the place to repeat the cure.
 */
export const CONCEPT_LABEL: Readonly<Record<Concept, string>> = {
  hitsOpponent: 'hits passed up',
  makesHomeBoardPoint: 'home board points missed',
  makesPoint: 'points left unmade',
  buildsPrime: 'primes not extended',
  escapesBackChecker: 'back checkers left back',
  anchorsInOpponentHome: 'anchors missed',
  leavesBlot: 'needless blots',
  leavesBlotInOpponentHome: 'blots in their home board',
  breaksAnchor: 'anchors broken',
  breaksHomeBoardPoint: 'home board points broken',
  stacksCheckers: 'checkers stacked',
  bearsOff: 'checkers left on',
};

export const CUBE_ADVICE: Readonly<Record<CubeMistake, string>> = {
  none: '',
  undecided: '',
  'missed-double':
    'You hold the cube too long. If you are clearly ahead and the position is volatile, double — a cube you never turn is a cube that never earns anything.',
  'premature-double':
    'You double too early. Being ahead is not enough; you need your opponent to be close to a drop, or you are just doubling the stake on a game you might lose.',
  'too-good-to-double':
    'You cash games you should play on. When you are winning a gammon often, doubling lets your opponent escape for one point.',
  'wrong-take':
    'You take doubles you should pass. A drop costs exactly one point — anything worse than that is a bad take, however much you want to play on.',
  'wrong-drop':
    'You pass doubles you should take. Roughly one game in four is enough to take; folding good positions is a slow, invisible way to lose a match.',
};

/** Advice for the phase a player is losing the most equity in. */
export function phaseAdvice(phase: GamePhase): string {
  return PHASE_GUIDANCE[phase];
}
