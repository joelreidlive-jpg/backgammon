import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TurnBuilder } from '@bg/rules';
import { destinationsFrom, extendTurn, startTurn, undoLastMove } from '@bg/rules';
import type { Difficulty, GameReview, HintLevel, MatchView, ProgressResponse } from '@bg/protocol';
import { Board } from './Board.js';
import { CoachPanel } from './CoachPanel.js';
import { NewMatchForm } from './NewMatchForm.js';
import { ReviewPanel } from './ReviewPanel.js';
import {
  api,
  clearSession,
  loadPlayerToken,
  loadSession,
  saveSession,
  type Session,
} from './api.js';

const LEVEL_NAMES: Readonly<Record<Difficulty, string>> = {
  beginner: 'Beginner',
  casual: 'Casual',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
};

export function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [view, setView] = useState<MatchView | null>(null);
  const [builder, setBuilder] = useState<TurnBuilder | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [review, setReview] = useState<GameReview | null>(null);

  const adopt = useCallback((next: MatchView) => {
    setView(next);
    setSelected(null);
    setError(null);
    if (next.review) setReview(next.review);
    setBuilder(
      next.state.phase === 'move' && next.state.turn === next.seat && next.state.dice !== null
        ? startTurn(next.state.board, next.seat, next.state.dice)
        : null,
    );
  }, []);

  const run = useCallback(
    async (action: () => Promise<MatchView>) => {
      setBusy(true);
      try {
        adopt(await action());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'something went wrong');
      } finally {
        setBusy(false);
      }
    },
    [adopt],
  );

  // Fetched on the setup screen, where it is both the record and the reason the
  // coach behaves differently for a stronger player.
  useEffect(() => {
    if (session && view) return;
    const token = loadPlayerToken();
    if (!token) return;
    void api
      .progress(token)
      .then(setProgress)
      .catch(() => setProgress(null));
  }, [session, view]);

  useEffect(() => {
    if (!session || view) return;
    void api
      .getMatch(session)
      .then(adopt)
      .catch(() => {
        clearSession();
        setSession(null);
      });
  }, [session, view, adopt]);

  // A reload lands on the finished game with no review in hand, so fetch the
  // one the server stored when the game ended.
  useEffect(() => {
    if (!session || !view || review) return;
    if (view.state.phase !== 'game-over' && view.state.phase !== 'match-over') return;
    void api
      .review(session)
      .then((stored) => {
        if (stored) setReview(stored);
      })
      .catch(() => undefined);
  }, [session, view, review]);

  // A completed turn is submitted immediately: partial turns are already
  // validated against full legal turns, so there is nothing left to confirm.
  // A turn with no moves is the forced pass, which the player confirms.
  useEffect(() => {
    if (!session || !builder?.complete || builder.pending.length === 0 || busy) return;
    const moves = builder.pending;
    setBuilder(null);
    void run(() => api.submitTurn(session, moves));
  }, [builder, session, busy, run]);

  const sources = useMemo(
    () => new Set(builder?.options.map((move) => move.from) ?? []),
    [builder],
  );
  const destinations = useMemo(
    () =>
      new Set(
        builder && selected !== null ? destinationsFrom(builder, selected).map((move) => move.to) : [],
      ),
    [builder, selected],
  );

  if (!session || !view) {
    return (
      <NewMatchForm
        busy={busy}
        progress={progress}
        onStart={async (request) => {
          setBusy(true);
          try {
            const { playerToken, match } = await api.createMatch(request);
            const next = { matchId: match.matchId, playerToken };
            saveSession(next);
            setSession(next);
            setReview(null);
            adopt(match);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'could not start a match');
          } finally {
            setBusy(false);
          }
        }}
        error={error}
      />
    );
  }

  const { state, seat } = view;
  const yourTurn = state.turn === seat;

  const onSelect = (slot: number) => {
    if (!builder) return;
    if (selected !== null) {
      const move = destinationsFrom(builder, selected).find((m) => m.to === slot);
      if (move) {
        setBuilder(extendTurn(builder, move));
        setSelected(null);
        return;
      }
    }
    setSelected(sources.has(slot) ? slot : null);
  };

  return (
    <div className="app">
      <header>
        <h1>Backgammon</h1>
        <div className="scoreline">
          <span>
            You {state.score[seat]} — {state.score[seat === 'white' ? 'black' : 'white']}{' '}
            {LEVEL_NAMES[view.aiLevel]}
          </span>
          <span className="muted">
            {state.matchLength > 1 ? `Match to ${state.matchLength}` : 'Single game'} · cube{' '}
            {state.cube.value}
            {state.crawfordGame ? ' · Crawford' : ''}
          </span>
          <button
            type="button"
            className="link"
            onClick={() => {
              clearSession();
              setSession(null);
              setView(null);
              setReview(null);
            }}
          >
            New match
          </button>
        </div>
      </header>

      <main>
        <Board
          board={builder?.board ?? state.board}
          seat={seat}
          selected={selected}
          sources={sources}
          destinations={destinations}
          onSelect={onSelect}
        />

        <section className="controls">
          {error && <p className="error">{error}</p>}

          {view.aiPlays.length > 0 && (
            <p className="ai-play">
              Opponent played <strong>{view.aiPlays.join(', ')}</strong>
            </p>
          )}

          {state.phase === 'match-over' && (
            <p className="result">
              {state.matchWinner === seat ? 'You win the match.' : 'The engine wins the match.'}
            </p>
          )}

          {state.phase === 'game-over' && (
            <>
              <p className="result">
                {state.result?.winner === seat ? 'You win' : 'You lose'} {state.result?.points} point
                {state.result?.points === 1 ? '' : 's'}.
              </p>
              <button type="button" disabled={busy} onClick={() => void run(() => api.nextGame(session))}>
                Next game
              </button>
            </>
          )}

          {state.phase === 'respond-to-double' && state.pendingDouble !== seat && (
            <div className="cube-offer">
              <p>The engine doubles to {state.cube.value * 2}.</p>
              <button type="button" disabled={busy} onClick={() => void run(() => api.cube(session, 'take'))}>
                Take
              </button>
              <button type="button" disabled={busy} onClick={() => void run(() => api.cube(session, 'drop'))}>
                Drop
              </button>
            </div>
          )}

          {state.phase === 'roll' &&
            (yourTurn ? (
              <div className="roll-controls">
                <button type="button" disabled={busy} onClick={() => void run(() => api.roll(session))}>
                  Roll
                </button>
                {view.canDouble && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => api.cube(session, 'double'))}
                  >
                    Double to {state.cube.value * 2}
                  </button>
                )}
              </div>
            ) : (
              <p className="muted">Waiting for the engine…</p>
            ))}

          {state.dice && state.phase === 'move' && (
            <div className="dice" aria-label="dice">
              <span className="die">{state.dice[0]}</span>
              <span className="die">{state.dice[1]}</span>
              {yourTurn && builder && builder.pending.length > 0 && (
                <button type="button" className="link" onClick={() => setBuilder(undoLastMove(builder))}>
                  Undo
                </button>
              )}
            </div>
          )}

          {yourTurn && builder?.complete && builder.pending.length === 0 && (
            <>
              <p className="muted">No legal play with this roll.</p>
              <button type="button" disabled={busy} onClick={() => void run(() => api.submitTurn(session, []))}>
                Pass
              </button>
            </>
          )}
        </section>

        <CoachPanel
          enabled={view.coaching}
          canAsk={yourTurn && state.phase === 'move' && !busy}
          canTakeback={view.canTakeback}
          analysis={view.lastAnalysis}
          cubeAnalysis={view.lastCubeAnalysis}
          policy={view.policy}
          onHint={(level: HintLevel) => api.hint(session, level)}
          onTakeback={() => void run(() => api.takeback(session))}
        />
      </main>

      {review && (state.phase === 'game-over' || state.phase === 'match-over') && (
        <ReviewPanel review={review} />
      )}
    </div>
  );
}
