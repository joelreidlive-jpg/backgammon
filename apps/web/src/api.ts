import type { Move } from '@bg/rules';
import type {
  CreateMatchRequest,
  CreateMatchResponse,
  CubeAnswer,
  CubeCommand,
  Hint,
  HintLevel,
  GameReview,
  HistoryEntry,
  MatchView,
  ProgressResponse,
  TrainerAttemptResponse,
  TrainerProblemResponse,
} from '@bg/protocol';

const TOKEN_KEY = 'bg.playerToken';
const MATCH_KEY = 'bg.matchId';
const ACTIVE_KEY = 'bg.matchActiveAt';

export interface Session {
  readonly matchId: string;
  readonly playerToken: string;
}

/**
 * The player token outlives any single match — it is the identity the server
 * accumulates progress against, so finishing or abandoning a match must not
 * clear it.
 */
export function loadPlayerToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function savePlayerToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function loadSession(): Session | null {
  const matchId = localStorage.getItem(MATCH_KEY);
  const playerToken = loadPlayerToken();
  return matchId && playerToken ? { matchId, playerToken } : null;
}

export function saveSession(session: Session): void {
  localStorage.setItem(MATCH_KEY, session.matchId);
  savePlayerToken(session.playerToken);
  touchSession();
}

/** Records that the stored match is being played right now. */
export function touchSession(): void {
  localStorage.setItem(ACTIVE_KEY, String(Date.now()));
}

/**
 * How long the stored match has been untouched, or `null` when that is not
 * known — a match stored before this was recorded is old by definition.
 */
export function sessionIdleMs(now = Date.now()): number | null {
  const stamp = Number(localStorage.getItem(ACTIVE_KEY));
  return Number.isFinite(stamp) && stamp > 0 ? Math.max(0, now - stamp) : null;
}

/** Forgets the current match but keeps the player. */
export function clearSession(): void {
  localStorage.removeItem(MATCH_KEY);
  localStorage.removeItem(ACTIVE_KEY);
}

export class ApiError extends Error {}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const response = await fetch(path, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-player-token': token } : {}),
      ...rest.headers,
    },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body ? String(body.error) : response.statusText;
    throw new ApiError(message);
  }
  return body as T;
}

/**
 * All state changes come back as a full `MatchView`, so the client is a
 * reducer over server events rather than a second source of truth. When the
 * WebSocket layer arrives for human-vs-human, only this module changes.
 */
export const api = {
  createMatch: (body: CreateMatchRequest) =>
    request<CreateMatchResponse>('/api/matches', {
      method: 'POST',
      body: JSON.stringify(body),
      token: loadPlayerToken() ?? undefined,
    }),

  progress: (playerToken: string) => request<ProgressResponse>('/api/me/progress', { token: playerToken }),

  review: ({ matchId, playerToken }: Session) =>
    request<GameReview | null>(`/api/matches/${matchId}/review`, { token: playerToken }),

  getMatch: ({ matchId, playerToken }: Session) =>
    request<MatchView>(`/api/matches/${matchId}`, { token: playerToken }),

  roll: ({ matchId, playerToken }: Session) =>
    request<MatchView>(`/api/matches/${matchId}/roll`, { method: 'POST', token: playerToken }),

  submitTurn: ({ matchId, playerToken }: Session, moves: readonly Move[]) =>
    request<MatchView>(`/api/matches/${matchId}/turn`, {
      method: 'POST',
      token: playerToken,
      body: JSON.stringify({ moves }),
    }),

  cube: ({ matchId, playerToken }: Session, action: CubeCommand) =>
    request<MatchView>(`/api/matches/${matchId}/cube`, {
      method: 'POST',
      token: playerToken,
      body: JSON.stringify({ action }),
    }),

  nextGame: ({ matchId, playerToken }: Session) =>
    request<MatchView>(`/api/matches/${matchId}/next-game`, { method: 'POST', token: playerToken }),

  takeback: ({ matchId, playerToken }: Session) =>
    request<MatchView>(`/api/matches/${matchId}/takeback`, { method: 'POST', token: playerToken }),

  playBest: ({ matchId, playerToken }: Session) =>
    request<MatchView>(`/api/matches/${matchId}/play-best`, { method: 'POST', token: playerToken }),

  hint: ({ matchId, playerToken }: Session, level: HintLevel) =>
    request<Hint>(`/api/matches/${matchId}/hint?level=${level}`, { token: playerToken }),

  history: ({ matchId, playerToken }: Session) =>
    request<HistoryEntry[]>(`/api/matches/${matchId}/history`, { token: playerToken }),

  // The trainer can be the first thing a visitor touches, so it works without
  // a token and returns the one the server minted.
  nextProblem: (playerToken: string | null) =>
    request<TrainerProblemResponse>('/api/trainer/next', { token: playerToken ?? undefined }),

  attempt: (playerToken: string, problemId: string, moves: readonly Move[]) =>
    request<TrainerAttemptResponse>('/api/trainer/attempt', {
      method: 'POST',
      token: playerToken,
      body: JSON.stringify({ kind: 'checker', problemId, moves }),
    }),

  cubeAttempt: (playerToken: string, problemId: string, answer: CubeAnswer) =>
    request<TrainerAttemptResponse>('/api/trainer/attempt', {
      method: 'POST',
      token: playerToken,
      body: JSON.stringify({ kind: 'cube', problemId, answer }),
    }),
};
