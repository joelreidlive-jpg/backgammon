import { type Player, barSlot, offSlot } from './board.js';
import { type Move } from './moves.js';

function slotName(player: Player, slot: number): string {
  if (slot === barSlot(player)) return 'bar';
  if (slot === offSlot(player)) return 'off';
  return String(slot);
}

/** Standard notation, e.g. "8/5 6/5" or "bar/20 13/11*". */
export function formatTurn(player: Player, moves: readonly Move[]): string {
  if (moves.length === 0) return '(no play)';

  const counts = new Map<string, { move: Move; count: number }>();
  for (const move of moves) {
    const key = `${move.from}/${move.to}/${move.hit ? 'h' : ''}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { move, count: 1 });
  }

  return [...counts.values()]
    .map(({ move, count }) => {
      const text = `${slotName(player, move.from)}/${slotName(player, move.to)}${move.hit ? '*' : ''}`;
      return count > 1 ? `${text}(${count})` : text;
    })
    .join(' ');
}
