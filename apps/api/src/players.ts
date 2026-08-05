import { EMPTY_PROGRESS, type GameReview, type PlayerProgress } from '@bg/coach';
import type { Difficulty } from '@bg/ai';
import type { GameSummary } from '@bg/protocol';

/**
 * A player is identified by an opaque bearer token held in the browser. There
 * are no accounts yet, so this is the whole identity: unguessable, but lost if
 * the browser is cleared. Adding real sign-in later means mapping an account to
 * this same key, not changing anything below it.
 */
export function newPlayerToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Rows are keyed by the token's digest so the database never holds the secret. */
export async function playerKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface PlayerRow {
  progress: string;
}

export async function loadProgress(db: D1Database, key: string): Promise<PlayerProgress> {
  const row = await db.prepare('SELECT progress FROM players WHERE id = ?').bind(key).first<PlayerRow>();
  if (!row) return EMPTY_PROGRESS;
  return JSON.parse(row.progress) as PlayerProgress;
}

/**
 * Persist a finished game.
 *
 * `review.progress` is already the new cumulative total, because the review was
 * built against the record loaded moments earlier. That read-modify-write is
 * safe here since a player has at most one game finishing at a time, and even a
 * lost update costs one game's statistics rather than corrupting the total.
 */
export async function recordGame(
  db: D1Database,
  key: string,
  game: {
    matchId: string;
    aiLevel: Difficulty;
    won: boolean;
    points: number;
    review: GameReview;
  },
): Promise<PlayerProgress> {
  const now = Date.now();
  const { progress, ...review } = game.review;

  await db.batch([
    db
      .prepare(
        `INSERT INTO players (id, created_at, seen_at, progress) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET seen_at = excluded.seen_at, progress = excluded.progress`,
      )
      .bind(key, now, now, JSON.stringify(progress)),
    db
      .prepare(
        `INSERT INTO completed_games
           (player_id, match_id, finished_at, ai_level, won, points, decisions, error_rate, review)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        key,
        game.matchId,
        now,
        game.aiLevel,
        game.won ? 1 : 0,
        game.points,
        game.review.decisions,
        game.review.errorRate,
        JSON.stringify(review),
      ),
  ]);

  return progress;
}

interface GameRow {
  match_id: string;
  finished_at: number;
  ai_level: string;
  won: number;
  points: number;
  decisions: number;
  error_rate: number;
}

export async function recentGames(db: D1Database, key: string, limit = 20): Promise<GameSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT match_id, finished_at, ai_level, won, points, decisions, error_rate
       FROM completed_games WHERE player_id = ? ORDER BY finished_at DESC LIMIT ?`,
    )
    .bind(key, limit)
    .all<GameRow>();

  return results.map((row) => ({
    matchId: row.match_id,
    finishedAt: row.finished_at,
    aiLevel: row.ai_level as Difficulty,
    won: row.won === 1,
    points: row.points,
    decisions: row.decisions,
    errorRate: row.error_rate,
  }));
}
