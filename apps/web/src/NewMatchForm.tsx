import { useState } from 'react';
import type { CreateMatchRequest, Difficulty } from '@bg/protocol';

const LEVELS: readonly { value: Difficulty; label: string; blurb: string }[] = [
  { value: 'beginner', label: 'Beginner', blurb: 'Plays a poor move nearly half the time' },
  { value: 'casual', label: 'Casual', blurb: 'Sound most of the time' },
  { value: 'intermediate', label: 'Intermediate', blurb: 'Solid one-ply play' },
  { value: 'advanced', label: 'Advanced', blurb: 'Two-ply search, occasional slip' },
  { value: 'expert', label: 'Expert', blurb: 'Two-ply search, always its best move' },
];

const LENGTHS: readonly number[] = [1, 3, 5, 7];

export interface NewMatchFormProps {
  busy: boolean;
  error: string | null;
  onStart: (request: CreateMatchRequest) => void;
}

export function NewMatchForm({ busy, error, onStart }: NewMatchFormProps) {
  const [aiLevel, setAiLevel] = useState<Difficulty>('intermediate');
  const [matchLength, setMatchLength] = useState(1);
  const [coaching, setCoaching] = useState(true);

  return (
    <div className="setup">
      <h1>Backgammon</h1>
      <p className="muted">Play the engine, with a coach watching over your shoulder.</p>

      <fieldset>
        <legend>Opponent</legend>
        {LEVELS.map((level) => (
          <label key={level.value} className="option">
            <input
              type="radio"
              name="level"
              value={level.value}
              checked={aiLevel === level.value}
              onChange={() => setAiLevel(level.value)}
            />
            <span>
              <strong>{level.label}</strong>
              <span className="muted"> — {level.blurb}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Match length</legend>
        <div className="lengths">
          {LENGTHS.map((length) => (
            <label key={length} className="option">
              <input
                type="radio"
                name="length"
                value={length}
                checked={matchLength === length}
                onChange={() => setMatchLength(length)}
              />
              <span>{length === 1 ? 'Single game' : `${length} points`}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="option">
        <input type="checkbox" checked={coaching} onChange={(e) => setCoaching(e.target.checked)} />
        <span>
          <strong>Coaching</strong>
          <span className="muted"> — hints, blunder alerts and take-backs</span>
        </span>
      </label>

      {error && <p className="error">{error}</p>}

      <button type="button" disabled={busy} onClick={() => onStart({ aiLevel, matchLength, coaching })}>
        {busy ? 'Starting…' : 'Start match'}
      </button>
    </div>
  );
}
