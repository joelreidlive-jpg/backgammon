import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { DEFAULT_GENERATE, consensusProblems, formatProblemModule, generateProblems } from './generate.js';

// Not a test: the generator for `problems.generated.ts`. Off by default because
// it runs a 2-ply search over thousands of positions and takes minutes.
// `GENERATE_PROBLEMS=1 npx vitest run packages/trainer/src/build-problems.test.ts`
const generate = process.env.GENERATE_PROBLEMS ? it : it.skip;

generate(
  'writes the problem set',
  () => {
    const problems = [...consensusProblems(), ...generateProblems(DEFAULT_GENERATE)];
    writeFileSync(new URL('./problems.generated.ts', import.meta.url), formatProblemModule(problems));

    const byTier = new Map<number, number>();
    for (const problem of problems) byTier.set(problem.tier, (byTier.get(problem.tier) ?? 0) + 1);
    console.log(`${problems.length} problems`, Object.fromEntries([...byTier].sort()));
  },
  1_800_000,
);
