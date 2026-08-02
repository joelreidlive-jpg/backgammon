import { type Board, type Player } from '@bg/rules';
import { CONCEPT_LABELS, type Concept, conceptsOf } from './concepts.js';

/** Concepts worth mentioning first, most instructive last-resort last. */
const PRIORITY: readonly Concept[] = [
  'hitsOpponent',
  'makesHomeBoardPoint',
  'anchorsInOpponentHome',
  'buildsPrime',
  'escapesBackChecker',
  'makesPoint',
  'bearsOff',
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
): Explanation {
  const playedConcepts = conceptsOf(before, played, player);
  const bestConcepts = conceptsOf(before, best, player);

  const gains = ranked(bestConcepts).filter((c) => !playedConcepts.has(c) && !DOWNSIDES.has(c));
  const costs = ranked(playedConcepts).filter((c) => !bestConcepts.has(c) && DOWNSIDES.has(c));

  const parts: string[] = [];
  if (gains.length > 0) parts.push(`the better play ${CONCEPT_LABELS[gains[0]]}`);
  if (costs.length > 0) parts.push(`your play ${CONCEPT_LABELS[costs[0]]}`);

  const text =
    parts.length > 0
      ? `${parts.join(' and ')}.`
      : 'the better play keeps a slightly stronger structure.';

  return { gains, costs, text: text.charAt(0).toUpperCase() + text.slice(1) };
}

/** A nudge that names the idea without giving away the move. */
export function conceptHint(before: Board, best: Board, player: Player): string | null {
  const concepts = ranked(conceptsOf(before, best, player)).filter((c) => !DOWNSIDES.has(c));
  if (concepts.length === 0) return null;
  return `Look for a play that ${CONCEPT_LABELS[concepts[0]]}.`;
}
