import Phaser from 'phaser';
import type { InputFrame } from '../../sim/model';

type MovementKeys = {
  up: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
};

export class InputAdapter {
  private readonly scene: Phaser.Scene;
  private readonly keys: MovementKeys;
  private readonly onPauseToggle: () => void;
  private readonly onBlurPause: () => void;
  private pointerHeld = false;

  private readonly handlePointerDown = (): void => {
    this.pointerHeld = true;
  };

  private readonly handlePointerUp = (): void => {
    this.pointerHeld = false;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Escape' || event.repeat) {
      return;
    }
    event.preventDefault();
    this.clearHeld();
    this.onPauseToggle();
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
    };

    scene.input.on('pointerdown', this.handlePointerDown);
    scene.input.on('pointerup', this.handlePointerUp);
    scene.input.on('pointerupoutside', this.handlePointerUp);
    scene.input.on('gameout', this.handlePointerUp);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('blur', this.handleBlur);
  }

  public readFrame(): InputFrame {
    const pointer = this.scene.input.activePointer;
    const worldPosition = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
    return {
      moveX: Number(this.keys.right.isDown) - Number(this.keys.left.isDown),
      moveY: Number(this.keys.down.isDown) - Number(this.keys.up.isDown),
      aimX: worldPosition.x,
      aimY: worldPosition.y,
      fire: this.pointerHeld,
    };
  }

  public clearHeld(): void {
    this.pointerHeld = false;
    this.keys.up.reset();
    this.keys.left.reset();
    this.keys.down.reset();
    this.keys.right.reset();
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
