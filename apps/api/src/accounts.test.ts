import { describe, expect, it } from 'vitest';
import {
  createAccount,
  hashPassword,
  normaliseEmail,
  resolveIdentity,
  signIn,
  signOut,
  verifyPassword,
} from './accounts.js';
import { playerKey } from './players.js';

type Row = Record<string, string | number>;

/**
 * Just enough D1 to exercise the account flows: the queries are matched by
 * shape, so a rewritten query fails the test rather than silently passing.
 */
class FakeDb {
  readonly accounts: Row[] = [];
  readonly sessions: Row[] = [];

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql);
  }

  async batch(statements: readonly FakeStatement[]): Promise<void> {
    for (const statement of statements) await statement.run();
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}

class FakeStatement {
  private args: (string | number)[] = [];

  constructor(
    private readonly db: FakeDb,
    private readonly sql: string,
  ) {}

  bind(...args: (string | number)[]): FakeStatement {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const [first, second] = this.args;
    if (/FROM accounts WHERE email/.test(this.sql)) {
      return (this.db.accounts.find((row) => row.email === first) ?? null) as T | null;
    }
    if (/FROM accounts WHERE player_id/.test(this.sql)) {
      return (this.db.accounts.find((row) => row.player_id === first) ?? null) as T | null;
    }
    if (/FROM sessions JOIN accounts/.test(this.sql)) {
      const session = this.db.sessions.find((row) => row.id === first && Number(row.expires_at) > Number(second));
      const account = session ? this.db.accounts.find((row) => row.email === session.email) : undefined;
      return account ? ({ email: account.email, player_id: account.player_id } as T) : null;
    }
    throw new Error(`unexpected query: ${this.sql}`);
  }

  async run(): Promise<void> {
    if (/INSERT INTO accounts/.test(this.sql)) {
      const [email, player_id, password_hash, password_salt, password_iterations, created_at] = this.args;
      this.db.accounts.push({
        email,
        player_id,
        password_hash,
        password_salt,
        password_iterations,
        created_at,
      });
      return;
    }
    if (/INSERT INTO sessions/.test(this.sql)) {
      const [id, email, created_at, expires_at] = this.args;
      this.db.sessions.push({ id, email, created_at, expires_at });
      return;
    }
    if (/DELETE FROM sessions WHERE email/.test(this.sql)) {
      const [email, now] = this.args;
      for (let i = this.db.sessions.length - 1; i >= 0; i -= 1) {
        const row = this.db.sessions[i];
        if (row.email === email && Number(row.expires_at) <= Number(now)) this.db.sessions.splice(i, 1);
      }
      return;
    }
    if (/DELETE FROM sessions WHERE id/.test(this.sql)) {
      const [id] = this.args;
      const index = this.db.sessions.findIndex((row) => row.id === id);
      if (index >= 0) this.db.sessions.splice(index, 1);
      return;
    }
    throw new Error(`unexpected statement: ${this.sql}`);
  }
}

const TOKEN = 'a'.repeat(64);

describe('passwords', () => {
  it('accepts the right password and refuses a wrong one', async () => {
    const record = await hashPassword('correct horse battery', 1000);
    expect(await verifyPassword('correct horse battery', record)).toBe(true);
    expect(await verifyPassword('correct horse batter', record)).toBe(false);
  });

  it('never stores the password itself', async () => {
    const record = await hashPassword('hunter2hunter2', 1000);
    expect(record.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.hash).not.toContain('hunter2');
  });

  it('stays inside the iteration count the Workers runtime will accept', async () => {
    const record = await hashPassword('a password worth keeping');
    expect(record.iterations).toBeLessThanOrEqual(100_000);
  });

  it('salts each account separately, so two equal passwords do not match', async () => {
    const one = await hashPassword('same password', 1000);
    const two = await hashPassword('same password', 1000);
    expect(one.hash).not.toBe(two.hash);
  });
});

describe('normaliseEmail', () => {
  it('folds case and surrounding space, so one address is one account', () => {
    expect(normaliseEmail(' Joel@Example.COM ')).toBe('joel@example.com');
  });
});

describe('accounts', () => {
  it('adopts the progress the browser already had', async () => {
    const db = new FakeDb();
    const before = await resolveIdentity(db.asD1(), TOKEN);
    const account = await createAccount(db.asD1(), 'joel@example.com', 'password123', before.key);

    expect(account.key).toBe(before.key);
    expect(account.token).not.toBe(TOKEN);
  });

  it('refuses a second account on the same address, however it is typed', async () => {
    const db = new FakeDb();
    await createAccount(db.asD1(), 'joel@example.com', 'password123', null);
    await expect(createAccount(db.asD1(), 'JOEL@example.com', 'other-password', null)).rejects.toThrow(
      /already has an account/,
    );
  });

  it('does not hand a second account the first account\u2019s progress', async () => {
    const db = new FakeDb();
    const held = await resolveIdentity(db.asD1(), TOKEN);
    const first = await createAccount(db.asD1(), 'first@example.com', 'password123', held.key);
    const second = await createAccount(db.asD1(), 'second@example.com', 'password123', held.key);

    expect(second.key).not.toBe(first.key);
  });

  it('signs in to the same progress key across sessions', async () => {
    const db = new FakeDb();
    const created = await createAccount(db.asD1(), 'joel@example.com', 'password123', null);
    const signedIn = await signIn(db.asD1(), ' Joel@Example.com ', 'password123');

    expect(signedIn.key).toBe(created.key);
    expect(signedIn.token).not.toBe(created.token);
    // The earlier session still works: signing in elsewhere is not a sign-out.
    expect((await resolveIdentity(db.asD1(), created.token)).email).toBe('joel@example.com');
  });

  it('refuses a wrong password, and says no more than that', async () => {
    const db = new FakeDb();
    await createAccount(db.asD1(), 'joel@example.com', 'password123', null);
    await expect(signIn(db.asD1(), 'joel@example.com', 'password124')).rejects.toThrow(
      'email or password is wrong',
    );
    await expect(signIn(db.asD1(), 'nobody@example.com', 'password123')).rejects.toThrow(
      'email or password is wrong',
    );
  });

  it('resolves an unknown token as an anonymous player, keyed by its digest', async () => {
    const db = new FakeDb();
    const identity = await resolveIdentity(db.asD1(), TOKEN);
    expect(identity.email).toBeNull();
    expect(identity.key).toBe(await playerKey(TOKEN));
  });

  it('stops accepting a token once it is signed out', async () => {
    const db = new FakeDb();
    const account = await createAccount(db.asD1(), 'joel@example.com', 'password123', null);
    await signOut(db.asD1(), account.token);

    const after = await resolveIdentity(db.asD1(), account.token);
    expect(after.email).toBeNull();
    // And the session token cannot reach the account's progress any more.
    expect(after.key).not.toBe(account.key);
  });
});
