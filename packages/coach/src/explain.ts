import { type Board, type Player } from '@bg/rules';
import { CONCEPT_LABELS, type Concept, conceptsOf } from './concepts.js';
import type { GamePhase } from './phase.js';

/** Concepts worth mentioning first, most instructive last-resort last. */
const PRIORITY: readonly Concept[] = [
  'hitsOpponent',
  'makesHomeBoardPoint',
  'anchorsInOpponentHome',
  'buildsPrime',
  'escapesBackChecker',
  'makesPoint',
  'bearsOff',
  'bringsCheckersHome',
  'leavesBlotInOpponentHome',
  'leavesBlot',
  'breaksAnchor',
  'breaksHomeBoardPoint',
  'stacksCheckers',
];

const DOWNSIDES = new Set<Concept>([
  'leavesBlot',
  'leavesBlotInOpponentHome',
  'breaksAnchor',
  'breaksHomeBoardPoint',
  'stacksCheckers',
]);

function ranked(concepts: Set<Concept>): Concept[] {
  return PRIORITY.filter((c) => concepts.has(c));
}

type PhaseReasons = Readonly<Partial<Record<GamePhase, string>>> & { readonly any: string };

/**
 * Why the concept that decided the play matters, in the phase it was played in.
 * The same blot is cheap in a race and expensive while the opponent still has a
 * board to hit into, and that is the part a player has to learn to see.
 */
const WHY: Readonly<Record<Concept, PhaseReasons>> = {
  hitsOpponent: {
    opening:
      'This early a hit sends their checker the length of the board while you still have every point to build.',
    any: 'A hit costs them the pips and a turn to come back in, and that is time you spend building.',
  },
  makesHomeBoardPoint: {
    any: 'Each home board point is one more number that keeps a checker you hit from coming back in.',
  },
  anchorsInOpponentHome: {
    any: 'An anchor is what lets you wait for a shot without fearing a blitz.',
  },
  buildsPrime: {
    any: 'Consecutive points are what actually trap their back checkers, so length beats safety here.',
  },
  escapesBackChecker: {
    any: 'A back checker still behind their blockade is the one most likely to lose you the game.',
  },
  makesPoint: {
    any: 'A made point is permanent; a stack of loose checkers is not.',
  },
  bearsOff: {
    any: 'With the contact gone, checkers off is the only thing that counts.',
  },
  leavesBlotInOpponentHome: {
    opening:
      'A hit that deep costs almost no pips, but it puts you on the bar in the very rolls you need for building points.',
    any: 'A hit that deep costs few pips and a lot of time: the checker restarts behind their strongest board, and every turn you dance there is a turn lost.',
  },
  leavesBlot: {
    opening:
      'A blot this early is worth it for a point, but here you took the risk without buying one.',
    middlegame:
      'They have a board built by now, so a hit costs you not just pips but the plan you were building.',
    holding: 'You are waiting for a shot, so a hit against you ends the game you were playing for.',
    race: 'There is no contact left to justify it, so the shot is pure loss.',
    any: 'A shot you did not need to give is equity handed over for nothing.',
  },
  breaksAnchor: {
    any: 'Without the anchor you have nowhere safe to land, so their next hit can blitz you.',
  },
  breaksHomeBoardPoint: {
    any: 'Breaking your own board is what makes their return hit cheap.',
  },
  stacksCheckers: {
    any: 'Stacked checkers make no points; it is spare builders that turn rolls into structure.',
  },
  bringsCheckersHome: {
    any: 'With nothing left to get past, every checker still outside is a crossing you have yet to pay for.',
  },
};

function whyItMatters(concept: Concept, phase: GamePhase): string {
  return WHY[concept][phase] ?? WHY[concept].any;
}

export interface Explanation {
  /** What the better play achieves that the played one does not. */
  readonly gains: readonly Concept[];
  /** What the played play costs that the better one does not. */
  readonly costs: readonly Concept[];
  readonly text: string;
}

/**
 * Explain why `best` beats `played`, as a diff of named concepts.
 *
 * Deterministic and cheap. If richer prose is ever wanted, feed this structured
 * diff to a language model as a rendering step — the diff itself is what
 * decides the content, so the advice cannot drift from the engine's reasoning.
 */
export function explainDifference(
  before: Board,
  played: Board,
  best: Board,
  player: Player,
  phase: GamePhase,
): Explanation {
  const playedConcepts = conceptsOf(before, played, player);
  const bestConcepts = conceptsOf(before, best, player);

  const gains = ranked(bestConcepts).filter((c) => !playedConcepts.has(c) && !DOWNSIDES.has(c));
  const costs = ranked(playedConcepts).filter((c) => !bestConcepts.has(c) && DOWNSIDES.has(c));

  const parts: string[] = [];
  if (gains.length > 0) parts.push(`the better play ${CONCEPT_LABELS[gains[0]]}`);
  if (costs.length > 0) parts.push(`your play ${CONCEPT_LABELS[costs[0]]}`);

  const what =
    parts.length > 0
      ? `${parts.join(' and ')}.`
      : 'the better play keeps a slightly stronger structure.';

  // Naming the difference says what happened; the phase says why it costs what
  // it costs, which is the part that carries over to the next game.
  const decisive = costs[0] ?? gains[0];
  const why = decisive === undefined ? '' : ` ${whyItMatters(decisive, phase)}`;
  const text = `${what.charAt(0).toUpperCase()}${what.slice(1)}${why}`;

  return { gains, costs, text };
}

/** A nudge that names the idea without giving away the move. */
export function conceptHint(before: Board, best: Board, player: Player): string | null {
  const concepts = ranked(conceptsOf(before, best, player)).filter((c) => !DOWNSIDES.has(c));
  if (concepts.length === 0) return null;
  return `Look for a play that ${CONCEPT_LABELS[concepts[0]]}.`;
}
