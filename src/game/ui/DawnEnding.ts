/**
 * The ending after the Mall Manager: the mall's sliding doors part on the
 * parking lot at sunrise and the janitor walks out into it, smaller and
 * darker against the light, while SHIFT COMPLETE and two more lines come up.
 * Timing comes from `dawnEndingModel`; the shift is already won. Any key,
 * click or pad button skips it after a short grace.
 */
import Phaser from 'phaser';
import { PLAYER_TEXTURE_KEYS, SCENE_TEXTURE_KEYS } from '../presentation/assets';
import { ensureNeonSign, ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import { croppedFrameOrigin } from '../view/ActorSpriteView';
import { DAWN_LINES, ENDING_MS, endingFrame, endingSkippable, type EndingFrame } from './dawnEndingModel';

// Under the end card (20 600), which opens over the last shot.
const DEPTH = 20_500;
const W = 960;
const H = 600;
/** Row of the walk sheet that faces away from the camera. */
const NORTH_ROW = 4;

export class DawnEnding {
  private readonly root: Phaser.GameObjects.Container;
  private readonly back: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly doors: Phaser.GameObjects.Graphics;
  private readonly walker: Phaser.GameObjects.Image | null;
  private readonly lines: Phaser.GameObjects.Image[][];
  private readonly hint: Phaser.GameObjects.Image;
  private readonly curtain: Phaser.GameObjects.Graphics;
  private elapsed = 0;
  private skip = false;

  public constructor(private readonly scene: Phaser.Scene) {
    this.back = scene.add.graphics().fillStyle(0x07050c, 1).fillRect(0, 0, W, H);
    const parts: Phaser.GameObjects.GameObject[] = [this.back];
    if (scene.textures.exists(SCENE_TEXTURE_KEYS.dawnExit)) {
      const art = scene.add.image(W / 2, H / 2, SCENE_TEXTURE_KEYS.dawnExit);
      // Cover the stage; the sides of the wide illustration may crop.
      art.setScale(Math.max(W / art.width, H / art.height));
      parts.push(art);
    }
    this.glow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.walker = this.makeWalker();
    this.doors = scene.add.graphics();
    const title = ensureNeonSign(scene, { text: DAWN_LINES[0], color: '#ffd84a', scale: 5 });
    const thanks = ensurePixelLabel(scene, DAWN_LINES[1], '#fff4d6', 2, '#1a0b2e');
    const hours = ensurePixelLabel(scene, DAWN_LINES[2], '#ff3fc8', 1, '#1a0b2e');
    this.lines = [
      [scene.add.image(W / 2, 74, title.halo).setBlendMode(Phaser.BlendModes.ADD), scene.add.image(W / 2, 74, title.core)],
      [scene.add.image(W / 2, 128, thanks.key)],
      [scene.add.image(W / 2, 156, hours.key)],
    ];
    const hint = ensurePixelLabel(scene, 'ANY KEY: SKIP', '#8a7aa8', 1, '#05030a');
    this.hint = scene.add.image(W - 16, H - 14, hint.key).setOrigin(1, 1);
    this.curtain = scene.add.graphics();
    this.root = scene.add
      .container(0, 0, [...parts, this.glow, this.doors, ...(this.walker ? [this.walker] : []), ...this.lines.flat(), this.hint, this.curtain])
      .setScrollFactor(0)
      .setDepth(DEPTH);
    window.addEventListener('keydown', this.requestSkip);
    scene.input.on('pointerdown', this.requestSkip);
    this.draw(endingFrame(0));
  }

  /** Advances the ending; returns true once it has finished or been skipped. */
  public update(elapsedMs: number): boolean {
    // A skip jumps straight to the held last shot.
    this.elapsed = this.skip ? Math.max(this.elapsed, ENDING_MS) : this.elapsed + Math.max(0, elapsedMs);
    const frame = endingFrame(this.elapsed);
    this.draw(frame);
    if (frame.done) this.hint.setAlpha(0);
    return frame.done;
  }

  public readonly requestSkip = (): void => {
    if (endingSkippable(this.elapsed)) this.skip = true;
  };

  public destroy(): void {
    window.removeEventListener('keydown', this.requestSkip);
    this.scene.input.off('pointerdown', this.requestSkip);
    this.root.destroy(true);
  }

  private makeWalker(): Phaser.GameObjects.Image | null {
    const key = PLAYER_TEXTURE_KEYS.walk;
    if (!this.scene.textures.exists(key)) return null;
    // Keep gameplay's default frame intact; draw() crops and anchors each step.
    return this.scene.add.image(0, 0, key, '__BASE');
  }

  private draw(frame: EndingFrame): void {
    this.glow.clear();
    // The sunrise pooling on the floor inside the doorway, and haze over the lot.
    // Layered ellipses, widest faintest, so the light falls off softly.
    for (let layer = 0; layer < 6; layer += 1) {
      const k = 1 - layer / 6;
      this.glow.fillStyle(0xffb060, 0.05 * frame.glow).fillEllipse(W / 2, 500, 200 + 380 * k, 60 + 110 * k);
      this.glow.fillStyle(0xffd8a0, 0.035 * frame.glow).fillEllipse(W / 2, 290, 180 + 360 * k, 70 + 130 * k);
    }
    if (this.walker) {
      const { x, y, scale, silhouette, frame: step } = frame.walker;
      const shade = Math.round(255 - (255 - 40) * silhouette);
      const origin = croppedFrameOrigin({ row: NORTH_ROW, column: step }, this.walker, { width: 64, height: 64 }, 64 * 0.9);
      this.walker
        .setCrop(step * 64, NORTH_ROW * 64, 64, 64)
        .setOrigin(origin.x, origin.y)
        .setPosition(Math.round(x), Math.round(y))
        .setScale(scale)
        .setTint(Phaser.Display.Color.GetColor(shade, Math.round(shade * 0.85), Math.round(shade * 0.9)));
    }
    this.drawDoors(frame.doors);
    frame.lines.forEach((alpha, index) => this.lines[index]?.forEach((image) => image.setAlpha(alpha)));
    this.hint.setAlpha(endingSkippable(this.elapsed) ? 0.8 : 0);
    this.curtain.clear().fillStyle(0x07050c, frame.fade).fillRect(0, 0, W, H);
  }

  /** The mall's glass sliding doors, parting from the middle. */
  private drawDoors(open: number): void {
    const g = this.doors.clear();
    const slide = (W / 2) * open;
    for (const side of [-1, 1] as const) {
      const inner = W / 2 + side * slide;
      const outer = side < 0 ? inner - W / 2 : inner + W / 2;
      const x = Math.min(inner, outer);
      g.fillStyle(0x2a1f3a, 0.55).fillRect(x, 0, W / 2, H);
      g.fillStyle(0x0d0916, 1).fillRect(x, 0, W / 2, 26).fillRect(x, H - 40, W / 2, 40);
      g.fillStyle(0x0d0916, 1).fillRect(inner - (side < 0 ? 14 : 0), 0, 14, H);
      g.lineStyle(2, 0x3ff0ff, 0.7).lineBetween(inner, 0, inner, H);
      // A handle bar and a reflection streak on each pane.
      g.fillStyle(0xc0b8d8, 1).fillRect(inner - side * 40 - 3, 250, 6, 110);
      g.fillStyle(0xffffff, 0.08).fillPoints([
        new Phaser.Math.Vector2(x + 60, 0), new Phaser.Math.Vector2(x + 120, 0),
        new Phaser.Math.Vector2(x + 20, H), new Phaser.Math.Vector2(x - 40, H),
      ], true);
    }
  }
}
