import {
  type Board,
  type Dice,
  type Move,
  type Player,
  type Turn,
  boardKey,
  formatTurn,
  legalTurns,
  parseXgid,
} from '@bg/rules';
import type { Concept, GamePhase } from '@bg/coach';

/**
 * How hard a problem is, 1 easiest. Graded from the equity margin between the
 * best play and the runner-up rather than assigned by an author, so the ladder
 * re-grades itself whenever the evaluator changes.
 */
export type Tier = 1 | 2 | 3 | 4 | 5;

/**
 * Where a problem's answer comes from, which is the honest limit on how much
 * the player should trust it.
 *
 * `consensus` answers are public expert agreement. `engine` answers are this
 * repository's own search, which agrees with consensus on roughly half of the
 * opening rolls — good enough to drill shapes, not an authority. `rollout`
 * answers were played out thousands of times and kept only where the winning
 * play separated from the field by several standard errors, which agrees with
 * consensus far more often but is still this engine judging itself. The
 * distinction is shown to the player rather than hidden.
 */
export type Provenance = 'consensus' | 'engine' | 'rollout';

export interface Problem {
  readonly id: string;
  /** Position and roll, self-contained. */
  readonly xgid: string;
  /** Accepted plays in standard notation, best first. */
  readonly best: readonly string[];
  readonly tier: Tier;
  readonly provenance: Provenance;
  readonly concepts: readonly Concept[];
  readonly phase: GamePhase;
  /** Equity between the best play and the runner-up: how discriminating it is. */
  readonly margin: number;
}

export interface LoadedProblem extends Problem {
  readonly board: Board;
  readonly player: Player;
  readonly dice: Dice;
  readonly legal: readonly Turn[];
  readonly bestTurns: readonly Turn[];
}

/**
 * The engine's own answers are least reliable exactly where problems are
 * hardest, since a tiny margin is within its own error. Tier 5 is therefore
 * reserved for externally verified positions and never generated.
 */
export const MAX_GENERATED_TIER: Tier = 4;

/** Notation is order-insensitive: "13/11 24/23" and "24/23 13/11" are one play. */
function canonical(play: string): string {
  return play.trim().split(/\s+/).sort().join(' ');
}

export function load(problem: Problem): LoadedProblem {
  const parsed = parseXgid(problem.xgid);
  if (!parsed.dice) throw new Error(`${problem.id}: XGID has no roll`);

  const legal = legalTurns(parsed.board, parsed.turn, parsed.dice);
  const byNotation = new Map<string, Turn>();
  for (const turn of legal) byNotation.set(canonical(formatTurn(parsed.turn, turn.moves)), turn);

  const bestTurns = problem.best.map((play) => {
    const turn = byNotation.get(canonical(play));
    if (!turn) throw new Error(`${problem.id}: "${play}" is not a legal turn`);
    return turn;
  });

  return { ...problem, board: parsed.board, player: parsed.turn, dice: parsed.dice, legal, bestTurns };
}

/**
 * What the client is allowed to see before it answers. Deliberately omits
 * `best` and `margin`: the answer stays on the server until an attempt is
 * submitted, or the trainer is a lookup table rather than an exercise.
 */
export interface ProblemPrompt {
  readonly kind: 'checker';
  readonly id: string;
  readonly tier: Tier;
  readonly provenance: Provenance;
  readonly phase: GamePhase;
  readonly board: Board;
  readonly player: Player;
  readonly dice: Dice;
  readonly legalTurns: readonly (readonly Move[])[];
}

export function prompt(problem: LoadedProblem): ProblemPrompt {
  return {
    kind: 'checker',
    id: problem.id,
    tier: problem.tier,
    provenance: problem.provenance,
    phase: problem.phase,
    board: problem.board,
    player: problem.player,
    dice: problem.dice,
    legalTurns: problem.legal.map((turn) => turn.moves),
  };
}

export function matchesBest(problem: LoadedProblem, board: Board): boolean {
  const key = boardKey(board);
  return problem.bestTurns.some((turn) => boardKey(turn.board) === key);
}
