/**
 * The in-canvas game HUD.
 *
 * Layout on the 960x600 stage, all key text in the shared pixel font at x2:
 *
 *   [objectives]                                   [wing map + area]
 *                  (boss bar / area title / new-item toast)
 *                     [E] BUY  [F] STEAL   (context prompt)
 *   [portrait][hearts $ heat]  [EQUIPPED + blurb | 1 2 3 | ALWAYS ON]  [log]
 *
 * Screen-fixed (scroll factor 0) above every world layer. It draws only the
 * `GameHudModel` derived from authoritative state and remembers nothing but
 * presentation: shown messages, toast timers, and the hotbar's hit boxes.
 */
import Phaser from 'phaser';
import type { MvpRunState } from '../../sim/run/types';
import { itemIconKey, PORTRAIT_TEXTURE_KEYS } from '../presentation/assets';
import { usableTextureKey } from '../presentation/assetFallback';
import { HEART_TEXTURES, ensureHeartTextures, ensureNeonSign, ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import { buildGameHudModel, type GameHudModel, type HudOfferDetail } from './gameHudModel';
import { itemBlurb } from './itemBlurbs';

const HUD_DEPTH = 20_000;
const SCREEN_W = 960;
const SCREEN_H = 600;
const PANEL = 0x0b0714;
const MAGENTA = 0xff3fc8;
const CYAN = 0x3ff0ff;
const YELLOW = 0xffd84a;
const SLOT = 46;
const SLOT_GAP = 6;
const TEXT = '#f4ecff';
const MUTED = '#9a8fb4';

type Label = Phaser.GameObjects.Image;
type Rect = { x: number; y: number; w: number; h: number };
type Toast = { title: string; titleColor: string; body: string; hint: string; startedTick: number };

export class GameHud {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly bottom: Phaser.GameObjects.Container;
  private readonly bottomFrame: Phaser.GameObjects.Graphics;
  private readonly labels = new Map<string, Label>();
  private readonly usedLabels = new Set<string>();
  private readonly hearts: Phaser.GameObjects.Image[] = [];
  private readonly weaponIcons: Phaser.GameObjects.Image[] = [];
  private readonly passiveIcons: Phaser.GameObjects.Image[] = [];
  private readonly portrait: Phaser.GameObjects.Image | null;
  private readonly promptIcon: Phaser.GameObjects.Image;
  private readonly log: Array<{ text: string; tick: number }> = [];
  private slotRects: Array<Rect & { slot: number }> = [];
  private lastRecent = '';
  private knownItems: Set<string> | null = null;
  private toast: Toast | null = null;
  private titleCard: { images: Phaser.GameObjects.Image[]; startedTick: number } | null = null;
  private titleRoomKey = '';
  private shiftStartTick: number | null = null;
  /** Everything the HUD would draw this frame; unchanged means skip the redraw. */
  private lastSignature = '';
  private lastHealth: number | null = null;
  private heartJoltTick: number | null = null;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    ensureHeartTextures(scene);
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.frame = scene.add.graphics();
    this.bottom = scene.add.container(0, 0);
    this.bottomFrame = scene.add.graphics();
    this.bottom.add(this.bottomFrame);
    this.root.add([this.frame, this.bottom]);
    const portraitKey = usableTextureKey(scene.textures, PORTRAIT_TEXTURE_KEYS.alex);
    this.portrait = portraitKey ? scene.add.image(12 + 40, SCREEN_H - 12 - 40, portraitKey).setDisplaySize(76, 76) : null;
    if (this.portrait) this.bottom.add(this.portrait);
    for (let i = 0; i < 3; i += 1) {
      const heart = scene.add.image(0, 0, HEART_TEXTURES.full);
      this.hearts.push(heart);
      this.bottom.add(heart);
    }
    this.promptIcon = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    this.root.add(this.promptIcon);
    for (let i = 0; i < 9; i += 1) {
      const icon = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
      this.weaponIcons.push(icon);
      this.bottom.add(icon);
    }
    for (let i = 0; i < 12; i += 1) {
      const icon = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
      this.passiveIcons.push(icon);
      this.bottom.add(icon);
    }
  }

  /** Hotbar hit test in game coordinates: which weapon slot is under a click. */
  public weaponSlotAt(x: number, y: number): number | null {
    const hit = this.slotRects.find((rect) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);
    return hit ? hit.slot : null;
  }

  public sync(state: MvpRunState): void {
    const model = buildGameHudModel(state);
    if (this.shiftStartTick === null || state.tick < this.shiftStartTick) this.shiftStartTick = state.tick;
    this.trackNewItems(state, model);
    this.joltHearts(state);
    if (state.recentChange && state.recentChange !== this.lastRecent) this.pushLog(state);
    // Rebuilding vector panels every frame is expensive on software renderers,
    // and most frames change nothing, so redraw only when the picture changes.
    const signature = this.signature(state, model);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.usedLabels.clear();
    this.frame.clear();
    this.bottomFrame.clear();
    this.drawObjectives(model);
    this.drawMinimap(model, state);
    this.drawBoss(model);
    this.drawVitals(model, state);
    this.drawHotbar(model);
    this.drawLog(state);
    this.drawPrompt(model, state.room.combat.player.y > 200);
    this.drawToast(state);
    this.drawControlsCard(state);
    this.drawTitleCard(state);
    // Fade the bottom row when the janitor walks underneath it.
    this.bottom.setAlpha(state.room.combat.player.y > 380 ? 0.4 : 1);
    for (const [key, label] of this.labels) {
      if (!this.usedLabels.has(key)) label.setVisible(false);
    }
  }

  /**
   * Losing health jolts the hearts: they pop oversized, wobble and settle.
   * Scale and rotation only, so it never needs a panel redraw.
   */
  private joltHearts(state: MvpRunState): void {
    const health = state.room.combat.player.health;
    if (this.lastHealth !== null && health < this.lastHealth) this.heartJoltTick = state.tick;
    // A restarted run rewinds the tick; never replay a jolt from the old one.
    if (this.heartJoltTick !== null && state.tick < this.heartJoltTick) this.heartJoltTick = null;
    this.lastHealth = health;
    const age = this.heartJoltTick === null ? null : state.tick - this.heartJoltTick;
    const active = age !== null && age >= 0 && age < 30;
    this.hearts.forEach((heart, index) => {
      if (!active) {
        heart.setScale(1).setRotation(0);
        return;
      }
      const t = age / 30;
      const wobble = Math.sin(age * 1.3 + index) * 0.35 * (1 - t);
      heart.setScale(1 + 0.8 * (1 - t) * (1 - t)).setRotation(wobble);
    });
    if (!active) this.heartJoltTick = null;
  }

  /** Fades are quantised so a fade costs ten redraws, not sixty. */
  private signature(state: MvpRunState, model: GameHudModel): string {
    const bucket = (age: number | null) => (age === null ? -1 : Math.floor(age / 6));
    const titleAge = this.titleCard ? state.tick - this.titleCard.startedTick : null;
    const toastAge = this.toast ? state.tick - this.toast.startedTick : null;
    const cardAge = state.roomIndex === 0 ? state.tick - (this.shiftStartTick ?? state.tick) : null;
    const logAges = this.log.map((entry) => bucket(state.tick - entry.tick)).join(',');
    const hurt = state.room.combat.player.invulnerableTicks > 0 && Math.floor(state.tick / 6) % 2 === 0;
    return JSON.stringify([
      model, state.roomIndex, state.wing.rooms[state.roomIndex]?.id, hurt, this.windupActive(state),
      state.room.combat.player.y > 200,
      state.room.combat.player.y > 380,
      titleAge !== null && titleAge < 160 ? bucket(titleAge) : 'x',
      toastAge !== null && toastAge < 280 ? bucket(toastAge) : 'x',
      cardAge !== null && cardAge < 560 ? bucket(cardAge) : 'x',
      this.log.map((entry) => entry.text).join('|'), logAges,
    ]);
  }

  /* ---------------------------------------------------------------------- */

  private text(id: string, text: string, x: number, y: number, color = TEXT, scale = 2, inBottom = false, alpha = 1, anchor: 'left' | 'center' | 'right' = 'left'): Label {
    const spec = ensurePixelLabel(this.scene, text, color, scale);
    let label = this.labels.get(id);
    if (!label) {
      label = this.scene.add.image(x, y, spec.key);
      this.labels.set(id, label);
      (inBottom ? this.bottom : this.root).add(label);
    }
    if (label.texture.key !== spec.key) label.setTexture(spec.key);
    label.setOrigin(anchor === 'left' ? 0 : anchor === 'center' ? 0.5 : 1, 0);
    label.setPosition(Math.round(x), Math.round(y)).setVisible(true).setAlpha(alpha);
    this.usedLabels.add(id);
    return label;
  }

  private panel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, edge = MAGENTA, alpha = 0.84): void {
    g.fillStyle(PANEL, alpha).fillRect(x, y, w, h);
    g.lineStyle(2, edge, 0.95).strokeRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle(edge, 1).fillRect(x, y, 10, 2).fillRect(x, y, 2, 10);
    g.fillRect(x + w - 10, y + h - 2, 10, 2).fillRect(x + w - 2, y + h - 10, 2, 10);
  }

  private keycap(g: Phaser.GameObjects.Graphics, id: string, key: string, x: number, y: number, disabled = false): number {
    const width = key.length * 12 + 10;
    g.fillStyle(disabled ? 0x5a5270 : 0xf4ecff, 1).fillRect(x, y, width, 22);
    g.fillStyle(disabled ? 0x3a3450 : 0x8a7fa8, 1).fillRect(x, y + 20, width, 2);
    this.text(id, key, x + 5, y + 4, '#0b0714', 2);
    return width;
  }

  /* ---------------------------------------------------------------------- */

  private drawObjectives(model: GameHudModel): void {
    const x = 10;
    const y = 58;
    const lineH = 20;
    const width = 300;
    this.panel(this.frame, x, y, width, 26 + model.objectives.length * lineH);
    this.text('obj-title', 'TONIGHT', x + 10, y + 8, '#3ff0ff', 1);
    model.objectives.forEach((objective, index) => {
      const oy = y + 22 + index * lineH;
      this.frame.lineStyle(2, objective.done ? 0x6aff8a : 0xc8b8e0, 1).strokeRect(x + 10, oy + 1, 12, 12);
      if (objective.done) {
        this.frame.fillStyle(0x6aff8a, 1).fillRect(x + 13, oy + 7, 2, 2).fillRect(x + 15, oy + 9, 2, 2).fillRect(x + 17, oy + 4, 2, 5);
      }
      this.text(`obj-${index}`, objective.text, x + 30, oy, objective.done ? MUTED : TEXT);
    });
  }

  private drawMinimap(model: GameHudModel, state: MvpRunState): void {
    const cellW = 32;
    const cellH = 20;
    const gap = 8;
    const width = model.rooms.length * (cellW + gap) - gap + 20;
    const x = SCREEN_W - width - 10;
    const y = 58;
    this.panel(this.frame, x, y, width, 60, CYAN);
    model.rooms.forEach((room, index) => {
      const cx = x + 10 + index * (cellW + gap);
      const cy = y + 10;
      if (index > 0) this.frame.fillStyle(0x4a3d62, 1).fillRect(cx - gap, cy + cellH / 2 - 1, gap, 3);
      const pulse = 1;
      const fill = room.state === 'current' ? CYAN : room.state === 'cleared' ? 0x3a3052 : 0x1c1628;
      this.frame.fillStyle(fill, room.state === 'current' ? pulse : 1).fillRect(cx, cy, cellW, cellH);
      this.frame.lineStyle(2, room.boss ? 0xff3a4a : 0x8a7fa8, 1).strokeRect(cx + 1, cy + 1, cellW - 2, cellH - 2);
      if (room.boss) this.text(`map-boss-${index}`, '!', cx + cellW / 2, cy + 3, '#ff3a4a', 2, false, 1, 'center');
      else if (room.store) this.text(`map-store-${index}`, '$', cx + cellW / 2, cy + 3, room.state === 'current' ? '#0b0714' : '#ffd84a', 2, false, 1, 'center');
    });
    const currentIndex = model.rooms.findIndex((room) => room.state === 'current');
    this.text('map-name', model.rooms[currentIndex]?.short ?? '', x + 10, y + 38, '#ff6fc8');
    this.text('map-count', `${currentIndex + 1}/${model.rooms.length}`, x + width - 10, y + 38, MUTED, 2, false, 1, 'right');
  }

  private drawBoss(model: GameHudModel): void {
    if (!model.boss) return;
    const width = 340;
    const x = (SCREEN_W - width) / 2;
    const y = 60;
    this.panel(this.frame, x - 10, y - 6, width + 20, 44, 0xff3a4a);
    this.text('boss-name', `LOSS PREVENTION  PHASE ${model.boss.phase}`, SCREEN_W / 2, y, '#ff6f7a', 2, false, 1, 'center');
    const fill = Math.round(width * Math.max(0, model.boss.health / model.boss.max));
    this.frame.fillStyle(0x2a0a12, 1).fillRect(x, y + 20, width, 10);
    this.frame.fillStyle(0xff3a4a, 1).fillRect(x, y + 20, fill, 10);
    this.frame.fillStyle(0xffffff, 0.35).fillRect(x, y + 20, fill, 3);
  }

  private drawVitals(model: GameHudModel, state: MvpRunState): void {
    const g = this.bottomFrame;
    const px = 12;
    const py = SCREEN_H - 12 - 80;
    g.fillStyle(PANEL, 0.9).fillRect(px, py, 80, 80);
    g.lineStyle(3, MAGENTA, 1).strokeRect(px + 1, py + 1, 78, 78);
    if (!this.portrait) g.fillStyle(0x3a2a50, 1).fillRect(px + 4, py + 4, 72, 72);
    const hurt = state.room.combat.player.invulnerableTicks > 0 && Math.floor(state.tick / 6) % 2 === 0;
    this.portrait?.setTint(hurt ? 0xff6070 : 0xffffff);
    this.panel(g, px + 86, py + 6, 132, 74);
    this.text('name', 'ALEX', px + 96, py + 12, '#ffd84a', 1, true);
    model.hearts.forEach((heart, index) => {
      const image = this.hearts[index];
      image?.setTexture(HEART_TEXTURES[heart]).setPosition(px + 96 + index * 26 + image.width / 2, py + 24 + image.height / 2);
    });
    this.text('cash', `$${model.cash}`, px + 96, py + 54, '#6aff8a', 2, true);
    this.text('heat', `HEAT ${model.heat}`, px + 210, py + 54, model.heat > 0 ? '#ff3a4a' : MUTED, 2, true, 1, 'right');
  }

  private drawHotbar(model: GameHudModel): void {
    const g = this.bottomFrame;
    const weaponCount = Math.max(3, model.weapons.length);
    const passiveW = model.passives.length > 0 ? 18 + model.passives.length * 32 : 0;
    const weaponsW = weaponCount * (SLOT + SLOT_GAP) - SLOT_GAP;
    const nameW = (model.equipped?.name.length ?? 9) * 12;
    const totalW = Math.max(weaponsW + (passiveW > 0 ? passiveW + 12 : 0), nameW, 300);
    const x = Math.round((SCREEN_W - totalW) / 2) + 16;
    const y = SCREEN_H - SLOT - 14;

    // Equipped weapon name and what it does, directly above the bar.
    const nameY = y - 38;
    this.panel(g, x - 10, nameY - 6, totalW + 20, SLOT + 54, CYAN, 0.86);
    this.text('equipped', model.equipped?.name ?? 'NO WEAPON', x, nameY, '#3ff0ff', 2, true);
    this.text('equipped-blurb', model.equipped?.blurb ?? '', x, nameY + 18, MUTED, 1, true);
    this.text('switch-hint', model.weapons.length > 1 ? '1-9 / Q / WHEEL: SWITCH' : 'BUY A WEAPON TO SWITCH', x + totalW, nameY + 19, '#ffd84a', 1, true, 1, 'right');

    this.slotRects = [];
    for (let i = 0; i < 9; i += 1) {
      const icon = this.weaponIcons[i]!;
      if (i >= weaponCount) {
        icon.setVisible(false);
        continue;
      }
      const sx = x + i * (SLOT + SLOT_GAP);
      const weapon = model.weapons[i];
      const selected = weapon?.selected ?? false;
      g.fillStyle(selected ? 0x2a1840 : 0x140e20, 1).fillRect(sx, y, SLOT, SLOT);
      g.lineStyle(selected ? 3 : 1, selected ? CYAN : 0x3a3052, 1).strokeRect(sx + 1, y + 1, SLOT - 2, SLOT - 2);
      if (selected) g.fillStyle(CYAN, 0.18).fillRect(sx + 3, y + 3, SLOT - 6, SLOT - 6);
      const key = weapon ? itemIconKey(weapon.itemDefinitionId) : null;
      const usable = key ? usableTextureKey(this.scene.textures, key) : null;
      if (usable) {
        if (icon.texture.key !== usable) icon.setTexture(usable);
        icon.setScale(Math.min((SLOT - 10) / icon.width, (SLOT - 10) / icon.height)).setVisible(true).setPosition(sx + SLOT / 2, y + SLOT / 2);
      } else {
        icon.setVisible(false);
      }
      if (weapon?.fused) g.fillStyle(0x6aff8a, 1).fillRect(sx + SLOT - 9, y + 3, 6, 6);
      // Number badge in the corner: the key that equips this slot.
      g.fillStyle(selected ? CYAN : 0x3a3052, 1).fillRect(sx, y, 14, 14);
      this.text(`slot-key-${i}`, `${i + 1}`, sx + 3, y + 3, selected ? '#0b0714' : TEXT, 1, true);
      if (weapon) this.slotRects.push({ slot: weapon.slot, x: sx, y, w: SLOT, h: SLOT });
    }

    // Passives are never numbered, because they are never "equipped": always on.
    for (let i = 0; i < this.passiveIcons.length; i += 1) {
      const icon = this.passiveIcons[i]!;
      const passive = model.passives[i];
      if (!passive) {
        icon.setVisible(false);
        continue;
      }
      const px = x + weaponsW + 22 + i * 32;
      g.fillStyle(0x14201a, 1).fillRect(px, y + 16, 28, 28);
      g.lineStyle(1, 0x6aff8a, 0.8).strokeRect(px + 0.5, y + 16.5, 27, 27);
      const key = itemIconKey(passive.itemDefinitionId);
      const usable = key ? usableTextureKey(this.scene.textures, key) : null;
      if (usable) {
        if (icon.texture.key !== usable) icon.setTexture(usable);
        icon.setScale(Math.min(22 / icon.width, 22 / icon.height)).setVisible(true).setPosition(px + 14, y + 30);
      } else icon.setVisible(false);
    }
    if (model.passives.length > 0) {
      g.fillStyle(0x6aff8a, 0.5).fillRect(x + weaponsW + 10, y + 4, 2, SLOT - 8);
      this.text('passive-label', 'ALWAYS ON', x + weaponsW + 22, y + 4, '#6aff8a', 1, true);
    }
  }

  private pushLog(state: MvpRunState): void {
    this.lastRecent = state.recentChange;
    const text = state.recentChange.toUpperCase().replace(/—/g, '-');
    this.log.unshift({ text: text.length > 34 ? `${text.slice(0, 33)}.` : text, tick: state.tick });
    this.log.length = Math.min(this.log.length, 4);
  }

  private drawLog(state: MvpRunState): void {
    const visible = this.log.filter((entry) => state.tick - entry.tick < 60 * 8);
    if (visible.length === 0) return;
    const width = 220;
    const x = SCREEN_W - width - 12;
    const y = SCREEN_H - 12 - 80;
    this.panel(this.bottomFrame, x, y, width, 80, 0x4a3d62);
    visible.forEach((entry, index) => {
      const age = state.tick - entry.tick;
      const alpha = index === 0 ? 1 : Math.max(0.35, 1 - age / 480);
      this.text(`log-${index}`, entry.text, x + 10, y + 10 + index * 16, index === 0 ? '#ffd84a' : '#c8b8e0', 1, true, alpha);
    });
  }

  private drawPrompt(model: GameHudModel, playerLow = false): void {
    const prompt = model.prompt;
    this.promptIcon.setVisible(false);
    if (!prompt) return;
    if (prompt.detail) {
      this.drawOfferCard(prompt, prompt.detail, playerLow);
      return;
    }
    const keysW = prompt.keys.reduce((sum, key) => sum + key.key.length * 12 + 10 + 8 + key.action.length * 12 + 16, 0);
    const subjectW = prompt.subject.length * 12;
    const width = Math.max(keysW, subjectW) + 28;
    const x = Math.round((SCREEN_W - width) / 2);
    const y = 404;
    this.panel(this.frame, x, y, width, prompt.keys.length > 0 ? 62 : 36, YELLOW);
    this.text('prompt-subject', prompt.subject, SCREEN_W / 2, y + 10, '#ffd84a', 2, false, 1, 'center');
    let cx = Math.round((SCREEN_W - keysW) / 2);
    prompt.keys.forEach((entry, index) => {
      cx += this.keycap(this.frame, `prompt-key-${index}`, entry.key, cx, y + 32) + 8;
      this.text(`prompt-action-${index}`, entry.action, cx, y + 36, TEXT);
      cx += entry.action.length * 12 + 16;
    });
  }

  /**
   * The store card for the offer the janitor is standing at: icon, name and
   * price, what it does, weapon or passive, the keys (greyed when refused),
   * and the one line that decides it — how short you are, or what stealing
   * costs.
   */
  private drawOfferCard(prompt: NonNullable<GameHudModel['prompt']>, detail: HudOfferDetail, playerLow: boolean): void {
    const width = 560;
    const height = 104;
    const x = Math.round((SCREEN_W - width) / 2);
    // Never cover the shelf the janitor is standing at: flip to the top when
    // they are in the lower half of the room.
    const y = playerLow ? 192 : 372;
    this.panel(this.frame, x, y, width, height, detail.canBuy ? YELLOW : 0xff5a6a);
    // Icon well.
    this.frame.fillStyle(0x140d22, 1).fillRect(x + 12, y + 12, 80, 80);
    this.frame.lineStyle(2, detail.kind === 'WEAPON' ? CYAN : 0x6aff8a, 1).strokeRect(x + 13, y + 13, 78, 78);
    const key = itemIconKey(detail.itemDefinitionId);
    const usable = key ? usableTextureKey(this.scene.textures, key) : null;
    if (usable) {
      this.promptIcon.setTexture(usable).setVisible(true).setPosition(x + 52, y + 52);
      const size = Math.max(this.promptIcon.width, this.promptIcon.height) || 1;
      this.promptIcon.setScale(64 / size);
    }
    const tx = x + 106;
    this.text('prompt-subject', prompt.subject, tx, y + 12, '#ffd84a', 2);
    this.text('prompt-kind', detail.kind, x + width - 14, y + 12, detail.kind === 'WEAPON' ? '#3ff0ff' : '#6aff8a', 1, false, 1, 'right');
    this.text('prompt-blurb', detail.blurb, tx, y + 34, TEXT, 1);
    let cx = tx;
    prompt.keys.forEach((entry, index) => {
      cx += this.keycap(this.frame, `prompt-key-${index}`, entry.key, cx, y + 48, entry.disabled) + 8;
      this.text(`prompt-action-${index}`, entry.action, cx, y + 52, entry.disabled ? MUTED : TEXT);
      cx += entry.action.length * 12 + 18;
    });
    this.text('prompt-note', detail.note, tx, y + 80, detail.canBuy ? '#ffb040' : '#ff5a6a', 1);
  }

  /** Announces every newly owned item: weapons with their key, passives as always on. */
  private trackNewItems(state: MvpRunState, model: GameHudModel): void {
    const ids = new Set(state.inventory.inventory.map((node) => node.instanceId));
    if (this.knownItems === null || ids.size < this.knownItems.size) {
      this.knownItems = ids;
      return;
    }
    for (const weapon of model.weapons) {
      if (!this.knownItems.has(weapon.instanceId)) {
        this.toast = { title: `NEW WEAPON: ${weapon.name}`, titleColor: '#3ff0ff', body: itemBlurb(weapon.itemDefinitionId), hint: `PRESS ${weapon.slot} TO EQUIP`, startedTick: state.tick };
      }
    }
    for (const passive of model.passives) {
      if (!this.knownItems.has(passive.instanceId)) {
        this.toast = { title: `PASSIVE: ${passive.name}`, titleColor: '#6aff8a', body: itemBlurb(passive.itemDefinitionId), hint: 'ALWAYS ON - NOTHING TO EQUIP', startedTick: state.tick };
      }
    }
    this.knownItems = ids;
  }

  private drawToast(state: MvpRunState): void {
    if (!this.toast) return;
    const age = state.tick - this.toast.startedTick;
    if (age > 60 * 4.5 || age < 0) {
      this.toast = null;
      return;
    }
    const alpha = age < 10 ? age / 10 : age > 240 ? Math.max(0, 1 - (age - 240) / 30) : 1;
    const width = Math.max(this.toast.title.length, this.toast.body.length, this.toast.hint.length) * 12 + 40;
    const x = Math.round((SCREEN_W - width) / 2);
    const y = 150;
    this.frame.fillStyle(PANEL, 0.92 * alpha).fillRect(x, y, width, 74);
    this.frame.lineStyle(2, parseInt(this.toast.titleColor.slice(1), 16), alpha).strokeRect(x + 1, y + 1, width - 2, 72);
    this.text('toast-title', this.toast.title, SCREEN_W / 2, y + 10, this.toast.titleColor, 2, false, alpha, 'center');
    this.text('toast-body', this.toast.body, SCREEN_W / 2, y + 32, TEXT, 2, false, alpha, 'center');
    this.text('toast-hint', this.toast.hint, SCREEN_W / 2, y + 56, '#ffd84a', 1, false, alpha, 'center');
  }

  /** A short controls card for the first seconds of a shift. */
  private drawControlsCard(state: MvpRunState): void {
    const age = state.tick - (this.shiftStartTick ?? state.tick);
    if (state.roomIndex !== 0 || age > 60 * 9) return;
    const alpha = age > 60 * 8 ? Math.max(0, 1 - (age - 480) / 60) : 1;
    const rows: Array<[string, string]> = [
      ['WASD', 'MOVE'],
      ['MOUSE', 'AIM'],
      ['CLICK', 'ATTACK'],
      ['SPACE', 'DASH'],
      ['E', 'BUY / USE'],
      ['F', 'STEAL'],
      ['1-9 Q', 'SWITCH WEAPON'],
    ];
    // Right side: the janitor spawns on the west, so the card never covers them.
    const x = SCREEN_W - 320;
    const y = 190;
    this.frame.fillStyle(PANEL, 0.85 * alpha).fillRect(x, y, 300, 30 + rows.length * 22);
    this.frame.lineStyle(2, CYAN, alpha).strokeRect(x + 1, y + 1, 298, 28 + rows.length * 22);
    this.text('controls-title', 'CONTROLS', x + 150, y + 8, '#3ff0ff', 1, false, alpha, 'center');
    rows.forEach(([key, action], index) => {
      this.text(`controls-key-${index}`, key, x + 110, y + 24 + index * 22, '#ffd84a', 2, false, alpha, 'right');
      this.text(`controls-act-${index}`, action, x + 128, y + 24 + index * 22, TEXT, 2, false, alpha);
    });
  }

  /** A neon area name that fades up on arrival, like the reference title plates. */
  private drawTitleCard(state: MvpRunState): void {
    const roomKey = `${state.roomIndex}:${state.wing.rooms[state.roomIndex]?.id}`;
    if (roomKey !== this.titleRoomKey) {
      this.titleRoomKey = roomKey;
      this.titleCard?.images.forEach((image) => image.destroy());
      const room = state.wing.rooms[state.roomIndex];
      const name = (room?.store?.name ?? room?.name ?? '').toUpperCase();
      const sign = ensureNeonSign(this.scene, { text: name, color: '#ff3fc8', scale: 4, subtitle: `SHIFT ROOM ${state.roomIndex + 1} OF ${state.wing.rooms.length}`, subtitleColor: '#3ff0ff' });
      const halo = this.scene.add.image(SCREEN_W / 2, 200, sign.halo).setBlendMode(Phaser.BlendModes.ADD);
      const core = this.scene.add.image(SCREEN_W / 2, 200, sign.core);
      this.root.add([halo, core]);
      this.titleCard = { images: [halo, core], startedTick: state.tick };
    }
    if (!this.titleCard) return;
    const age = state.tick - this.titleCard.startedTick;
    const fade = age < 20 ? age / 20 : age < 110 ? 1 : Math.max(0, 1 - (age - 110) / 40);
    // A wind-up must never hide behind the room title: it steps aside.
    const alpha = Math.min(fade, this.windupActive(state) ? 0.2 : 1);
    for (const image of this.titleCard.images) image.setAlpha(alpha).setVisible(alpha > 0);
  }

  private windupActive(state: MvpRunState): boolean {
    return state.room.combat.enemies.some((enemy) => enemy.health > 0 && (enemy.phase === 'telegraph' || (enemy.bossVolleyTelegraphTicks ?? 0) > 0));
  }

  public destroy(): void {
    this.titleCard?.images.forEach((image) => image.destroy());
    this.root.destroy(true);
    this.labels.clear();
  }
}
