import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TurnBuilder } from '@bg/rules';
import { destinationsFrom, extendTurn, startTurn, undoLastMove } from '@bg/rules';
import type {
  CubeAnswer,
  CubeQuestion,
  Provenance,
  TrainerAttemptResponse,
  TrainerProblemResponse,
} from '@bg/protocol';
import { Board } from './Board.js';
import { NO_DICE_SPENT, spentFaces } from './Dice.js';
import { costInWords } from './wording.js';
import { api, loadPlayerToken, savePlayerToken } from './api.js';

const TIER_NAMES: readonly string[] = ['', 'Straightforward', 'Routine', 'Testing', 'Hard', 'Expert'];

const PHASE_NAMES: Readonly<Record<string, string>> = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  holding: 'Holding game',
  race: 'Race',
  bearoff: 'Bear-off',
};

const PROVENANCE: Readonly<Record<Provenance, { label: string; hint: string }>> = {
  consensus: {
    label: 'expert answer',
    hint: 'The answer is published expert agreement.',
  },
  engine: {
    label: 'engine answer',
    hint: "The answer is this app's own engine, which agrees with expert play about half the time on the opening rolls. Treat it as a sparring partner, not an authority.",
  },
  rollout: {
    label: 'rollout answer',
    hint: 'The answer was found by playing the position out thousands of times and kept only where one play beat the rest by a clear margin. Much more reliable than the plain engine answer, but still the engine judging itself.',
  },
};

const ANSWER_LABELS: Readonly<Record<CubeAnswer, string>> = {
  'no-double': 'No double',
  double: 'Double',
  'too-good': 'Too good to double',
  take: 'Take',
  drop: 'Drop',
};

const CUBE_QUESTIONS: Readonly<Record<CubeQuestion, string>> = {
  offer: 'The cube is in the middle and it is your roll. What do you do with it?',
  respond: 'Your opponent has doubled. Do you take or drop?',
};

export interface TrainerProps {
  onExit: () => void;
}

/**
 * The problem trainer: a position and either a roll to play or a cube to
 * decide, graded.
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
        response.problem?.kind === 'checker'
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
  const checker = problem?.kind === 'checker' ? problem : null;
  const cube = problem?.kind === 'cube' ? problem : null;

  // A complete turn is the answer, so it is submitted as soon as it is built —
  // the same interaction as playing a move in a game.
  useEffect(() => {
    if (!checker || !builder?.complete || outcome || busy) return;
    const moves = builder.pending;
    setBusy(true);
    void api
      .attempt(loadPlayerToken() ?? '', checker.id, moves)
      .then(setOutcome)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'could not grade that play');
        setBuilder(startTurn(checker.board, checker.player, checker.dice));
      })
      .finally(() => setBusy(false));
  }, [builder, checker, outcome, busy]);

  const answerCube = (answer: CubeAnswer) => {
    if (!cube || outcome || busy) return;
    setBusy(true);
    void api
      .cubeAttempt(loadPlayerToken() ?? '', cube.id, answer)
      .then(setOutcome)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'could not grade that answer');
      })
      .finally(() => setBusy(false));
  };

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
            yourDice={{
              dice: checker?.dice ?? null,
              spent: checker && builder ? spentFaces(checker.dice, builder.pending) : NO_DICE_SPENT,
              rolling: false,
            }}
            opponentDice={{ dice: null, spent: NO_DICE_SPENT, rolling: false }}
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
                <span title={PROVENANCE[problem.provenance].hint}>
                  {PROVENANCE[problem.provenance].label}
                </span>
              </p>

              {checker && !outcome && builder && builder.pending.length > 0 && (
                <button type="button" className="link" onClick={() => setBuilder(undoLastMove(builder))}>
                  Undo
                </button>
              )}

              {checker && !outcome && (
                <p className="muted">Play the best move for {checker.player}.</p>
              )}

              {cube && (
                <>
                  <p>{CUBE_QUESTIONS[cube.question]}</p>
                  {!outcome && (
                    <div className="cube-answers">
                      {cube.answers.map((answer) => (
                        <button
                          key={answer}
                          type="button"
                          disabled={busy}
                          onClick={() => answerCube(answer)}
                        >
                          {ANSWER_LABELS[answer]}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {outcome && outcome.result.kind === 'cube' && (
            <div className={`attempt ${outcome.result.solved ? 'solved' : 'missed'}`}>
              <p className="result">
                {outcome.result.solved
                  ? 'Correct.'
                  : `Wrong — ${costInWords(outcome.result.equityLoss)}.`}
              </p>
              <p>{outcome.result.explanation}</p>
              {!outcome.result.solved && (
                <p className="muted">
                  You said <strong>{ANSWER_LABELS[outcome.result.chosen]}</strong>; the answer is{' '}
                  <strong>{ANSWER_LABELS[outcome.result.best]}</strong>.
                </p>
              )}
              {outcome.unlocked && <p className="result">Tier {outcome.ladder.tier} unlocked.</p>}
              <button type="button" disabled={busy} onClick={() => void next()}>
                Next problem
              </button>
            </div>
          )}

          {outcome && outcome.result.kind === 'checker' && (
            <div className={`attempt ${outcome.result.solved ? 'solved' : 'missed'}`}>
              <p className="result">
                {outcome.result.exact
                  ? 'Correct.'
                  : outcome.result.solved
                    ? 'Good enough — that play is worth the same.'
                    : `Not the best play — ${costInWords(outcome.result.equityLoss)}.`}
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
