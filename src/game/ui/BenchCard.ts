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
import { buildBenchCardModel, type BenchCardModel, type BenchTile } from './benchCardModel';

const DEPTH = 20_580;
const W = 960;
const H = 600;
const CARD_W = 760;
const CARD_H = 470;
const TILE = 64;
const CYAN = 0x3ff0ff;
const YELLOW = 0xffd84a;
const CARD_X = (W - CARD_W) / 2;
const CARD_Y = (H - CARD_H) / 2;
const GREEN = 0x6aff8a;

/** A card button, or a click on one of your item tiles. */
export type BenchCardAction = 'fuse' | 'cancel' | { readonly pick: string };
type Rect = { x: number; y: number; w: number; h: number; action: BenchCardAction };

export class BenchCard {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly images: Phaser.GameObjects.Image[] = [];
  private openedAt: number | null = null;
  private buttons: Rect[] = [];
  /** The item tiles, clickable to pick or put back. */
  private targets: Rect[] = [];
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
    return this.model?.fee !== null && this.model?.affordable === true;
  }

  public buttonAt(x: number, y: number): BenchCardAction | null {
    if (!this.root.visible) return null;
    const hit = [...this.buttons, ...this.targets].find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (hit?.action === 'fuse' && !this.canFuse) return null;
    return hit?.action ?? null;
  }

  /** The tile behind number key `key` (1-9), when the bench is open. */
  public tileForKey(key: number): string | null {
    return this.model?.tiles.find((tile) => tile.key === key)?.instanceId ?? null;
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

  private iconWell(slot: number, itemDefinitionId: string | null, x: number, y: number, edge: number): number {
    const g = this.g;
    g.fillStyle(0x140d22, 1).fillRect(x, y, 84, 84);
    g.lineStyle(2, edge, itemDefinitionId ? 1 : 0.35).strokeRect(x + 1, y + 1, 82, 82);
    if (!itemDefinitionId) return slot;
    const key = itemIconKey(itemDefinitionId);
    const usable = key ? usableTextureKey(this.scene.textures, key) : null;
    if (!usable) return slot;
    const icon = this.image(slot, usable, x + 42, y + 42);
    icon.setScale(66 / (Math.max(icon.width, icon.height) || 1));
    return slot + 1;
  }

  private tileWell(slot: number, tile: BenchTile, x: number, y: number, now: number): number {
    const g = this.g;
    const edge = tile.pick === 'first' ? CYAN : tile.pick === 'second' ? YELLOW : tile.fused ? 0x3a3450 : 0x6a5a8a;
    const hot = this.hovered !== null && typeof this.hovered === 'object' && this.hovered.pick === tile.instanceId;
    g.fillStyle(tile.pick ? edge : 0x140d22, tile.pick ? 0.22 : 1).fillRect(x, y, TILE, TILE);
    g.lineStyle(tile.pick || hot ? 3 : 2, hot && !tile.pick ? 0xf4ecff : edge, 1).strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
    const key = itemIconKey(tile.iconDefinitionId);
    const usable = key ? usableTextureKey(this.scene.textures, key) : null;
    if (usable) {
      const icon = this.image(slot++, usable, x + TILE / 2, y + TILE / 2 + 2);
      const bob = tile.pick ? Math.sin(now / 180) * 1.5 : 0;
      icon.setScale(40 / (Math.max(icon.width, icon.height) || 1)).setY(Math.round(y + TILE / 2 + 2 + bob)).setAlpha(tile.fused ? 0.45 : 1);
    }
    // A key cap in the corner: the number key that picks this tile.
    g.fillStyle(0xf4ecff, 1).fillRect(x + 3, y + 3, 16, 16);
    this.image(slot++, ensurePixelLabel(this.scene, String(tile.key), '#0b0714', 2, '#f4ecff').key, x + 11, y + 11);
    if (tile.fused) this.label(slot++, 'FUSED', '#9a8fb4', x + TILE / 2, y + TILE - 8, 1);
    if (tile.stolen && !tile.fused) this.label(slot++, 'HOT', '#ff5a6a', x + TILE - 12, y + 9, 1);
    const name = tile.name.length > 12 ? `${tile.name.slice(0, 11)}.` : tile.name;
    this.label(slot++, name, tile.pick ? '#f4ecff' : '#9a8fb4', x + TILE / 2, y + TILE + 10, 1);
    this.targets.push({ x, y, w: TILE, h: TILE, action: { pick: tile.instanceId } });
    return slot;
  }

  private draw(model: BenchCardModel, ease: number, now: number): void {
    const g = this.g;
    g.clear();
    for (const image of this.images) image.setVisible(false);
    this.targets = [];
    const oy = Math.round((1 - ease) * 24);
    const top = CARD_Y + oy;
    g.fillStyle(0x05030a, 0.66 * ease).fillRect(0, 0, W, H);
    g.fillStyle(0x0b0714, 0.97).fillRect(CARD_X, top, CARD_W, CARD_H);
    g.lineStyle(3, GREEN, 1).strokeRect(CARD_X + 1, top + 1, CARD_W - 2, CARD_H - 2);
    g.lineStyle(1, GREEN, 0.4).strokeRect(CARD_X + 7, top + 7, CARD_W - 14, CARD_H - 14);

    let slot = 0;
    const sign = ensureNeonSign(this.scene, { text: 'BENCH WARRANT', color: '#6aff8a', scale: 4 });
    this.image(slot++, sign.halo, W / 2, top + 34).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8 + 0.2 * Math.sin(now / 300));
    this.image(slot++, sign.core, W / 2, top + 34);
    this.label(slot++, 'VOID THE WARRANTY - FUSE ANY TWO ITEMS', '#9a8fb4', W / 2, top + 64, 1);

    // Your items: numbered tiles, picked ones lit cyan (first) and yellow (second).
    const gap = 10;
    const rowW = model.tiles.length * TILE + Math.max(0, model.tiles.length - 1) * gap;
    const tilesY = top + 84;
    model.tiles.forEach((tile, index) => {
      slot = this.tileWell(slot, tile, W / 2 - rowW / 2 + index * (TILE + gap), tilesY, now);
    });

    // The pair and what it makes.
    const pairY = tilesY + TILE + 34;
    const left = CARD_X + 36;
    const first = model.tiles.find((tile) => tile.pick === 'first') ?? null;
    const second = model.tiles.find((tile) => tile.pick === 'second') ?? null;
    slot = this.iconWell(slot, first?.iconDefinitionId ?? null, left, pairY, CYAN);
    this.label(slot++, '+', '#ffd84a', left + 100, pairY + 42, 4);
    slot = this.iconWell(slot, second?.iconDefinitionId ?? null, left + 124, pairY, YELLOW);
    this.label(slot++, '=', '#6aff8a', left + 226, pairY + 42, 4);
    const textX = left + 252;
    if (model.result) {
      const resultColor = model.signature ? '#ffd84a' : '#6aff8a';
      const long = model.result.length > 22;
      this.label(slot++, model.result, resultColor, textX, pairY + 10, long ? 1 : 2, 0);
      if (model.signature) this.label(slot++, 'SIGNATURE FUSION', '#ff3fc8', textX, pairY + 30, 1, 0);
      const lines = model.recipe === 'emitter_mount'
        ? model.changes.map((change) => `${change.label}: ${change.before} > ${change.after}`)
        : model.lines;
      lines.slice(0, 5).forEach((line, index) => {
        this.label(slot++, line, '#f4ecff', textX, pairY + 46 + index * 15, 1, 0);
      });
    } else {
      this.label(slot++, model.hint, model.hint.startsWith('PICK') ? '#9a8fb4' : '#ff5a6a', textX, pairY + 42, 1, 0);
    }

    // Fee, cash, warning.
    const feeY = pairY + 140;
    if (model.fee !== null) {
      this.label(slot++, `FEE $${model.fee}`, model.affordable ? '#6aff8a' : '#ff5a6a', CARD_X + 40, feeY, 2, 0);
      this.label(slot++, model.feeNote, '#9a8fb4', CARD_X + 170, feeY, 1, 0);
      this.label(slot++, model.warning, '#ff5a6a', W / 2, feeY + 24, 1);
    }
    this.label(slot++, `CASH $${model.cash}`, '#f4ecff', CARD_X + CARD_W - 40, feeY, 2, 1);

    // Buttons.
    this.buttons = [];
    const by = top + CARD_H - 58;
    const canFuse = model.fee !== null && model.affordable;
    const specs: Array<{ action: 'fuse' | 'cancel'; key: string; text: string; x: number; color: number; disabled: boolean }> = [
      { action: 'fuse', key: 'ENTER', text: model.fee === null ? 'FUSE' : model.affordable ? 'FUSE' : 'NEED CASH', x: W / 2 - 230, color: GREEN, disabled: !canFuse },
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
