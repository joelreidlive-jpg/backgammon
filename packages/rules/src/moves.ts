import {
  type Board,
  type Player,
  barSlot,
  checkersAt,
  cloneBoard,
  direction,
  distanceToOff,
  homeSlots,
  offSlot,
  opponent,
  allCheckersHome,
} from './board.js';

/** A single checker move. `to` may be the player's off slot for a bear-off. */
export interface Move {
  readonly from: number;
  readonly to: number;
  readonly hit: boolean;
}

/** True if the player may land a checker on slot 1..24. */
export function canLand(board: Board, player: Player, slot: number): boolean {
  if (slot < 1 || slot > 24) return false;
  return checkersAt(board, opponent(player), slot) <= 1;
}

/**
 * Bearing off with a die larger than the exact distance is only legal when no
 * checker sits farther from the off tray.
 */
function noCheckersBehind(board: Board, player: Player, slot: number): boolean {
  for (const home of homeSlots(player)) {
    if (distanceToOff(player, home) > distanceToOff(player, slot) && checkersAt(board, player, home) > 0) {
      return false;
    }
  }
  return true;
}

/** All single checker moves the player can make with one die. */
export function movesForDie(board: Board, player: Player, die: number): Move[] {
  const dir = direction(player);
  const bar = barSlot(player);
  const off = offSlot(player);

  if (board.bar[player] > 0) {
    const to = bar + dir * die;
    if (!canLand(board, player, to)) return [];
    return [{ from: bar, to, hit: checkersAt(board, opponent(player), to) === 1 }];
  }

  const moves: Move[] = [];
  const bearingOff = allCheckersHome(board, player);

  for (let from = 1; from <= 24; from++) {
    if (checkersAt(board, player, from) === 0) continue;
    const to = from + dir * die;

    if (to >= 1 && to <= 24) {
      if (canLand(board, player, to)) {
        moves.push({ from, to, hit: checkersAt(board, opponent(player), to) === 1 });
      }
      continue;
    }

    if (!bearingOff) continue;
    const distance = distanceToOff(player, from);
    if (die === distance || (die > distance && noCheckersBehind(board, player, from))) {
      moves.push({ from, to: off, hit: false });
    }
  }

  return moves;
}

/** Apply one move. The move is assumed legal; callers validate via `legalTurns`. */
export function applyMove(board: Board, player: Player, move: Move): Board {
  const next = cloneBoard(board);
  const foe = opponent(player);
  const sign = player === 'white' ? 1 : -1;

  if (move.from === barSlot(player)) {
    next.bar[player] -= 1;
  } else {
    next.points[move.from] -= sign;
  }

  if (move.to === offSlot(player)) {
    next.off[player] += 1;
  } else {
    if (checkersAt(board, foe, move.to) === 1) {
      next.points[move.to] = 0;
      next.bar[foe] += 1;
    }
    next.points[move.to] += sign;
  }

  return next;
}
