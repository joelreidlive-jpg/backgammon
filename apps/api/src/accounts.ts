import { MatchError } from './errors.js';
import { newPlayerToken, playerKey } from './players.js';

/**
 * Email and password accounts, layered over the token identity rather than
 * replacing it.
 *
 * A player is still a key: `players.id`, `completed_games.player_id` and
 * `trainer_attempts.player_id` all mean the same thing before and after
 * sign-in. What an account changes is only how that key is reached — a session
 * token resolves to the account's key, an anonymous token to its own digest —
 * so progress follows the login instead of the browser without any of the
 * progress code knowing accounts exist.
 */

/** How long a sign-in lasts. Long enough that a player is not asked weekly. */
const SESSION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * PBKDF2-SHA256 is used because it is the only password KDF the Workers runtime
 * offers through Web Crypto; a memory-hard KDF would need a WASM dependency.
 * The count is OWASP's 2023 floor for this construction.
 */
const ITERATIONS = 210_000;

export interface Identity {
  /** The token the caller presented, or the one just minted for them. */
  readonly token: string;
  /** The progress key. Stable across sign-ins for an account. */
  readonly key: string;
  /** The signed-in address, or `null` for an anonymous player. */
  readonly email: string | null;
}

interface PasswordRecord {
  readonly hash: string;
  readonly salt: string;
  readonly iterations: number;
}

interface AccountRow {
  email: string;
  player_id: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
}

/**
 * Addresses are compared case-insensitively and without surrounding space, so
 * `Joel@Example.com ` cannot become a second account alongside
 * `joel@example.com`.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytes(value: string): Uint8Array {
  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function derive(password: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: bytes(salt), iterations },
    key,
    256,
  );
  return hex(bits);
}

export async function hashPassword(password: string, iterations = ITERATIONS): Promise<PasswordRecord> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const saltHex = hex(salt.buffer);
  return { hash: await derive(password, saltHex, iterations), salt: saltHex, iterations };
}

/** Compared without early exit, so a wrong password cannot be timed digit by digit. */
function sameDigest(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  return sameDigest(await derive(password, record.salt, record.iterations), record.hash);
}

/**
 * Create an account, adopting the caller's anonymous progress when there is
 * some and nobody else owns it: the common case is a player who has been
 * playing in this browser and now wants that record to follow them.
 */
export async function createAccount(
  db: D1Database,
  email: string,
  password: string,
  anonymousKey: string | null,
): Promise<Identity> {
  const address = normaliseEmail(email);
  const existing = await db.prepare('SELECT email FROM accounts WHERE email = ?').bind(address).first();
  if (existing) throw new MatchError('that email already has an account', 409);

  const adopted = anonymousKey === null ? null : await adoptableKey(db, anonymousKey);
  const key = adopted ?? (await playerKey(newPlayerToken()));
  const credential = await hashPassword(password);

  await db
    .prepare(
      `INSERT INTO accounts
         (email, player_id, password_hash, password_salt, password_iterations, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(address, key, credential.hash, credential.salt, credential.iterations, Date.now())
    .run();

  return { token: await createSession(db, address), key, email: address };
}

/** An anonymous key is adoptable unless another account already owns it. */
async function adoptableKey(db: D1Database, key: string): Promise<string | null> {
  const owner = await db.prepare('SELECT email FROM accounts WHERE player_id = ?').bind(key).first();
  return owner ? null : key;
}

/**
 * Sign in. Wrong address and wrong password give the same answer, so the
 * endpoint cannot be used to discover who has an account.
 */
export async function signIn(db: D1Database, email: string, password: string): Promise<Identity> {
  const address = normaliseEmail(email);
  const row = await db
    .prepare(
      `SELECT email, player_id, password_hash, password_salt, password_iterations
         FROM accounts WHERE email = ?`,
    )
    .bind(address)
    .first<AccountRow>();
  const refused = new MatchError('email or password is wrong', 401);
  if (!row) throw refused;

  const ok = await verifyPassword(password, {
    hash: row.password_hash,
    salt: row.password_salt,
    iterations: row.password_iterations,
  });
  if (!ok) throw refused;

  return { token: await createSession(db, address), key: row.player_id, email: address };
}

export async function createSession(db: D1Database, email: string): Promise<string> {
  const token = newPlayerToken();
  const now = Date.now();
  await db.batch([
    // Expired rows are cleared as they are replaced, so signing in repeatedly
    // does not accumulate dead sessions.
    db.prepare('DELETE FROM sessions WHERE email = ? AND expires_at <= ?').bind(email, now),
    db
      .prepare('INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(await playerKey(token), email, now, now + SESSION_MS),
  ]);
  return token;
}

export async function signOut(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(await playerKey(token)).run();
}

/**
 * Work out who is calling. The token's digest is both the session lookup and
 * the anonymous player key, so an unrecognised token is simply an anonymous
 * player rather than an error — visitors keep playing without an account.
 */
export async function resolveIdentity(db: D1Database, token: string): Promise<Identity> {
  const digest = await playerKey(token);
  const row = await db
    .prepare(
      `SELECT accounts.email AS email, accounts.player_id AS player_id
         FROM sessions JOIN accounts ON accounts.email = sessions.email
        WHERE sessions.id = ? AND sessions.expires_at > ?`,
    )
    .bind(digest, Date.now())
    .first<{ email: string; player_id: string }>();

  if (row) return { token, key: row.player_id, email: row.email };
  return { token, key: digest, email: null };
}
