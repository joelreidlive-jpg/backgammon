import { type Board, type Dice, type Move, type Player, formatTurn } from '@bg/rules';
import { type SearchOptions, rankTurns } from '@bg/ai';
import { conceptHint } from './explain.js';

/**
 * Escalating hint levels. The point is to teach, so the answer is the last
 * resort rather than the default.
 */
export type HintLevel = 1 | 2 | 3 | 4;

export interface Hint {
  readonly level: HintLevel;
  readonly message: string;
  /** Populated at level 3: candidate plays in an order that hides the ranking. */
  readonly candidates?: readonly string[];
  /** Populated at level 4 only. */
  readonly bestMoves?: readonly Move[];
  readonly equityGain?: number;
}

const CANDIDATE_COUNT = 3;

export function buildHint(
  board: Board,
  player: Player,
  dice: Dice,
  level: HintLevel,
  options: SearchOptions = { plies: 2, candidateWidth: 8 },
): Hint {
  const ranked = rankTurns(board, player, dice, options);
  const best = ranked[0];

  if (best === undefined || best.turn.moves.length === 0) {
    return { level, message: 'You have no legal play with this roll.' };
  }
  if (ranked.length === 1) {
    return { level, message: 'This roll only has one legal play.' };
  }

  const gap = best.equity - ranked[1].equity;

  switch (level) {
    case 1:
      return {
        level,
        message:
          gap < 0.02
            ? 'Several plays are close here — it is hard to go badly wrong.'
            : 'One play is clearly better than the rest.',
      };
    case 2:
      return { level, message: conceptHint(board, best.turn.board, player) ?? 'Think about safety versus flexibility.' };
    case 3:
      return {
        level,
        message: 'One of these is best.',
        candidates: ranked
          .slice(0, CANDIDATE_COUNT)
          .map((r) => formatTurn(player, r.turn.moves))
          .sort(),
      };
    case 4:
      return {
        level,
        message: `Best play is ${formatTurn(player, best.turn.moves)}.`,
        bestMoves: best.turn.moves,
        equityGain: gap,
      };
  }
}
