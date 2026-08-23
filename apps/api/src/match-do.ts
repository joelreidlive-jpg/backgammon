import { DurableObject } from 'cloudflare:workers';
import {
  type Dice,
  type MatchState,
  type Move,
  type Player,
  canDouble,
  currentLegalTurns,
  formatTurn,
  newGame,
  newMatch,
  offerDouble,
  opponent,
  playTurn,
  respondToDouble,
  roll,
} from '@bg/rules';
import { type Difficulty, decideCubeAction, decideCubeResponse, decideTurn } from '@bg/ai';
import {
  type CoachingPolicy,
  type CubeAnalysis,
  type GameReview,
  type HintLevel,
  type PlayerProgress,
  type TurnAnalysis,
  EMPTY_PROGRESS,
  analyseCubeDecision,
  analyseCubeResponse,
  analyseTurn,
  buildHint,
  coachingPolicy,
  isCubeDecisionPoint,
  phaseOf,
  reviewGame,
} from '@bg/coach';
import type { CreateMatchRequest, CubeCommand, HistoryEntry, MatchView } from '@bg/protocol';
import { MatchError } from './errors.js';
import { matchOptions } from './matchOptions.js';
import { lastTurnBy, opponentTurnsSince } from './moveLog.js';
import { loadProgress, recordGame } from './players.js';

interface MatchMeta {
  readonly matchId: string;
  /** The human's seat. The AI plays the other one. */
  readonly seat: Player;
  readonly aiLevel: Difficulty;
  readonly coaching: boolean;
  /** Identifies the player across matches, so progress accumulates. */
  readonly playerToken: string;
  readonly playerKey: string;
  readonly createdAt: number;
}

interface MoveRow extends Record<string, SqlStorageValue> {
  seq: number;
  game: number;
  player: string;
  dice: string;
  notation: string;
  state_before: string;
  state_after: string;
  analysis: string | null;
  ts: number;
}

interface CubeRow extends Record<string, SqlStorageValue> {
  seq: number;
  game: number;
  /** The move sequence number this decision was taken before, so a take-back can undo it. */
  move_seq: number;
  analysis: string;
}

/**
 * Live coaching runs on every human turn, so it uses a shallower search than
 * post-game review. Deep review belongs off the request path.
 */
const LIVE_ANALYSIS = { plies: 2, candidateWidth: 6 } as const;

/** Unbiased die roll from the platform CSPRNG. Dice are never client-supplied. */
function rollDie(): number {
  const bytes = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(bytes);
    // 252 = 6 * 42; discarding the tail keeps every face equally likely.
    if (bytes[0] < 252) return (bytes[0] % 6) + 1;
  }
}

function rollDice(): Dice {
  return [rollDie(), rollDie()];
}

/** The opening roll decides who starts, so the dice must differ. */
function openingRoll(): Dice {
  for (;;) {
    const dice = rollDice();
    if (dice[0] !== dice[1]) return dice;
  }
}

/**
 * One Durable Object per match. It is the only writer of match state, which
 * makes it the concurrency control: there is no lock, no optimistic retry and
 * no way for two submissions to interleave. The AI submits turns through the
 * same code path as the human, which is what keeps human-vs-human additive.
 */
