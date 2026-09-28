/**
 * The pink slip: when the janitor dies, a Notice of Termination flutters down
 * over the fallen shift, takes a red FIRED stamp, then drops away for the
 * SHIFT OVER card. Timing and copy come from `pinkSlipModel`; the shift is
 * already over, so this is presentation only. Any key or click skips it.
 */
import Phaser from 'phaser';
import { ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import { PINK_SLIP_MS, SLIP_SKIP_GRACE_MS, SLIP_STAMP_AT_MS, pinkSlipFrame } from './pinkSlipModel';

const DEPTH = 20_650;
const W = 960;
const H = 600;
const SLIP_W = 400;
const SLIP_H = 260;
const PAPER = '#ffb8d2';
const INK = '#5a0a24';
const FALL_AT_MS = 900;

export class PinkSlip {
  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly slip: Phaser.GameObjects.Container;
  private readonly stamp: Phaser.GameObjects.Container;
  private readonly root: Phaser.GameObjects.Container;
  private elapsed = 0;
  private skip = false;
  private fell = false;
  private stamped = false;

  public constructor(
    private readonly scene: Phaser.Scene,
    reason: string,
    private readonly sounds: { readonly fall: () => void; readonly stamp: () => void },
  ) {
    this.dim = scene.add.graphics();
    const paper = scene.add.graphics();
    const left = -SLIP_W / 2;
    const top = -SLIP_H / 2;
    paper.fillStyle(0x05030a, 0.45).fillRect(left + 8, top + 10, SLIP_W, SLIP_H);
    paper.fillStyle(0xffb8d2, 1).fillRect(left, top, SLIP_W, SLIP_H);
    // Torn perforations along the top, like a form ripped off the pad.
    for (let x = left + 8; x < left + SLIP_W; x += 14) paper.fillStyle(0xd88aa8, 1).fillCircle(x, top + 6, 2);
    paper.fillStyle(0xe890b0, 1).fillRect(left, top + 14, SLIP_W, 2);
    paper.lineStyle(1, 0xe890b0, 1);
    for (const y of [82, 106, 130, 170, 194]) paper.lineBetween(left + 24, top + y + 10, left + SLIP_W - 24, top + y + 10);
    // Management's signature: a confident, illegible scrawl.
    paper.lineStyle(2, 0x1a1a5a, 1).beginPath();
    for (let i = 0; i <= 24; i += 1) {
      const x = left + 220 + i * 6;
      const y = top + 218 + Math.sin(i * 1.3) * 7 - (i % 5 === 0 ? 6 : 0);
      if (i === 0) paper.moveTo(x, y);
      else paper.lineTo(x, y);
    }
    paper.strokePath();
    const text = (content: string, x: number, y: number, scale: number, color = INK) =>
      scene.add.image(left + x, top + y, ensurePixelLabel(scene, content, color, scale, PAPER).key).setOrigin(0, 0.5);
    this.stamp = this.makeStamp();
    this.slip = scene.add.container(W / 2, -300, [
      paper,
      scene.add.image(0, top + 44, ensurePixelLabel(scene, 'NOTICE OF TERMINATION', '#b0103a', 2, PAPER).key),
      text('EMPLOYEE:  ALEX', 28, 84, 1),
      text('DEPT:  JANITORIAL - NIGHTS', 28, 108, 1),
      text('REASON:', 28, 132, 1),
      text(reason, 40, 152, 1, '#1a1a5a'),
      text('EFFECTIVE:  IMMEDIATELY', 28, 196, 1),
      text('- THE MANAGEMENT', 220, 240, 1, '#4a3d62'),
      this.stamp,
    ]);
    this.root = scene.add.container(0, 0, [this.dim, this.slip]).setScrollFactor(0).setDepth(DEPTH);
    window.addEventListener('keydown', this.requestSkip);
    scene.input.on('pointerdown', this.requestSkip);
    this.draw();
  }

  /** Advances the slip; returns true once it has gone (or been skipped). */
  public update(elapsedMs: number): boolean {
    this.elapsed = this.skip ? PINK_SLIP_MS : this.elapsed + Math.max(0, elapsedMs);
    if (!this.fell && this.elapsed >= FALL_AT_MS && !this.skip) {
      this.fell = true;
      this.sounds.fall();
    }
    if (!this.stamped && this.elapsed >= SLIP_STAMP_AT_MS && !this.skip) {
      this.stamped = true;
      this.sounds.stamp();
    }
    this.draw();
    return pinkSlipFrame(this.elapsed).done;
  }

  public readonly requestSkip = (): void => {
    if (this.elapsed >= SLIP_SKIP_GRACE_MS) this.skip = true;
  };

  public destroy(): void {
    window.removeEventListener('keydown', this.requestSkip);
    this.scene.input.off('pointerdown', this.requestSkip);
    this.root.destroy(true);
  }

  private makeStamp(): Phaser.GameObjects.Container {
    const label = ensurePixelLabel(this.scene, 'FIRED', '#e0102a', 4, PAPER);
    const word = this.scene.add.image(0, 0, label.key);
    const ring = this.scene.add.graphics();
    const w = word.width + 28;
    const h = word.height + 20;
    ring.lineStyle(4, 0xe0102a, 0.95).strokeRect(-w / 2, -h / 2, w, h);
    return this.scene.add.container(110, 40, [ring, word]).setRotation(-0.3).setAlpha(0);
  }

  private draw(): void {
    const frame = pinkSlipFrame(this.elapsed);
    this.slip.setPosition(W / 2, frame.y).setRotation(frame.rotation);
    this.stamp.setAlpha(frame.stampAlpha).setScale(frame.stampScale);
    // The fallen shift dims behind the slip while it is in view.
    const presence = Math.max(0, Math.min(1, (frame.y + 150) / 450)) * (frame.y > H ? 0 : 1);
    this.dim.clear().fillStyle(0x05030a, 0.45 * presence).fillRect(0, 0, W, H);
  }
}
