import { useEffect, useState, type FormEvent } from 'react';
import { api, clearPlayer, loadPlayerToken, savePlayerToken, clearSession } from './api.js';

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

export function AccountButton() {
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState<Mode | null>(null);

  // The token in this browser may be a session that has since expired, so who
  // it belongs to is the server's answer, not something the client remembers.
  useEffect(() => {
    const token = loadPlayerToken();
    if (!token) return;
    void api
      .whoAmI(token)
      .then((who) => setEmail(who.email))
      .catch(() => setEmail(null));
  }, []);

  const signOut = async () => {
    const token = loadPlayerToken();
    if (token) await api.signOut(token).catch(() => undefined);
    clearPlayer();
    window.location.reload();
  };

  return (
    <>
      {email === null ? (
        <button type="button" className="link" onClick={() => setOpen('signin')}>
          Sign in
        </button>
      ) : (
        <>
          <span className="muted account-email">{email}</span>
          <button type="button" className="link" onClick={() => void signOut()}>
            Sign out
          </button>
        </>
      )}
      {open && <AccountDialog mode={open} onMode={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

function AccountDialog({
  mode,
  onMode,
  onClose,
}: {
  mode: Mode;
  onMode: (mode: Mode) => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const who = mode === 'signup' ? await api.signUp(email, password) : await api.signIn(email, password);
      savePlayerToken(who.playerToken);
      // Whatever match was open belonged to the previous identity.
      clearSession();
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'that did not work');
      setBusy(false);
    }
  };

  return (
    <div className="glossary-backdrop" onClick={onClose}>
      <aside
        className="account"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'signup' ? 'Create an account' : 'Sign in'}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{mode === 'signup' ? 'Create an account' : 'Sign in'}</h2>
          <button type="button" className="link" onClick={onClose}>
            Close
          </button>
        </header>

        <form onSubmit={(event) => void submit(event)}>
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

          {mode === 'signup' && (
            <p className="muted">
              At least 8 characters. Whatever you have played on this device so far becomes this
              account’s record.
            </p>
          )}
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
                onMode(mode === 'signup' ? 'signin' : 'signup');
              }}
            >
              {mode === 'signup' ? 'I already have an account' : 'Create an account'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
