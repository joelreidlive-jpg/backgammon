import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dice, TurnBuilder } from '@bg/rules';
import { boardKey, destinationsFrom, extendTurn, startTurn, undoLastMove } from '@bg/rules';
import type {
  Difficulty,
  GameReview,
  HintLevel,
  MatchView,
  ProgressResponse,
  TurnAnalysis,
} from '@bg/protocol';
import { Board } from './Board.js';
import { NO_DICE_SPENT, spentFaces } from './Dice.js';
import { ThemePicker } from './ThemePicker.js';
import { useBoardTheme } from './theme.js';
import { CoachPanel } from './CoachPanel.js';
import {
  type BetterMoveEvent,
  type BetterMoveState,
  isPreviewing,
  nextBetterMoveState,
  previewBoard,
  previewDestinations,
} from './betterMove.js';
import { type ReplayStep, PULSE_MS, enginePlaySteps } from './enginePlay.js';
import { type ReplyTiming, ReplyScheduler, replyTiming } from './engineReply.js';
import { NewMatchForm } from './NewMatchForm.js';
import { ReviewPanel } from './ReviewPanel.js';
import { Trainer } from './Trainer.js';
import {
  api,
  clearSession,
  loadPlayerToken,
  loadSession,
  saveSession,
  sessionIdleMs,
  touchSession,
  type Session,
} from './api.js';
import { describeResume, shouldPromptResume } from './resume.js';
import { FullscreenButton } from './FullscreenButton.js';

/** Long enough to read as a throw, short enough not to slow the game down. */
const ROLL_MS = 700;
const TUMBLE_MS = 90;

function randomFace(): number {
  return 1 + Math.floor(Math.random() * 6);
}

/** Identifies the position the coach's advice is about. */
function positionKey(view: MatchView | null): string {
  if (!view) return '';
  return `${view.state.gameNumber}:${boardKey(view.state.board)}:${view.state.dice?.join('-') ?? ''}`;
}

