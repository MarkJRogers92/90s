/**
 * The in-canvas Bench Warrant card. Draws `buildBenchCardModel` — the two
 * ingredients with their icons, what they become, what changes (before →
 * after), the fee against your cash, the permanence warning — with FUSE
 * (Enter) and CANCEL (Esc) buttons. The preview holds the sim clock, so the
 * card animates on real time. The DOM bench panel stays for assistive tech.
 */
import Phaser from 'phaser';
import type { MvpRunState } from '../../sim/run/types';
import { itemIconKey } from '../presentation/assets';
import { usableTextureKey } from '../presentation/assetFallback';
import { ensureNeonSign, ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import { buildBenchCardModel, type BenchCardModel } from './benchCardModel';

const DEPTH = 20_580;
const W = 960;
const H = 600;
const CARD_W = 640;
const CARD_H = 430;
const CARD_X = (W - CARD_W) / 2;
const CARD_Y = (H - CARD_H) / 2;
const GREEN = 0x6aff8a;

export type BenchCardAction = 'fuse' | 'cancel';
type Rect = { x: number; y: number; w: number; h: number; action: BenchCardAction };

export class BenchCard {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly images: Phaser.GameObjects.Image[] = [];
  private openedAt: number | null = null;
  private buttons: Rect[] = [];
  private hovered: BenchCardAction | null = null;
  private model: BenchCardModel | null = null;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.g = scene.add.graphics();
    this.root = scene.add.container(0, 0, [this.g]).setScrollFactor(0).setDepth(DEPTH).setVisible(false);
  }

  public get open(): boolean {
    return this.model !== null;
  }

  public get canFuse(): boolean {
    return this.model?.affordable === true;
  }

  public buttonAt(x: number, y: number): BenchCardAction | null {
    if (!this.root.visible) return null;
    const hit = this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (hit?.action === 'fuse' && !this.canFuse) return null;
    return hit?.action ?? null;
  }

  public hover(x: number, y: number): void {
    this.hovered = this.buttonAt(x, y);
  }

  private image(index: number, key: string, x: number, y: number, originX = 0.5): Phaser.GameObjects.Image {
    let image = this.images[index];
    if (!image) {
      image = this.scene.add.image(0, 0, key);
      this.images[index] = image;
      this.root.add(image);
    }
    if (image.texture.key !== key) image.setTexture(key);
    return image.setOrigin(originX, 0.5).setPosition(Math.round(x), Math.round(y)).setVisible(true).setAlpha(1).setScale(1).setBlendMode(Phaser.BlendModes.NORMAL);
  }

  private label(index: number, text: string, color: string, x: number, y: number, scale = 2, originX = 0.5): Phaser.GameObjects.Image {
    return this.image(index, ensurePixelLabel(this.scene, text, color, scale).key, x, y, originX);
  }

  public sync(state: MvpRunState): void {
    this.model = buildBenchCardModel(state);
    if (!this.model) {
      this.openedAt = null;
      this.buttons = [];
      this.root.setVisible(false);
      return;
    }
    const now = this.scene.time.now;
    if (this.openedAt === null) this.openedAt = now;
    this.root.setVisible(true);
    this.draw(this.model, Math.min(1, (now - this.openedAt) / 180), now);
  }

  private iconWell(slot: number, itemDefinitionId: string, x: number, y: number, edge: number): number {
    const g = this.g;
    g.fillStyle(0x140d22, 1).fillRect(x, y, 84, 84);
    g.lineStyle(2, edge, 1).strokeRect(x + 1, y + 1, 82, 82);
    const key = itemIconKey(itemDefinitionId);
    const usable = key ? usableTextureKey(this.scene.textures, key) : null;
    if (!usable) return slot;
    const icon = this.image(slot, usable, x + 42, y + 42);
    icon.setScale(66 / (Math.max(icon.width, icon.height) || 1));
    return slot + 1;
  }

  private draw(model: BenchCardModel, ease: number, now: number): void {
    const g = this.g;
    g.clear();
    for (const image of this.images) image.setVisible(false);
    const oy = Math.round((1 - ease) * 24);
    const top = CARD_Y + oy;
    g.fillStyle(0x05030a, 0.66 * ease).fillRect(0, 0, W, H);
    g.fillStyle(0x0b0714, 0.97).fillRect(CARD_X, top, CARD_W, CARD_H);
    g.lineStyle(3, GREEN, 1).strokeRect(CARD_X + 1, top + 1, CARD_W - 2, CARD_H - 2);
    g.lineStyle(1, GREEN, 0.4).strokeRect(CARD_X + 7, top + 7, CARD_W - 14, CARD_H - 14);

    let slot = 0;
    const sign = ensureNeonSign(this.scene, { text: 'BENCH WARRANT', color: '#6aff8a', scale: 4 });
    this.image(slot++, sign.halo, W / 2, top + 36).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8 + 0.2 * Math.sin(now / 300));
    this.image(slot++, sign.core, W / 2, top + 36);
    this.label(slot++, 'EMITTER MOUNT FUSION', '#9a8fb4', W / 2, top + 66, 1);

    // Ingredients: [icon] + [icon] = result.
    const row = top + 84;
    const left = CARD_X + 40;
    slot = this.iconWell(slot, model.primary.itemDefinitionId, left, row, 0x3ff0ff);
    this.label(slot++, model.primary.name, '#f4ecff', left + 42, row + 96, 1);
    this.label(slot++, '+', '#ffd84a', left + 112, row + 42, 4);
    slot = this.iconWell(slot, model.carrier.itemDefinitionId, left + 140, row, 0xffd84a);
    this.label(slot++, model.carrier.name, '#f4ecff', left + 182, row + 96, 1);
    this.label(slot++, '=', '#6aff8a', left + 252, row + 42, 4);
    this.label(slot++, model.result, '#6aff8a', left + 280, row + 30, 1, 0);
    this.label(slot++, 'YOUR SHOTS LEAVE FROM THE CAR,', '#f4ecff', left + 280, row + 48, 1, 0);
    this.label(slot++, 'AND YOU STEER IT WITH THE MOUSE.', '#f4ecff', left + 280, row + 62, 1, 0);

    // Before -> after.
    const table = row + 118;
    this.label(slot++, 'BEFORE', '#9a8fb4', CARD_X + 250, table, 1, 0);
    this.label(slot++, 'AFTER', '#6aff8a', CARD_X + 430, table, 1, 0);
    model.changes.forEach((change, index) => {
      const y = table + 18 + index * 22;
      g.fillStyle(0xffffff, index % 2 === 0 ? 0.04 : 0).fillRect(CARD_X + 24, y - 9, CARD_W - 48, 20);
      this.label(slot++, change.label, '#ffd84a', CARD_X + 40, y, 1, 0);
      this.label(slot++, change.before, '#9a8fb4', CARD_X + 250, y, 1, 0);
      this.label(slot++, '>', '#6aff8a', CARD_X + 412, y, 1);
      this.label(slot++, change.after, '#f4ecff', CARD_X + 430, y, 1, 0);
    });

    // Fee, cash, warning.
    const feeY = table + 18 + model.changes.length * 22 + 14;
    this.label(slot++, `FEE $${model.fee}`, model.affordable ? '#6aff8a' : '#ff5a6a', CARD_X + 40, feeY, 2, 0);
    this.label(slot++, model.feeNote, '#9a8fb4', CARD_X + 170, feeY, 1, 0);
    this.label(slot++, `CASH $${model.cash}`, '#f4ecff', CARD_X + CARD_W - 40, feeY, 2, 1);
    this.label(slot++, model.warning, '#ff5a6a', W / 2, feeY + 26, 1);

    // Buttons.
    this.buttons = [];
    const by = top + CARD_H - 58;
    const specs: Array<{ action: BenchCardAction; key: string; text: string; x: number; color: number; disabled: boolean }> = [
      { action: 'fuse', key: 'ENTER', text: model.affordable ? 'FUSE' : 'NEED CASH', x: W / 2 - 230, color: GREEN, disabled: !model.affordable },
      { action: 'cancel', key: 'ESC', text: 'CANCEL', x: W / 2 + 20, color: 0x9a8fb4, disabled: false },
    ];
    for (const spec of specs) {
      const w = 210;
      const h = 42;
      const hot = this.hovered === spec.action && !spec.disabled;
      g.fillStyle(hot ? spec.color : 0x140d22, hot ? 0.35 : 1).fillRect(spec.x, by, w, h);
      g.lineStyle(2, spec.disabled ? 0x3a3450 : spec.color, 1).strokeRect(spec.x + 1, by + 1, w - 2, h - 2);
      const capW = spec.key.length * 12 + 10;
      g.fillStyle(spec.disabled ? 0x5a5270 : 0xf4ecff, 1).fillRect(spec.x + 10, by + 10, capW, 22);
      this.image(slot++, ensurePixelLabel(this.scene, spec.key, '#0b0714', 2, spec.disabled ? '#5a5270' : '#f4ecff').key, spec.x + 10 + capW / 2, by + 21);
      this.label(slot++, spec.text, spec.disabled ? '#5a5270' : '#f4ecff', spec.x + 20 + capW, by + 21, 2, 0);
      this.buttons.push({ x: spec.x, y: by, w, h, action: spec.action });
    }
  }

  public destroy(): void {
    this.root.destroy(true);
  }
}
