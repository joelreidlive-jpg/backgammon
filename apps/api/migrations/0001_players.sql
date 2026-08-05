-- Progress is keyed by a hash of the player's bearer token, never the token
-- itself, so a leak of this table does not let anyone impersonate a player.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL,
  -- Aggregated PlayerProgress. Stored whole because it is only ever read and
  -- written as one object, and keeping it additive means no per-turn rows.
  progress TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS completed_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  finished_at INTEGER NOT NULL,
  ai_level TEXT NOT NULL,
  won INTEGER NOT NULL,
  points INTEGER NOT NULL,
  decisions INTEGER NOT NULL,
  error_rate REAL NOT NULL,
  -- GameReview without the embedded progress snapshot.
  review TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_completed_games_player
  ON completed_games (player_id, finished_at DESC);
