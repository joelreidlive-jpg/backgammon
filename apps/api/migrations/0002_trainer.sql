-- One row per attempt, including repeats of the same problem: the ladder is
-- judged on recent form, so a retry has to be visible as an attempt.
CREATE TABLE IF NOT EXISTS trainer_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  problem_id TEXT NOT NULL,
  -- Denormalised from the problem set so history stays meaningful after the
  -- set is regenerated and a problem's difficulty is re-graded.
  tier INTEGER NOT NULL,
  solved INTEGER NOT NULL,
  equity_loss REAL NOT NULL,
  attempted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trainer_attempts_player
  ON trainer_attempts (player_id, attempted_at DESC);
