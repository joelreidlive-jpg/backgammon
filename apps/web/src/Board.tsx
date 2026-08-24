import type { Board as BoardModel, Dice, Player } from '@bg/rules';
import { barSlot, checkersAt, offSlot } from '@bg/rules';
import { DicePair } from './Dice.js';

const WIDTH = 1120;
const HEIGHT = 640;
const MARGIN = 20;
const FELT_WIDTH = 980;
const BAR_WIDTH = 80;
const POINT_WIDTH = (FELT_WIDTH - BAR_WIDTH) / 12;
const POINT_HEIGHT = 250;
const MAX_VISIBLE = 5;
/**
 * Sized so a full five-checker stack fits inside the point rather than
 * spilling into the middle of the board, which the point's width alone does
 * not guarantee.
 */
const CHECKER_RADIUS = Math.min(POINT_WIDTH / 2 - 4, POINT_HEIGHT / (2 * MAX_VISIBLE));
const BAR_X = MARGIN + 6 * POINT_WIDTH;
const TRAY_X = MARGIN + FELT_WIDTH + 10;
const TRAY_WIDTH = WIDTH - TRAY_X - MARGIN;
/** Dice are thrown into a half: yours on the right, the engine's on the left. */
const YOUR_DICE_X = BAR_X + BAR_WIDTH + 3 * POINT_WIDTH;
const ENGINE_DICE_X = MARGIN + 3 * POINT_WIDTH;

/**
 * Standard layout seen from White: 1-12 along the bottom right-to-left, 13-24
 * along the top left-to-right, so White bears off at the bottom right.
 */
function pointX(slot: number): number {
  const column = slot <= 12 ? 12 - slot : slot - 13;
  return MARGIN + column * POINT_WIDTH + (column >= 6 ? BAR_WIDTH : 0);
}

function isTopRow(slot: number): boolean {
  return slot > 12;
}

interface StackProps {
  count: number;
  player: Player;
  centreX: number;
  baseY: number;
  /** +1 stacks downwards, -1 upwards. */
  direction: 1 | -1;
}

/** A checker drawn as a moulded disc: lit face, bevelled rim, inset centre. */
function Checker({ cx, cy, player }: { cx: number; cy: number; player: Player }) {
  return (
    <g className="checker">
      <ellipse className="checker-shadow" cx={cx} cy={cy + 2} rx={CHECKER_RADIUS} ry={CHECKER_RADIUS * 0.94} />
      <circle className="checker-face" cx={cx} cy={cy} r={CHECKER_RADIUS} fill={`url(#checker-${player})`} />
      <circle className="checker-rim" cx={cx} cy={cy} r={CHECKER_RADIUS - 3} />
      <circle className="checker-inset" cx={cx} cy={cy} r={CHECKER_RADIUS * 0.45} />
    </g>
  );
}

function CheckerStack({ count, player, centreX, baseY, direction }: StackProps) {
  if (count === 0) return null;
  const visible = Math.min(count, MAX_VISIBLE);

  return (
    <g className={`checkers ${player}`}>
      {Array.from({ length: visible }, (_, i) => (
        <Checker key={i} cx={centreX} cy={baseY + direction * CHECKER_RADIUS * (2 * i + 1)} player={player} />
      ))}
      {count > MAX_VISIBLE && (
        <text
          className="stack-count"
          x={centreX}
          y={baseY + direction * CHECKER_RADIUS * (2 * MAX_VISIBLE - 1)}
          dy="0.35em"
        >
          {count}
        </text>
      )}
    </g>
  );
}

/** Borne-off checkers are shown as slabs; fifteen circles would not fit. */
function OffTray({ count, player, baseY, direction }: Omit<StackProps, 'centreX'>) {
  const slabHeight = 16;
  return (
    <g className={`slabs ${player}`}>
      {Array.from({ length: count }, (_, i) => (
        <rect
          key={i}
          x={TRAY_X + 8}
          y={direction === 1 ? baseY + i * slabHeight : baseY - (i + 1) * slabHeight}
          width={TRAY_WIDTH - 16}
          height={slabHeight - 3}
          rx="3"
        />
      ))}
    </g>
  );
}

