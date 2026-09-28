/**
 * Twin-stick controller input for Night Shift, over the browser's standard
 * gamepad mapping (Xbox / PlayStation layouts):
 *
 *   left stick / d-pad  move            right stick     aim (and fire when pushed all the way)
 *   RT                  attack          A / LT          dash
 *   X                   buy / use       Y               steal
 *   B                   recall          LB / RB         previous / next weapon
 *   Start               pause
 *
 * Pure apart from its own button memory: it turns one pad snapshot into the
 * same intents the keyboard and mouse produce, so the scene feeds the
 * simulation one input frame whichever device the player picked up.
 */
export const GAMEPAD_BUTTONS = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  leftBumper: 4,
  rightBumper: 5,
  leftTrigger: 6,
  rightTrigger: 7,
  back: 8,
  start: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

export type PadSnapshot = {
  readonly connected: boolean;
  readonly axes: readonly number[];
  readonly buttons: ReadonlyArray<{ readonly pressed: boolean; readonly value: number }>;
};

export type PadFrame = {
  /** True when a connected pad produced any input this frame. */
  readonly active: boolean;
  readonly moveX: number;
  readonly moveY: number;
  /** World point to aim at, or null when the pad has never aimed. */
  readonly aim: { readonly x: number; readonly y: number } | null;
  /** True when the right stick is being pushed right now (takes aim from the mouse). */
  readonly aiming: boolean;
  readonly fire: boolean;
  readonly dash: boolean;
  readonly interact: boolean;
  readonly steal: boolean;
  readonly recall: boolean;
  readonly cycle: -1 | 0 | 1;
  readonly pause: boolean;
  /** Menu confirm (A) and cancel (B), for the end, bench and pause cards. */
  readonly confirm: boolean;
  readonly cancel: boolean;
};

const MOVE_DEADZONE = 0.25;
const AIM_DEADZONE = 0.35;
const AIM_FIRE_THRESHOLD = 0.9;
const TRIGGER_THRESHOLD = 0.4;
const AIM_REACH = 140;

const EMPTY: PadFrame = {
  active: false, moveX: 0, moveY: 0, aim: null, aiming: false, fire: false,
  dash: false, interact: false, steal: false, recall: false, cycle: 0, pause: false, confirm: false, cancel: false,
};

/** A stick vector with a radial deadzone, rescaled so it starts from zero. */
function stick(x: number, y: number, deadzone: number): { x: number; y: number; length: number } {
  const length = Math.hypot(x, y);
  if (length < deadzone) return { x: 0, y: 0, length: 0 };
  const scaled = Math.min(1, (length - deadzone) / (1 - deadzone));
  return { x: (x / length) * scaled, y: (y / length) * scaled, length: Math.min(1, length) };
}

export class GamepadReader {
  private previous: boolean[] = [];
  private aimDirection: { x: number; y: number } | null = null;

  public read(pad: PadSnapshot | null, player: { readonly x: number; readonly y: number }): PadFrame {
    if (!pad || !pad.connected) {
      this.previous = [];
      return { ...EMPTY, aim: this.aimAt(player) };
    }
    const down = (index: number): boolean => {
      const button = pad.buttons[index];
      return button !== undefined && (button.pressed || button.value > TRIGGER_THRESHOLD);
    };
    const pressed = (index: number): boolean => down(index) && !this.previous[index];

    const left = stick(pad.axes[0] ?? 0, pad.axes[1] ?? 0, MOVE_DEADZONE);
    const dpadX = Number(down(GAMEPAD_BUTTONS.dpadRight)) - Number(down(GAMEPAD_BUTTONS.dpadLeft));
    const dpadY = Number(down(GAMEPAD_BUTTONS.dpadDown)) - Number(down(GAMEPAD_BUTTONS.dpadUp));
    const moveX = dpadX !== 0 ? dpadX : left.x;
    const moveY = dpadY !== 0 ? dpadY : left.y;

    const right = stick(pad.axes[2] ?? 0, pad.axes[3] ?? 0, AIM_DEADZONE);
    const aiming = right.length > 0;
    if (aiming) {
      const length = Math.hypot(right.x, right.y) || 1;
      this.aimDirection = { x: right.x / length, y: right.y / length };
    }

    const frame: PadFrame = {
      active: left.length > 0 || aiming || dpadX !== 0 || dpadY !== 0 || pad.buttons.some((button) => button.pressed || button.value > TRIGGER_THRESHOLD),
      moveX,
      moveY,
      aim: this.aimAt(player),
      aiming,
      fire: down(GAMEPAD_BUTTONS.rightTrigger) || right.length >= AIM_FIRE_THRESHOLD,
      dash: pressed(GAMEPAD_BUTTONS.a) || pressed(GAMEPAD_BUTTONS.leftTrigger),
      interact: pressed(GAMEPAD_BUTTONS.x),
      steal: pressed(GAMEPAD_BUTTONS.y),
      recall: pressed(GAMEPAD_BUTTONS.b),
      cycle: pressed(GAMEPAD_BUTTONS.rightBumper) ? 1 : pressed(GAMEPAD_BUTTONS.leftBumper) ? -1 : 0,
      pause: pressed(GAMEPAD_BUTTONS.start),
      confirm: pressed(GAMEPAD_BUTTONS.a),
      cancel: pressed(GAMEPAD_BUTTONS.b),
    };
    this.previous = pad.buttons.map((_, index) => down(index));
    return frame;
  }

  private aimAt(player: { readonly x: number; readonly y: number }): { x: number; y: number } | null {
    if (!this.aimDirection) return null;
    return { x: player.x + this.aimDirection.x * AIM_REACH, y: player.y + this.aimDirection.y * AIM_REACH };
  }
}

/** The first connected pad from the browser, as a snapshot, or null. */
export function firstGamepad(): PadSnapshot | null {
  try {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (pad && pad.connected) return { connected: true, axes: [...pad.axes], buttons: pad.buttons.map((b) => ({ pressed: b.pressed, value: b.value })) };
    }
  } catch {
    // Gamepads blocked (permissions policy): keyboard and mouse only.
  }
  return null;
}
