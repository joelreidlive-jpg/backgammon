import { describe, expect, it } from 'vitest';
import type { CoachingPolicy, MatchView, TurnAnalysis } from '@bg/protocol';
import { initialBoard, newMatch } from '@bg/rules';
import { COACH_PAUSE_MS, replyTiming } from './engineReply.js';

const policy: CoachingPolicy = {
  tier: 'novice',
  alertThreshold: 0.06,
  defaultHintLevel: 3,
  offerTakeback: true,
  suggestedDifficulty: 'beginner',
};

const blunder: TurnAnalysis = {
  player: 'white',
  dice: [6, 5],
  played: '24/18 13/8',
  best: '24/18 18/13',
  boardBefore: initialBoard(),
  playedMoves: [],
  bestMoves: [
    { from: 24, to: 18, hit: false },
    { from: 18, to: 13, hit: false },
  ],
  playedEquity: -0.1,
  bestEquity: 0.1,
  equityLoss: 0.2,
  severity: 'blunder',
  phase: 'opening',
  explanation: 'the coach would run the back checker to safety',
  missed: [],
  incurred: [],
};

/** A view with the engine to move, as it is the moment a turn is submitted. */
function engineToMove(analysis: TurnAnalysis | null): MatchView {
  return {
    matchId: 'm',
    seat: 'white',
    aiLevel: 'intermediate',
    coaching: true,
    state: { ...newMatch(1, 'black', [6, 5]), phase: 'roll', dice: null },
    legalTurns: [],
    canDouble: false,
    canTakeback: true,
    canPlayBest: true,
    lastAnalysis: analysis,
    aiPlays: [],
    lastCubeAnalysis: null,
    policy,
    review: null,
  };
}

describe('replyTiming', () => {
  it('owes nothing while it is the player to move', () => {
    const view: MatchView = { ...engineToMove(null), state: { ...newMatch(1, 'white', [6, 5]) } };
    expect(replyTiming(view, 'hidden', false)).toEqual({ reply: 'none' });
  });

  it('answers at once when the coach has nothing to offer', () => {
    expect(replyTiming(engineToMove(null), 'hidden', false)).toEqual({ reply: 'after', ms: 0 });
  });

  it('answers at once when the play was the best one', () => {
    const agreed: TurnAnalysis = { ...blunder, best: blunder.played, equityLoss: 0 };
    expect(replyTiming(engineToMove(agreed), 'hidden', false)).toEqual({ reply: 'after', ms: 0 });
  });

  it('pauses for the player to ask for the better move', () => {
    expect(replyTiming(engineToMove(blunder), 'hidden', false)).toEqual({
      reply: 'after',
      ms: COACH_PAUSE_MS,
    });
  });

  it('holds indefinitely while the better move is on the board', () => {
    expect(replyTiming(engineToMove(blunder), 'shown', false)).toEqual({ reply: 'hold' });
    expect(replyTiming(engineToMove(blunder), 'playing', false)).toEqual({ reply: 'hold' });
  });

  it('answers without a further pause once the player has decided', () => {
    expect(replyTiming(engineToMove(blunder), 'hidden', true)).toEqual({ reply: 'after', ms: 0 });
    expect(replyTiming(engineToMove(blunder), 'played', false)).toEqual({ reply: 'after', ms: 0 });
  });

  it('leaves a double for the player to answer rather than the engine', () => {
    const doubled = engineToMove(null);
    const view: MatchView = {
      ...doubled,
      state: { ...doubled.state, phase: 'respond-to-double', pendingDouble: 'black' },
    };
    expect(replyTiming(view, 'hidden', false)).toEqual({ reply: 'none' });
  });

  it('owes nothing once the game is over', () => {
    const done = engineToMove(null);
    const view: MatchView = { ...done, state: { ...done.state, phase: 'game-over' } };
    expect(replyTiming(view, 'hidden', false)).toEqual({ reply: 'none' });
  });
});
