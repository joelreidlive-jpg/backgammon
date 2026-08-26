import { describe, expect, it } from 'vitest';
import { initialBoard, makeBoard } from '@bg/rules';
import { bestTurn, rankTurns } from '@bg/ai';
import { classifyEquityLoss } from './classify.js';
import { conceptsOf } from './concepts.js';
import { conceptHint, explainDifference } from './explain.js';
import { phaseOf } from './phase.js';
import { analyseTurn } from './analyse.js';
import { buildHint } from './hints.js';
import { summarise, type DecisionRecord } from './performance.js';

describe('classification', () => {
  it('bands equity loss', () => {
    expect(classifyEquityLoss(0)).toBe('fine');
    expect(classifyEquityLoss(0.019)).toBe('fine');
    expect(classifyEquityLoss(0.02)).toBe('inaccuracy');
    expect(classifyEquityLoss(0.06)).toBe('error');
    expect(classifyEquityLoss(0.5)).toBe('blunder');
  });
});

describe('concepts', () => {
  it('recognises making a home board point', () => {
    const before = initialBoard();
    const after = makeBoard({
      white: { 24: 2, 13: 5, 8: 2, 6: 4, 5: 2 },
      black: { 1: 2, 12: 5, 17: 3, 19: 5 },
    });
    const concepts = conceptsOf(before, after, 'white');
    expect(concepts.has('makesPoint')).toBe(true);
    expect(concepts.has('makesHomeBoardPoint')).toBe(true);
  });

  it('recognises a hit', () => {
    const before = makeBoard({ white: { 10: 1 }, black: { 8: 1 } });
    const after = makeBoard({ white: { 8: 1 }, bar: { black: 1 } });
    expect(conceptsOf(before, after, 'white').has('hitsOpponent')).toBe(true);
  });

  it('recognises a new blot and where it sits', () => {
    const before = makeBoard({ white: { 13: 2 }, black: { 20: 2 } });
    const after = makeBoard({ white: { 13: 1, 22: 1 }, black: { 20: 2 } });
    const concepts = conceptsOf(before, after, 'white');
    expect(concepts.has('leavesBlot')).toBe(true);
    expect(concepts.has('leavesBlotInOpponentHome')).toBe(true);
  });

  it('recognises giving up an anchor', () => {
    const before = makeBoard({ white: { 20: 2, 13: 2 } });
    const after = makeBoard({ white: { 13: 4 } });
    expect(conceptsOf(before, after, 'white').has('breaksAnchor')).toBe(true);
  });
});

describe('explanations', () => {
  it('names what the better play achieves', () => {
    const before = initialBoard();
    const best = bestTurn(before, 'white', [3, 1], { plies: 1 })!;
    const worse = rankTurns(before, 'white', [3, 1], { plies: 1 }).at(-1)!;

    const explanation = explainDifference(before, worse.turn.board, best.turn.board, 'white', 'opening');
    expect(explanation.text).toMatch(/home board point|point|prime|blot|structure/);
    expect(explanation.text.endsWith('.')).toBe(true);
  });

  it('says why the difference matters in the phase being played', () => {
    const before = initialBoard();
    const best = bestTurn(before, 'white', [3, 1], { plies: 1 })!;
    const worse = rankTurns(before, 'white', [3, 1], { plies: 1 }).at(-1)!;

    const opening = explainDifference(before, worse.turn.board, best.turn.board, 'white', 'opening');
    const race = explainDifference(before, worse.turn.board, best.turn.board, 'white', 'race');

    // Two sentences: what the difference is, then why it costs what it costs.
    expect(opening.text.split(/(?<=\.)\s+/)).toHaveLength(2);
    expect(opening.text).not.toBe(race.text);
  });

  it('gives a concept hint without naming the move', () => {
    const before = initialBoard();
    const best = bestTurn(before, 'white', [3, 1], { plies: 1 })!;
    const hint = conceptHint(before, best.turn.board, 'white');
    expect(hint).toBe('Look for a play that makes a home board point.');
    expect(hint).not.toMatch(/\d\/\d/);
  });
});

