import { type Board, type Player, emptyBoard } from './board.js';

export interface BoardSpec {
  white?: Readonly<Record<number, number>>;
  black?: Readonly<Record<number, number>>;
  bar?: Partial<Record<Player, number>>;
  off?: Partial<Record<Player, number>>;
}

/** Build a board from a sparse description. Intended for tests and fixtures. */
export function makeBoard(spec: BoardSpec): Board {
  const base = emptyBoard();
  const points = base.points.slice();
  for (const [slot, count] of Object.entries(spec.white ?? {})) points[Number(slot)] += count;
  for (const [slot, count] of Object.entries(spec.black ?? {})) points[Number(slot)] -= count;
  return {
    points,
    bar: { white: spec.bar?.white ?? 0, black: spec.bar?.black ?? 0 },
    off: { white: spec.off?.white ?? 0, black: spec.off?.black ?? 0 },
  };
}
