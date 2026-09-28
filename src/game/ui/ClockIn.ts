/**
 * The clock-in cold open: a break-room wall under a buzzing fluorescent tube,
 * the time clock, and Alex's card sliding up into the slot. KA-CHUNK: it
 * comes back out stamped, NIGHT SHIFT lights up, and the overlay fades off
 * the concourse. Timing comes from `clockInModel`.
 *
 * It does not hold the run (the opening concourse is calm), and it never
 * swallows input: the first key or click clears it and still reaches the game.
 */
import Phaser from 'phaser';
import { SCENE_TEXTURE_KEYS } from '../presentation/assets';
import { ensureNeonSign, ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import { PUNCH_AT_MS, SLOT_Y, clockInFrame, clockInTime, type ClockInFrame } from './clockInModel';

const DEPTH = 20_700;
const W = 960;
const H = 600;
const CARD_W = 88;
const CARD_H = 150;
const CARD_TEXTURE = 'clockin:card';
const CLOCK_SCALE = 2.5;
const SKIP_GRACE_MS = 300;

export class ClockIn {
  private readonly root: Phaser.GameObjects.Container;
  private readonly wall: Phaser.GameObjects.Graphics;
  private readonly clock: Phaser.GameObjects.Image | null;
  private readonly card: Phaser.GameObjects.Image;
  private readonly print: Phaser.GameObjects.Image[];
  private readonly stamp: Phaser.GameObjects.Image;
  private readonly title: Phaser.GameObjects.Image[];
  private readonly flash: Phaser.GameObjects.Graphics;
  private elapsed = 0;
  private skip = false;
  private punched = false;

  public constructor(private readonly scene: Phaser.Scene, seed: number, private readonly onPunch: () => void) {
    this.wall = scene.add.graphics();
    this.clock = scene.textures.exists(SCENE_TEXTURE_KEYS.timeClock)
      ? scene.add.image(W / 2, 270, SCENE_TEXTURE_KEYS.timeClock).setScale(CLOCK_SCALE)
      : null;
    this.ensureCardTexture();
    this.card = scene.add.image(W / 2 - CARD_W / 2, H, CARD_TEXTURE).setOrigin(0, 0);
    const name = ensurePixelLabel(scene, 'ALEX', '#1a0b2e', 2, '#f4ecd0');
    const dept = ensurePixelLabel(scene, 'JANITORIAL', '#4a3d62', 1, '#f4ecd0');
    // The card only has room for the minutes; the sign below gives the full time.
    const time = ensurePixelLabel(scene, clockInTime(seed).replace(' PM', ''), '#d0182a', 2, '#f4ecd0');
    this.print = [scene.add.image(W / 2, 0, name.key), scene.add.image(W / 2, 0, dept.key)];
    this.stamp = scene.add.image(W / 2, 0, time.key).setRotation(-0.08);
    const sign = ensureNeonSign(scene, { text: 'NIGHT SHIFT', color: '#ff3fc8', scale: 5, subtitle: `DEAD MALL - CLOCKED IN ${clockInTime(seed)}`, subtitleColor: '#3ff0ff' });
    this.title = [
      scene.add.image(W / 2, 522, sign.halo).setBlendMode(Phaser.BlendModes.ADD),
      scene.add.image(W / 2, 522, sign.core),
    ];
    const notice = ensurePixelLabel(scene, 'ALL EMPLOYEES MUST CLOCK IN', '#c8b8e0', 1, '#10141a');
    const noticeImage = scene.add.image(W / 2, 46, notice.key);
    this.flash = scene.add.graphics();
    this.root = scene.add
      .container(0, 0, [this.wall, noticeImage, ...(this.clock ? [this.clock] : []), this.card, ...this.print, this.stamp, ...this.title, this.flash])
      .setScrollFactor(0)
      .setDepth(DEPTH);
    window.addEventListener('keydown', this.requestSkip);
    scene.input.on('pointerdown', this.requestSkip);
    this.draw(clockInFrame(0));
  }

  /** Advances the cold open; returns true once it is over or cleared. */
  public update(elapsedMs: number): boolean {
    this.elapsed += Math.max(0, elapsedMs);
    const frame = clockInFrame(this.elapsed);
    this.draw(frame);
    if (!this.punched && frame.stamped) {
      this.punched = true;
      this.onPunch();
    }
    return frame.done || this.skip;
  }

  public readonly requestSkip = (): void => {
    if (this.elapsed >= SKIP_GRACE_MS) this.skip = true;
  };

  public destroy(): void {
    window.removeEventListener('keydown', this.requestSkip);
    this.scene.input.off('pointerdown', this.requestSkip);
    this.root.destroy(true);
  }

  /** A cream time card: a red header band and ruled rows. */
  private ensureCardTexture(): void {
    if (this.scene.textures.exists(CARD_TEXTURE)) return;
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xf4ecd0, 1).fillRect(0, 0, CARD_W, CARD_H);
    g.fillStyle(0xd0182a, 1).fillRect(0, 0, CARD_W, 14);
    g.lineStyle(1, 0xc8bca0, 1);
    for (let y = 26; y < CARD_H; y += 12) g.lineBetween(4, y, CARD_W - 4, y);
    g.lineBetween(30, 20, 30, CARD_H - 4);
    g.lineStyle(2, 0x8a7a5a, 1).strokeRect(1, 1, CARD_W - 2, CARD_H - 2);
    g.generateTexture(CARD_TEXTURE, CARD_W, CARD_H);
    g.destroy();
  }

  private draw(frame: ClockInFrame): void {
    this.drawWall();
    const shake = frame.jolt * 4 * (Math.floor(this.elapsed / 30) % 2 === 0 ? 1 : -1);
    this.clock?.setPosition(W / 2 + shake, 270);
    // The card is only visible below the slot: crop what is inside the clock.
    const top = Math.round(frame.cardY);
    const hidden = Math.max(0, Math.min(CARD_H, SLOT_Y - top));
    this.card.setPosition(W / 2 - CARD_W / 2 + shake, top).setCrop(0, hidden, CARD_W, CARD_H - hidden);
    // The printing shows once the stamped card is on its way back out.
    const out = frame.stamped && this.elapsed > PUNCH_AT_MS + 250;
    this.print[0]?.setPosition(W / 2, top + 70).setVisible(out);
    this.print[1]?.setPosition(W / 2, top + 88).setVisible(out);
    this.stamp.setPosition(W / 2, top + 122).setVisible(out);
    for (const image of this.title) image.setAlpha(frame.titleAlpha);
    this.flash.clear().fillStyle(0xffffff, 0.3 * frame.jolt).fillRect(0, 0, W, H);
    this.root.setAlpha(frame.alpha);
  }

  /** Tiled break-room wall under a flickering fluorescent tube. */
  private drawWall(): void {
    const g = this.wall.clear();
    g.fillStyle(0x10141a, 1).fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 32) for (let x = (y / 32) % 2 === 0 ? 0 : 16; x < W; x += 32) g.fillStyle(0x161c24, 1).fillRect(x, y, 30, 30);
    g.fillStyle(0x0a0d12, 1).fillRect(0, H - 40, W, 40);
    // The tube buzzes: mostly on, with the odd stutter.
    const t = this.elapsed / 1000;
    const on = Math.sin(t * 37) > -0.92 && !(t > 0.35 && t < 0.42);
    g.fillStyle(0x2a3038, 1).fillRect(W / 2 - 170, 12, 340, 14);
    g.fillStyle(on ? 0xe8fff4 : 0x5a6a66, 1).fillRect(W / 2 - 160, 16, 320, 6);
    if (on) g.fillStyle(0xc8fff0, 0.06).fillTriangle(W / 2 - 160, 22, W / 2 + 160, 22, W / 2 + 420, H).fillTriangle(W / 2 - 160, 22, W / 2 - 420, H, W / 2 + 420, H);
  }
}
