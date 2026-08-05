import type { Board as BoardModel, Player } from '@bg/rules';
import { barSlot, checkersAt, offSlot } from '@bg/rules';

const WIDTH = 1120;
const HEIGHT = 640;
const MARGIN = 20;
const FELT_WIDTH = 980;
const BAR_WIDTH = 80;
const POINT_WIDTH = (FELT_WIDTH - BAR_WIDTH) / 12;
const POINT_HEIGHT = 250;
const CHECKER_RADIUS = POINT_WIDTH / 2 - 4;
const MAX_VISIBLE = 5;
const BAR_X = MARGIN + 6 * POINT_WIDTH;
const TRAY_X = MARGIN + FELT_WIDTH + 10;
const TRAY_WIDTH = WIDTH - TRAY_X - MARGIN;

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

function CheckerStack({ count, player, centreX, baseY, direction }: StackProps) {
  if (count === 0) return null;
  const visible = Math.min(count, MAX_VISIBLE);

  return (
    <g className={`checkers ${player}`}>
      {Array.from({ length: visible }, (_, i) => (
        <circle key={i} cx={centreX} cy={baseY + direction * CHECKER_RADIUS * (2 * i + 1)} r={CHECKER_RADIUS} />
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

export interface BoardProps {
  board: BoardModel;
  seat: Player;
  selected: number | null;
  /** Slots the player may move a checker from. */
  sources: ReadonlySet<number>;
  /** Slots the selected checker may move to. */
  destinations: ReadonlySet<number>;
  onSelect: (slot: number) => void;
}

export function Board({ board, seat, selected, sources, destinations, onSelect }: BoardProps) {
  const bar = barSlot(seat);
  const off = offSlot(seat);

  return (
    <svg className="board" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label="Backgammon board">
      <rect className="frame" x="0" y="0" width={WIDTH} height={HEIGHT} rx="14" />
      <rect className="felt" x={MARGIN} y={MARGIN} width={FELT_WIDTH} height={HEIGHT - 2 * MARGIN} />
      <rect className="bar" x={BAR_X} y={MARGIN} width={BAR_WIDTH} height={HEIGHT - 2 * MARGIN} />
      <rect className="tray" x={TRAY_X} y={MARGIN} width={TRAY_WIDTH} height={HEIGHT - 2 * MARGIN} rx="6" />

      {Array.from({ length: 24 }, (_, i) => i + 1).map((slot) => {
        const x = pointX(slot);
        const top = isTopRow(slot);
        const baseY = top ? MARGIN : HEIGHT - MARGIN;
        const tipY = top ? baseY + POINT_HEIGHT : baseY - POINT_HEIGHT;
        const shape = `${x},${baseY} ${x + POINT_WIDTH},${baseY} ${x + POINT_WIDTH / 2},${tipY}`;

        return (
          <g key={slot}>
            <polygon className={`point ${slot % 2 === 0 ? 'even' : 'odd'}`} points={shape} />
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
        baseY={HEIGHT / 2 - 150}
        direction={1}
      />
      <CheckerStack
        count={board.bar.white}
        player="white"
        centreX={BAR_X + BAR_WIDTH / 2}
        baseY={HEIGHT / 2 + 150}
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
