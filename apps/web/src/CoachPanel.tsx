import { useEffect, useState } from 'react';
import type { CoachingPolicy, CubeAnalysis, Hint, HintLevel, TurnAnalysis } from '@bg/protocol';
import type { BetterMoveEvent, BetterMoveState } from './betterMove.js';
import { betterMoveOffered } from './betterMove.js';
import { SEVERITY_HEADLINE } from './wording.js';

/**
 * Hints nudge; they no longer hand over the answer. Being shown the best play
 * before moving taught nothing that the coach's better move — offered after
 * you have committed to one — does not teach better.
 */
type OfferedHint = 1 | 2 | 3;

const HINT_LABELS: Readonly<Record<OfferedHint, string>> = {
  1: 'Is this close?',
  2: 'Give me the idea',
  3: 'Narrow it down',
};

const CUBE_LABELS: Readonly<Record<CubeAnalysis['choice'], string>> = {
  'no-double': 'rolled on',
  double: 'doubled',
  take: 'took',
  drop: 'dropped',
};

const CUBE_ACTIONS: Readonly<Record<CubeAnalysis['choice'], string>> = {
  'no-double': 'roll on',
  double: 'double',
  take: 'take',
  drop: 'drop',
};

export interface CoachPanelProps {
  enabled: boolean;
  canAsk: boolean;
  canTakeback: boolean;
  analysis: TurnAnalysis | null;
  cubeAnalysis: CubeAnalysis | null;
  policy: CoachingPolicy;
  /** Changes whenever the position on the board does. */
  position: string;
  /** Where the player is in the show/play/revert conversation. */
  betterMove: BetterMoveState;
  /** True while the coach's play can still replace the one that was made. */
  canPlayBest: boolean;
  onBetterMove: (event: BetterMoveEvent) => void;
  onHint: (level: HintLevel) => Promise<Hint>;
  onTakeback: () => void;
}

export function CoachPanel({
  enabled,
  canAsk,
  canTakeback,
  analysis,
  cubeAnalysis,
  policy,
  position,
  betterMove,
  canPlayBest,
  onBetterMove,
  onHint,
  onTakeback,
}: CoachPanelProps) {
  const [hint, setHint] = useState<Hint | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A hint describes one position. Keeping it on screen after the board has
  // moved on shows advice for a position that no longer exists, and would let
  // the next request start at the level the last one finished on.
  useEffect(() => {
    setHint(null);
    setFailure(null);
  }, [position]);

  if (!enabled) {
    return (
      <aside className="coach">
        <h2>Coach</h2>
        <p className="muted">Coaching is off for this match.</p>
      </aside>
    );
  }

  const ask = async (level: HintLevel) => {
    setBusy(true);
    setFailure(null);
    try {
      setHint(await onHint(level));
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : 'could not fetch a hint');
    } finally {
      setBusy(false);
    }
  };

  // Hint levels escalate deliberately: the answer is the last resort, so the
  // player has to think before the engine tells them what to do. Where a
  // stronger player starts is set by the server from their record.
  const nextLevel = Math.min(3, hint ? hint.level + 1 : policy.defaultHintLevel) as OfferedHint;

  const offered = betterMoveOffered(analysis, policy);

  return (
    <aside className="coach">
      <div className="coach-head">
        <h2>Coach</h2>
        <span className={`tier ${policy.tier}`}>{policy.tier}</span>
      </div>

      {cubeAnalysis && cubeAnalysis.mistake !== 'none' && cubeAnalysis.mistake !== 'undecided' && (
        <div className={`analysis ${cubeAnalysis.severity}`}>
          <div className="analysis-head">
            <span className="severity">cube</span>
          </div>
          <p>
            You {CUBE_LABELS[cubeAnalysis.choice]} — the cube action was to{' '}
            <strong>{CUBE_ACTIONS[cubeAnalysis.best]}</strong>.
          </p>
          <p className="explanation">{cubeAnalysis.explanation}</p>
        </div>
      )}

      {betterMove === 'played' && (
        <p className="replaced">Played the coach&rsquo;s move for you.</p>
      )}

      {offered && betterMove !== 'played' && (
        <div className={`analysis ${analysis.severity}`}>
          <div className="analysis-head">
            <span className="severity">{SEVERITY_HEADLINE[analysis.severity]}</span>
          </div>

          <p>
            You played <strong>{analysis.played}</strong>.
          </p>

          <div className="better-move">
            {betterMove === 'hidden' || betterMove === 'failed' ? (
              <button type="button" onClick={() => onBetterMove('show')}>
                Show me the better move
              </button>
            ) : (
              <>
                <p className="explanation">{analysis.explanation}</p>
                <p>
                  The coach plays <strong>{analysis.best}</strong> — the checkers it moves are
                  pulsing on the board.
                </p>
                <div className="better-move-actions">
                  <button
                    type="button"
                    disabled={!canPlayBest || betterMove === 'playing'}
                    onClick={() => onBetterMove('play')}
                  >
                    {betterMove === 'playing' ? 'Playing…' : 'Play it instead'}
                  </button>
                  <button
                    type="button"
                    className="link"
                    disabled={betterMove === 'playing'}
                    onClick={() => onBetterMove('revert')}
                  >
                    Keep my move
                  </button>
                </div>
                <p className="muted">The engine waits until you choose.</p>
              </>
            )}
            {betterMove === 'failed' && (
              <p className="error">That move could not be replayed — your own move stands.</p>
            )}
          </div>

          {canTakeback && policy.offerTakeback && analysis.severity === 'blunder' && betterMove === 'hidden' && (
            <button type="button" className="link" onClick={onTakeback}>
              Take that move back
            </button>
          )}
        </div>
      )}

      <div className="hints">
        <button type="button" disabled={!canAsk || busy} onClick={() => void ask(nextLevel)}>
          {HINT_LABELS[nextLevel]}
        </button>
        {failure && <p className="error">{failure}</p>}
        {hint && (
          <div className="hint">
            <p>{hint.message}</p>
            {hint.candidates && (
              <ul>
                {hint.candidates.map((play) => (
                  <li key={play}>{play}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