describe('phase detection', () => {
  it('calls the starting position the opening', () => {
    expect(phaseOf(initialBoard(), 'white')).toBe('opening');
  });

  it('detects bear-off and race', () => {
    expect(phaseOf(makeBoard({ white: { 3: 2 }, off: { white: 13 } }), 'white')).toBe('bearoff');
    expect(phaseOf(makeBoard({ white: { 3: 5 }, black: { 10: 5 } }), 'white')).toBe('race');
  });

  it('detects a holding game', () => {
    // White is anchored on the 20 but 22 pips down in the race.
    const board = makeBoard({
      white: { 20: 2, 13: 2, 8: 3, 6: 5, 4: 3 },
      black: { 19: 5, 18: 5, 16: 5 },
    });
    expect(phaseOf(board, 'white')).toBe('holding');
  });
});

describe('turn analysis', () => {
  it('scores the best play as no loss', () => {
    const board = initialBoard();
    const best = bestTurn(board, 'white', [3, 1])!;
    const analysis = analyseTurn(board, 'white', [3, 1], best.turn.moves);
    expect(analysis).not.toBeNull();
    expect(analysis!.equityLoss).toBeCloseTo(0, 10);
    expect(analysis!.severity).toBe('fine');
    expect(analysis!.played).toBe(analysis!.best);
    expect(analysis!.phase).toBe('opening');
  });

  it('flags a bad play with a positive equity loss and an explanation', () => {
    const board = initialBoard();
    const ranked = rankTurns(board, 'white', [3, 1], { plies: 2, candidateWidth: 12 });
    const worst = ranked.at(-1)!;
    const analysis = analyseTurn(board, 'white', [3, 1], worst.turn.moves)!;

    expect(analysis.equityLoss).toBeGreaterThan(0);
    expect(analysis.best).toBe('8/5 6/5');
    expect(analysis.explanation.length).toBeGreaterThan(0);
  });

  it('returns null for an illegal sequence', () => {
    expect(analyseTurn(initialBoard(), 'white', [3, 1], [{ from: 24, to: 2, hit: false }])).toBeNull();
  });
});

describe('hints', () => {
  const board = initialBoard();

  it('escalates from a nudge to the answer', () => {
    expect(buildHint(board, 'white', [3, 1], 1).message).toMatch(/better|close/);
    expect(buildHint(board, 'white', [3, 1], 2).message).toMatch(/^Look for a play/);

    const candidates = buildHint(board, 'white', [3, 1], 3);
    expect(candidates.candidates).toHaveLength(3);
    expect(candidates.bestMoves).toBeUndefined();

    const answer = buildHint(board, 'white', [3, 1], 4);
    expect(answer.message).toBe('Best play is 8/5 6/5.');
    expect(answer.bestMoves).toHaveLength(2);
    expect(answer.equityGain).toBeGreaterThan(0);
  });

  it('hides the ranking in the candidate list', () => {
    const hint = buildHint(board, 'white', [3, 1], 3);
    expect(hint.candidates).toEqual([...hint.candidates!].sort());
  });

  it('says so when there is no play', () => {
    const stuck = makeBoard({ black: { 20: 2, 21: 2 }, bar: { white: 1 } });
    expect(buildHint(stuck, 'white', [4, 5], 4).message).toMatch(/no legal play/);
  });
});

describe('performance summary', () => {
  const records: DecisionRecord[] = [
    { equityLoss: 0.0, severity: 'fine', phase: 'opening', kind: 'checker' },
    { equityLoss: 0.03, severity: 'inaccuracy', phase: 'middlegame', kind: 'checker' },
    { equityLoss: 0.2, severity: 'blunder', phase: 'race', kind: 'cube' },
    { equityLoss: 0.3, severity: 'blunder', phase: 'race', kind: 'cube' },
  ];

  it('separates checker play from cube handling', () => {
    const summary = summarise(records);
    expect(summary.decisions).toBe(4);
    expect(summary.checkerErrorRate).toBeCloseTo(15, 6);
    expect(summary.cubeErrorRate).toBeCloseTo(250, 6);
    expect(summary.counts.blunder).toBe(2);
  });

  it('identifies the phase costing the most equity', () => {
    expect(summarise(records).weakestPhase).toBe('race');
    expect(summarise(records).byPhase.race?.decisions).toBe(2);
  });

  it('handles an empty history', () => {
    expect(summarise([]).errorRate).toBe(0);
    expect(summarise([]).weakestPhase).toBeNull();
  });
});
