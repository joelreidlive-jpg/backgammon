import { describe, expect, it } from 'vitest';
import { CUBE_PROBLEMS, PROBLEMS, answersFor, loadById } from '@bg/trainer';
import type { TrainerAttemptRequest } from '@bg/protocol';
import { gradeRequest } from './grading.js';

const checker = PROBLEMS[0];
const cube = CUBE_PROBLEMS[0];

/** A body the client could send but the types forbid, which is the point. */
function malformed(body: unknown): void {
  gradeRequest(body as TrainerAttemptRequest);
}

describe('gradeRequest', () => {
  it('grades a checker attempt against the stored answer', () => {
    const loaded = loadById(checker.id);
    if (!loaded) throw new Error('the first problem should load');

    const best = gradeRequest({ problemId: checker.id, moves: loaded.bestTurns[0].moves });
    expect(best.tier).toBe(checker.tier);
    expect(best.result.kind).toBe('checker');
    expect(best.result.solved).toBe(true);
  });

  it('rejects a checker attempt with no moves, and an unknown problem', () => {
    expect(() => malformed({ problemId: checker.id })).toThrow(/moves are required/);
    expect(() => gradeRequest({ problemId: 'nope', moves: [] })).toThrow(/unknown problem/);
  });

  it('ships cube problems to grade', () => {
    expect(CUBE_PROBLEMS.length).toBeGreaterThan(0);
  });

  it('grades a cube answer server-side, and records it at the problem’s tier', () => {
    const graded = gradeRequest({ kind: 'cube', problemId: cube.id, answer: cube.answer });
    expect(graded.tier).toBe(cube.tier);
    expect(graded.result.kind).toBe('cube');
    expect(graded.result.solved).toBe(true);
    expect(graded.result.equityLoss).toBe(0);

    const wrong = answersFor(cube.question).find((answer) => answer !== cube.answer);
    if (!wrong) throw new Error('every cube question has an alternative answer');
    const missed = gradeRequest({ kind: 'cube', problemId: cube.id, answer: wrong });
    expect(missed.result.solved).toBe(false);
    expect(missed.result.equityLoss).toBeGreaterThan(0);
  });

  it('refuses an answer that belongs to the other question', () => {
    const foreign = cube.question === 'offer' ? 'take' : 'double';
    expect(() => gradeRequest({ kind: 'cube', problemId: cube.id, answer: foreign })).toThrow(
      /not an answer to this question/,
    );

    expect(() =>
      gradeRequest({ kind: 'cube', problemId: 'nope', answer: cube.answer }),
    ).toThrow(/unknown problem/);
  });
});
