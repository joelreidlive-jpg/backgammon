import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import type { CubeProblem } from './cube.js';
import {
  type CubeGenerateOptions,
  DEFAULT_CUBE_GENERATE,
  formatCubeModule,
  generateCubeProblems,
} from './cube-generate.js';

// Not tests: the generator for `cube-problems.generated.ts`. Off by default
// because every candidate position is rolled out to the end hundreds of times.
//
//   GENERATE_CUBE=1 CUBE_SHARDS=8 CUBE_SHARD=0 CUBE_OUT=/tmp/cube-0.json \
//     npx vitest run packages/trainer/src/build-cube-problems.test.ts
//   MERGE_CUBE=/tmp/cube-0.json,/tmp/cube-1.json \
//     npx vitest run packages/trainer/src/build-cube-problems.test.ts
//
// A pass can be aimed at one answer, which is how the doubling band gets
// covered at all: CUBE_WINDOW=0.68,0.84 CUBE_ANSWERS=double,take. The window
// is on a short probe rollout's win rate, not on the heuristic's. A pass at
// the doubling band needs more trials than the default to separate the
// actions at all: CUBE_TRIALS=480 CUBE_PROBE_TRIALS=48.
const generate = process.env.GENERATE_CUBE ? it : it.skip;
const merge = process.env.MERGE_CUBE ? it : it.skip;

generate(
  'harvests cube problems',
  () => {
    const shards = Number(process.env.CUBE_SHARDS ?? 1);
    const shard = Number(process.env.CUBE_SHARD ?? 0);
    const wanted = process.env.CUBE_ANSWERS?.split(',');
    const band = process.env.CUBE_WINDOW?.split(',').map(Number);

    // Sharding by seed rather than by position: self-play is sequential, so
    // each shard plays its own games instead of re-playing the same ones.
    const problems = generateCubeProblems({
      ...DEFAULT_CUBE_GENERATE,
      seed: DEFAULT_CUBE_GENERATE.seed + shard,
      games: Math.ceil(DEFAULT_CUBE_GENERATE.games / shards),
      quota: Object.fromEntries(
        Object.entries(DEFAULT_CUBE_GENERATE.quota).map(([answer, count]) => [
          answer,
          wanted && !wanted.includes(answer) ? 0 : Math.max(1, Math.ceil(count / shards)),
        ]),
      ) as CubeGenerateOptions['quota'],
      window: band?.length === 2 ? [band[0], band[1]] : DEFAULT_CUBE_GENERATE.window,
      trials: Number(process.env.CUBE_TRIALS ?? DEFAULT_CUBE_GENERATE.trials),
      probeTrials: Number(process.env.CUBE_PROBE_TRIALS ?? DEFAULT_CUBE_GENERATE.probeTrials),
      maxRollouts: Math.ceil(DEFAULT_CUBE_GENERATE.maxRollouts / shards),
      maxProbes: Math.ceil(DEFAULT_CUBE_GENERATE.maxProbes / shards),
      onPosition: (rolledOut, kept) =>
        console.log(`shard ${shard}: ${rolledOut} rolled out, ${kept} kept`),
    }).map((problem) => ({ ...problem, id: `${problem.id}-s${shard}` }));

    const out = process.env.CUBE_OUT;
    if (out) writeFileSync(out, JSON.stringify(problems));

    const byAnswer = new Map<string, number>();
    for (const problem of problems) {
      byAnswer.set(problem.answer, (byAnswer.get(problem.answer) ?? 0) + 1);
    }
    console.log(`shard ${shard}: ${problems.length} problems`, Object.fromEntries(byAnswer));
  },
  21_600_000,
);

merge('writes the cube problem set', () => {
  const files = (process.env.MERGE_CUBE ?? '').split(',').filter(Boolean);
  // Shards play their own games but open from the same position, so the early
  // plies collide; the same position asked twice is one problem.
  const byPosition = new Map<string, CubeProblem>();
  for (const file of files) {
    for (const problem of JSON.parse(readFileSync(file, 'utf8')) as CubeProblem[]) {
      const key = `${problem.xgid}|${problem.question}`;
      if (!byPosition.has(key)) byPosition.set(key, problem);
    }
  }
  const problems = [...byPosition.values()].sort((a, b) => a.id.localeCompare(b.id));

  writeFileSync(new URL('./cube-problems.generated.ts', import.meta.url), formatCubeModule(problems));

  const byTier = new Map<number, number>();
  for (const problem of problems) byTier.set(problem.tier, (byTier.get(problem.tier) ?? 0) + 1);
  console.log(`${problems.length} cube problems`, Object.fromEntries([...byTier].sort()));
});