export class MatchDO extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  /**
   * The debrief for the game currently being written to D1. Two requests can
   * observe the same terminal state, and the stored marker only lands after
   * the write, so without this they both record the game.
   */
  private finishing: { game: number; review: Promise<GameReview> } | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS moves (
          seq INTEGER PRIMARY KEY,
          game INTEGER NOT NULL,
          player TEXT NOT NULL,
          dice TEXT NOT NULL,
          notation TEXT NOT NULL,
          state_before TEXT NOT NULL,
          state_after TEXT NOT NULL,
          analysis TEXT,
          ts INTEGER NOT NULL
        )
      `);
      // Cube decisions are graded separately from checker play: there are far
      // fewer of them and they are worth far more equity each.
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS cube_decisions (
          seq INTEGER PRIMARY KEY,
          game INTEGER NOT NULL,
          move_seq INTEGER NOT NULL DEFAULT 0,
          analysis TEXT NOT NULL
        )
      `);
      // Matches created before cube decisions were tied to the move log: their
      // rows default to sequence 0, so a take-back leaves them in place rather
      // than deleting decisions it cannot place.
      const columns = this.sql
        .exec<{ name: string }>('PRAGMA table_info(cube_decisions)')
        .toArray()
        .map((column) => column.name);
      if (!columns.includes('move_seq')) {
        this.sql.exec('ALTER TABLE cube_decisions ADD COLUMN move_seq INTEGER NOT NULL DEFAULT 0');
      }
    });
  }

  async create(
    matchId: string,
    request: CreateMatchRequest,
    player: { token: string; key: string },
  ): Promise<{ playerToken: string; view: MatchView }> {
    if (await this.ctx.storage.get<MatchMeta>('meta')) {
      throw new MatchError('match already exists', 409);
    }

    const options = matchOptions(request);
    const meta: MatchMeta = {
      matchId,
      seat: options.seat,
      aiLevel: options.aiLevel,
      coaching: options.coaching,
      playerToken: player.token,
      playerKey: player.key,
      createdAt: Date.now(),
    };

    // Cached so coaching can be calibrated without a D1 round trip per turn.
    await this.ctx.storage.put('progress', await loadProgress(this.env.DB, player.key));

    const opening = openingRoll();
    // The higher die wins the opening roll; white owns the first die by convention.
    const first: Player = opening[0] > opening[1] ? 'white' : 'black';
    let state = newMatch(options.matchLength, first, opening);

    await this.ctx.storage.put('meta', meta);
    state = this.advanceAI(state, meta);
    await this.putState(state);

    return { playerToken: meta.playerToken, view: await this.view(state, meta) };
  }

  async get(token: string): Promise<MatchView> {
    const meta = await this.requireMeta(token);
    return this.view(await this.requireState(), meta);
  }

  async roll(token: string): Promise<MatchView> {
    const meta = await this.requireMeta(token);
    let state = await this.requireState();
    this.requireHumanTurn(state, meta);
    if (state.phase !== 'roll') throw new MatchError(`cannot roll during "${state.phase}"`, 409);

    // Choosing to roll on is a cube decision too, and the commonest cube error
    // in practice is the double that never gets made.
    const declined =
      meta.coaching && canDouble(state, meta.seat)
        ? analyseCubeDecision(state.board, meta.seat, 'no-double')
        : null;
    // Correct no-doubles count too, so the cube error rate has a denominator of
    // real decisions rather than only the ones that went wrong.
    if (declined && isCubeDecisionPoint(declined)) this.recordCube(state, declined);

    state = roll(state, rollDice());
    await this.putState(state);
    return this.view(state, meta, { cubeAnalysis: declined });
  }

  async submitTurn(token: string, moves: readonly Move[]): Promise<MatchView> {
    const meta = await this.requireMeta(token);
    const before = await this.requireState();
    this.requireHumanTurn(before, meta);
    if (before.phase !== 'move' || before.dice === null) {
      throw new MatchError(`cannot move during "${before.phase}"`, 409);
    }

    let state: MatchState;
    try {
      state = playTurn(before, moves);
    } catch {
      throw new MatchError('illegal move sequence', 400);
    }

    const analysis = meta.coaching
      ? analyseTurn(before.board, meta.seat, before.dice, moves, LIVE_ANALYSIS)
      : null;

    this.record(before, state, meta.seat, before.dice, formatTurn(meta.seat, moves), analysis);
    state = this.advanceAI(state, meta);
    await this.putState(state);
    const review = await this.finishGameIfOver(state, meta);
    return this.view(state, meta, { analysis, review });
  }

  async cube(token: string, command: CubeCommand): Promise<MatchView> {
    const meta = await this.requireMeta(token);
    let state = await this.requireState();

    let cubeAnalysis: CubeAnalysis | null = null;

    if (command === 'double') {
      this.requireHumanTurn(state, meta);
      if (!canDouble(state, meta.seat)) throw new MatchError('double not available', 409);
      cubeAnalysis = meta.coaching ? analyseCubeDecision(state.board, meta.seat, 'double') : null;
      state = offerDouble(state, meta.seat);
      const response = decideCubeResponse(state);
      state = respondToDouble(state, response);
    } else {
      if (state.phase !== 'respond-to-double') throw new MatchError('no double to respond to', 409);
      if (state.pendingDouble === meta.seat) throw new MatchError('you offered this double', 409);
      cubeAnalysis = meta.coaching ? analyseCubeResponse(state.board, meta.seat, command) : null;
      state = respondToDouble(state, command);
    }

    if (cubeAnalysis) this.recordCube(state, cubeAnalysis);

    state = this.advanceAI(state, meta);
    await this.putState(state);
    const review = await this.finishGameIfOver(state, meta);
    return this.view(state, meta, { cubeAnalysis, review });
  }

  async nextGame(token: string): Promise<MatchView> {
    const meta = await this.requireMeta(token);
    let state = await this.requireState();
    if (state.phase !== 'game-over') throw new MatchError('the game is not over', 409);

    const opening = openingRoll();
    state = newGame(state, opening[0] > opening[1] ? 'white' : 'black', opening);
    state = this.advanceAI(state, meta);
    await this.putState(state);
    return this.view(state, meta);
  }

  /** The review of the most recently finished game, if there is one. */
  async review(token: string): Promise<GameReview | null> {
    await this.requireMeta(token);
    return (await this.ctx.storage.get<GameReview>('review')) ?? null;
  }

  async hint(token: string, level: HintLevel): Promise<unknown> {
    const meta = await this.requireMeta(token);
    // Hints are a cheating vector, so availability is decided here rather than
    // in the client. When a second human is seated this must stay refused.
    if (!meta.coaching) throw new MatchError('coaching is disabled for this match', 403);

    const state = await this.requireState();
    this.requireHumanTurn(state, meta);
    if (state.phase !== 'move' || state.dice === null) throw new MatchError('nothing to hint at', 409);

    await this.ctx.storage.put('hintsUsed', ((await this.ctx.storage.get<number>('hintsUsed')) ?? 0) + 1);
    return buildHint(state.board, meta.seat, state.dice, level);
  }

  /** Undo the human's last turn of the current game, and the AI reply it triggered. */
  async takeback(token: string): Promise<MatchView> {
    const meta = await this.requireMeta(token);
    if (!meta.coaching) throw new MatchError('coaching is disabled for this match', 403);

    const current = await this.requireState();
    // The result is already scored and written to the player's permanent
    // record, so unwinding it would leave the two disagreeing.
    if (current.phase === 'game-over' || current.phase === 'match-over') {
      throw new MatchError('the game is over', 409);
    }

    const rows = this.sql
      .exec<MoveRow>('SELECT * FROM moves WHERE game = ? ORDER BY seq DESC', current.gameNumber)
      .toArray();
    const lastHuman = lastTurnBy(rows, meta.seat, current.gameNumber);
    if (!lastHuman) throw new MatchError('nothing to take back', 409);

    this.sql.exec('DELETE FROM moves WHERE seq >= ?', lastHuman.seq);
    // Otherwise the cube decision taken on the same roll is graded twice.
    this.sql.exec('DELETE FROM cube_decisions WHERE move_seq >= ?', lastHuman.seq);
    await this.ctx.storage.put('takebacksUsed', ((await this.ctx.storage.get<number>('takebacksUsed')) ?? 0) + 1);

    const state = JSON.parse(lastHuman.state_before) as MatchState;
    await this.putState(state);
    return this.view(state, meta);
  }

  async history(token: string): Promise<HistoryEntry[]> {
    await this.requireMeta(token);
    return this.sql
      .exec<MoveRow>('SELECT * FROM moves ORDER BY seq ASC')
      .toArray()
      .map((row) => ({
        seq: row.seq,
        player: row.player as Player,
        dice: JSON.parse(row.dice) as Dice,
        notation: row.notation,
        analysis: row.analysis ? (JSON.parse(row.analysis) as TurnAnalysis) : null,
      }));
  }

  /**
   * Play the AI side until it is the human's move again, the AI offers a double
   * or the game ends. Every AI turn goes through the same `playTurn` as a human
   * one; the engine only chooses which legal turn to submit.
   */
  private advanceAI(initial: MatchState, meta: MatchMeta): MatchState {
    const ai = opponent(meta.seat);
    let state = initial;

    for (let guard = 0; guard < 64; guard++) {
      if (state.turn !== ai) return state;

      if (state.phase === 'roll') {
        if (decideCubeAction(state, meta.aiLevel)?.action === 'double') {
          return offerDouble(state, ai);
        }
        state = roll(state, rollDice());
        continue;
      }

      const dice = state.dice;
      if (state.phase !== 'move' || dice === null) return state;

      const before = state;
      const { chosen } = decideTurn(state, meta.aiLevel);
      state = playTurn(state, chosen.turn.moves);
      this.record(before, state, ai, dice, formatTurn(ai, chosen.turn.moves), null);
    }

    throw new MatchError('engine failed to yield the turn', 500);
  }

  /** The sequence number the next recorded move will take. */
  private nextMoveSeq(): number {
    return this.sql.exec<{ seq: number }>('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM moves').one().seq;
  }

  private record(
    before: MatchState,
    after: MatchState,
    player: Player,
    dice: Dice,
    notation: string,
    analysis: TurnAnalysis | null,
  ): void {
    const next = this.nextMoveSeq();
    this.sql.exec(
      'INSERT INTO moves (seq, game, player, dice, notation, state_before, state_after, analysis, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      next,
      before.gameNumber,
      player,
      JSON.stringify(dice),
      notation,
      JSON.stringify(before),
      JSON.stringify(after),
      analysis ? JSON.stringify(analysis) : null,
      Date.now(),
    );
  }

  private recordCube(state: MatchState, analysis: CubeAnalysis): void {
    const next = this.sql
      .exec<{ seq: number }>('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM cube_decisions')
      .one().seq;
    this.sql.exec(
      'INSERT INTO cube_decisions (seq, game, move_seq, analysis) VALUES (?, ?, ?, ?)',
      next,
      state.gameNumber,
      this.nextMoveSeq(),
      JSON.stringify(analysis),
    );
  }

  /**
   * Build the strategy debrief for a finished game and fold it into the
   * player's permanent record.
   *
   * Idempotent on game number, because the same terminal state can be observed
   * by more than one request.
   */
  private async finishGameIfOver(state: MatchState, meta: MatchMeta): Promise<GameReview | null> {
    if (state.phase !== 'game-over' && state.phase !== 'match-over') return null;
    if (state.result === null) return null;
    if ((await this.ctx.storage.get<number>('reviewedGame')) === state.gameNumber) {
      return (await this.ctx.storage.get<GameReview>('review')) ?? null;
    }
    if (this.finishing?.game === state.gameNumber) return this.finishing.review;

    const pending = this.finishGame(state, meta);
    this.finishing = { game: state.gameNumber, review: pending };
    try {
      return await pending;
    } finally {
      this.finishing = null;
    }
  }

  private async finishGame(state: MatchState, meta: MatchMeta): Promise<GameReview> {
    if (state.result === null) throw new MatchError('game is not over', 409);

    const turns = this.sql
      .exec<Pick<MoveRow, 'analysis'>>(
        'SELECT analysis FROM moves WHERE game = ? AND player = ? AND analysis IS NOT NULL',
        state.gameNumber,
        meta.seat,
      )
      .toArray()
      .map((row) => JSON.parse(row.analysis as string) as TurnAnalysis);

    const cubes = this.sql
      .exec<Pick<CubeRow, 'analysis'>>('SELECT analysis FROM cube_decisions WHERE game = ?', state.gameNumber)
      .toArray()
      .map((row) => JSON.parse(row.analysis) as CubeAnalysis);

    // Reloaded rather than taken from the cache: another match may have
    // finished a game since this one started.
    const history = await loadProgress(this.env.DB, meta.playerKey);
    const review = reviewGame(turns, cubes, history, state.phase === 'match-over');

    const progress = await recordGame(this.env.DB, meta.playerKey, {
      matchId: meta.matchId,
      aiLevel: meta.aiLevel,
      won: state.result.winner === meta.seat,
      points: state.result.points,
      review,
    });

    await this.ctx.storage.put('progress', progress);
    await this.ctx.storage.put('review', review);
    await this.ctx.storage.put('reviewedGame', state.gameNumber);
    return review;
  }

  private async view(
    state: MatchState,
    meta: MatchMeta,
    last: {
      analysis?: TurnAnalysis | null;
      cubeAnalysis?: CubeAnalysis | null;
      review?: GameReview | null;
    } = {},
  ): Promise<MatchView> {
    const yours = state.turn === meta.seat;
    // Scoped to the current game so a finished game's plays do not surface as
    // the opponent's reply in the next one.
    const rows = this.sql
      .exec<
        Pick<MoveRow, 'seq' | 'game' | 'player' | 'notation'>
      >(
        'SELECT seq, game, player, notation FROM moves WHERE game = ? ORDER BY seq DESC LIMIT 8',
        state.gameNumber,
      )
      .toArray();

    const aiPlays = opponentTurnsSince(rows, meta.seat, state.gameNumber);

    const over = state.phase === 'game-over' || state.phase === 'match-over';

    const policy = await this.policyFor(state, meta);

    return {
      matchId: meta.matchId,
      seat: meta.seat,
      aiLevel: meta.aiLevel,
      coaching: meta.coaching,
      state,
      legalTurns: yours ? currentLegalTurns(state).map((turn) => turn.moves) : [],
      canDouble: yours && canDouble(state, meta.seat),
      canTakeback:
        meta.coaching &&
        policy.offerTakeback &&
        !over &&
        lastTurnBy(rows, meta.seat, state.gameNumber) !== null,
      lastAnalysis: last.analysis ?? null,
      lastCubeAnalysis: last.cubeAnalysis ?? null,
      policy,
      review: last.review ?? null,
      aiPlays,
    };
  }

  private async policyFor(state: MatchState, meta: MatchMeta): Promise<CoachingPolicy> {
    const progress = (await this.ctx.storage.get<PlayerProgress>('progress')) ?? EMPTY_PROGRESS;
    return coachingPolicy(progress, phaseOf(state.board, meta.seat));
  }

  private async requireMeta(token: string): Promise<MatchMeta> {
    const meta = await this.ctx.storage.get<MatchMeta>('meta');
    if (!meta) throw new MatchError('match not found', 404);
    if (meta.playerToken !== token) throw new MatchError('not your match', 403);
    return meta;
  }

  private async requireState(): Promise<MatchState> {
    const state = await this.ctx.storage.get<MatchState>('state');
    if (!state) throw new MatchError('match not found', 404);
    return state;
  }

  private requireHumanTurn(state: MatchState, meta: MatchMeta): void {
    if (state.turn !== meta.seat) throw new MatchError('not your turn', 409);
  }

  private async putState(state: MatchState): Promise<void> {
    await this.ctx.storage.put('state', state);
  }
}
