import type { Dice, MatchState, Move, Player } from '@bg/rules';
import type { Difficulty } from '@bg/ai';
import type {
  CoachingPolicy,
  CubeAnalysis,
  GameReview,
  Hint,
  HintLevel,
  PlayerProgress,
  Severity,
  SkillTier,
  TurnAnalysis,
} from '@bg/coach';
import type {
  AttemptResult,
  CubeAnswer,
  CubeAttemptResult,
  CubePrompt,
  CubeQuestion,
  LadderState,
  ProblemPrompt,
  Provenance,
  Tier,
  TierProgress,
} from '@bg/trainer';

/**
 * Wire types shared by the Worker and the browser.
 *
 * The engine and coach types are re-exported here as types only. TypeScript
 * erases them, so the client bundle never contains the evaluator — which it
 * must not, since a player could then read the engine's own analysis.
 */
export type {
  CoachingPolicy,
  CubeAnalysis,
  Difficulty,
  GameReview,
  Hint,
  HintLevel,
  PlayerProgress,
  Severity,
  SkillTier,
  TurnAnalysis,
};

export type {
  AttemptResult,
  CubeAnswer,
  CubeAttemptResult,
  CubePrompt,
  CubeQuestion,
  LadderState,
  ProblemPrompt,
  Provenance,
  Tier,
  TierProgress,
};

/**
 * A problem to solve. Discriminated on `kind` rather than split across two
 * endpoints, because the trainer decides which sort of question the player
 * needs next and the client should not get a say in it.
 */
export type TrainerPrompt = ProblemPrompt | CubePrompt;

export type TrainerResult = AttemptResult | CubeAttemptResult;

export interface CreateMatchRequest {
  readonly aiLevel?: Difficulty;
  readonly matchLength?: number;
  readonly coaching?: boolean;
  readonly seat?: Player;
}

/** One turn the AI played, with the roll it played it with. */
export interface AiPlay {
  readonly dice: Dice;
  readonly notation: string;
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
  readonly aiPlays: readonly AiPlay[];
  /** Set when the human's last action was a cube decision and coaching is on. */
  readonly lastCubeAnalysis: CubeAnalysis | null;
  /** How the coach is currently calibrated for this player. */
  readonly policy: CoachingPolicy;
  /** Present once a game in the match has finished. */
  readonly review: GameReview | null;
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

export interface GameSummary {
  readonly matchId: string;
  readonly finishedAt: number;
  readonly aiLevel: Difficulty;
  readonly won: boolean;
  readonly points: number;
  readonly decisions: number;
  readonly errorRate: number;
}

export interface ProgressResponse {
  readonly progress: PlayerProgress;
  readonly tier: SkillTier;
  readonly errorRate: number;
  readonly trend: 'improving' | 'steady' | 'slipping';
  readonly policy: CoachingPolicy;
  readonly weakestPhase: string | null;
  readonly focus: readonly string[];
  readonly recentGames: readonly GameSummary[];
}

export interface TrainerProblemResponse {
  /** The caller's token, minted here if the browser did not send one. */
  readonly playerToken: string;
  /** Null only if the problem set is empty. */
  readonly problem: TrainerPrompt | null;
  readonly ladder: LadderState;
  /** Why this problem was chosen, in the coach's own advice vocabulary. */
  readonly focus: readonly string[];
  readonly attempted: number;
  readonly solved: number;
}

export interface CheckerAttemptRequest {
  readonly kind?: 'checker';
  readonly problemId: string;
  readonly moves: readonly Move[];
}

export interface CubeAttemptRequest {
  readonly kind: 'cube';
  readonly problemId: string;
  readonly answer: CubeAnswer;
}

export type TrainerAttemptRequest = CheckerAttemptRequest | CubeAttemptRequest;

export interface TrainerAttemptResponse {
  readonly result: TrainerResult;
  readonly ladder: LadderState;
  /** True when this attempt unlocked a harder tier. */
  readonly unlocked: boolean;
}
