import { describe, expect, it } from 'vitest';
import type { MatchView } from '@bg/protocol';
import { RESUME_PROMPT_AFTER_MS, describeResume, shouldPromptResume } from './resume.js';

function view(overrides: { phase?: string; gameNumber?: number; matchLength?: number } = {}) {
  return {
    seat: 'white',
    state: {
      phase: overrides.phase ?? 'move',
      gameNumber: overrides.gameNumber ?? 2,
      matchLength: overrides.matchLength ?? 5,
      score: { white: 1, black: 2 },
    },
  } as unknown as MatchView;
}

describe('picking a stored match back up', () => {
  it('resumes silently while the game is still being played', () => {
    expect(shouldPromptResume(view(), 5 * 60 * 1000)).toBe(false);
  });

  it('asks once the game has been left alone', () => {
    expect(shouldPromptResume(view(), RESUME_PROMPT_AFTER_MS)).toBe(true);
  });

  it('asks when nothing recorded the game being played', () => {
    expect(shouldPromptResume(view(), null)).toBe(true);
  });

  it('never asks about a game that is already over', () => {
    expect(shouldPromptResume(view({ phase: 'game-over' }), null)).toBe(false);
    expect(shouldPromptResume(view({ phase: 'match-over' }), null)).toBe(false);
  });

  it('describes the stored match from the player’s side', () => {
    expect(describeResume(view())).toBe('Game 2 of a match to 5, you 1 — 2');
    expect(describeResume(view({ matchLength: 1, gameNumber: 1 }))).toBe(
      'Game 1 of a single game, you 1 — 2',
    );
  });
});
