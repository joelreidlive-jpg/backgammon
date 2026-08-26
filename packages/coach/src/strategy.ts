import type { Concept } from './concepts.js';
import type { CubeMistake } from './cube.js';
import type { GamePhase } from './phase.js';

/**
 * What actually decides games in each phase. Tactics change completely between
 * them — a blot in the opening is a normal cost of building, the same blot in
 * a bear-off is usually a lost game — so advice that ignores phase is noise.
 */
export const PHASE_GUIDANCE: Readonly<Record<GamePhase, readonly string[]>> = {
  opening: [
    'Openings are about building, not safety. Make your 5-point and bar-point when you can, bring builders down from the midpoint, and accept blots that buy you a point.',
    'Opening rolls are mostly solved. Learn the standard replies — 31 makes the 5-point, 61 makes the bar-point, 42 makes the 4-point — and save your thinking for the second roll.',
    'Do not run a back checker just because it is loose. Splitting to the 23-point fights for an anchor; running one checker to the 18-point into a builder-rich board usually just hands over a target.',
  ],
  middlegame: [
    'This is where games are won. Decide which game you are playing — priming, blitzing or holding — and make every checker serve it rather than drifting between plans.',
    'Count before you commit. Ahead in the race, trade hits and simplify; behind in it, keep contact and play for a shot rather than running into a race you have already lost.',
    'Timing decides priming games. If you are about to be forced to break your prime, hit or anchor now — a board you cannot hold is worth nothing next roll.',
  ],
  holding: [
    'You are behind in the race, so you need a shot. Keep your anchor, keep your home board intact for when you hit, and do not break the anchor early to save a couple of pips.',
    'A holding game is a waiting game. Keep spares flexible so you always have a safe number to play, and do not crunch your home board while you wait for the shot.',
    'Plan the board you will need when the shot comes. Holding from the 20-point wins by hitting late, so the points you keep matter more than the pips you save.',
  ],
  race: [
    'No contact left, so structure stops mattering and pips are everything. Cross quadrants, avoid wasting pips on the ace point, and keep an even distribution.',
    'Use the pip count, not a feeling: roughly 8% ahead is a double and 10% is close to a pass. Recount at each crossover decision rather than once at the start.',
    'Wastage is the whole game in a race. Play the number that fills your lowest gap, and avoid burying checkers on the ace and deuce points.',
  ],
  bearoff: [
    'Minimise wastage: fill gaps rather than taking checkers off from the back, and keep an even number on each point so you never have to break a point unnecessarily.',
    'With a checker still back, safety beats speed. Leave the fewest shots even at the cost of a roll, and never break your last home board point to take one checker off.',
    'Take two off whenever it does not open a gap. The rolls where you can only take one off are how bear-offs are lost.',
  ],
};

/** How to fix a leak, phrased as a habit rather than a rule about one position. */
export const CONCEPT_ADVICE: Readonly<Record<Concept, readonly string[]>> = {
  hitsOpponent: [
    'You are passing up hits. Hitting gains tempo and pips at once — when in doubt in the early game, hit.',
    'Look for the direct shot before you make a quiet point. A hit is usually worth taking when it also builds your home board.',
  ],
  makesHomeBoardPoint: [
    'You are missing chances to make home board points. Every point you own makes a future hit more valuable, and the 5-point is the single most valuable point on the board.',
    'When you can make either a home board point or a builder, make the point first. Four made points turn every hit into a serious threat.',
  ],
  makesPoint: [
    'You are leaving builders unused. Look for plays that convert two loose checkers into a made point.',
    'Spend the spare checker that is closest to a useful point. A point is worth more than a second builder waiting behind it.',
  ],
  buildsPrime: [
    'You are not extending your prime. Consecutive made points trap back checkers; four in a row is worth far more than four scattered points.',
    "Extend the prime at the end nearest your opponent's back checkers. A point made behind them traps nothing.",
  ],
  escapesBackChecker: [
    'Your back checkers stay back too long. A checker still on the 24-point in the middlegame is usually the thing that loses you the game.',
    'Split or run before your opponent makes another point in front of you. One checker out is progress; two trapped together often cost a whole turn.',
  ],
  anchorsInOpponentHome: [
    'You are missing anchors. An advanced anchor gives you a safe landing spot and the freedom to play aggressively everywhere else.',
    'Take the highest anchor on offer. The 20- and 18-points let you play on everywhere else; an anchor on the ace point mostly just postpones the loss.',
  ],
  leavesBlot: [
    'You leave more blots than you need to. Before playing, count how many numbers hit you — if the play gains little, take the safe one.',
    'Before leaving a blot, count direct shots and indirect shots separately. Choose the blot with fewer direct shots when the gains are otherwise close.',
  ],
  leavesBlotInOpponentHome: [
    'You leave blots deep in your opponent\u2019s home board, where a hit costs you the most and is hardest to recover from.',
    'Do not leave a blot in their home board to save a single pip. Move the checker out or make a point unless the shot creates a clear hit next turn.',
  ],
  breaksAnchor: [
    'You give up anchors too readily. An anchor is your insurance; break it only when you have a concrete plan that does not need it.',
    "Keep the anchor until your opponent's home board is weak or your race lead is clear. An extra turn of safety is worth more than a small gain in the race.",
  ],
  breaksHomeBoardPoint: [
    'You break home board points too early. A strong home board is what makes hitting worthwhile later.',
    'Do not break a made point for a builder unless the new point is safe. Once your home board has a gap, every hit you make is less valuable.',
  ],
  stacksCheckers: [
    'You stack checkers. Six on a point is five checkers doing nothing — spread them into builders.',
    'Use a spare checker to cover a blot or make a new point before adding to a stack. Two points with three checkers each work harder than one point with six.',
  ],
  bearsOff: [
    'You are not taking checkers off when you safely could. In a pure race, off is always progress.',
    'In a race with no contact, take the checkers off. Keeping a spare back to smooth a later roll only earns anything while your opponent can still hit you.',
  ],
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

/** Advice for a phase, rotating through its ordered variants. */
export function phaseAdvice(phase: GamePhase, index = 0): string {
  const variants = PHASE_GUIDANCE[phase];
  return variants[index % variants.length];
}

/** Advice for a concept, rotating through its ordered variants. */
export function conceptAdvice(concept: Concept, index = 0): string {
  const variants = CONCEPT_ADVICE[concept];
  return variants[index % variants.length];
}
