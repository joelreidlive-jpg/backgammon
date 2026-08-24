import { describe, expect, it } from 'vitest';
import {
  BLACK_TRAY_BASE,
  EDGE_HEIGHT,
  EDGE_PITCH,
  WHITE_TRAY_BASE,
  offEdgeTop,
} from './Board.js';

const ALL_FIFTEEN = 15;

function edges(baseY: number, direction: 1 | -1): { top: number; bottom: number }[] {
  return Array.from({ length: ALL_FIFTEEN }, (_, i) => {
    const top = offEdgeTop(baseY, direction, i);
    return { top, bottom: top + EDGE_HEIGHT };
  });
}

describe('borne-off checkers standing on edge', () => {
  it('stacks each one clear of the last, in from its own end of the tray', () => {
    const black = edges(BLACK_TRAY_BASE, 1);
    const white = edges(WHITE_TRAY_BASE, -1);

    expect(black[0]?.top).toBe(BLACK_TRAY_BASE);
    expect(white[0]?.bottom).toBe(WHITE_TRAY_BASE);

    for (const stack of [black, white]) {
      const tops = stack.map((edge) => edge.top).sort((a, b) => a - b);
      for (let i = 1; i < tops.length; i += 1) {
        // A gap between edges, so a stack reads as separate checkers rather
        // than one solid block.
        expect((tops[i] ?? 0) - (tops[i - 1] ?? 0)).toBe(EDGE_PITCH);
        expect(EDGE_PITCH).toBeGreaterThan(EDGE_HEIGHT);
      }
    }
  });

  it('keeps a full bear-off inside its own half of the tray', () => {
    const blackLowest = Math.max(...edges(BLACK_TRAY_BASE, 1).map((edge) => edge.bottom));
    const whiteHighest = Math.min(...edges(WHITE_TRAY_BASE, -1).map((edge) => edge.top));

    expect(blackLowest).toBeLessThan(whiteHighest);
  });
});
