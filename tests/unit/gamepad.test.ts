import { describe, expect, it } from 'vitest';
import { GAMEPAD_BUTTONS, GamepadReader, type PadSnapshot } from '../../src/game/input/gamepad';

function pad(overrides: { axes?: number[]; pressed?: number[]; values?: Record<number, number> } = {}): PadSnapshot {
  const buttons = Array.from({ length: 17 }, (_, i) => ({
    pressed: overrides.pressed?.includes(i) ?? false,
    value: overrides.values?.[i] ?? (overrides.pressed?.includes(i) ? 1 : 0),
  }));
  return { connected: true, axes: overrides.axes ?? [0, 0, 0, 0], buttons };
}

const at = { x: 400, y: 300 };

describe('gamepad reading', () => {
  it('moves with the left stick, ignoring drift inside the deadzone', () => {
    const reader = new GamepadReader();
    expect(reader.read(pad({ axes: [0.1, -0.12, 0, 0] }), at).moveX).toBe(0);
    const frame = reader.read(pad({ axes: [1, 0, 0, 0] }), at);
    expect(frame.moveX).toBeCloseTo(1);
    expect(frame.moveY).toBe(0);
  });

  it('also moves with the d-pad', () => {
    const frame = new GamepadReader().read(pad({ pressed: [GAMEPAD_BUTTONS.dpadLeft, GAMEPAD_BUTTONS.dpadUp] }), at);
    expect(frame.moveX).toBe(-1);
    expect(frame.moveY).toBe(-1);
  });

  it('aims with the right stick, and keeps the last aim when the stick is let go', () => {
    const reader = new GamepadReader();
    const aimed = reader.read(pad({ axes: [0, 0, 0, 1] }), at);
    expect(aimed.aim).not.toBeNull();
    expect(aimed.aim!.y).toBeGreaterThan(at.y);
    expect(aimed.aim!.x).toBeCloseTo(at.x);
    const released = reader.read(pad(), { x: 500, y: 300 });
    expect(released.aim!.y).toBeGreaterThan(300);
    expect(released.aim!.x).toBeCloseTo(500);
  });

  it('fires on the right trigger, or when the aim stick is pushed all the way', () => {
    const reader = new GamepadReader();
    expect(reader.read(pad({ values: { [GAMEPAD_BUTTONS.rightTrigger]: 0.8 } }), at).fire).toBe(true);
    expect(reader.read(pad({ axes: [0, 0, 1, 0] }), at).fire).toBe(true);
    expect(reader.read(pad({ axes: [0, 0, 0.5, 0] }), at).fire).toBe(false);
  });

  it('turns button presses into one-shot actions on the press, not while held', () => {
    const reader = new GamepadReader();
    const first = reader.read(pad({ pressed: [GAMEPAD_BUTTONS.a] }), at);
    expect(first.dash).toBe(true);
    const held = reader.read(pad({ pressed: [GAMEPAD_BUTTONS.a] }), at);
    expect(held.dash).toBe(false);
    const buy = reader.read(pad({ pressed: [GAMEPAD_BUTTONS.x] }), at);
    expect(buy.interact).toBe(true);
    const next = reader.read(pad({ pressed: [GAMEPAD_BUTTONS.rightBumper] }), at);
    expect(next.cycle).toBe(1);
    const prev = reader.read(pad({ pressed: [GAMEPAD_BUTTONS.leftBumper] }), at);
    expect(prev.cycle).toBe(-1);
    expect(reader.read(pad({ pressed: [GAMEPAD_BUTTONS.start] }), at).pause).toBe(true);
  });

  it('reads nothing from a missing pad', () => {
    const frame = new GamepadReader().read(null, at);
    expect(frame.active).toBe(false);
    expect(frame.moveX).toBe(0);
    expect(frame.aim).toBeNull();
  });
});
