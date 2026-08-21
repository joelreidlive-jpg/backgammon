import type { AttemptRecord, AttemptResult, Tier } from '@bg/trainer';

interface AttemptRow {
  problem_id: string;
  tier: number;
  solved: number;
  attempted_at: number;
}

/**
 * The ladder only ever looks at recent form, so there is no reason to read a
 * player's whole history to answer a request.
 */
export const ATTEMPT_HISTORY = 200;

export async function loadAttempts(
  db: D1Database,
  key: string,
  limit = ATTEMPT_HISTORY,
): Promise<AttemptRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT problem_id, tier, solved, attempted_at
       FROM trainer_attempts WHERE player_id = ? ORDER BY attempted_at DESC, id DESC LIMIT ?`,
    )
    .bind(key, limit)
    .all<AttemptRow>();

  return results.map((row) => ({
    problemId: row.problem_id,
    tier: row.tier as Tier,
    solved: row.solved === 1,
    at: row.attempted_at,
  }));
}

/**
 * Every attempt is recorded, including repeats of a problem already answered.
 * Retrying until it is right therefore costs an unsolved attempt in the same
 * window, which is what stops the ladder being farmable.
 */
export async function recordAttempt(
  db: D1Database,
  key: string,
  tier: Tier,
  result: AttemptResult,
): Promise<AttemptRecord> {
  const at = Date.now();
  await db
    .prepare(
      `INSERT INTO trainer_attempts (player_id, problem_id, tier, solved, equity_loss, attempted_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(key, result.problemId, tier, result.solved ? 1 : 0, result.equityLoss, at)
    .run();

  return { problemId: result.problemId, tier, solved: result.solved, at };
}
