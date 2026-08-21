import { describe, it } from 'vitest';
import { OPENING_ROLLS } from './positions/openings.js';
import { formatReport, runBenchmark } from './run.js';

// Not an assertion: a printable snapshot of where the evaluator stands, run
// with `npx vitest run packages/bench/src/report.test.ts`.
describe('benchmark report', () => {
  it('prints agreement with the opening-roll consensus', () => {
    console.log(formatReport(runBenchmark(OPENING_ROLLS)));
  });
});
