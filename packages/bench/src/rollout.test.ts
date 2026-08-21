import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPENING_ROLLS } from './positions/openings.js';
import { runBenchmark } from './run.js';
import { BENCH_ROLLOUT, formatRolloutReport, runRolloutBenchmark } from './rollout.js';
import { load } from './schema.js';

describe('rollout benchmark', () => {
  it('grades a position against the accepted play', () => {
    const grade = runRolloutBenchmark([OPENING_ROLLS[0]], {
      ...BENCH_ROLLOUT,
      maxTrials: 36,
      minTrials: 36,
      candidates: 3,
    }).grades[0];

    expect(grade.id).toBe(load(OPENING_ROLLS[0]).id);
    expect(grade.trials).toBe(36);
    expect(grade.play.length).toBeGreaterThan(0);
  });
});

// Not a test: the measurement that decides whether rollouts are trustworthy
// enough to supply trainer answers. Compares rollout agreement with expert
// consensus against the 2-ply search's agreement on the same positions.
//
// Rolling out a position costs minutes, so the run shards across processes:
//   ROLLOUT_BENCH=1 ROLLOUT_SHARDS=8 ROLLOUT_SHARD=0 ROLLOUT_OUT=/tmp/bench-0.json \
//     npx vitest run packages/bench/src/rollout.test.ts
const measure = process.env.ROLLOUT_BENCH ? it : it.skip;

measure('measures rollout agreement with consensus', () => {
  const shards = Number(process.env.ROLLOUT_SHARDS ?? 1);
  const shard = Number(process.env.ROLLOUT_SHARD ?? 0);
  const subset = OPENING_ROLLS.filter((_, index) => index % shards === shard);

  const rollout = runRolloutBenchmark(subset);
  if (shards === 1) {
    console.log(`2-ply search agreement ${Math.round(runBenchmark(subset).accuracy * 100)}%`);
  }
  console.log(formatRolloutReport(rollout));

  const out = process.env.ROLLOUT_OUT;
  if (out) writeFileSync(out, JSON.stringify(rollout.grades, null, 2));
}, 6 * 60 * 60 * 1000);
