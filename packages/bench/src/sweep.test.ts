import { it } from 'vitest';
import { type HeuristicWeights, createHeuristicEvaluator } from '@bg/ai';
import { OPENING_ROLLS } from './positions/openings.js';
import { runBenchmark } from './run.js';

// A coordinate sweep, not a test: run it by hand when retuning the evaluator.
// `npx vitest run packages/bench/src/sweep.test.ts`
it.skip('sweeps evaluator weights against the benchmark', () => {
  const axes: Partial<Record<keyof HeuristicWeights, number[]>> = {
    blotDanger: [0.014, 0.018, 0.022, 0.026, 0.03],
    checkerOnBar: [0.1, 0.14, 0.18, 0.24, 0.32],
    builder: [0.01, 0.022, 0.035, 0.05],
    trappedBackChecker: [0.02, 0.05, 0.08, 0.12],
    stack: [0.015, 0.03, 0.05],
    pipLead: [0.02, 0.028, 0.036],
  };

  let base: Partial<HeuristicWeights> = {};
  const score = (weights: Partial<HeuristicWeights>) => {
    const report = runBenchmark(OPENING_ROLLS, {
      plies: 2,
      candidateWidth: 12,
      evaluator: createHeuristicEvaluator(weights),
    });
    // Accuracy first, then how badly it is wrong when it disagrees.
    return report.accuracy - report.meanEquityGap / 10;
  };

  for (let pass = 0; pass < 2; pass++) {
    for (const [key, values] of Object.entries(axes)) {
      let best = { value: base[key as keyof HeuristicWeights], score: score(base) };
      for (const value of values) {
        const candidate = { ...base, [key]: value };
        const s = score(candidate);
        if (s > best.score) best = { value, score: s };
      }
      if (best.value !== undefined) base = { ...base, [key]: best.value };
    }
  }

  const report = runBenchmark(OPENING_ROLLS, {
    plies: 2,
    candidateWidth: 12,
    evaluator: createHeuristicEvaluator(base),
  });
  console.log(JSON.stringify(base), `accuracy ${report.accuracy.toFixed(2)}`, `gap ${report.meanEquityGap.toFixed(3)}`);
});
