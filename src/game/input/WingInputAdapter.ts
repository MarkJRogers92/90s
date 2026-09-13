import Phaser from 'phaser';
import type { WingInputFrame } from '../../sim/shop/tickWingRun';

type WingMovementKeys = {
  up: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  interact: Phaser.Input.Keyboard.Key;
  steal: Phaser.Input.Keyboard.Key;
};

export class WingInputAdapter {
  private readonly scene: Phaser.Scene;
  private readonly keys: WingMovementKeys;
  private readonly onPauseToggle: () => void;
  private readonly onBlurPause: () => void;
  private pendingInteract = false;
  private pendingSteal = false;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }
    if (event.code === 'KeyE') {
      this.pendingInteract = true;
    } else if (event.code === 'KeyF') {
      this.pendingSteal = true;
    } else if (event.code === 'Escape') {
      event.preventDefault();
      this.clearHeld();
      this.onPauseToggle();
    }
  };

  private readonly handleBlur = (): void => {
    this.clearHeld();
    this.onBlurPause();
  };

  public constructor(
    scene: Phaser.Scene,
    onPauseToggle: () => void,
    onBlurPause: () => void,
  ) {
    this.scene = scene;
    this.onPauseToggle = onPauseToggle;
    this.onBlurPause = onBlurPause;

    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }
    this.keys = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      interact: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      steal: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F),
    };

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('blur', this.handleBlur);
  }

  public readFrame(): WingInputFrame {
    const frame = {
      moveX: Number(this.keys.right.isDown) - Number(this.keys.left.isDown),
      moveY: Number(this.keys.down.isDown) - Number(this.keys.up.isDown),
      interact: this.keys.interact.isDown || this.pendingInteract,
      steal: this.keys.steal.isDown || this.pendingSteal,
    };
    this.pendingInteract = false;
    this.pendingSteal = false;
    return frame;
  }

  public clearHeld(): void {
    this.keys.up.reset();
    this.keys.left.reset();
    this.keys.down.reset();
    this.keys.right.reset();
    this.keys.interact.reset();
    this.keys.steal.reset();
    this.pendingInteract = false;
    this.pendingSteal = false;
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('blur', this.handleBlur);
    this.clearHeld();
  }
}
