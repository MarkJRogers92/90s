import Phaser from 'phaser';
import { RunScene } from './RunScene';

export class BootScene extends Phaser.Scene {
  public constructor() {
    super('BootScene');
  }

  public create(): void {
    this.scene.start(RunScene.KEY);
  }
}
