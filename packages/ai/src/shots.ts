import { type Board, type Player, barSlot, checkersAt, direction, opponent } from '@bg/rules';

/**
 * Number of the 36 dice combinations that cover a given distance, assuming
 * nothing is in the way. Distances above 6 need two or more dice, so doubles
 * contribute the long entries.
 */
const COMBINATIONS_FOR_DISTANCE: Readonly<Record<number, number>> = {
  1: 11,
  2: 12,
  3: 14,
  4: 15,
  5: 15,
  6: 17,
  7: 6,
  8: 6,
  9: 5,
  10: 3,
  11: 2,
  12: 3,
  15: 1,
  16: 1,
  18: 1,
  20: 1,
  24: 1,
};

function landable(board: Board, mover: Player, slot: number): boolean {
  if (slot < 1 || slot > 24) return false;
  return checkersAt(board, opponent(mover), slot) <= 1;
}

/**
 * Combinations (out of 36) with which `attacker` can hit a checker on `target`
 * starting from `from`.
 *
 * Direct shots are exact. Indirect shots discount combinations whose
 * intermediate landing point is blocked, which is the dominant blocking effect;
 * it does not model every multi-checker route, so treat the result as a good
 * estimate rather than an exact shot count.
 */
export function shotsFrom(board: Board, attacker: Player, from: number, target: number): number {
  const dir = direction(attacker);
  const distance = (target - from) * dir;
  if (distance <= 0) return 0;

  const total = COMBINATIONS_FOR_DISTANCE[distance];
  if (total === undefined) return 0;
  if (distance <= 6) return total;

  let combinations = 0;
  for (let first = 1; first <= 6; first++) {
    const second = distance - first;
    if (second < 1 || second > 6) continue;
    if (!landable(board, attacker, from + dir * first)) continue;
    combinations += 1; // one ordered pair = one of the 36 outcomes
  }

  // Doubles covering the distance in three or four hops.
  for (let die = 1; die <= 6; die++) {
    for (const hops of [3, 4]) {
      if (die * hops !== distance) continue;
      let clear = true;
      for (let hop = 1; hop < hops; hop++) {
        if (!landable(board, attacker, from + dir * die * hop)) {
          clear = false;
          break;
        }
      }
      if (clear) combinations += 1;
    }
  }

  return Math.min(combinations, total);
}

/**
 * Combinations (out of 36) with which the opponent can hit `victim`'s blot on
 * `slot`. Taken as the best single attacking checker rather than a union over
 * all of them, so it never overstates the danger.
 */
export function shotsAgainst(board: Board, victim: Player, slot: number): number {
  const attacker = opponent(victim);

  if (board.bar[attacker] > 0) {
    return shotsFrom(board, attacker, barSlot(attacker), slot);
  }

  let best = 0;
  for (let from = 1; from <= 24; from++) {
    if (checkersAt(board, attacker, from) === 0) continue;
    const shots = shotsFrom(board, attacker, from, slot);
    if (shots > best) best = shots;
  }
  return best;
}
