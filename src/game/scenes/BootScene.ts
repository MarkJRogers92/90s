import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  public constructor() {
    super('BootScene');
  }

  public create(): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x252926, 1);
    graphics.fillRect(0, 0, 960, 480);

    graphics.fillStyle(0xb9ae82, 1);
    graphics.fillRect(24, 24, 912, 432);
    graphics.fillStyle(0x4d5147, 1);
    graphics.fillRect(34, 34, 892, 412);
    graphics.fillStyle(0x8d8974, 1);
    graphics.fillRect(44, 44, 872, 392);

    for (let x = 44; x < 916; x += 32) {
      graphics.lineStyle(1, 0x777361, 0.5);
      graphics.lineBetween(x, 44, x, 436);
    }
    for (let y = 44; y < 436; y += 32) {
      graphics.lineStyle(1, 0x777361, 0.5);
      graphics.lineBetween(44, y, 916, y);
    }

    this.add
      .text(480, 214, 'NIGHT SHIFT INITIALIZED', {
        color: '#f6d365',
        fontFamily: '"Courier New", monospace',
        fontSize: '28px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(480, 254, 'Combat room wiring follows in M1', {
        color: '#20231e',
        fontFamily: '"Courier New", monospace',
        fontSize: '16px',
      })
      .setOrigin(0.5);
  }
}
