import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GENERATED_PROBLEMS } from './problems.generated.js';
import { formatProblemModule } from './generate.js';
import { MIN_ROLLOUT_MARGIN, rolloutTier, verifyProblem } from './verify.js';
import { type Problem } from './problem.js';
import { load } from './problem.js';

describe('verification', () => {
  it('answers a problem from the rollout rather than from the search', () => {
    const verified = verifyProblem(GENERATED_PROBLEMS[0], {
      maxTrials: 72,
      minTrials: 36,
      checkEvery: 36,
      candidates: 3,
      confidence: 0,
    });

    expect(verified).not.toBeNull();
    if (!verified) return;
    expect(verified.provenance).toBe('rollout');
    expect(verified.margin).toBeGreaterThanOrEqual(MIN_ROLLOUT_MARGIN);
    expect(verified.tier).toBe(rolloutTier(verified.margin));
    // The answer has to be a legal turn in the position, whoever supplied it.
    expect(() => load(verified)).not.toThrow();
  });
});

// Not a test: the offline pass that re-answers the committed problem set by
// rollout. Sharded because it costs hours in one process:
//   VERIFY_PROBLEMS=1 VERIFY_SHARDS=7 VERIFY_SHARD=0 VERIFY_OUT=/tmp/verified-0.json \
//     npx vitest run packages/trainer/src/verify-problems.test.ts
const verify = process.env.VERIFY_PROBLEMS ? it : it.skip;

verify('re-answers the problem set by rollout', () => {
  const shards = Number(process.env.VERIFY_SHARDS ?? 1);
  const shard = Number(process.env.VERIFY_SHARD ?? 0);
  // Consensus answers are left alone. Where a rollout disagrees with published
  // expert agreement, the rollout is the thing more likely to be wrong.
  const subset = GENERATED_PROBLEMS.filter(
    (problem, index) => problem.provenance !== 'consensus' && index % shards === shard,
  );

  const verified = subset.flatMap((problem) => {
    const result = verifyProblem(problem);
    console.log(
      result
        ? `${problem.id} ${result.overruled ? `overruled ${result.overruled} -> ` : 'kept '}${result.best[0]} margin ${result.margin.toFixed(3)} ± ${result.marginStderr.toFixed(3)} tier ${result.tier} (${result.trials} trials)`
        : `${problem.id} dropped: no play separated`,
    );
    return result ? [result] : [];
  });

  const out = process.env.VERIFY_OUT;
  if (out) writeFileSync(out, JSON.stringify(verified, null, 2));
}, 12 * 60 * 60 * 1000);

// Merges the shards written above into the committed data module:
//   MERGE_PROBLEMS=/tmp/verified-0.json,/tmp/verified-1.json \
//     npx vitest run packages/trainer/src/verify-problems.test.ts
const merge = process.env.MERGE_PROBLEMS ? it : it.skip;

merge('writes the verified set', () => {
  const files = (process.env.MERGE_PROBLEMS ?? '').split(',').filter(Boolean);
  const consensus = GENERATED_PROBLEMS.filter((problem) => problem.provenance === 'consensus');
  const problems = [
    ...consensus,
    ...files.flatMap((file) => JSON.parse(readFileSync(file, 'utf8')) as Problem[]),
  ].sort((a, b) => a.id.localeCompare(b.id));

  for (const problem of problems) load(problem);
  writeFileSync(
    new URL('./problems.generated.ts', import.meta.url),
    formatProblemModule(problems),
  );
  console.log(`${problems.length} problems written`);
});
