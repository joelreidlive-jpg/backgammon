/**
 * The coach as a drawer, for a screen with no room for a column.
 *
 * On a phone the coach cannot sit open beside the board and still leave the
 * board readable, so it closes to a tab at the edge. The tab flashes when there
 * is something to read; opening it is the player's choice, and it shuts again
 * once the position has moved on, because advice belongs to one position and a
 * panel left open would cover the board for the rest of the game.
 */
export interface DrawerState {
  /** The position the drawer's state is about, plus whether it had a message. */
  readonly signal: string;
  readonly open: boolean;
  /** True while there is a message the player has not opened the drawer for. */
  readonly unread: boolean;
}

export const DRAWER_SHUT: DrawerState = { signal: '', open: false, unread: false };

/** What the drawer is reacting to: a position, and whether the coach spoke. */
export function drawerSignal(position: string, message: boolean): string {
  return `${position}|${message ? 'said' : 'quiet'}`;
}

/**
 * The board has changed. Anything open belonged to the position before it, so
 * the drawer shuts; if the coach has spoken about the new one, the tab flashes.
 */
export function onSignal(state: DrawerState, signal: string, message: boolean): DrawerState {
  if (state.signal === signal) return state;
  return { signal, open: false, unread: message };
}

/** The player has opened the drawer, so the message has been seen. */
export function onOpen(state: DrawerState): DrawerState {
  return { ...state, open: true, unread: false };
}

export function onShut(state: DrawerState): DrawerState {
  return { ...state, open: false, unread: false };
}
