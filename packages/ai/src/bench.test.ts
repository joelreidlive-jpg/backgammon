import { expect, it } from 'vitest';
import { newMatch, playTurn, roll } from '@bg/rules';
import { decideTurn } from './engine.js';

/**
 * Workers bill CPU time, so the search has to stay inside a budget rather than
 * merely terminate. The bound is deliberately loose to survive slow CI boxes;
 * it exists to catch an order-of-magnitude regression, not to benchmark.
 */
it('keeps a 2-ply expert turn inside the Workers CPU budget', () => {
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const die = () => 1 + Math.floor(rnd() * 6);

  let state = newMatch(1, 'white', [die(), die()]);
  const times: number[] = [];
  while ((state.phase === 'move' || state.phase === 'roll') && times.length < 150) {
    if (state.phase === 'roll') {
      state = roll(state, [die(), die()]);
      continue;
    }
    const t0 = performance.now();
    const { chosen } = decideTurn(state, 'expert', rnd);
    times.push(performance.now() - t0);
    state = playTurn(state, chosen.turn.moves);
  }
  times.sort((a, b) => a - b);
  const q = (f: number) => times[Math.floor(times.length * f)].toFixed(1);
  const slowest = times[times.length - 1];
  console.log(`2-ply expert: n=${times.length} median=${q(0.5)}ms p90=${q(0.9)}ms max=${slowest.toFixed(1)}ms`);
  expect(slowest).toBeLessThan(2000);
}, 120000);
