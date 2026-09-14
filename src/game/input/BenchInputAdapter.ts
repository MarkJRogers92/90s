import Phaser from 'phaser';
import type { BenchInputFrame } from '../../sim/bench/types';

type BenchMovementKeys = {
  up: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  interact: Phaser.Input.Keyboard.Key;
  recall: Phaser.Input.Keyboard.Key;
};

export class BenchInputAdapter {
  private readonly scene: Phaser.Scene;
  private readonly keys: BenchMovementKeys;
  private readonly onEscape: () => void;
  private readonly onBlurPause: () => void;
  private pointerHeld = false;
  private pendingInteract = false;
  private pendingRecall = false;

  private readonly handlePointerDown = (): void => {
    this.pointerHeld = true;
  };

  private readonly handlePointerUp = (): void => {
    this.pointerHeld = false;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }
    if (event.code === 'KeyE') {
      this.pendingInteract = true;
    } else if (event.code === 'KeyR') {
      this.pendingRecall = true;
    } else if (event.code === 'Escape') {
      event.preventDefault();
      this.clearHeld();
      this.onEscape();
    }
  };

  private readonly handleBlur = (): void => {
    this.clearHeld();
    this.onBlurPause();
  };

  public constructor(scene: Phaser.Scene, onEscape: () => void, onBlurPause: () => void) {
    this.scene = scene;
    this.onEscape = onEscape;
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
      recall: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R),
    };

    scene.input.on('pointerdown', this.handlePointerDown);
    scene.input.on('pointerup', this.handlePointerUp);
    scene.input.on('pointerupoutside', this.handlePointerUp);
    scene.input.on('gameout', this.handlePointerUp);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('blur', this.handleBlur);
  }

  public readFrame(): BenchInputFrame {
    const pointer = this.scene.input.activePointer;
    const worldPosition = pointer.positionToCamera(
      this.scene.cameras.main,
    ) as Phaser.Math.Vector2;
    const frame: BenchInputFrame = {
      moveX: Number(this.keys.right.isDown) - Number(this.keys.left.isDown),
      moveY: Number(this.keys.down.isDown) - Number(this.keys.up.isDown),
      aimX: worldPosition.x,
      aimY: worldPosition.y,
      fire: this.pointerHeld,
      interact: this.keys.interact.isDown || this.pendingInteract,
      recall: this.keys.recall.isDown || this.pendingRecall,
    };
    this.pendingInteract = false;
    this.pendingRecall = false;
    return frame;
  }

  public clearHeld(): void {
    this.pointerHeld = false;
    this.keys.up.reset();
    this.keys.left.reset();
    this.keys.down.reset();
    this.keys.right.reset();
    this.keys.interact.reset();
    this.keys.recall.reset();
    this.pendingInteract = false;
    this.pendingRecall = false;
  }

  public destroy(): void {
    this.scene.input.off('pointerdown', this.handlePointerDown);
    this.scene.input.off('pointerup', this.handlePointerUp);
    this.scene.input.off('pointerupoutside', this.handlePointerUp);
    this.scene.input.off('gameout', this.handlePointerUp);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('blur', this.handleBlur);
    this.clearHeld();
  }
}
