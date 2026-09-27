/**
 * The in-canvas game HUD: portrait and hearts, hotbar, minimap, objectives,
 * pickup log, boss bar and the area title card.
 *
 * It is screen-fixed (scroll factor 0) above every world layer, draws only the
 * `GameHudModel` derived from authoritative state, and remembers nothing but
 * presentation: which messages have been shown and when a title card started.
 */
import Phaser from 'phaser';
import type { MvpRunState } from '../../sim/run/types';
import { itemIconKey, PORTRAIT_TEXTURE_KEYS } from '../presentation/assets';
import { usableTextureKey } from '../presentation/assetFallback';
import { HEART_TEXTURES, ensureHeartTextures, ensureNeonSign, ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import { buildGameHudModel, type GameHudModel } from './gameHudModel';

const HUD_DEPTH = 20_000;
const SCREEN_W = 960;
const SCREEN_H = 600;
const PANEL = 0x0b0714;
const EDGE = 0xff3fc8;
const CYAN = 0x3ff0ff;

type Label = Phaser.GameObjects.Image;

export class GameHud {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly dynamic: Phaser.GameObjects.Graphics;
  private readonly bottomGroup: Phaser.GameObjects.Container;
  private readonly labels = new Map<string, Label>();
  private readonly usedLabels = new Set<string>();
  private readonly hearts: Phaser.GameObjects.Image[] = [];
  private readonly slotIcons: Phaser.GameObjects.Image[] = [];
  private readonly portrait: Phaser.GameObjects.Image | null;
  private readonly log: Array<{ text: string; tick: number }> = [];
  private lastRecent = '';
  private titleCard: { images: Phaser.GameObjects.Image[]; startedTick: number } | null = null;
  private titleRoomKey = '';

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    ensureHeartTextures(scene);
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.bottomGroup = scene.add.container(0, 0);
    this.frame = scene.add.graphics();
    this.dynamic = scene.add.graphics();
    this.root.add([this.frame, this.bottomGroup, this.dynamic]);
    const portraitKey = usableTextureKey(scene.textures, PORTRAIT_TEXTURE_KEYS.alex);
    this.portrait = portraitKey
      ? scene.add.image(18 + 34, SCREEN_H - 14 - 34, portraitKey).setDisplaySize(64, 64)
      : null;
    if (this.portrait) this.bottomGroup.add(this.portrait);
    for (let i = 0; i < 3; i += 1) {
      const heart = scene.add.image(0, 0, HEART_TEXTURES.full).setOrigin(0, 0);
      this.hearts.push(heart);
      this.bottomGroup.add(heart);
    }
    for (let i = 0; i < 8; i += 1) {
      const icon = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
      this.slotIcons.push(icon);
      this.bottomGroup.add(icon);
    }
  }

  public sync(state: MvpRunState): void {
    const model = buildGameHudModel(state);
    this.usedLabels.clear();
    this.frame.clear();
    this.dynamic.clear();
    this.drawObjectives(model);
    this.drawMinimap(model, state);
    this.drawVitals(model, state);
    this.drawHotbar(model);
    this.drawLog(state);
    this.drawBoss(model);
    this.drawTitleCard(state);
    // Fade the bottom row when the janitor walks underneath it.
    const player = state.room.combat.player;
    this.bottomGroup.setAlpha(player.y > 410 ? 0.35 : 1);
    for (const [key, label] of this.labels) {
      if (!this.usedLabels.has(key)) label.setVisible(false);
    }
  }

  /* ---------------------------------------------------------------------- */

  private text(id: string, text: string, x: number, y: number, color = '#f4ecff', scale = 1, bottom = false, alpha = 1): Label {
    const spec = ensurePixelLabel(this.scene, text, color, scale);
    let label = this.labels.get(id);
    if (!label) {
      label = this.scene.add.image(x, y, spec.key).setOrigin(0, 0);
      this.labels.set(id, label);
      (bottom ? this.bottomGroup : this.root).add(label);
    }
    if (label.texture.key !== spec.key) label.setTexture(spec.key);
    label.setPosition(Math.round(x), Math.round(y)).setVisible(true).setAlpha(alpha);
    this.usedLabels.add(id);
    return label;
  }

  private panel(x: number, y: number, w: number, h: number, edge = EDGE): void {
    this.frame.fillStyle(PANEL, 0.78).fillRect(x, y, w, h);
    this.frame.lineStyle(1, edge, 0.9).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    this.frame.fillStyle(edge, 1).fillRect(x, y, 6, 1).fillRect(x, y, 1, 6);
    this.frame.fillRect(x + w - 6, y + h - 1, 6, 1).fillRect(x + w - 1, y + h - 6, 1, 6);
  }

  private drawObjectives(model: GameHudModel): void {
    const x = 10;
    const y = 64;
    const width = 196;
    this.panel(x, y, width, 16 + model.objectives.length * 13);
    this.text('obj-title', 'NIGHT SHIFT', x + 7, y + 5, '#3ff0ff');
    model.objectives.forEach((objective, index) => {
      const oy = y + 18 + index * 13;
      this.frame.lineStyle(1, objective.done ? 0x6aff8a : 0xc8b8e0, 1).strokeRect(x + 7.5, oy + 0.5, 8, 8);
      if (objective.done) {
        this.frame.fillStyle(0x6aff8a, 1).fillRect(x + 9, oy + 4, 2, 2).fillRect(x + 11, oy + 5, 2, 2).fillRect(x + 13, oy + 2, 2, 3);
      }
      this.text(`obj-${index}`, objective.text, x + 21, oy + 1, objective.done ? '#8a7f9c' : '#f4ecff');
    });
  }

  private drawMinimap(model: GameHudModel, state: MvpRunState): void {
    const cellW = 24;
    const cellH = 16;
    const gap = 6;
    const width = model.rooms.length * (cellW + gap) - gap + 16;
    const x = SCREEN_W - width - 10;
    const y = 64;
    this.panel(x, y, width, 48, CYAN);
    model.rooms.forEach((room, index) => {
      const cx = x + 8 + index * (cellW + gap);
      const cy = y + 8;
      if (index > 0) this.frame.fillStyle(0x4a3d62, 1).fillRect(cx - gap, cy + cellH / 2 - 1, gap, 2);
      const pulse = 0.65 + 0.35 * Math.sin(state.tick / 9);
      const fill = room.state === 'current' ? CYAN : room.state === 'cleared' ? 0x3a3052 : 0x1c1628;
      this.frame.fillStyle(fill, room.state === 'current' ? pulse : 1).fillRect(cx, cy, cellW, cellH);
      this.frame.lineStyle(1, room.boss ? 0xff3a4a : 0x8a7fa8, 1).strokeRect(cx + 0.5, cy + 0.5, cellW - 1, cellH - 1);
      if (room.boss) this.text(`map-boss-${index}`, '!', cx + cellW / 2 - 3, cy + 4, '#ff3a4a');
      else if (room.store) this.text(`map-store-${index}`, '$', cx + cellW / 2 - 3, cy + 4, room.state === 'current' ? '#0b0714' : '#ffd84a');
    });
    const current = model.rooms.find((room) => room.state === 'current');
    this.text('map-name', current?.short ?? '', x + 8, y + 31, '#ff6fc8');
    this.text('map-count', `${model.rooms.findIndex((room) => room.state === 'current') + 1}/${model.rooms.length}`, x + width - 32, y + 31, '#8a7fa8');
  }

  private drawVitals(model: GameHudModel, state: MvpRunState): void {
    const px = 14;
    const py = SCREEN_H - 14 - 68;
    this.frame.fillStyle(PANEL, 0.85).fillRect(px, py, 68, 68);
    this.frame.lineStyle(2, EDGE, 1).strokeRect(px, py, 68, 68);
    if (!this.portrait) this.frame.fillStyle(0x3a2a50, 1).fillRect(px + 2, py + 2, 64, 64);
    const damaged = state.room.combat.player.invulnerableTicks > 0 && Math.floor(state.tick / 6) % 2 === 0;
    this.portrait?.setTint(damaged ? 0xff6070 : 0xffffff);
    this.panel(px + 72, py + 20, 120, 48);
    this.text('name', 'ALEX  JANITOR', px + 80, py + 24, '#ffd84a', 1, true);
    model.hearts.forEach((state, index) => {
      const heart = this.hearts[index];
      if (!heart) return;
      heart.setTexture(HEART_TEXTURES[state]).setPosition(px + 80 + index * 19, py + 34);
    });
    this.text('cash', `$${model.cash}`, px + 146, py + 36, '#6aff8a', 1, true);
    const heatColor = model.heat > 0 ? '#ff3a4a' : '#8a7fa8';
    this.text('heat', `HEAT ${model.heat}`, px + 80, py + 56, heatColor, 1, true);
    if (model.carriedCount > 0) this.text('carried', `BAG ${model.carriedCount}`, px + 146, py + 56, '#ffd84a', 1, true);
  }

  private drawHotbar(model: GameHudModel): void {
    const slot = 30;
    const gap = 4;
    const count = 8;
    const width = count * (slot + gap) - gap;
    const x = Math.round((SCREEN_W - width) / 2);
    const y = SCREEN_H - slot - 12;
    this.frame.fillStyle(PANEL, 0.8).fillRect(x - 6, y - 6, width + 12, slot + 12);
    this.frame.lineStyle(1, 0x4a3d62, 1).strokeRect(x - 5.5, y - 5.5, width + 11, slot + 11);
    for (let i = 0; i < count; i += 1) {
      const sx = x + i * (slot + gap);
      const entry = model.hotbar[i];
      const selected = entry?.selected ?? false;
      this.frame.fillStyle(selected ? 0x2a1840 : 0x140e20, 1).fillRect(sx, y, slot, slot);
      this.frame.lineStyle(selected ? 2 : 1, selected ? CYAN : 0x3a3052, 1).strokeRect(sx + 0.5, y + 0.5, slot - 1, slot - 1);
      const icon = this.slotIcons[i]!;
      const key = entry ? itemIconKey(entry.itemDefinitionId) : null;
      const usable = key ? usableTextureKey(this.scene.textures, key) : null;
      if (usable) {
        if (icon.texture.key !== usable) icon.setTexture(usable);
        const scale = Math.min((slot - 6) / icon.width, (slot - 6) / icon.height);
        icon.setVisible(true).setPosition(sx + slot / 2, y + slot / 2).setScale(scale);
      } else {
        icon.setVisible(false);
      }
      if (entry?.fused) this.frame.fillStyle(0x6aff8a, 1).fillRect(sx + slot - 7, y + 2, 5, 5);
      if (entry?.stolen) this.frame.fillStyle(0xff3a4a, 1).fillRect(sx + 2, y + 2, 4, 4);
      this.text(`slot-key-${i}`, `${i + 1}`, sx + 2, y + slot - 9, selected ? '#3ff0ff' : '#5a4f70', 1, true);
    }
  }

  private drawLog(state: MvpRunState): void {
    if (state.recentChange && state.recentChange !== this.lastRecent) {
      this.lastRecent = state.recentChange;
      const text = state.recentChange.toUpperCase();
      this.log.unshift({ text: text.length > 40 ? `${text.slice(0, 39)}.` : text, tick: state.tick });
      this.log.length = Math.min(this.log.length, 4);
    }
    const x = SCREEN_W - 272;
    const y = SCREEN_H - 14 - 58;
    const visible = this.log.filter((entry) => state.tick - entry.tick < 60 * 8);
    if (visible.length === 0) return;
    this.panel(x, y, 262, 58, 0x4a3d62);
    visible.forEach((entry, index) => {
      const age = state.tick - entry.tick;
      const alpha = index === 0 ? 1 : Math.max(0.35, 1 - age / 480);
      this.text(`log-${index}`, `${index === 0 ? '>' : ' '} ${entry.text}`, x + 6, y + 6 + index * 12, index === 0 ? '#ffd84a' : '#c8b8e0', 1, true, alpha);
    });
  }

  private drawBoss(model: GameHudModel): void {
    if (!model.boss) return;
    const width = 300;
    const x = (SCREEN_W - width) / 2;
    const y = 14;
    this.panel(x - 8, y - 6, width + 16, 30, 0xff3a4a);
    this.text('boss-name', `LOSS PREVENTION MGR  PHASE ${model.boss.phase}`, x, y - 1, '#ff6f7a');
    this.dynamic.fillStyle(0x2a0a12, 1).fillRect(x, y + 10, width, 8);
    this.dynamic.fillStyle(0xff3a4a, 1).fillRect(x, y + 10, Math.round(width * Math.max(0, model.boss.health / model.boss.max)), 8);
    this.dynamic.fillStyle(0xffffff, 0.35).fillRect(x, y + 10, Math.round(width * Math.max(0, model.boss.health / model.boss.max)), 2);
  }

  /** A neon area name that fades up on arrival, like the reference title plates. */
  private drawTitleCard(state: MvpRunState): void {
    const roomKey = `${state.roomIndex}:${state.wing.rooms[state.roomIndex]?.id}`;
    if (roomKey !== this.titleRoomKey) {
      this.titleRoomKey = roomKey;
      this.titleCard?.images.forEach((image) => image.destroy());
      const room = state.wing.rooms[state.roomIndex];
      const name = (room?.store?.name ?? room?.name ?? '').toUpperCase();
      const sign = ensureNeonSign(this.scene, { text: name, color: '#ff3fc8', scale: 3, subtitle: `SHIFT ROOM ${state.roomIndex + 1} OF ${state.wing.rooms.length}`, subtitleColor: '#3ff0ff' });
      const halo = this.scene.add.image(SCREEN_W / 2, 250, sign.halo).setBlendMode(Phaser.BlendModes.ADD);
      const core = this.scene.add.image(SCREEN_W / 2, 250, sign.core);
      this.root.add([halo, core]);
      this.titleCard = { images: [halo, core], startedTick: state.tick };
    }
    if (!this.titleCard) return;
    const age = state.tick - this.titleCard.startedTick;
    const alpha = age < 20 ? age / 20 : age < 110 ? 1 : Math.max(0, 1 - (age - 110) / 40);
    for (const image of this.titleCard.images) image.setAlpha(alpha).setVisible(alpha > 0);
  }

  public destroy(): void {
    this.titleCard?.images.forEach((image) => image.destroy());
    this.root.destroy(true);
    this.labels.clear();
  }
}
