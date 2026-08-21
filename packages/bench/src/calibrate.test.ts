import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CALIBRATE,
  type CalibrationSample,
  buildCalibration,
  collectSamples,
  formatCalibrationModule,
  samplePositions,
} from './calibrate.js';

describe('calibration', () => {
  it('samples reachable positions across a game', () => {
    const positions = samplePositions(20, 1);
    expect(positions).toHaveLength(20);
    // Sampling from self-play, not from the starting position over and over.
    expect(new Set(positions.map((p) => p.board.points.join(','))).size).toBeGreaterThan(10);
  });

  it('bins samples into a monotone table', () => {
    const samples: CalibrationSample[] = [
      { score: 0.05, points: 0.1, winRate: 0.52 },
      { score: 0.15, points: 0.6, winRate: 0.62 },
      // Out of order: a stronger score that rolled out worse is noise.
      { score: 0.25, points: 0.3, winRate: 0.55 },
      { score: -0.15, points: -0.5, winRate: 0.4 },
    ];
    const table = buildCalibration(samples, 4);

    expect(table.map((point) => point.points)).toEqual([...table.map((p) => p.points)].sort((a, b) => a - b));
    expect(table.map((point) => point.winRate)).toEqual([...table.map((p) => p.winRate)].sort((a, b) => a - b));
    // The negative sample folds onto the positive side rather than being lost.
    expect(table.reduce((sum, point) => sum + point.samples, 0)).toBe(4);
  });
});

// Not a test: measures what the evaluator's score is worth in real points, by
// rolling sampled positions out to the end. Sharded, since it is hours of CPU:
//   CALIBRATE=1 CALIBRATE_SHARDS=8 CALIBRATE_SHARD=0 CALIBRATE_OUT=/tmp/cal-0.json \
//     npx vitest run packages/bench/src/calibrate.test.ts
const calibrate = process.env.CALIBRATE ? it : it.skip;

calibrate('measures the evaluator against rolled-out outcomes', () => {
  const shards = Number(process.env.CALIBRATE_SHARDS ?? 1);
  const shard = Number(process.env.CALIBRATE_SHARD ?? 0);
  const positions = samplePositions(DEFAULT_CALIBRATE.positions, DEFAULT_CALIBRATE.seed).filter(
    (_, index) => index % shards === shard,
  );

  const samples = collectSamples(positions, { ...DEFAULT_CALIBRATE, seed: DEFAULT_CALIBRATE.seed + shard });
  const out = process.env.CALIBRATE_OUT;
  if (out) writeFileSync(out, JSON.stringify(samples, null, 2));
  console.log(`${samples.length} positions rolled out`);
}, 12 * 60 * 60 * 1000);

// Merges the shards into the committed table:
//   MERGE_CALIBRATION=/tmp/cal-0.json,/tmp/cal-1.json \
//     npx vitest run packages/bench/src/calibrate.test.ts
const merge = process.env.MERGE_CALIBRATION ? it : it.skip;

merge('writes the calibration table', () => {
  const files = (process.env.MERGE_CALIBRATION ?? '').split(',').filter(Boolean);
  const samples = files.flatMap((file) => JSON.parse(readFileSync(file, 'utf8')) as CalibrationSample[]);
  const table = buildCalibration(samples);

  writeFileSync(
    new URL('../../ai/src/calibration.generated.ts', import.meta.url),
    formatCalibrationModule(table),
  );
  console.log(`${samples.length} samples in ${table.length} bins`);
  for (const point of table) {
    console.log(`  ≤${point.score.toFixed(2)}  ${point.points.toFixed(3)} points  ${(point.winRate * 100).toFixed(1)}% wins  (${point.samples})`);
  }
});
