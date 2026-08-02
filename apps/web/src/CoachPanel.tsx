import { useState } from 'react';
import type { Hint, HintLevel, TurnAnalysis } from '@bg/protocol';

const HINT_LABELS: Readonly<Record<HintLevel, string>> = {
  1: 'Is this close?',
  2: 'Give me the idea',
  3: 'Narrow it down',
  4: 'Show the best play',
};

export interface CoachPanelProps {
  enabled: boolean;
  canAsk: boolean;
  canTakeback: boolean;
  analysis: TurnAnalysis | null;
  onHint: (level: HintLevel) => Promise<Hint>;
  onTakeback: () => void;
}

export function CoachPanel({
  enabled,
  canAsk,
  canTakeback,
  analysis,
  onHint,
  onTakeback,
}: CoachPanelProps) {
  const [hint, setHint] = useState<Hint | null>(null);
  const [busy, setBusy] = useState(false);

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
    try {
      setHint(await onHint(level));
    } finally {
      setBusy(false);
    }
  };

  // Hint levels escalate deliberately: the answer is the last resort, so the
  // player has to think before the engine tells them what to do.
  const nextLevel = ((hint ? Math.min(4, hint.level + 1) : 1) as HintLevel);

  return (
    <aside className="coach">
      <h2>Coach</h2>

      {analysis && (
        <div className={`analysis ${analysis.severity}`}>
          <div className="analysis-head">
            <span className="severity">{analysis.severity}</span>
            <span className="loss">−{analysis.equityLoss.toFixed(3)}</span>
          </div>
          <p>
            You played <strong>{analysis.played}</strong>
            {analysis.played !== analysis.best && (
              <>
                {' '}
                — best was <strong>{analysis.best}</strong>
              </>
            )}
            .
          </p>
          {analysis.played !== analysis.best && <p className="explanation">{analysis.explanation}</p>}
          {canTakeback && analysis.severity === 'blunder' && (
            <button type="button" onClick={onTakeback}>
              Take that move back
            </button>
          )}
        </div>
      )}

      <div className="hints">
        <button type="button" disabled={!canAsk || busy} onClick={() => void ask(nextLevel)}>
          {HINT_LABELS[nextLevel]}
        </button>
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
