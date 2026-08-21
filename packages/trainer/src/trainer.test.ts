import { describe, expect, it } from 'vitest';
import type { Concept } from '@bg/coach';
import { OPENING_ROLLS } from '@bg/bench';
import { MAX_GENERATED_TIER, type Problem, type Tier, load, prompt } from './problem.js';
import { NEAR_MISS, gradeAttempt } from './attempt.js';
import { LADDER_WINDOW, type AttemptRecord, ladderState } from './ladder.js';
import { RECENT_MEMORY, selectProblem } from './select.js';
import { PROBLEMS } from './problems.js';

function opening(id: string, overrides: Partial<Problem> = {}): Problem {
  const position = OPENING_ROLLS.find((entry) => entry.id === id);
  if (!position) throw new Error(`no benchmark position ${id}`);
  return {
    id,
    xgid: position.xgid,
    best: [...position.best],
    tier: 1,
    provenance: 'consensus',
    concepts: [...position.tags],
    phase: 'opening',
    margin: 0.1,
    ...overrides,
  };
}

describe('problems', () => {
  it('resolves the stored answer to a legal turn', () => {
    const loaded = load(opening('opening-31'));
    expect(loaded.bestTurns).toHaveLength(1);
    expect(loaded.legal.length).toBeGreaterThan(1);
  });

  it('rejects a problem whose answer is not legal in its position', () => {
    expect(() => load(opening('opening-31', { best: ['24/23 24/23'] }))).toThrow(/not a legal turn/);
  });

  it('never sends the answer to the client', () => {
    const sent = prompt(load(opening('opening-31')));
    expect(Object.keys(sent)).not.toContain('best');
    expect(Object.keys(sent)).not.toContain('margin');
    expect(JSON.stringify(sent)).not.toContain('8/5');
  });

  it('keeps every generated answer inside the tiers the engine can be trusted at', () => {
    for (const problem of PROBLEMS) {
      if (problem.provenance === 'engine') expect(problem.tier).toBeLessThanOrEqual(MAX_GENERATED_TIER);
    }
  });

  it('has a legal answer for every problem in the set', () => {
    for (const problem of PROBLEMS) expect(() => load(problem)).not.toThrow();
  });
});

describe('grading', () => {
  const problem = load(opening('opening-31'));
  const answer = problem.bestTurns[0];

  it('marks the stored answer correct', () => {
    const result = gradeAttempt(problem, answer.moves);
    expect(result).not.toBeNull();
    expect(result?.exact).toBe(true);
    expect(result?.solved).toBe(true);
    expect(result?.equityLoss).toBe(0);
    expect(result?.explanation).toMatch(/^Correct/);
  });

  it('accepts the same play submitted in the other order', () => {
    const result = gradeAttempt(problem, [...answer.moves].reverse());
    expect(result?.exact).toBe(true);
  });

  it('rejects moves that are not a legal turn', () => {
    expect(gradeAttempt(problem, [{ from: 24, to: 23, hit: false }])).toBeNull();
    expect(gradeAttempt(problem, [{ from: 13, to: 4, hit: false }])).toBeNull();
  });

  it('costs equity for a play that is not the answer', () => {
    const others = problem.legal.filter((turn) => turn !== answer);
    const graded = others.map((turn) => gradeAttempt(problem, turn.moves));
    expect(graded.every((result) => result !== null)).toBe(true);

    const losses = graded.map((result) => result?.equityLoss ?? 0);
    expect(Math.max(...losses)).toBeGreaterThan(NEAR_MISS);
    // Anything the evaluator cannot separate from the answer is still a solve:
    // failing a player on the evaluator's own noise would teach nothing.
    for (const result of graded) {
      if (result && result.equityLoss <= NEAR_MISS) expect(result.solved).toBe(true);
      if (result && result.equityLoss > NEAR_MISS) expect(result.solved).toBe(false);
    }
  });
});

function records(tier: Tier, results: readonly boolean[], from = 1_000_000): AttemptRecord[] {
  return results.map((solved, index) => ({
    problemId: `p${tier}-${index}`,
    tier,
    solved,
    at: from - index,
  }));
}

describe('ladder', () => {
  it('starts at tier one and reports what is left to decide', () => {
    const state = ladderState([]);
    expect(state.tier).toBe(1);
    expect(state.attemptsToDecide).toBe(LADDER_WINDOW);
    expect(state.solvesToUnlock).toBe(7);
  });

  it('unlocks the next tier at seven solved out of ten', () => {
    const passing = records(1, [...Array(7).fill(true), ...Array(3).fill(false)]);
    expect(ladderState(passing).tier).toBe(2);

    const failing = records(1, [...Array(6).fill(true), ...Array(4).fill(false)]);
    expect(ladderState(failing).tier).toBe(1);
  });

  it('judges recent form rather than lifetime totals', () => {
    const stale = records(1, Array(20).fill(false), 2_000_000);
    const recent = records(1, Array(10).fill(true), 3_000_000);
    expect(ladderState([...recent, ...stale]).tier).toBe(2);
  });

  it('does not demote after a bad run at a harder tier', () => {
    const unlocked = records(1, Array(10).fill(true), 1_000_000);
    const struggling = records(2, Array(10).fill(false), 2_000_000);
    expect(ladderState([...struggling, ...unlocked]).tier).toBe(2);
  });

  it('stops at the hardest tier the set contains', () => {
    const all: AttemptRecord[] = [
      ...records(1, Array(10).fill(true), 1_000),
      ...records(2, Array(10).fill(true), 2_000),
    ];
    expect(ladderState(all, 2).tier).toBe(2);
  });
});

describe('selection', () => {
  const hitting: Concept[] = ['hitsOpponent'];
  const priming: Concept[] = ['buildsPrime'];
  const pool: Problem[] = [
    opening('opening-31', { id: 'hit-1', tier: 1, concepts: hitting }),
    opening('opening-31', { id: 'prime-1', tier: 1, concepts: priming }),
    opening('opening-31', { id: 'hard-1', tier: 3, concepts: priming }),
  ];

  it('returns nothing when the set is empty', () => {
    expect(selectProblem({ problems: [], attempts: [], weakConcepts: [], tier: 1 })).toBeNull();
  });

  it('targets the concepts the player leaks equity on', () => {
    const chosen = selectProblem({ problems: pool, attempts: [], weakConcepts: hitting, tier: 1 });
    expect(chosen?.id).toBe('hit-1');
  });

  it('avoids problems answered recently', () => {
    const attempts: AttemptRecord[] = [{ problemId: 'hit-1', tier: 1, solved: true, at: Date.now() }];
    const chosen = selectProblem({ problems: pool, attempts, weakConcepts: hitting, tier: 1 });
    expect(chosen?.id).toBe('prime-1');
  });

  it('serves a problem again once it has fallen out of recent memory', () => {
    const attempts: AttemptRecord[] = Array.from({ length: RECENT_MEMORY }, (_, index) => ({
      problemId: `other-${index}`,
      tier: 1,
      solved: true,
      at: Date.now() - index,
    }));
    const only = [pool[0]];
    expect(selectProblem({ problems: only, attempts, weakConcepts: [], tier: 1 })?.id).toBe('hit-1');
  });

  it('falls back to an easier tier when the unlocked one is empty', () => {
    const chosen = selectProblem({ problems: pool, attempts: [], weakConcepts: [], tier: 2 });
    expect(chosen?.tier).toBe(1);
  });

  it('serves the unlocked tier when it has problems', () => {
    const chosen = selectProblem({ problems: pool, attempts: [], weakConcepts: [], tier: 3 });
    expect(chosen?.id).toBe('hard-1');
  });
});
