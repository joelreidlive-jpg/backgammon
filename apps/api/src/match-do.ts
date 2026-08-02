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
import { type HintLevel, type TurnAnalysis, analyseTurn, buildHint } from '@bg/coach';
import type { CreateMatchRequest, CubeCommand, HistoryEntry, MatchView } from '@bg/protocol';

export class MatchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface MatchMeta {
  readonly matchId: string;
  /** The human's seat. The AI plays the other one. */
  readonly seat: Player;
  readonly aiLevel: Difficulty;
  readonly coaching: boolean;
  readonly playerToken: string;
  readonly createdAt: number;
}

interface MoveRow extends Record<string, SqlStorageValue> {
  seq: number;
  player: string;
  dice: string;
  notation: string;
  state_before: string;
  state_after: string;
  analysis: string | null;
  ts: number;
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

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS moves (
          seq INTEGER PRIMARY KEY,
          player TEXT NOT NULL,
          dice TEXT NOT NULL,
          notation TEXT NOT NULL,
          state_before TEXT NOT NULL,
          state_after TEXT NOT NULL,
          analysis TEXT,
          ts INTEGER NOT NULL
        )
      `);
    });
  }

  async create(matchId: string, request: CreateMatchRequest): Promise<{ playerToken: string; view: MatchView }> {
    if (await this.ctx.storage.get<MatchMeta>('meta')) {
      throw new MatchError('match already exists', 409);
    }

    const matchLength = Math.min(25, Math.max(1, Math.trunc(request.matchLength ?? 1)));
    const seat = request.seat ?? 'white';
    const meta: MatchMeta = {
      matchId,
      seat,
      aiLevel: request.aiLevel ?? 'intermediate',
      coaching: request.coaching ?? true,
      playerToken: crypto.randomUUID(),
      createdAt: Date.now(),
    };

    const opening = openingRoll();
    // The higher die wins the opening roll; white owns the first die by convention.
    const first: Player = opening[0] > opening[1] ? 'white' : 'black';
    let state = newMatch(matchLength, first, opening);

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

    state = roll(state, rollDice());
    await this.putState(state);
    return this.view(state, meta);
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
    return this.view(state, meta, analysis);
  }

  async cube(token: string, command: CubeCommand): Promise<MatchView> {
    const meta = await this.requireMeta(token);
    let state = await this.requireState();

    if (command === 'double') {
      this.requireHumanTurn(state, meta);
      if (!canDouble(state, meta.seat)) throw new MatchError('double not available', 409);
      state = offerDouble(state, meta.seat);
      const response = decideCubeResponse(state);
      state = respondToDouble(state, response);
    } else {
      if (state.phase !== 'respond-to-double') throw new MatchError('no double to respond to', 409);
      if (state.pendingDouble === meta.seat) throw new MatchError('you offered this double', 409);
      state = respondToDouble(state, command);
    }

    state = this.advanceAI(state, meta);
    await this.putState(state);
    return this.view(state, meta);
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

  /** Undo the human's last turn, and the AI reply it triggered. */
  async takeback(token: string): Promise<MatchView> {
    const meta = await this.requireMeta(token);
    if (!meta.coaching) throw new MatchError('coaching is disabled for this match', 403);

    const rows = this.sql
      .exec<MoveRow>('SELECT * FROM moves ORDER BY seq DESC')
      .toArray();
    const lastHuman = rows.find((row) => row.player === meta.seat);
    if (!lastHuman) throw new MatchError('nothing to take back', 409);

    this.sql.exec('DELETE FROM moves WHERE seq >= ?', lastHuman.seq);
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

  private record(
    before: MatchState,
    after: MatchState,
    player: Player,
    dice: Dice,
    notation: string,
    analysis: TurnAnalysis | null,
  ): void {
    const next = this.sql.exec<{ seq: number }>('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM moves').one().seq;
    this.sql.exec(
      'INSERT INTO moves (seq, player, dice, notation, state_before, state_after, analysis, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      next,
      player,
      JSON.stringify(dice),
      notation,
      JSON.stringify(before),
      JSON.stringify(after),
      analysis ? JSON.stringify(analysis) : null,
      Date.now(),
    );
  }

  private async view(state: MatchState, meta: MatchMeta, lastAnalysis: TurnAnalysis | null = null): Promise<MatchView> {
    const yours = state.turn === meta.seat;
    const rows = this.sql
      .exec<Pick<MoveRow, 'player' | 'notation'>>('SELECT player, notation FROM moves ORDER BY seq DESC LIMIT 8')
      .toArray();

    const aiPlays: string[] = [];
    for (const row of rows) {
      if (row.player === meta.seat) break;
      aiPlays.unshift(row.notation);
    }

    return {
      matchId: meta.matchId,
      seat: meta.seat,
      aiLevel: meta.aiLevel,
      coaching: meta.coaching,
      state,
      legalTurns: yours ? currentLegalTurns(state).map((turn) => turn.moves) : [],
      canDouble: yours && canDouble(state, meta.seat),
      canTakeback: meta.coaching && rows.some((row) => row.player === meta.seat),
      lastAnalysis,
      aiPlays,
    };
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
