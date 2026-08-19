import type { BenchmarkPosition } from '../schema.js';

const START = '-b----E-C---eE---c-e----B-';

function opening(roll: string): string {
  return `XGID=${START}:0:0:1:${roll}:0:0:0:0:10`;
}

/**
 * The fifteen opening rolls, with the play modern rollouts settle on for money.
 *
 * These are the natural first benchmark: they are the most heavily analysed
 * positions in the game, the answers are public knowledge rather than any one
 * author's work, and every position is reached from the same board, so a
 * disagreement here is a statement about the evaluator and nothing else.
 *
 * Where the top two plays are close enough that both appear in current
 * rollouts, both are accepted — scoring the engine wrong for picking a play
 * that is within noise of the best would measure the wrong thing.
 */
export const OPENING_ROLLS: readonly BenchmarkPosition[] = [
  {
    id: 'opening-31',
    xgid: opening('31'),
    best: ['8/5 6/5'],
    source: 'consensus',
    tags: ['makesHomeBoardPoint', 'makesPoint'],
    note: 'The golden point. The only opening roll with no serious rival play.',
  },
  {
    id: 'opening-42',
    xgid: opening('42'),
    best: ['8/4 6/4'],
    source: 'consensus',
    tags: ['makesHomeBoardPoint', 'makesPoint'],
  },
  {
    id: 'opening-53',
    xgid: opening('53'),
    best: ['8/3 6/3'],
    source: 'consensus',
    tags: ['makesHomeBoardPoint', 'makesPoint'],
  },
  {
    id: 'opening-61',
    xgid: opening('61'),
    best: ['13/7 8/7'],
    source: 'consensus',
    tags: ['makesPoint', 'buildsPrime'],
    note: 'The bar point: three consecutive points, and the start of a prime.',
  },
  {
    id: 'opening-65',
    xgid: opening('65'),
    best: ['24/18 18/13'],
    source: 'consensus',
    tags: ['escapesBackChecker'],
    note: 'Running one back checker to safety costs nothing and is unopposed.',
  },
  {
    id: 'opening-64',
    xgid: opening('64'),
    best: ['24/18 13/9', '8/2 6/2'],
    source: 'consensus',
    tags: ['escapesBackChecker', 'makesPoint'],
    note: 'Splitting is the modern preference; making the deep two point is close.',
  },
  {
    id: 'opening-63',
    xgid: opening('63'),
    best: ['24/18 13/10'],
    source: 'consensus',
    tags: ['escapesBackChecker'],
  },
  {
    id: 'opening-62',
    xgid: opening('62'),
    best: ['24/18 13/11'],
    source: 'consensus',
    tags: ['escapesBackChecker'],
  },
  {
    id: 'opening-54',
    xgid: opening('54'),
    best: ['24/20 13/8'],
    source: 'consensus',
    tags: ['anchorsInOpponentHome'],
    note: 'Splitting to the 20 point aims at the best anchor in the game.',
  },
  {
    id: 'opening-52',
    xgid: opening('52'),
    best: ['24/22 13/8', '13/8 13/11'],
    source: 'consensus',
    tags: ['anchorsInOpponentHome'],
  },
  {
    id: 'opening-43',
    xgid: opening('43'),
    best: ['24/20 13/10', '13/9 13/10'],
    source: 'consensus',
    tags: ['anchorsInOpponentHome'],
  },
  {
    id: 'opening-32',
    xgid: opening('32'),
    best: ['24/21 13/11', '13/11 13/10'],
    source: 'consensus',
    tags: ['anchorsInOpponentHome'],
  },
  {
    id: 'opening-51',
    xgid: opening('51'),
    best: ['24/23 13/8', '13/8 6/5'],
    source: 'consensus',
    tags: ['leavesBlot'],
    note: 'A one-pip split, daring the opponent to attack a checker they cannot hurt much.',
  },
  {
    id: 'opening-41',
    xgid: opening('41'),
    best: ['24/23 13/9', '13/9 6/5'],
    source: 'consensus',
    tags: ['leavesBlot'],
  },
  {
    id: 'opening-21',
    xgid: opening('21'),
    best: ['24/23 13/11', '13/11 6/5'],
    source: 'consensus',
    tags: ['leavesBlot'],
    note: 'Split or slot: the two plays have traded places as engines improved.',
  },
];
