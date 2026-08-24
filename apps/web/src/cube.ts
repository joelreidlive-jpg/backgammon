import type { Player } from '@bg/rules';

/**
 * A real cube has no 1 on it: centred and unused, it rests 64 upwards, and the
 * game is played for one point. Showing that rather than a 1 is what the
 * player will see on a board across a table.
 */
export function cubeFace(value: number): number {
  return value === 1 ? 64 : value;
}

/**
 * Which end of the tray the cube sits at. Ownership is the whole point of the
 * cube — who may double next — so it is read off its position, as on a board:
 * centred while nobody owns it, and in front of whoever holds it.
 */
export function cubeSide(owner: Player | null, seat: Player): 'yours' | 'theirs' | 'centre' {
  if (owner === null) return 'centre';
  return owner === seat ? 'yours' : 'theirs';
}

/** What clicking the cube would do, in words the player can act on. */
export function cubeLabel(value: number, owner: Player | null, seat: Player, offered: boolean): string {
  if (offered) return `doubling cube offered at ${value * 2}`;
  const held =
    cubeSide(owner, seat) === 'centre'
      ? 'centred'
      : cubeSide(owner, seat) === 'yours'
        ? 'yours'
        : 'the engine’s';
  return `doubling cube at ${value}, ${held}`;
}
