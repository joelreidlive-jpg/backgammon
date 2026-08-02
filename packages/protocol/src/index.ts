import type { Dice, MatchState, Move, Player } from '@bg/rules';
import type { Difficulty } from '@bg/ai';
import type { Hint, HintLevel, Severity, TurnAnalysis } from '@bg/coach';

/**
 * Wire types shared by the Worker and the browser.
 *
 * The engine and coach types are re-exported here as types only. TypeScript
 * erases them, so the client bundle never contains the evaluator — which it
 * must not, since a player could then read the engine's own analysis.
 */
export type { Difficulty, Hint, HintLevel, Severity, TurnAnalysis };

export interface CreateMatchRequest {
  readonly aiLevel?: Difficulty;
  readonly matchLength?: number;
  readonly coaching?: boolean;
  readonly seat?: Player;
}

/** Everything the client is allowed to see. Never includes engine internals. */
export interface MatchView {
  readonly matchId: string;
  readonly seat: Player;
  readonly aiLevel: Difficulty;
  readonly coaching: boolean;
  readonly state: MatchState;
  readonly legalTurns: readonly (readonly Move[])[];
  readonly canDouble: boolean;
  readonly canTakeback: boolean;
  /** Set for the human's own last turn while coaching is on. */
  readonly lastAnalysis: TurnAnalysis | null;
  /** Plays the AI made since the human's last action, newest last. */
  readonly aiPlays: readonly string[];
}

export interface CreateMatchResponse {
  readonly playerToken: string;
  readonly match: MatchView;
}

export interface HistoryEntry {
  readonly seq: number;
  readonly player: Player;
  readonly dice: Dice;
  readonly notation: string;
  readonly analysis: TurnAnalysis | null;
}

export interface HintRequest {
  readonly level: HintLevel;
}

export type CubeCommand = 'double' | 'take' | 'drop';