const NO_SLOTS: ReadonlySet<number> = new Set();

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
  const [training, setTraining] = useState(false);
  const [rolling, setRolling] = useState<'you' | 'engine' | null>(null);
  const [tumble, setTumble] = useState<Dice>([1, 1]);
  const lastEnginePlay = useRef<string | null>(null);
  // The engine's reply mid-replay: one checker of it at a time.
  const [replay, setReplay] = useState<ReplayStep | null>(null);
  const [boardTheme, setBoardTheme] = useBoardTheme();
  const [betterMove, setBetterMove] = useState<BetterMoveState>('hidden');
  // The coach's note on the turn just played. Held here rather than read
  // straight off the view, because the engine's reply arrives in a later
  // response and would otherwise wipe the advice off the screen.
  const [analysis, setAnalysis] = useState<TurnAnalysis | null>(null);
  // True once the player has answered the coach's offer, either way: there is
  // then nothing left to wait for and the engine can answer at once.
  const [decided, setDecided] = useState(false);
  const advisedPosition = useRef<string>('');
  const replyScheduler = useRef(new ReplyScheduler());
  // A stored match the player has not yet said they want back.
  const [resumable, setResumable] = useState<MatchView | null>(null);

  const adopt = useCallback((next: MatchView) => {
    touchSession();
    setView(next);
    if (next.lastAnalysis) setAnalysis(next.lastAnalysis);
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

  // Restoring the stored match silently is right after a reload and wrong days
  // later: the player reads a game in progress as the opening of a new one.
  useEffect(() => {
    if (!session || view || resumable) return;
    void api
      .getMatch(session)
      .then((match) => {
        if (shouldPromptResume(match, sessionIdleMs())) setResumable(match);
        else adopt(match);
      })
      .catch(() => {
        clearSession();
        setSession(null);
      });
  }, [session, view, resumable, adopt]);

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

  // A submission that fails leaves the turn cleared but the position unplayed,
  // which would otherwise strand the player with no checkers to move. Rebuild
  // the turn from the position the server still believes we are in.
  useEffect(() => {
    if (!view || builder || busy) return;
    const { board, dice, phase, turn } = view.state;
    if (phase !== 'move' || dice === null || turn !== view.seat) return;
    setBuilder(startTurn(board, view.seat, dice));
  }, [view, builder, busy]);

  // The faces shown while the dice are in the air are decoration: the real
  // roll is already in hand, and showing it immediately would give the throw
  // away before the animation ends.
  useEffect(() => {
    if (!rolling) return;
    const tumbling = setInterval(() => setTumble([randomFace(), randomFace()]), TUMBLE_MS);
    const settle = setTimeout(() => setRolling(null), ROLL_MS);
    return () => {
      clearInterval(tumbling);
      clearTimeout(settle);
    };
  }, [rolling]);

  // The engine's roll arrives with its reply, already played, so the throw is
  // animated when a new one appears rather than when it is made — and the
  // checkers it moved are then walked through one at a time, since a position
  // that changes in three places at once reads as no move at all.
  useEffect(() => {
    const played = view?.aiPlays.at(-1);
    const key = played ? `${view?.state.gameNumber}:${played.dice.join('-')}:${played.notation}` : null;
    if (key === lastEnginePlay.current) return;
    lastEnginePlay.current = key;
    if (key === null || !view) return;
    setRolling('engine');

    const steps = enginePlaySteps(view.aiPlays, view.seat === 'white' ? 'black' : 'white');
    if (steps.length === 0) return;

    let timer: ReturnType<typeof setTimeout>;
    const show = (index: number) => {
      if (index >= steps.length) {
        // The last step is the position the server sent, so dropping the
        // replay here leaves the board exactly as it is.
        setReplay(null);
        return;
      }
      setReplay(steps[index]);
      timer = setTimeout(() => show(index + 1), PULSE_MS);
    };
    timer = setTimeout(() => show(0), ROLL_MS);
    return () => {
      clearTimeout(timer);
      setReplay(null);
    };
  }, [view]);

  // The engine answers on the browser's cue rather than as part of the turn,
  // so that the coach's offer is not overtaken by the reply it is about to be
  // asked to replace.
  const timing: ReplyTiming = view
    ? replyTiming(view, betterMove, decided, analysis)
    : { reply: 'none' };
  const replyDelayMs = timing.reply === 'after' ? timing.ms : null;
  const replyKey = timing.reply === 'after' ? positionKey(view) : '';
  useEffect(() => {
    const scheduler = replyScheduler.current;
    if (!session || replyDelayMs === null || busy) return;
    scheduler.schedule(replyKey, replyDelayMs, () => void run(() => api.opponentReply(session)));
    return () => scheduler.cancel();
  }, [session, replyKey, replyDelayMs, busy, run]);

  // Advice belongs to one position. Replacing your move moves the game on, so
  // the position it produced is adopted here rather than treated as new, which
  // is what keeps the confirmation on screen.
  const currentPosition = positionKey(view);
  useEffect(() => {
    if (advisedPosition.current === currentPosition) return;
    advisedPosition.current = currentPosition;
    setBetterMove('hidden');
  }, [currentPosition]);

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

  if (training) return <Trainer onExit={() => setTraining(false)} />;

  if (!session || !view) {
    return (
      <NewMatchForm
        busy={busy}
        onTrain={() => setTraining(true)}
        progress={progress}
        resume={
          resumable
            ? {
                summary: describeResume(resumable),
                onResume: () => {
                  const match = resumable;
                  setResumable(null);
                  adopt(match);
                },
                onDiscard: () => {
                  clearSession();
                  setSession(null);
                  setResumable(null);
                },
              }
            : null
        }
        onStart={async (request) => {
          setBusy(true);
          try {
            const { playerToken, match } = await api.createMatch(request);
            const next = { matchId: match.matchId, playerToken };
            saveSession(next);
            setSession(next);
            setResumable(null);
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
  const canRoll = yourTurn && state.phase === 'roll' && !busy;
  const yourDice = yourTurn && state.dice !== null ? state.dice : null;
  // Only one side's dice are on the felt at a time: the engine's stay until you
  // throw your own, which replaces them.
  const engineDice = yourDice === null ? (view.aiPlays.at(-1)?.dice ?? null) : null;

  const roll = () => {
    setRolling('you');
    // The advice on screen is about the turn before this one.
    setAnalysis(null);
    setDecided(false);
    void run(() => api.roll(session));
  };

  const preview = analysis && isPreviewing(betterMove) ? analysis : null;
  const replayPulse = replay ? new Set([replay.pulse]) : NO_SLOTS;

  const playBest = async () => {
    setBetterMove('playing');
    setBusy(true);
    try {
      const next = await api.playBest(session);
      advisedPosition.current = positionKey(next);
      adopt(next);
      setBetterMove('played');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'could not play that move');
      setBetterMove('failed');
    } finally {
      setBusy(false);
    }
  };

  const onBetterMove = (event: BetterMoveEvent) => {
    // Waving the coach away changes nothing on screen, but it is the answer
    // the engine has been waiting for.
    if (event === 'dismiss') {
      setDecided(true);
      return;
    }
    const next = nextBetterMoveState(betterMove, event);
    if (next === betterMove) return;
    // The request drives the state from here, so that a second click cannot
    // submit the replacement turn twice.
    if (next === 'playing') {
      void playBest();
      return;
    }
    // Keeping your own move is a decision too, and the engine has been waiting
    // on it.
    if (event === 'revert') setDecided(true);
    setBetterMove(next);
  };

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
              setError(null);
            }}
          >
            New match
          </button>
          <ThemePicker theme={boardTheme} onChange={setBoardTheme} />
          <FullscreenButton />
        </div>
      </header>

      <p className="rotate-hint">Turn your phone sideways — the board needs the width.</p>

      <main>
        {/* The checkers the coach moved pulse until the offer is answered. */}
        {preview ? (
          <Board
            board={previewBoard(preview)}
            pulse={previewDestinations(preview)}
            seat={seat}
            selected={null}
            sources={NO_SLOTS}
            destinations={previewDestinations(preview)}
            onSelect={() => undefined}
            yourDice={{ dice: preview.dice, spent: NO_DICE_SPENT, rolling: false }}
            opponentDice={{ dice: null, spent: NO_DICE_SPENT, rolling: false }}
            previewLabel="the coach’s play"
          />
        ) : (
          <Board
            board={replay?.board ?? builder?.board ?? state.board}
            pulse={replayPulse}
            seat={seat}
            selected={replay ? null : selected}
            sources={replay ? NO_SLOTS : sources}
            destinations={replay ? NO_SLOTS : destinations}
            onSelect={replay ? () => undefined : onSelect}
            yourDice={{
              dice: rolling === 'you' ? tumble : yourDice,
              spent: builder && yourDice ? spentFaces(yourDice, builder.pending) : NO_DICE_SPENT,
              rolling: rolling === 'you',
            }}
            opponentDice={{
              dice: rolling === 'engine' ? tumble : engineDice,
              spent: NO_DICE_SPENT,
              rolling: rolling === 'engine',
            }}
            onRoll={canRoll && !replay ? roll : undefined}
            cube={{
              value: state.cube.value,
              owner: state.cube.owner,
              offered: state.phase === 'respond-to-double',
              onDouble:
                view.canDouble && yourTurn && !busy && !replay
                  ? () => void run(() => api.cube(session, 'double'))
                  : undefined,
            }}
          />
        )}

        <section className="controls">
          {error && <p className="error">{error}</p>}

          {view.aiPlays.length > 0 && (
            <p className="ai-play">
              Opponent played <strong>{view.aiPlays.map((play) => play.notation).join(', ')}</strong>
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
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  // Otherwise the debrief for the game just finished is still
                  // on screen when the next one ends.
                  setReview(null);
                  void run(() => api.nextGame(session));
                }}
              >
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
                <button type="button" disabled={busy} onClick={roll}>
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

          {yourTurn && builder && builder.pending.length > 0 && (
            <button type="button" className="link" onClick={() => setBuilder(undoLastMove(builder))}>
              Undo
            </button>
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
          analysis={analysis}
          cubeAnalysis={view.lastCubeAnalysis}
          policy={view.policy}
          position={currentPosition}
          betterMove={betterMove}
          canPlayBest={view.canPlayBest && !busy}
          engineHeld={timing.reply === 'hold'}
          onBetterMove={onBetterMove}
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
