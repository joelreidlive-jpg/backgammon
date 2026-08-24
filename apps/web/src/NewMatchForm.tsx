import { useState } from 'react';
import type { CreateMatchRequest, Difficulty, ProgressResponse } from '@bg/protocol';
import { ProgressPanel } from './ProgressPanel.js';
import { ThemePicker } from './ThemePicker.js';
import { useBoardTheme } from './theme.js';

const LEVELS: readonly { value: Difficulty; label: string; blurb: string }[] = [
  { value: 'beginner', label: 'Beginner', blurb: 'Plays a poor move nearly half the time' },
  { value: 'casual', label: 'Casual', blurb: 'Sound most of the time' },
  { value: 'intermediate', label: 'Intermediate', blurb: 'Solid one-ply play' },
  { value: 'advanced', label: 'Advanced', blurb: 'Two-ply search, occasional slip' },
  { value: 'expert', label: 'Expert', blurb: 'Two-ply search, always its best move' },
];

const LENGTHS: readonly number[] = [1, 3, 5, 7];

/** A stored game the player can pick up where they left it. */
export interface ResumeOffer {
  summary: string;
  onResume: () => void;
  onDiscard: () => void;
}

export interface NewMatchFormProps {
  busy: boolean;
  error: string | null;
  progress: ProgressResponse | null;
  onStart: (request: CreateMatchRequest) => void;
  onTrain: () => void;
  resume?: ResumeOffer | null;
}

export function NewMatchForm({ busy, error, progress, onStart, onTrain, resume }: NewMatchFormProps) {
  // Progress arrives after the first render, so the suggested level has to be
  // read live rather than captured as initial state — until the player picks.
  const [chosenLevel, setChosenLevel] = useState<Difficulty | null>(null);
  const aiLevel = chosenLevel ?? progress?.policy.suggestedDifficulty ?? 'intermediate';
  const [matchLength, setMatchLength] = useState(1);
  const [custom, setCustom] = useState(false);
  const [coaching, setCoaching] = useState(true);
  const [boardTheme, setBoardTheme] = useBoardTheme();

  return (
    <div className="setup">
      <h1>Backgammon</h1>
      <p className="muted">Play the engine, with a coach watching over your shoulder.</p>

      {resume && (
        <div className="resume">
          <p>
            <strong>You left a game unfinished.</strong>{' '}
            <span className="muted">{resume.summary}</span>
          </p>
          <button type="button" onClick={resume.onResume}>
            Resume it
          </button>
          <button type="button" className="link" onClick={resume.onDiscard}>
            Leave it and start a new one
          </button>
        </div>
      )}

      <fieldset>
        <legend>Opponent</legend>
        {LEVELS.map((level) => (
          <label key={level.value} className="option">
            <input
              type="radio"
              name="level"
              value={level.value}
              checked={aiLevel === level.value}
              onChange={() => setChosenLevel(level.value)}
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
                checked={!custom && matchLength === length}
                onChange={() => {
                  setCustom(false);
                  setMatchLength(length);
                }}
              />
              <span>{length === 1 ? 'Single game' : `${length} points`}</span>
            </label>
          ))}
          <label className="option">
            <input type="radio" name="length" checked={custom} onChange={() => setCustom(true)} />
            <span>Custom</span>
          </label>
          {custom && (
            <input
              type="number"
              min={1}
              max={25}
              value={matchLength}
              aria-label="points"
              onChange={(e) => setMatchLength(Math.min(25, Math.max(1, Number(e.target.value) || 1)))}
            />
          )}
        </div>
        <p className="muted">
          A match is played to a points total, with gammons and the cube counting toward it — so “best of
          5” is a 5-point match, not five games.
        </p>
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

      <fieldset>
        <legend>Board</legend>
        <ThemePicker theme={boardTheme} onChange={setBoardTheme} />
      </fieldset>

      <div className="trainer-entry">
        <button type="button" className="link" onClick={onTrain}>
          Train on problems
        </button>
        <span className="muted">
          {' '}
          — single positions, graded, getting harder as you solve them
        </span>
      </div>

      {progress && <ProgressPanel progress={progress} />}
    </div>
  );
}
