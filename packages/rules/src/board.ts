export type Player = 'white' | 'black';

/**
 * Slots are numbered 1..24 from White's perspective: White moves 24 -> 1 and
 * bears off past 0, Black moves 1 -> 24 and bears off past 25.
 *
 * A positive value in `points` is that many White checkers, a negative value is
 * that many Black checkers. Slots 0 and 25 are never occupied; they exist so a
 * single number can address the bar and the off tray in move notation:
 *
 *   White: bar = 25, off = 0        Black: bar = 0, off = 25
 */
export interface Board {
  readonly points: readonly number[];
  readonly bar: Readonly<Record<Player, number>>;
  readonly off: Readonly<Record<Player, number>>;
}

export const CHECKERS_PER_SIDE = 15;

export function opponent(player: Player): Player {
  return player === 'white' ? 'black' : 'white';
}

/** +1 if the player's checkers move towards higher-numbered slots, else -1. */
export function direction(player: Player): 1 | -1 {
  return player === 'white' ? -1 : 1;
}

export function barSlot(player: Player): number {
  return player === 'white' ? 25 : 0;
}

export function offSlot(player: Player): number {
  return player === 'white' ? 0 : 25;
}

/** Slots making up the player's home board, in bear-off order. */
export function homeSlots(player: Player): readonly number[] {
  return player === 'white' ? [1, 2, 3, 4, 5, 6] : [24, 23, 22, 21, 20, 19];
}

export function isHomeSlot(player: Player, slot: number): boolean {
  return player === 'white' ? slot >= 1 && slot <= 6 : slot >= 19 && slot <= 24;
}

/** Pips remaining for a checker on `slot` to bear off. */
export function distanceToOff(player: Player, slot: number): number {
  return player === 'white' ? slot : 25 - slot;
}

/** How many of the player's checkers sit on `slot`. */
export function checkersAt(board: Board, player: Player, slot: number): number {
  if (slot === barSlot(player)) return board.bar[player];
  if (slot === offSlot(player)) return board.off[player];
  const v = board.points[slot] ?? 0;
  return player === 'white' ? Math.max(0, v) : Math.max(0, -v);
}

export function initialBoard(): Board {
  const points = new Array<number>(26).fill(0);
  points[24] = 2;
  points[13] = 5;
  points[8] = 3;
  points[6] = 5;
  points[1] = -2;
  points[12] = -5;
  points[17] = -3;
  points[19] = -5;
  return { points, bar: { white: 0, black: 0 }, off: { white: 0, black: 0 } };
}

export function emptyBoard(): Board {
  return {
    points: new Array<number>(26).fill(0),
    bar: { white: 0, black: 0 },
    off: { white: 0, black: 0 },
  };
}

export function pipCount(board: Board, player: Player): number {
  let pips = board.bar[player] * 25;
  for (let slot = 1; slot <= 24; slot++) {
    const n = checkersAt(board, player, slot);
    if (n > 0) pips += n * distanceToOff(player, slot);
  }
  return pips;
}

export function allCheckersHome(board: Board, player: Player): boolean {
  if (board.bar[player] > 0) return false;
  let inHome = board.off[player];
  for (const slot of homeSlots(player)) inHome += checkersAt(board, player, slot);
  return inHome === CHECKERS_PER_SIDE;
}

/** Slots (1..24) where the player has at least one checker. */
export function occupiedSlots(board: Board, player: Player): number[] {
  const slots: number[] = [];
  for (let slot = 1; slot <= 24; slot++) {
    if (checkersAt(board, player, slot) > 0) slots.push(slot);
  }
  return slots;
}

/** Slots where the player has exactly one checker and can therefore be hit. */
export function blots(board: Board, player: Player): number[] {
  const slots: number[] = [];
  for (let slot = 1; slot <= 24; slot++) {
    if (checkersAt(board, player, slot) === 1) slots.push(slot);
  }
  return slots;
}

/** Slots where the player has two or more checkers. */
export function madePoints(board: Board, player: Player): number[] {
  const slots: number[] = [];
  for (let slot = 1; slot <= 24; slot++) {
    if (checkersAt(board, player, slot) >= 2) slots.push(slot);
  }
  return slots;
}

/**
 * True when no opponent point stands between the player and their home board.
 *
 * From here the player's game is bringing checkers home and bearing off rather
 * than getting past anything: nothing can block them, and the only risk left is
 * a shot. Structure that exists to trap checkers stops paying at this point.
 */
export function isBearingIn(board: Board, player: Player): boolean {
  if (board.bar[player] > 0) return false;

  let rearmost = 0;
  for (let slot = 1; slot <= 24; slot++) {
    if (checkersAt(board, player, slot) === 0) continue;
    rearmost = Math.max(rearmost, distanceToOff(player, slot));
  }

  const foe = opponent(player);
  for (let slot = 1; slot <= 24; slot++) {
    if (checkersAt(board, foe, slot) < 2) continue;
    if (distanceToOff(player, slot) < rearmost) return false;
  }
  return true;
}

/** True once the two sides can no longer hit each other. */
export function isRace(board: Board): boolean {
  if (board.bar.white > 0 || board.bar.black > 0) return false;
  let whiteRearmost = 0;
  let blackRearmost = 25;
  for (let slot = 1; slot <= 24; slot++) {
    if (checkersAt(board, 'white', slot) > 0) whiteRearmost = Math.max(whiteRearmost, slot);
    if (checkersAt(board, 'black', slot) > 0) blackRearmost = Math.min(blackRearmost, slot);
  }
  return whiteRearmost < blackRearmost;
}

/** Stable key for deduplicating positions. */
export function boardKey(board: Board): string {
  return `${board.points.slice(1, 25).join(',')}|${board.bar.white},${board.bar.black}|${board.off.white},${board.off.black}`;
}

export function cloneBoard(board: Board): { points: number[]; bar: Record<Player, number>; off: Record<Player, number> } {
  return {
    points: board.points.slice(),
    bar: { ...board.bar },
    off: { ...board.off },
  };
}
