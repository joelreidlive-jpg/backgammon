import type { CubeAnalysis, CubeChoice } from '@bg/protocol';

const MADE: Readonly<Record<CubeChoice, string>> = {
  double: 'You doubled',
  'no-double': 'You kept the cube',
  take: 'You took',
  drop: 'You dropped',
};

const BETTER: Readonly<Record<CubeChoice, string>> = {
  double: 'doubling',
  'no-double': 'keeping the cube',
  take: 'taking',
  drop: 'dropping',
};

/**
 * One cube decision of the game just played, in a line. A game settled by the
 * cube is settled by exactly these decisions, so the debrief names them rather
 * than only counting them.
 */
export function cubeVerdict(analysis: Pick<CubeAnalysis, 'choice' | 'best' | 'mistake'>): string {
  if (analysis.mistake === 'none') return `${MADE[analysis.choice]} — correct.`;
  if (analysis.mistake === 'undecided') return `${MADE[analysis.choice]} — either way is defensible.`;
  return `${MADE[analysis.choice]} — ${BETTER[analysis.best]} was right.`;
}