/**
 * The gradients and filters that make the board read as a physical case. The
 * stop colours come from CSS variables, so a theme is a palette in one place
 * rather than a second set of components.
 */
function BoardDefs() {
  return (
    <defs>
      <linearGradient id="case-wood" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0%" className="wood-light" />
        <stop offset="45%" className="wood-mid" />
        <stop offset="100%" className="wood-dark" />
      </linearGradient>

      <radialGradient id="felt-light" cx="0.5" cy="0.42" r="0.78">
        <stop offset="0%" className="felt-lit" />
        <stop offset="100%" className="felt-shade" />
      </radialGradient>

      <linearGradient id="point-odd" x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0%" className="point-odd-light" />
        <stop offset="100%" className="point-odd-dark" />
      </linearGradient>
      <linearGradient id="point-even" x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0%" className="point-even-light" />
        <stop offset="100%" className="point-even-dark" />
      </linearGradient>

      {/* Lit from the top left, like the rest of the board. */}
      <radialGradient id="checker-white" cx="0.35" cy="0.3" r="0.85">
        <stop offset="0%" className="checker-white-light" />
        <stop offset="70%" className="checker-white-mid" />
        <stop offset="100%" className="checker-white-dark" />
      </radialGradient>
      <radialGradient id="checker-black" cx="0.35" cy="0.3" r="0.85">
        <stop offset="0%" className="checker-black-light" />
        <stop offset="70%" className="checker-black-mid" />
        <stop offset="100%" className="checker-black-dark" />
      </radialGradient>

      <linearGradient id="die-white" x1="0.2" y1="0" x2="0.8" y2="1">
        <stop offset="0%" className="die-white-light" />
        <stop offset="100%" className="die-white-dark" />
      </linearGradient>
      <linearGradient id="die-black" x1="0.2" y1="0" x2="0.8" y2="1">
        <stop offset="0%" className="die-black-light" />
        <stop offset="100%" className="die-black-dark" />
      </linearGradient>

      <filter id="board-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.45" />
      </filter>
    </defs>
  );
}

/** One side's dice as the board should draw them. */
export interface DiceView {
  readonly dice: Dice | null;
  /** Indices of the drawn faces already played. */
  readonly spent: ReadonlySet<number>;
  readonly rolling: boolean;
}

export interface BoardProps {
  board: BoardModel;
  seat: Player;
  selected: number | null;
  /** Slots the player may move a checker from. */
  sources: ReadonlySet<number>;
  /** Slots the selected checker may move to. */
  destinations: ReadonlySet<number>;
  onSelect: (slot: number) => void;
  yourDice: DiceView;
  opponentDice: DiceView;
  /** Set when clicking your dice is what rolls them. */
  onRoll?: () => void;
}

