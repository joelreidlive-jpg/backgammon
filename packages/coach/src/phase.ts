import {
  type Board,
  type Player,
  allCheckersHome,
  checkersAt,
  homeSlots,
  isRace,
  opponent,
  pipCount,
} from '@bg/rules';

export type GamePhase = 'opening' | 'middlegame' | 'holding' | 'race' | 'bearoff';

/**
 * Coarse phase label. Used to tell a player *where* their equity goes, which is
 * the part of coaching that changes what they practise.
 */
export function phaseOf(board: Board, player: Player): GamePhase {
  if (allCheckersHome(board, player)) return 'bearoff';
  if (isRace(board)) return 'race';

  const pips = pipCount(board, player);
  const foePips = pipCount(board, opponent(player));
  if (pips > 150 && foePips > 150) return 'opening';

  // Holding a point in or near the opponent's home board while behind in the
  // race is the classic holding game.
  const behind = pips > foePips + 8;
  const holdsRearPoint = homeSlots(opponent(player))
    .concat(player === 'white' ? [18, 20] : [5, 7])
    .some((slot) => checkersAt(board, player, slot) >= 2);
  if (behind && holdsRearPoint) return 'holding';

  return 'middlegame';
}
