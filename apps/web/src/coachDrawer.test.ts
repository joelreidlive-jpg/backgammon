import { describe, expect, it } from 'vitest';
import { DRAWER_SHUT, drawerSignal, onOpen, onShut, onSignal } from './coachDrawer.js';

describe('the coach drawer', () => {
  it('flashes when the coach has something to say about a new position', () => {
    const state = onSignal(DRAWER_SHUT, drawerSignal('p1', true), true);
    expect(state).toMatchObject({ open: false, unread: true });
  });

  it('stays quiet when the position changes with nothing to read', () => {
    const state = onSignal(DRAWER_SHUT, drawerSignal('p1', false), false);
    expect(state).toMatchObject({ open: false, unread: false });
  });

  it('stops flashing once the player has opened it', () => {
    const flashing = onSignal(DRAWER_SHUT, drawerSignal('p1', true), true);
    expect(onOpen(flashing)).toMatchObject({ open: true, unread: false });
  });

  it('holds its state while the position is unchanged, so it cannot flap', () => {
    const opened = onOpen(onSignal(DRAWER_SHUT, drawerSignal('p1', true), true));
    expect(onSignal(opened, drawerSignal('p1', true), true)).toBe(opened);
  });

  it('shuts itself at the end of the turn', () => {
    const opened = onOpen(onSignal(DRAWER_SHUT, drawerSignal('p1', true), true));
    expect(onSignal(opened, drawerSignal('p2', false), false)).toMatchObject({
      open: false,
      unread: false,
    });
  });

  it('closes on the player asking it to, without pretending to be unread', () => {
    const opened = onOpen(onSignal(DRAWER_SHUT, drawerSignal('p1', true), true));
    expect(onShut(opened)).toMatchObject({ open: false, unread: false });
  });
});
