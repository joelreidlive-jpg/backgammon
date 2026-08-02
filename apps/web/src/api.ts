import type { Move } from '@bg/rules';
import type {
  CreateMatchRequest,
  CreateMatchResponse,
  CubeCommand,
  Hint,
  HintLevel,
  HistoryEntry,
  MatchView,
} from '@bg/protocol';

const TOKEN_KEY = 'bg.playerToken';
const MATCH_KEY = 'bg.matchId';

export interface Session {
  readonly matchId: string;
  readonly playerToken: string;
}

export function loadSession(): Session | null {
  const matchId = localStorage.getItem(MATCH_KEY);
  const playerToken = localStorage.getItem(TOKEN_KEY);
  return matchId && playerToken ? { matchId, playerToken } : null;
}

export function saveSession(session: Session): void {
  localStorage.setItem(MATCH_KEY, session.matchId);
  localStorage.setItem(TOKEN_KEY, session.playerToken);
}

export function clearSession(): void {
  localStorage.removeItem(MATCH_KEY);
  localStorage.removeItem(TOKEN_KEY);
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
    request<CreateMatchResponse>('/api/matches', { method: 'POST', body: JSON.stringify(body) }),

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

  hint: ({ matchId, playerToken }: Session, level: HintLevel) =>
    request<Hint>(`/api/matches/${matchId}/hint?level=${level}`, { token: playerToken }),

  history: ({ matchId, playerToken }: Session) =>
    request<HistoryEntry[]>(`/api/matches/${matchId}/history`, { token: playerToken }),
};
