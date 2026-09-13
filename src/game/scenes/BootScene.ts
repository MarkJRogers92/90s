import Phaser from 'phaser';
import { RunScene } from './RunScene';
import { WingScene } from './WingScene';

export class BootScene extends Phaser.Scene {
  public constructor() {
    super('BootScene');
  }

  public create(): void {
    if (document.body.dataset.mode === 'shop') {
      this.scene.start(WingScene.KEY);
      return;
    }
    this.scene.start(RunScene.KEY);
  }
}
