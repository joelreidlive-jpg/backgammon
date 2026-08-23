import type { Dice, Move } from '@bg/rules';

const SIZE = 54;
const GAP = 12;

/** Pip layout in a 3x3 grid, in units of the die's width. */
const PIPS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1: [[0.5, 0.5]],
  2: [
    [0.28, 0.28],
    [0.72, 0.72],
  ],
  3: [
    [0.28, 0.28],
    [0.5, 0.5],
    [0.72, 0.72],
  ],
  4: [
    [0.28, 0.28],
    [0.72, 0.28],
    [0.28, 0.72],
    [0.72, 0.72],
  ],
  5: [
    [0.28, 0.28],
    [0.72, 0.28],
    [0.5, 0.5],
    [0.28, 0.72],
    [0.72, 0.72],
  ],
  6: [
    [0.28, 0.25],
    [0.72, 0.25],
    [0.28, 0.5],
    [0.72, 0.5],
    [0.28, 0.75],
    [0.72, 0.75],
  ],
};

interface DieProps {
  face: number;
  x: number;
  y: number;
  spent: boolean;
}

function Die({ face, x, y, spent }: DieProps) {
  return (
    <g className={`board-die${spent ? ' spent' : ''}`} transform={`translate(${x} ${y})`}>
      <rect className="die-body" width={SIZE} height={SIZE} rx={SIZE * 0.18} />
      {(PIPS[face] ?? []).map(([px, py], i) => (
        <circle key={i} className="pip" cx={px * SIZE} cy={py * SIZE} r={SIZE * 0.09} />
      ))}
    </g>
  );
}

/** Shared empty set, so a board with nothing played needs no allocation. */
export const NO_DICE_SPENT: ReadonlySet<number> = new Set();

/** Doubles are played as four moves, so they are drawn as four dice. */
export function facesOf(dice: Dice): number[] {
  return dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
}

/**
 * Which drawn dice the pending moves have used up, so the player can see what
 * is left to play. A bear-off may legally use a die larger than the distance,
 * which is why an exact face is preferred before a larger one.
 */
export function spentFaces(dice: Dice, pending: readonly Move[]): Set<number> {
  const faces = facesOf(dice);
  const spent = new Set<number>();
  const free = (): number[] => faces.map((_, i) => i).filter((i) => !spent.has(i));
  const smallest = (indices: readonly number[]): number | undefined =>
    [...indices].sort((a, b) => faces[a] - faces[b])[0];

  for (const move of pending) {
    const distance = Math.abs(move.to - move.from);
    const available = free();
    const index =
      available.find((i) => faces[i] === distance) ??
      smallest(available.filter((i) => faces[i] > distance)) ??
      available[0];
    if (index !== undefined) spent.add(index);
  }
  return spent;
}

export interface DicePairProps {
  /** The roll to show, or null for an unrolled cup. */
  dice: Dice | null;
  /** Faces already played, dimmed so the player can see what is left. */
  spent: ReadonlySet<number>;
  /** Tumbling: the faces shown are decoration, not the result. */
  rolling: boolean;
  player: 'white' | 'black';
  /** Centre of the group. */
  x: number;
  y: number;
  onRoll?: () => void;
  label: string;
}

/**
 * The dice as they sit on the felt. Doubles show four dice, as they are played,
 * rather than two the player has to remember to use twice.
 */
export function DicePair({ dice, spent, rolling, player, x, y, onRoll, label }: DicePairProps) {
  const faces = dice === null ? [] : facesOf(dice);
  const clickable = onRoll !== undefined;
  // Nothing rolled and nothing to roll — a trainer position, or a side waiting
  // its turn — draws no dice at all rather than an empty cup.
  if (faces.length === 0 && !clickable) return null;

  const width = faces.length === 0 ? SIZE * 2 + GAP : faces.length * SIZE + (faces.length - 1) * GAP;
  const left = x - width / 2;

  return (
    <g
      className={[`dice-pair ${player}`, rolling ? 'rolling' : '', clickable ? 'clickable' : '']
        .filter(Boolean)
        .join(' ')}
      role={clickable ? 'button' : 'img'}
      tabIndex={clickable ? 0 : undefined}
      aria-label={label}
      onClick={onRoll}
      onKeyDown={(event) => {
        if (onRoll && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onRoll();
        }
      }}
    >
      {faces.length === 0 ? (
        <g className="cup">
          <rect
            className="cup-body"
            x={left}
            y={y - SIZE / 2}
            width={width}
            height={SIZE}
            rx={SIZE * 0.18}
          />
          <text className="cup-label" x={x} y={y} dy="0.35em">
            roll
          </text>
        </g>
      ) : (
        faces.map((face, i) => (
          <Die
            key={i}
            face={face}
            x={left + i * (SIZE + GAP)}
            y={y - SIZE / 2}
            spent={!rolling && spent.has(i)}
          />
        ))
      )}
    </g>
  );
}
