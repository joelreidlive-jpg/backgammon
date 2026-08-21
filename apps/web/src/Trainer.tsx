import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TurnBuilder } from '@bg/rules';
import { destinationsFrom, extendTurn, startTurn, undoLastMove } from '@bg/rules';
import type { TrainerAttemptResponse, TrainerProblemResponse } from '@bg/protocol';
import { Board } from './Board.js';
import { api, loadPlayerToken, savePlayerToken } from './api.js';

const TIER_NAMES: readonly string[] = ['', 'Straightforward', 'Routine', 'Testing', 'Hard', 'Expert'];

const PHASE_NAMES: Readonly<Record<string, string>> = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  holding: 'Holding game',
  race: 'Race',
  bearoff: 'Bear-off',
};

export interface TrainerProps {
  onExit: () => void;
}

/**
 * The problem trainer: one position, one roll, one play, graded.
 *
 * The answer is never in this component — the server sends a position and the
 * legal turns, and only says what the right play was once an attempt has been
 * submitted. Reading the bundle or the network tab therefore does not give the
 * answer away.
 */
export function Trainer({ onExit }: TrainerProps) {
  const [data, setData] = useState<TrainerProblemResponse | null>(null);
  const [outcome, setOutcome] = useState<TrainerAttemptResponse | null>(null);
  const [builder, setBuilder] = useState<TurnBuilder | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = useCallback(async () => {
    setBusy(true);
    try {
      const response = await api.nextProblem(loadPlayerToken());
      savePlayerToken(response.playerToken);
      setData(response);
      setOutcome(null);
      setSelected(null);
      setError(null);
      setBuilder(
        response.problem
          ? startTurn(response.problem.board, response.problem.player, response.problem.dice)
          : null,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'could not load a problem');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void next();
  }, [next]);

  const problem = data?.problem ?? null;

  // A complete turn is the answer, so it is submitted as soon as it is built —
  // the same interaction as playing a move in a game.
  useEffect(() => {
    if (!problem || !builder?.complete || outcome || busy) return;
    const moves = builder.pending;
    setBusy(true);
    void api
      .attempt(loadPlayerToken() ?? '', problem.id, moves)
      .then(setOutcome)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'could not grade that play');
        setBuilder(startTurn(problem.board, problem.player, problem.dice));
      })
      .finally(() => setBusy(false));
  }, [builder, problem, outcome, busy]);

  const sources = useMemo(() => new Set(builder?.options.map((move) => move.from) ?? []), [builder]);
  const destinations = useMemo(
    () =>
      new Set(
        builder && selected !== null ? destinationsFrom(builder, selected).map((move) => move.to) : [],
      ),
    [builder, selected],
  );

  const onSelect = (slot: number) => {
    if (!builder || outcome) return;
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

  const ladder = data?.ladder;

  return (
    <div className="app">
      <header>
        <h1>Problems</h1>
        <div className="scoreline">
          {ladder && (
            <span>
              Tier {ladder.tier} of {ladder.maxTier} · {TIER_NAMES[ladder.tier]}
            </span>
          )}
          {ladder && (
            <span className="muted">
              {ladder.attemptsToDecide > 0
                ? `${ladder.attemptsToDecide} more attempt${ladder.attemptsToDecide === 1 ? '' : 's'} at this tier`
                : ladder.solvesToUnlock > 0
                  ? `${ladder.solvesToUnlock} more solved to unlock tier ${Math.min(ladder.tier + 1, ladder.maxTier)}`
                  : 'Tier complete'}
              {data ? ` · ${data.solved}/${data.attempted} solved` : ''}
            </span>
          )}
          <button type="button" className="link" onClick={onExit}>
            Back to play
          </button>
        </div>
      </header>

      <p className="rotate-hint">Turn your phone sideways — the board needs the width.</p>

      <main>
        {problem ? (
          <Board
            board={builder?.board ?? problem.board}
            seat={problem.player}
            selected={selected}
            sources={sources}
            destinations={destinations}
            onSelect={onSelect}
          />
        ) : (
          <p className="muted">No problems available yet.</p>
        )}

        <section className="controls">
          {error && <p className="error">{error}</p>}

          {problem && (
            <>
              <p className="muted">
                {PHASE_NAMES[problem.phase] ?? problem.phase} · tier {problem.tier}
                {' · '}
                <span title={
                  problem.provenance === 'consensus'
                    ? 'The answer is published expert agreement.'
                    : "The answer is this app's own engine, which agrees with expert play about half the time on the opening rolls. Treat it as a sparring partner, not an authority."
                }>
                  {problem.provenance === 'consensus' ? 'expert answer' : 'engine answer'}
                </span>
              </p>

              <div className="dice" aria-label="dice">
                <span className="die">{problem.dice[0]}</span>
                <span className="die">{problem.dice[1]}</span>
                {!outcome && builder && builder.pending.length > 0 && (
                  <button type="button" className="link" onClick={() => setBuilder(undoLastMove(builder))}>
                    Undo
                  </button>
                )}
              </div>

              {!outcome && <p className="muted">Play the best move for {problem.player}.</p>}
            </>
          )}

          {outcome && (
            <div className={`attempt ${outcome.result.solved ? 'solved' : 'missed'}`}>
              <p className="result">
                {outcome.result.exact
                  ? 'Correct.'
                  : outcome.result.solved
                    ? 'Good enough — that play is worth the same.'
                    : `Not the best play — it costs ${outcome.result.equityLoss.toFixed(3)}.`}
              </p>
              <p>{outcome.result.explanation}</p>
              {!outcome.result.exact && (
                <p className="muted">
                  You played <strong>{outcome.result.played}</strong>; the answer is{' '}
                  <strong>{outcome.result.best}</strong>.
                </p>
              )}
              {outcome.unlocked && <p className="result">Tier {outcome.ladder.tier} unlocked.</p>}
              <button type="button" disabled={busy} onClick={() => void next()}>
                Next problem
              </button>
            </div>
          )}
        </section>

        {data && data.focus.length > 0 && (
          <aside className="coach">
            <h2>Why this problem</h2>
            {data.focus.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </aside>
        )}
      </main>
    </div>
  );
}
