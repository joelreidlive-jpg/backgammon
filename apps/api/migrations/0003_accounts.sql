-- Accounts sit on top of the existing player records rather than replacing
-- them: `player_id` is the same key `players.id` uses, so signing up can adopt
-- the progress a browser has already accumulated anonymously, and everything
-- downstream of the key (progress, completed games, trainer attempts) is
-- untouched by sign-in.
CREATE TABLE IF NOT EXISTS accounts (
  -- Lower-cased, trimmed email. The username is the primary key because there
  -- is exactly one account per address and no separate profile to reference.
  email TEXT PRIMARY KEY,
  -- One account owns one progress record, and no progress record is shared.
  player_id TEXT NOT NULL UNIQUE,
  -- PBKDF2-SHA256. Parameters are stored per row so they can be raised later
  -- without invalidating existing passwords.
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Sessions are what the browser actually holds after signing in. Rows are keyed
-- by the token's digest, as player tokens are, so a leak of this table cannot
-- be replayed as a sign-in.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions (email);
