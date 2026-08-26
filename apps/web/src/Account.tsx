import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  ApiError,
  api,
  clearPlayer,
  loadPlayerToken,
  savePlayerToken,
  clearSession,
} from './api.js';

/**
 * Signing in, so that progress follows the player rather than the browser.
 *
 * The account is only ever a way of reaching a player record: the token the
 * server hands back on sign-in is used exactly as an anonymous one is, so
 * nothing else in the client needs to know whether anyone has signed in. A
 * change of identity reloads the page rather than rewiring the app's state —
 * the match on screen belongs to whoever was playing a moment ago.
 */

type Mode = 'signin' | 'signup';

/**
 * Who is playing, as the server sees it: the browser's token may have expired.
 * `lost` is deliberately distinct from `out` — a token the server refuses is
 * not the same as a server that would not answer, and since this gates the
 * whole app, guessing `out` on a rate limit or a dropped connection would sign
 * a player out of a game they are in the middle of.
 */
type Who =
  | { status: 'asking' }
  | { status: 'out' }
  | { status: 'lost' }
  | { status: 'in'; email: string };

/** One answer per page load, shared: asking twice spends the auth rate limit twice. */
const WhoContext = createContext<Who>({ status: 'asking' });

function useWho(): Who {
  return useContext(WhoContext);
}

function useAskWho(): { who: Who; again: () => void } {
  const [who, setWho] = useState<Who>({ status: 'asking' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const token = loadPlayerToken();
    if (!token) {
      setWho({ status: 'out' });
      return;
    }
    void api
      .whoAmI(token)
      .then((answer) =>
        setWho(answer.email === null ? { status: 'out' } : { status: 'in', email: answer.email }),
      )
      .catch((cause: unknown) =>
        setWho(
          cause instanceof ApiError && cause.status === 401
            ? { status: 'out' }
            : { status: 'lost' },
        ),
      );
  }, [attempt]);

  const again = useCallback(() => {
    setWho({ status: 'asking' });
    setAttempt((n) => n + 1);
  }, []);

  return { who, again };
}

/**
 * The gate on the whole app. Every game, trainer attempt and progress read is
 * written against an account, so there is nothing to show a visitor who has
 * not signed in — and letting them play first would build a record that the
 * server then refuses to accept.
 */
export function RequireAccount({ children }: { children: ReactNode }) {
  const { who, again } = useAskWho();

  if (who.status === 'asking') return <p className="setup muted">One moment…</p>;

  if (who.status === 'in') {
    return <WhoContext.Provider value={who}>{children}</WhoContext.Provider>;
  }

  if (who.status === 'lost') {
    return (
      <div className="setup">
        <h1>Backgammon</h1>
        <p className="muted">
          Could not reach the server to check who is playing. You are still signed in — this is the
          connection, not your account.
        </p>
        <button type="button" onClick={again}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="setup gate">
      <div className="blurb">
        <h1>Backgammon</h1>
        <p className="muted">Play a computer opponent, with a coach watching over your shoulder.</p>
        <p className="muted">
          Sign in to play: your games, your grade and the trainer's record of what you keep getting
          wrong belong to your account, so they follow you to any device.
        </p>
      </div>
      <AccountForm mode="signin" />
    </div>
  );
}

/** Who is signed in, and the way out. Shown once there is an account to show. */
export function AccountButton() {
  const who = useWho();

  const signOut = async () => {
    const token = loadPlayerToken();
    if (token) await api.signOut(token).catch(() => undefined);
    clearPlayer();
    window.location.reload();
  };

  if (who.status !== 'in') return null;

  return (
    <>
      <span className="muted account-email">{who.email}</span>
      <button type="button" className="link" onClick={() => void signOut()}>
        Sign out
      </button>
    </>
  );
}

export function AccountForm({ mode: initial }: { mode: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setError(null);
      try {
        const who =
          mode === 'signup' ? await api.signUp(email, password) : await api.signIn(email, password);
        savePlayerToken(who.playerToken);
        // Whatever match was open belonged to the previous identity.
        clearSession();
        window.location.reload();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'that did not work');
        setBusy(false);
      }
    },
    [email, mode, password],
  );

  return (
    <form className="account" onSubmit={(event) => void submit(event)}>
      <h2>{mode === 'signup' ? 'Create an account' : 'Sign in'}</h2>
      <label>
        Email
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {mode === 'signup' && <p className="muted">At least 8 characters.</p>}
      {error && <p className="error">{error}</p>}

      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            setError(null);
            setMode(mode === 'signup' ? 'signin' : 'signup');
          }}
        >
          {mode === 'signup' ? 'I already have an account' : 'Create an account'}
        </button>
      </div>
    </form>
  );
}