export function Board({
  board,
  seat,
  selected,
  sources,
  destinations,
  onSelect,
  yourDice,
  opponentDice,
  onRoll,
}: BoardProps) {
  const bar = barSlot(seat);
  const off = offSlot(seat);
  const opponent: Player = seat === 'white' ? 'black' : 'white';

  return (
    <svg className="board" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label="Backgammon board">
      <BoardDefs />

      <rect className="frame" x="0" y="0" width={WIDTH} height={HEIGHT} rx="16" fill="url(#case-wood)" />
      <rect className="frame-bevel" x="6" y="6" width={WIDTH - 12} height={HEIGHT - 12} rx="12" />
      <rect
        className="felt"
        x={MARGIN}
        y={MARGIN}
        width={FELT_WIDTH}
        height={HEIGHT - 2 * MARGIN}
        fill="url(#felt-light)"
      />
      <rect
        className="bar"
        x={BAR_X}
        y={MARGIN}
        width={BAR_WIDTH}
        height={HEIGHT - 2 * MARGIN}
        fill="url(#case-wood)"
      />
      {/* The hinges of a folding case, on the spine. */}
      {[HEIGHT * 0.3, HEIGHT * 0.7].map((y) => (
        <rect
          key={y}
          className="hinge"
          x={BAR_X + BAR_WIDTH / 2 - 9}
          y={y - 18}
          width={18}
          height={36}
          rx={4}
        />
      ))}
      <rect
        className="tray"
        x={TRAY_X}
        y={MARGIN}
        width={TRAY_WIDTH}
        height={HEIGHT - 2 * MARGIN}
        rx="6"
        fill="url(#case-wood)"
      />

      {Array.from({ length: 24 }, (_, i) => i + 1).map((slot) => {
        const x = pointX(slot);
        const top = isTopRow(slot);
        const baseY = top ? MARGIN : HEIGHT - MARGIN;
        const tipY = top ? baseY + POINT_HEIGHT : baseY - POINT_HEIGHT;
        const shape = `${x},${baseY} ${x + POINT_WIDTH},${baseY} ${x + POINT_WIDTH / 2},${tipY}`;

        return (
          <g key={slot}>
            <polygon
              className={`point ${slot % 2 === 0 ? 'even' : 'odd'}`}
              points={shape}
              fill={slot % 2 === 0 ? 'url(#point-even)' : 'url(#point-odd)'}
            />
            {destinations.has(slot) && <polygon className="point-target" points={shape} />}
            <CheckerStack
              count={checkersAt(board, 'white', slot)}
              player="white"
              centreX={x + POINT_WIDTH / 2}
              baseY={baseY}
              direction={top ? 1 : -1}
            />
            <CheckerStack
              count={checkersAt(board, 'black', slot)}
              player="black"
              centreX={x + POINT_WIDTH / 2}
              baseY={baseY}
              direction={top ? 1 : -1}
            />
            <text className="slot-label" x={x + POINT_WIDTH / 2} y={top ? MARGIN - 6 : HEIGHT - MARGIN + 16}>
              {slot}
            </text>
            <rect
              className={[
                'hit-area',
                selected === slot ? 'selected' : '',
                sources.has(slot) ? 'source' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              x={x}
              y={top ? MARGIN : HEIGHT / 2}
              width={POINT_WIDTH}
              height={HEIGHT / 2 - MARGIN}
              onClick={() => onSelect(slot)}
            />
          </g>
        );
      })}

      <CheckerStack
        count={board.bar.black}
        player="black"
        centreX={BAR_X + BAR_WIDTH / 2}
        baseY={MARGIN + 20}
        direction={1}
      />
      <CheckerStack
        count={board.bar.white}
        player="white"
        centreX={BAR_X + BAR_WIDTH / 2}
        baseY={HEIGHT - MARGIN - 20}
        direction={-1}
      />
      <rect
        className={['hit-area', selected === bar ? 'selected' : '', sources.has(bar) ? 'source' : '']
          .filter(Boolean)
          .join(' ')}
        x={BAR_X}
        y={MARGIN}
        width={BAR_WIDTH}
        height={HEIGHT - 2 * MARGIN}
        onClick={() => onSelect(bar)}
      />

      {/* Only one side's dice are ever on the felt: yours right, the engine's left. */}
      <DicePair
        {...opponentDice}
        player={opponent}
        x={ENGINE_DICE_X}
        y={HEIGHT / 2}
        label="the engine’s dice"
      />
      <DicePair
        {...yourDice}
        player={seat}
        x={YOUR_DICE_X}
        y={HEIGHT / 2}
        onRoll={onRoll}
        label={onRoll ? 'roll the dice' : 'your dice'}
      />

      <OffTray count={board.off.black} player="black" baseY={MARGIN + 8} direction={1} />
      <OffTray count={board.off.white} player="white" baseY={HEIGHT - MARGIN - 8} direction={-1} />
      <rect
        className={['hit-area', destinations.has(off) ? 'target' : ''].filter(Boolean).join(' ')}
        x={TRAY_X}
        y={MARGIN}
        width={TRAY_WIDTH}
        height={HEIGHT - 2 * MARGIN}
        onClick={() => onSelect(off)}
      />
    </svg>
  );
}
