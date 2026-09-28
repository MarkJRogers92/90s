/**
 * The in-canvas pause card: a neon PAUSED sign, the controls, and how to get
 * back in. Before this the only sign of a pause was one line of DOM text above
 * the canvas while the mall sat frozen. Drawn on real time (the sim clock is
 * held while paused).
 */
import Phaser from 'phaser';
import { ensureNeonSign, ensurePixelLabel } from '../presentation/neon/proceduralTextures';

const DEPTH = 20_550;
const W = 960;
const H = 600;
const CARD_W = 420;
const CARD_H = 358;
const CARD_X = (W - CARD_W) / 2;
const CARD_Y = (H - CARD_H) / 2;

export const PAUSE_CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ['WASD', 'MOVE'],
  ['CLICK', 'ATTACK'],
  ['SPACE', 'DASH'],
  ['E / F', 'BUY / STEAL'],
  ['1-9 Q', 'SWITCH WEAPON'],
  ['M / N', 'SOUND / MUSIC'],
  ['O', 'SETTINGS'],
];

export class PauseCard {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly images: Phaser.GameObjects.Image[] = [];
  private openedAt: number | null = null;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.g = scene.add.graphics();
    this.root = scene.add.container(0, 0, [this.g]).setScrollFactor(0).setDepth(DEPTH).setVisible(false);
  }

  private image(index: number, key: string, x: number, y: number, originX = 0.5): Phaser.GameObjects.Image {
    let image = this.images[index];
    if (!image) {
      image = this.scene.add.image(0, 0, key);
      this.images[index] = image;
      this.root.add(image);
    }
    if (image.texture.key !== key) image.setTexture(key);
    return image.setOrigin(originX, 0.5).setPosition(Math.round(x), Math.round(y)).setVisible(true).setAlpha(1).setBlendMode(Phaser.BlendModes.NORMAL);
  }

  public sync(paused: boolean): void {
    if (!paused) {
      this.openedAt = null;
      this.root.setVisible(false);
      return;
    }
    const now = this.scene.time.now;
    if (this.openedAt === null) this.openedAt = now;
    const ease = Math.min(1, (now - this.openedAt) / 160);
    this.root.setVisible(true);
    const g = this.g;
    g.clear();
    g.fillStyle(0x05030a, 0.6 * ease).fillRect(0, 0, W, H);
    g.fillStyle(0x0b0714, 0.95 * ease).fillRect(CARD_X, CARD_Y, CARD_W, CARD_H);
    g.lineStyle(3, 0xff3fc8, ease).strokeRect(CARD_X + 1, CARD_Y + 1, CARD_W - 2, CARD_H - 2);
    g.lineStyle(1, 0xff3fc8, 0.4 * ease).strokeRect(CARD_X + 7, CARD_Y + 7, CARD_W - 14, CARD_H - 14);
    let slot = 0;
    const sign = ensureNeonSign(this.scene, { text: 'PAUSED', color: '#ff3fc8', scale: 5 });
    // A slow neon breathe while the mall waits.
    const breathe = 0.75 + 0.25 * Math.sin(now / 400);
    this.image(slot++, sign.halo, W / 2, CARD_Y + 52).setBlendMode(Phaser.BlendModes.ADD).setAlpha(ease * breathe);
    this.image(slot++, sign.core, W / 2, CARD_Y + 52).setAlpha(ease);
    PAUSE_CONTROLS.forEach(([key, action], index) => {
      const y = CARD_Y + 108 + index * 28;
      this.image(slot++, ensurePixelLabel(this.scene, key, '#ffd84a', 2).key, W / 2 - 16, y, 1).setAlpha(ease);
      this.image(slot++, ensurePixelLabel(this.scene, action, '#f4ecff', 2).key, W / 2 + 8, y, 0).setAlpha(ease);
    });
    const blink = Math.floor(now / 500) % 2 === 0 ? 1 : 0.55;
    this.image(slot++, ensurePixelLabel(this.scene, 'ESC  TO RESUME', '#3ff0ff', 2).key, W / 2, CARD_Y + CARD_H - 34).setAlpha(ease * blink);
    for (let i = slot; i < this.images.length; i += 1) this.images[i]!.setVisible(false);
  }

  public destroy(): void {
    this.root.destroy(true);
  }
}
