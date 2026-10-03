import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser', () => ({ default: { Scene: class {}, Input: { Keyboard: { KeyCodes: { W: 87, A: 65, S: 83, D: 68, E: 69, F: 70, R: 82 } } } } }));
import { MvpRunInputAdapter, MvpRunScene } from '../../src/game/scenes/MvpRunScene';

afterEach(() => vi.unstubAllGlobals());
function setup() {
  const menu = { hidden: false };
  vi.stubGlobal('document', { getElementById: (id: string) => id === 'run-menu-panel' ? menu : null });
  vi.stubGlobal('window', new EventTarget());
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const scene = { input: {
    keyboard: { addKey: () => ({ isDown: false, reset() {} }) },
    on: (name: string, callback: (...args: unknown[]) => void) => listeners.set(name, callback),
    off: () => {},
  } } as unknown as Phaser.Scene;
  let escapes = 0;
  const input = new MvpRunInputAdapter(scene, () => { escapes += 1; }, () => {}, () => {});
  return { menu, listeners, input, escapes: () => escapes };
}

describe('Night Shift menu input boundary', () => {
  it('ignores pointer and wheel actions while the menu covers the canvas', () => {
    const { input, listeners, menu } = setup();
    input.hudSlotAt = () => 3;
    listeners.get('pointerdown')!({ x: 20, y: 20 });
    listeners.get('wheel')!(null, null, 0, 1);
    expect(Reflect.get(input, 'pendingSlot')).toBe(0);
    expect(Reflect.get(input, 'pendingCycle')).toBe(0);
    expect(Reflect.get(input, 'pointerHeld')).toBe(false);
    menu.hidden = true;
    listeners.get('pointerdown')!({ x: 20, y: 20 });
    expect(Reflect.get(input, 'pendingSlot')).toBe(3);
  });

  it('ignores window keys even when a handler is invoked without menu capture', () => {
    const { input, escapes } = setup();
    for (const code of ['KeyE', 'KeyF', 'KeyR', 'Digit3', 'Space', 'KeyX', 'Escape']) {
      const event = new Event('keydown', { cancelable: true });
      Object.assign(event, { code, repeat: false });
      window.dispatchEvent(event);
    }
    expect(escapes()).toBe(0);
    for (const field of ['pendingInteract', 'pendingSteal', 'pendingRecall', 'pendingDash', 'pendingDrop']) expect(Reflect.get(input, field)).toBe(false);
    expect(Reflect.get(input, 'pendingSlot')).toBe(0);
  });

  it('leaves Space activation on page buttons to the browser instead of dashing', () => {
    const { input, menu } = setup();
    menu.hidden = true;
    class PageControl { closest(): PageControl { return this; } }
    vi.stubGlobal('HTMLElement', PageControl);
    const button = new PageControl();
    for (const type of ['keydown', 'keyup']) {
      const event = new Event(type, { cancelable: true });
      Object.assign(event, { code: 'Space', repeat: false });
      Object.defineProperty(event, 'target', { value: button });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(Reflect.get(input, 'pendingDash')).toBe(false);
  });

  it('does not let controller Start resume the menu-paused run', () => {
    setup();
    const buttons = Array.from({ length: 16 }, (_, i) => ({ pressed: i === 9, value: i === 9 ? 1 : 0 }));
    vi.stubGlobal('navigator', { getGamepads: () => [{ connected: true, axes: [0, 0, 0, 0], buttons }] });
    const scene = new MvpRunScene();
    const state = Reflect.get(scene, 'run');
    state.paused = true;
    Reflect.set(scene, 'inputAdapter', { setPad() {}, clearHeld() {} });
    Reflect.set(scene, 'syncView', () => {});
    Reflect.get(scene, 'pollGamepad').call(scene);
    expect(state.paused).toBe(true);
  });

  it('holds cinematic time while the menu is open', () => {
    setup();
    vi.stubGlobal('navigator', { getGamepads: () => [] });
    const scene = new MvpRunScene();
    let advanced = 0;
    Reflect.set(scene, 'ride', { update: () => { advanced += 1; return false; } });
    Reflect.set(scene, 'syncView', () => {});
    scene.update(0, 50);
    expect(advanced).toBe(0);
  });
});
