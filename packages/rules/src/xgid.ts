import { CHECKERS_PER_SIDE, type Board, type Player, emptyBoard } from './board.js';
import type { Dice } from './legalTurns.js';

/**
 * A position in eXtreme Gammon's interchange format, the closest thing
 * backgammon has to a lingua franca: every serious bot and problem collection
 * can emit it, so positions can be moved between tools as text rather than as
 * pictures of boards.
 *
 *   XGID=-b----E-C---eE---c-e----B-:0:0:1:63:0:0:0:0:10
 *        └ position ────────────┘ │ │ │ │  │ │ │ │  └ match length (0 = money)
 *                          cube ──┘ │ │ │  │ │ │ └ Jacoby / beaver flags
 *                        owner ─────┘ │ │  │ │ └ Crawford
 *                       on roll ──────┘ │  └─┴ scores
 *                                  dice ┘
 *
 * The 26 position characters are slots 0..25 with the same numbering this
 * package already uses — uppercase A-O are White (1-15 checkers, moving
 * 24 -> 1), lowercase a-o are Black — so no perspective flip is needed.
 */
export interface XgPosition {
  readonly board: Board;
  readonly turn: Player;
  /** null when the XGID records no roll, or records a double being offered. */
  readonly dice: Dice | null;
  readonly cube: { readonly value: number; readonly owner: Player | null };
  readonly score: Readonly<Record<Player, number>>;
  readonly matchLength: number;
  readonly crawford: boolean;
}

const CODE_A = 'A'.charCodeAt(0);
const CODE_a = 'a'.charCodeAt(0);

function countAt(char: string): { player: Player; count: number } | null {
  if (char === '-') return null;
  const code = char.charCodeAt(0);
  if (code >= CODE_A && code <= CODE_A + 14) return { player: 'white', count: code - CODE_A + 1 };
  if (code >= CODE_a && code <= CODE_a + 14) return { player: 'black', count: code - CODE_a + 1 };
  throw new Error(`invalid XGID checker "${char}"`);
}

function charFor(player: Player, count: number): string {
  if (count === 0) return '-';
  if (count > CHECKERS_PER_SIDE) throw new Error(`too many checkers: ${count}`);
  return String.fromCharCode((player === 'white' ? CODE_A : CODE_a) + count - 1);
}

function parseDice(field: string): Dice | null {
  // "00" is "not rolled yet"; "D"/"B"/"R" mark a cube action rather than a roll.
  if (field.length !== 2 || !/^[1-6]{2}$/.test(field)) return null;
  return [Number(field[0]), Number(field[1])] as Dice;
}

export function parseXgid(xgid: string): XgPosition {
  const body = xgid.trim().replace(/^XGID=/i, '');
  const fields = body.split(':');
  if (fields.length < 9) throw new Error(`malformed XGID: ${xgid}`);

  const [position, cubeExp, cubeOwner, onRoll, dice, scoreX, scoreO, crawford, matchLength] = fields;
  if (position.length !== 26) throw new Error(`XGID position must be 26 characters, got ${position.length}`);

  const points = emptyBoard().points.slice();
  const bar: Record<Player, number> = { white: 0, black: 0 };
  const onBoard: Record<Player, number> = { white: 0, black: 0 };

  for (let slot = 0; slot < 26; slot++) {
    const entry = countAt(position[slot]);
    if (!entry) continue;
    onBoard[entry.player] += entry.count;
    // Slot 25 is White's bar and slot 0 is Black's; a checker of the other
    // colour there is meaningless, so treat it as a malformed record.
    if (slot === 25 || slot === 0) {
      const owner: Player = slot === 25 ? 'white' : 'black';
      if (entry.player !== owner) throw new Error(`XGID puts ${entry.player} on ${owner}'s bar`);
      bar[owner] = entry.count;
      continue;
    }
    points[slot] += entry.player === 'white' ? entry.count : -entry.count;
  }

  // XGID never stores borne-off checkers: they are whatever is missing.
  const off: Record<Player, number> = {
    white: CHECKERS_PER_SIDE - onBoard.white,
    black: CHECKERS_PER_SIDE - onBoard.black,
  };
  if (off.white < 0 || off.black < 0) throw new Error('XGID has more than 15 checkers for a side');

  const exponent = Number(cubeExp);
  const owner = Number(cubeOwner);

  return {
    board: { points, bar, off },
    turn: Number(onRoll) >= 0 ? 'white' : 'black',
    dice: parseDice(dice),
    cube: {
      value: 2 ** exponent,
      owner: owner === 0 ? null : owner > 0 ? 'white' : 'black',
    },
    score: { white: Number(scoreX), black: Number(scoreO) },
    matchLength: Number(matchLength),
    crawford: crawford === '1',
  };
}

export function formatXgid(position: XgPosition): string {
  const chars: string[] = [];
  for (let slot = 0; slot <= 25; slot++) {
    if (slot === 0) chars.push(charFor('black', position.board.bar.black));
    else if (slot === 25) chars.push(charFor('white', position.board.bar.white));
    else {
      const value = position.board.points[slot] ?? 0;
      chars.push(value === 0 ? '-' : charFor(value > 0 ? 'white' : 'black', Math.abs(value)));
    }
  }

  const owner = position.cube.owner === null ? 0 : position.cube.owner === 'white' ? 1 : -1;
  const dice = position.dice ? `${position.dice[0]}${position.dice[1]}` : '00';

  return [
    `XGID=${chars.join('')}`,
    String(Math.log2(position.cube.value)),
    String(owner),
    position.turn === 'white' ? '1' : '-1',
    dice,
    String(position.score.white),
    String(position.score.black),
    position.crawford ? '1' : '0',
    String(position.matchLength),
    '10',
  ].join(':');
}
