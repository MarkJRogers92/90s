/**
 * The boss title card: walking into a boss room holds the fight for a beat
 * while letterbox bars close in, the camera leans toward the boss, and a
 * mall-directory plaque slides in with YOU ARE HERE, the floor and room, and
 * the boss's name stuttering on in neon. Timing and copy come from
 * `bossIntroModel`.
 *
 * A fresh key press or click (not a held movement key's auto-repeat) cuts
 * straight to the fade. Like the kill cam, the overlay is screen-fixed and
 * counter-scaled against the camera zoom so it stays put.
 */
import Phaser from 'phaser';
import type { BossKind } from '../../sim/combat/boss';
import { ensureNeonSign, ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import { ENEMY_TEXTURE_KEYS } from '../presentation/assets';
import { usableTextureKey } from '../presentation/assetFallback';
import { BOSS_INTRO_MS, BOSS_INTRO_SKIP_GRACE_MS, bossIntroCopy, bossIntroFrame, portraitCrop } from './bossIntroModel';
import { flashAllowed, gameSettings } from '../settings/settings';

const DEPTH = 20_640;
const W = 960;
const H = 600;
const PLATE_W = 600;
const PLATE_H = 150;
const PLATE_X = 36;
const PLATE_Y = H - PLATE_H - 84;
const FADE_MS = 380;
const BRASS = 0xc8a050;
/** The mugshot slot on the plaque's left, under the header rule. */
const PORTRAIT_X = 20;
const PORTRAIT_Y = 48;
const PORTRAIT_SIZE = 90;
/** Everything else sits to the right of the mugshot. */
const TEXT_LEFT = PORTRAIT_X + PORTRAIT_SIZE + 16;

const PORTRAIT_SHEETS: Readonly<Record<BossKind, string>> = {
  lp_manager: ENEMY_TEXTURE_KEYS.lpManagerIdle,
  manager: ENEMY_TEXTURE_KEYS.managerIdle,
  owner: ENEMY_TEXTURE_KEYS.ownerIdle,
  developer: ENEMY_TEXTURE_KEYS.developerIdle,
};

export class BossIntro {
  private readonly overlay: Phaser.GameObjects.Container;
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly plate: Phaser.GameObjects.Container;
  private readonly name: Phaser.GameObjects.Image[];
  private readonly dot: Phaser.GameObjects.Graphics;
  private elapsed = 0;
  private skipped = false;

  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly kind: BossKind,
    private readonly focus: { readonly x: number; readonly y: number },
    private readonly room: { readonly x: number; readonly y: number },
  ) {
    const copy = bossIntroCopy(kind);
    this.bars = scene.add.graphics();

    const board = scene.add.graphics();
    // A dark lacquered directory board with a brass frame and a header rule.
    board.fillStyle(0x0c0812, 0.94).fillRect(0, 0, PLATE_W, PLATE_H);
    board.lineStyle(4, BRASS, 1).strokeRect(2, 2, PLATE_W - 4, PLATE_H - 4);
    board.lineStyle(1, BRASS, 0.6).strokeRect(9, 9, PLATE_W - 18, PLATE_H - 18);
    board.fillStyle(BRASS, 0.8).fillRect(20, 38, PLATE_W - 40, 2);
    const header = scene.add.image(20, 18, ensurePixelLabel(scene, 'MALL DIRECTORY', '#c8a050', 2, '#0c0812').key).setOrigin(0, 0);
    const directory = scene.add.image(PLATE_W - 20, 18, ensurePixelLabel(scene, copy.directory, '#f4ecd0', 2, '#0c0812').key).setOrigin(1, 0);
    // YOU ARE HERE: the red dot every mall map has.
    this.dot = scene.add.graphics();
    const here = scene.add.image(TEXT_LEFT + 16, PLATE_H - 30, ensurePixelLabel(scene, 'YOU ARE HERE', '#ff5a6a', 1, '#0c0812').key).setOrigin(0, 0.5);
    const tagline = scene.add.image(PLATE_W - 20, PLATE_H - 30, ensurePixelLabel(scene, copy.tagline, '#ffd84a', 1, '#0c0812').key).setOrigin(1, 0.5);
    const sign = ensureNeonSign(scene, { text: copy.name, color: copy.color, scale: 4 });
    const nameCentre = (TEXT_LEFT + PLATE_W - 20) / 2;
    const signScale = Math.min(1, (PLATE_W - 20 - TEXT_LEFT) / sign.width);
    this.name = [
      scene.add.image(nameCentre, 80, sign.halo).setBlendMode(Phaser.BlendModes.ADD).setScale(signScale),
      scene.add.image(nameCentre, 80, sign.core).setScale(signScale),
    ];
    const portrait = this.buildPortrait(kind, board);
    this.plate = scene.add.container(PLATE_X, PLATE_Y, [board, header, directory, ...portrait, this.dot, here, tagline, ...this.name]);
    // A container's scroll factor does not reach its children unless asked, and
    // this card is drawn while the camera zooms and leans.
    this.plate.setScrollFactor(0, 0, true);
    this.overlay = scene.add.container(0, 0, [this.bars, this.plate]).setScrollFactor(0, 0, true).setDepth(DEPTH);

    window.addEventListener('keydown', this.onKey);
    scene.input.on('pointerdown', this.requestSkip);
    this.update(0);
  }

  /** Advances the card; returns true once it has finished or been skipped. */
  public update(elapsedMs: number): boolean {
    this.elapsed += Math.max(0, elapsedMs);
    const frame = bossIntroFrame(this.elapsed, flashAllowed(gameSettings().get()));
    const camera = this.scene.cameras.main;
    camera.setZoom(frame.zoom);
    const lean = (frame.zoom - 1) / 0.25;
    camera.centerOn(this.room.x + (this.focus.x - this.room.x) * lean * 0.6, this.room.y + (this.focus.y - 30 - this.room.y) * lean * 0.6);
    const z = frame.zoom;
    this.overlay.setScale(1 / z).setPosition((W / 2) * (z - 1) / z, (H / 2) * (z - 1) / z);

    const bars = this.bars.clear();
    if (frame.bars > 0) {
      bars.fillStyle(0x05030a, 1).fillRect(0, 0, W, frame.bars).fillRect(0, H - frame.bars, W, frame.bars);
      bars.fillStyle(BRASS, 0.8).fillRect(0, frame.bars, W, 2).fillRect(0, H - frame.bars - 2, W, 2);
    }
    this.plate.setX(PLATE_X - (PLATE_W + PLATE_X + 20) * (1 - frame.plate)).setAlpha(frame.plateAlpha);
    for (const image of this.name) image.setVisible(frame.nameLit);
    const pulse = 0.55 + 0.45 * Math.sin(this.elapsed / 120);
    this.dot.clear().fillStyle(0xff2a3a, pulse).fillCircle(TEXT_LEFT + 4, PLATE_H - 30, 6).lineStyle(2, 0xff2a3a, 0.4 * pulse).strokeCircle(TEXT_LEFT + 4, PLATE_H - 30, 10);
    return frame.done;
  }

  /**
   * The mugshot: a brass-framed slot with a dim red backdrop, holding a
   * head-and-shoulders crop of the boss's own south-facing idle frame. With
   * no sheet loaded the slot stays, empty but for a question mark.
   */
  private buildPortrait(kind: BossKind, board: Phaser.GameObjects.Graphics): Phaser.GameObjects.Image[] {
    board.fillStyle(0x2a0810, 1).fillRect(PORTRAIT_X, PORTRAIT_Y, PORTRAIT_SIZE, PORTRAIT_SIZE);
    board.fillStyle(0x4a1018, 0.8).fillRect(PORTRAIT_X, PORTRAIT_Y + PORTRAIT_SIZE * 0.55, PORTRAIT_SIZE, PORTRAIT_SIZE * 0.45);
    board.lineStyle(3, BRASS, 1).strokeRect(PORTRAIT_X - 2, PORTRAIT_Y - 2, PORTRAIT_SIZE + 4, PORTRAIT_SIZE + 4);
    const key = usableTextureKey(this.scene.textures, PORTRAIT_SHEETS[kind]);
    if (!key) {
      const unknown = ensurePixelLabel(this.scene, '?', '#c8a050', 5, '#2a0810');
      return [this.scene.add.image(PORTRAIT_X + PORTRAIT_SIZE / 2, PORTRAIT_Y + PORTRAIT_SIZE / 2, unknown.key)];
    }
    const source = this.scene.textures.get(key).getSourceImage() as { height: number };
    const crop = portraitCrop(source.height);
    const scale = PORTRAIT_SIZE / crop.size;
    // Crop the whole sheet rather than adding a named frame: the first frame
    // added to a single-frame texture becomes its default, and every boss
    // sprite made from the sheet afterwards would draw the mugshot.
    const image = this.scene.add.image(PORTRAIT_X - crop.x * scale, PORTRAIT_Y - crop.y * scale, key)
      .setOrigin(0, 0)
      .setScale(scale)
      .setCrop(crop.x, crop.y, crop.size, crop.size);
    return [image];
  }

  /** Jumps to the fade, once the grace after the doorway step has passed. */
  public readonly requestSkip = (): void => {
    if (this.elapsed < BOSS_INTRO_SKIP_GRACE_MS) return;
    if (this.elapsed < BOSS_INTRO_MS - FADE_MS) {
      // How long it was watched before the skip, for the playtest log.
      this.watchedMs = this.elapsed;
      this.skipped = true;
    }
    this.elapsed = Math.max(this.elapsed, BOSS_INTRO_MS - FADE_MS);
  };

  private watchedMs: number | null = null;

  /** How long the card was on screen before it was skipped or ended, and whether it was skipped. */
  public watched(): { readonly ms: number; readonly skipped: boolean } {
    return { ms: this.watchedMs ?? Math.min(this.elapsed, BOSS_INTRO_MS), skipped: this.skipped };
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    // A movement key held through the doorway auto-repeats; only a new press skips.
    if (!event.repeat) this.requestSkip();
  };

  public destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    this.scene.input.off('pointerdown', this.requestSkip);
    this.scene.cameras.main.setZoom(1);
    this.overlay.destroy(true);
  }
}
