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
import { activeStore } from '../../sim/run/storeInterior';
import type { MvpRunState } from '../../sim/run/types';
import { PORTRAIT_TEXTURE_KEYS } from '../presentation/assets';
import { usableTextureKey } from '../presentation/assetFallback';
import { usableItemIcon } from '../presentation/fusedIconTexture';
import { HEART_TEXTURES, ensureHeartTextures, ensureNeonSign, ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import { buildGameHudModel, collapsedObjective, hudExpanded, roomTitleSubtitle, wrapLogText, type GameHudModel, type HudOfferDetail } from './gameHudModel';
import { roomEventFor } from '../../sim/run/roomEvents';
import { itemBlurb } from './itemBlurbs';
import { blink, flashAllowed, gameSettings } from '../settings/settings';
import { browserCareer } from '../career/career';
import { coachActive, nextCoachTip, type CoachTipId } from './coachModel';
import { fitHudText, hudDockLayout, wantedPanel, wantedRows } from './gameHudLayout';

const HUD_DEPTH = 20_000;
const SCREEN_W = 960;
const SCREEN_H = 600;
const PANEL = 0x111726;
const MAGENTA = 0xc98caf;
const CYAN = 0x71b8b5;
const YELLOW = 0xd7bd8b;
const TEXT = '#f3e9d0';
const MUTED = '#a7b1b8';

type Label = Phaser.GameObjects.Image;
type Rect = { x: number; y: number; w: number; h: number };
type Toast = { title: string; titleColor: string; body: string; hint: string; startedTick: number; /** Ticks on screen; the usual toast is 4.5 s, a coach tip longer. */ life?: number };

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
  /** The top HUD collapses to corner chips once a room settles; Tab peeks. */
  private hudRoomKey = '';
  private roomEnteredTick = 0;
  private objectivesKey = '';
  private objectivesChangedTick = 0;
  private expanded = true;
  private readonly peekKey: Phaser.Input.Keyboard.Key | undefined;
  private titleRoomKey = '';
  private wantedShown = 0;
  private wantedChangedTick = -1000;
  private shiftStartTick: number | null = null;
  /** Everything the HUD would draw this frame; unchanged means skip the redraw. */
  private lastSignature = '';
  private lastHealth: number | null = null;
  private heartJoltTick: number | null = null;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    ensureHeartTextures(scene, 2);
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.peekKey = scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    this.frame = scene.add.graphics();
    this.bottom = scene.add.container(0, 0);
    this.bottomFrame = scene.add.graphics();
    this.bottom.add(this.bottomFrame);
    this.root.add([this.frame, this.bottom]);
    const portraitKey = usableTextureKey(scene.textures, PORTRAIT_TEXTURE_KEYS.alex);
    this.portrait = portraitKey ? scene.add.image(51, 547, portraitKey).setDisplaySize(56, 56) : null;
    if (this.portrait) this.bottom.add(this.portrait);
    for (let i = 0; i < 6; i += 1) {
      const heart = scene.add.image(0, 0, HEART_TEXTURES.full).setVisible(false);
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

  /** Cinematic moments (the boss kill cam) clear the screen of HUD. */
  public setHidden(hidden: boolean): void {
    this.root.setVisible(!hidden);
  }

  public sync(state: MvpRunState): void {
    const model = buildGameHudModel(state);
    if (this.shiftStartTick === null || state.tick < this.shiftStartTick) this.shiftStartTick = state.tick;
    this.trackNewItems(state, model);
    this.trackMannequins(state);
    this.trackCoach(state);
    this.joltHearts(state);
    this.trackDisclosure(state, model);
    if (model.wanted !== this.wantedShown) {
      this.wantedShown = model.wanted;
      this.wantedChangedTick = state.tick;
    }
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
    this.drawAlarm(model, state);
    this.drawVitals(model, state);
    this.drawHotbar(model);
    this.drawLog(state);
    this.drawPrompt(model, state.room.combat.player.y > 200);
    this.drawCombo(model);
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
    const hurt = state.room.combat.player.invulnerableTicks > 0 && flashAllowed(gameSettings().get()) && Math.floor(state.tick / 6) % 2 === 0;
    return JSON.stringify([
      model, state.roomIndex, state.wing.rooms[state.roomIndex]?.id, hurt, this.windupActive(state),
      state.room.combat.player.y > 200,
      state.room.combat.player.y > 380,
      titleAge !== null && titleAge < 200 ? bucket(titleAge) : 'x',
      toastAge !== null && toastAge < 280 ? bucket(toastAge) : 'x',
      cardAge !== null && cardAge < 560 ? bucket(cardAge) : 'x',
      this.log.map((entry) => entry.text).join('|'), logAges,
      this.expanded,
      // The alarm banner blinks and the stars flash briefly when they change.
      model.alarm ? Math.floor(state.tick / 10) % 2 : 'x',
      state.tick - this.wantedChangedTick < 40 ? Math.floor((state.tick - this.wantedChangedTick) / 5) % 2 : 'x',
    ]);
  }

  /* ---------------------------------------------------------------------- */

  private text(id: string, text: string, x: number, y: number, color = TEXT, scale = 2, inBottom = false, alpha = 1, anchor: 'left' | 'center' | 'right' = 'left', outline = '#0a0610'): Label {
    const spec = ensurePixelLabel(this.scene, text, color, scale, outline);
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

  private panel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, edge = MAGENTA, alpha = 0.92): void {
    g.fillStyle(0x080b11, 0.45).fillRect(x + 2, y + 2, w, h);
    g.fillStyle(PANEL, alpha).fillRect(x, y, w, h);
    g.lineStyle(1, 0x637278, 0.95).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.fillStyle(edge, 1).fillRect(x, y, 4, h);
    g.fillStyle(0x99a4a0, 0.5).fillRect(x + 6, y + 1, w - 8, 1);
  }

  private stamp(g: Phaser.GameObjects.Graphics, id: string, text: string, x: number, y: number, color = YELLOW, inBottom = false): void {
    g.fillStyle(color, 1).fillRect(x, y, text.length * 6 + 8, 13);
    this.text(id, text, x + 4, y + 2, '#1b2530', 1, inBottom, 1, 'left', `#${color.toString(16).padStart(6, '0')}`);
  }

  private fitted(id: string, text: string, x: number, y: number, width: number, color = TEXT, scale = 2, inBottom = false, outline = '#0a0610'): void {
    const fit = fitHudText(text, width, scale);
    this.text(id, fit.text, x, y, color, fit.scale, inBottom, 1, 'left', outline);
  }

  private keycap(g: Phaser.GameObjects.Graphics, id: string, key: string, x: number, y: number, disabled = false): number {
    const width = key.length * 12 + 10;
    g.fillStyle(disabled ? 0x5a5270 : 0xf4ecff, 1).fillRect(x, y, width, 22);
    g.fillStyle(disabled ? 0x3a3450 : 0x8a7fa8, 1).fillRect(x, y + 20, width, 2);
    this.text(id, key, x + 5, y + 4, '#0b0714', 2, false, 1, 'left', disabled ? '#5a5270' : '#f4ecff');
    return width;
  }

  /* ---------------------------------------------------------------------- */

  /** Opens the full top HUD on a new room or a changed objective, then lets it collapse. */
  private trackDisclosure(state: MvpRunState, model: GameHudModel): void {
    const roomKey = this.roomKey(state);
    if (roomKey !== this.hudRoomKey || state.tick < this.roomEnteredTick) {
      this.hudRoomKey = roomKey;
      this.roomEnteredTick = state.tick;
    }
    // Counts ("4 LEFT", "$12") tick constantly in a fight; only a new, gone or
    // finished objective counts as a change worth reopening for.
    const key = model.objectives.map((objective) => `${objective.text.replace(/[\d$/]+/g, '').trim()}:${objective.done}`).join('|');
    if (key !== this.objectivesKey) {
      if (this.objectivesKey !== '') this.objectivesChangedTick = state.tick;
      this.objectivesKey = key;
    }
    this.expanded = hudExpanded({
      tick: state.tick,
      roomEnteredTick: this.roomEnteredTick,
      objectivesChangedTick: this.objectivesChangedTick,
      peek: this.peekKey?.isDown ?? false,
      paused: state.paused,
      playing: state.status === 'playing',
    });
  }

  private drawObjectives(model: GameHudModel): void {
    if (!this.expanded) {
      // The PA owns y=6..30. These corner chips stay below it even while it speaks.
      this.panel(this.frame, 12, 34, 274, 24, MAGENTA);
      this.fitted('obj-chip', `> ${collapsedObjective(model) ?? 'ALL CLEAR'}`, 22, 42, 222, TEXT, 1);
      this.text('obj-tab', 'TAB', 258, 42, MUTED, 1);
      return;
    }
    const x = 10;
    const y = 58;
    const lineH = 20;
    const width = 276;
    this.panel(this.frame, x, y, width, 26 + model.objectives.length * lineH);
    this.text('obj-title', 'TONIGHT', x + 10, y + 8, '#3ff0ff', 1);
    model.objectives.forEach((objective, index) => {
      const oy = y + 22 + index * lineH;
      this.frame.lineStyle(2, objective.done ? 0x6aff8a : 0xc8b8e0, 1).strokeRect(x + 10, oy + 1, 12, 12);
      if (objective.done) {
        this.frame.fillStyle(0x6aff8a, 1).fillRect(x + 13, oy + 7, 2, 2).fillRect(x + 15, oy + 9, 2, 2).fillRect(x + 17, oy + 4, 2, 5);
      }
      // Long lines (wanted, lockdown) drop to the small size to fit the panel.
      this.fitted(`obj-${index}`, objective.text, x + 30, oy + (objective.text.length > 19 ? 3 : 0), width - 42, objective.done ? MUTED : TEXT, 2);
    });
  }

  private drawMinimap(model: GameHudModel, state: MvpRunState): void {
    if (!this.expanded) {
      const current = model.rooms.findIndex((room) => room.state === 'current');
      const x = 672;
      this.panel(this.frame, x, 34, 276, 34, CYAN);
      this.fitted('map-name', `F${model.floor} / ${model.rooms[current]?.short ?? ''}`, x + 12, 40, 248, '#d5dfda', 1);
      model.rooms.forEach((room, index) => {
        const cx = x + 12 + index * 24;
        const fill = room.state === 'current' ? CYAN : room.state === 'cleared' ? 0x42495c : 0x22293b;
        this.frame.fillStyle(fill, 1).fillRect(cx, 52, 18, 12);
        this.frame.lineStyle(1, room.boss ? 0xff6f7a : 0x75848b, 1).strokeRect(cx + 0.5, 52.5, 17, 11);
        this.text(`map-cell-${index}`, room.boss ? '!' : room.store ? '$' : `${index + 1}`, cx + 6, 54, room.state === 'current' ? '#13222c' : '#b7c0c0', 1);
      });
      this.text('map-count', `${current + 1}/${model.rooms.length}`, x + 242, 54, MUTED, 1);
      return;
    }
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
    this.fitted('map-name', model.rooms[currentIndex]?.short ?? '', x + 10, y + 38, width - 68, '#c98caf');
    this.text('map-count', `${currentIndex + 1}/${model.rooms.length}`, x + width - 10, y + 38, MUTED, 2, false, 1, 'right');
  }

  private drawBoss(model: GameHudModel): void {
    if (!model.boss) return;
    const width = 340;
    const x = (SCREEN_W - width) / 2;
    const y = 60;
    this.panel(this.frame, x - 10, y - 6, width + 20, 44, 0xff3a4a);
    this.text('boss-name', `${model.boss.name}  PHASE ${model.boss.phase}`, SCREEN_W / 2, y, '#ff6f7a', 2, false, 1, 'center');
    const fill = Math.round(width * Math.max(0, model.boss.health / model.boss.max));
    this.frame.fillStyle(0x2a0a12, 1).fillRect(x, y + 20, width, 10);
    this.frame.fillStyle(0xff3a4a, 1).fillRect(x, y + 20, fill, 10);
    this.frame.fillStyle(0xffffff, 0.35).fillRect(x, y + 20, fill, 3);
  }

  /**
   * A red flashing strip with the shutter countdown, just under the PA ticker
   * (which runs y 6-30 and is always talking during an alarm) and between the
   * objectives panel and the minimap. Alarms only ring in stores, never with
   * the boss bar up.
   */
  private drawAlarm(model: GameHudModel, state: MvpRunState): void {
    const alarm = model.alarm;
    if (!alarm) return;
    const width = 300;
    const x = (SCREEN_W - width) / 2;
    const y = 34;
    const on = blink(state.tick, 10, gameSettings().get());
    const closed = alarm.shutter === 'closed';
    const lifted = alarm.shutter === 'lifted';
    const edge = lifted ? 0x6aff8a : 0xff3a4a;
    this.frame.fillStyle(lifted ? 0x0a2a14 : on ? 0x5a0a14 : 0x2a0a12, 0.94).fillRect(x, y, width, 40);
    this.frame.lineStyle(2, edge, on || lifted ? 1 : 0.5).strokeRect(x + 1, y + 1, width - 2, 38);
    const title = lifted ? 'SHUTTER UP - GO!' : closed ? 'LOCKED IN!' : `ALARM  ${alarm.secondsLeft.toFixed(1)}S`;
    this.text('alarm-title', title, SCREEN_W / 2, y + 6, lifted ? '#6aff8a' : on ? '#ffffff' : '#ff6f7a', 2, false, 1, 'center');
    const sub = lifted ? 'GET THE LOOT TO THE DOOR' : closed ? 'TAKE DOWN SECURITY' : `${alarm.store || 'THE STORE'}: RUN FOR THE DOOR`;
    this.text('alarm-sub', sub, SCREEN_W / 2, y + 26, '#ffd84a', 1, false, 1, 'center');
  }

  /** Five star outlines; the wanted ones fill in, and flash when the level changes. */
  private drawStars(g: Phaser.GameObjects.Graphics, wanted: number, right: number, cy: number, tick: number): void {
    const flashing = tick - this.wantedChangedTick < 40 && flashAllowed(gameSettings().get()) && Math.floor((tick - this.wantedChangedTick) / 5) % 2 === 0;
    const outer = 5;
    const inner = 2;
    const step = 12;
    for (let i = 0; i < 5; i += 1) {
      const cx = right - (4 - i) * step - outer;
      const points: Phaser.Math.Vector2[] = [];
      for (let k = 0; k < 10; k += 1) {
        const angle = -Math.PI / 2 + (k * Math.PI) / 5;
        const r = k % 2 === 0 ? outer : inner;
        points.push(new Phaser.Math.Vector2(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r + 0.5));
      }
      if (i < wanted) {
        g.fillStyle(flashing ? 0xffffff : i >= 3 ? 0xff3a4a : 0xffb02e, 1).fillPoints(points, true);
      } else {
        g.lineStyle(1, 0x5a4a78, 1).strokePoints(points, true);
      }
    }
  }

  private drawVitals(model: GameHudModel, state: MvpRunState): void {
    const g = this.bottomFrame;
    this.panel(g, 12, 506, 218, 82);
    g.fillStyle(0x333443, 1).fillRect(22, 518, 58, 58);
    g.lineStyle(1, 0x687b83, 1).strokeRect(22.5, 518.5, 57, 57);
    const hurt = state.room.combat.player.invulnerableTicks > 0 && flashAllowed(gameSettings().get()) && Math.floor(state.tick / 6) % 2 === 0;
    this.portrait?.setTint(hurt ? 0xff6070 : 0xffffff);
    this.stamp(g, 'name', 'ALEX', 90, 514, YELLOW, true);
    // All supported health upgrades remain visible, and old hearts vanish on restart.
    this.hearts.forEach((image, index) => {
      const heart = model.hearts[index];
      image.setVisible(heart !== undefined);
      if (heart) image.setTexture(HEART_TEXTURES[heart]).setPosition(98 + index * 20, 542);
    });
    this.fitted('cash', `$${model.cash}`, 90, 560, 66, '#d3df9b', 2, true);
    this.text('wanted-label', 'WANTED', 166, 554, MUTED, 1, true);
    this.drawStars(g, model.wanted, 220, 573, state.tick);
    if (model.wantedLine) {
      const rows = wantedRows(model.wantedLine);
      const strip = wantedPanel(rows.length);
      this.panel(g, strip.x, strip.y, strip.w, strip.h, 0xf3ab65);
      rows.forEach((line, i) => this.text(`wanted-line-${i}`, line, 22, strip.y + 7 + i * 11, '#edc2a3', 1, true));
    }
  }

  private drawHotbar(model: GameHudModel): void {
    const g = this.bottomFrame;
    const layout = hudDockLayout(model);
    const { x, y, w, h } = layout.equipment;
    this.panel(g, x, y, w, h, CYAN);
    this.stamp(g, 'equipment-label', 'EQUIPPED', x + 10, y - 6, CYAN, true);
    const selected = model.weapons.find((weapon) => weapon.selected);
    const tag = selected?.hot ? 'HOT' : selected?.fused ? 'FUSED' : '';
    if (tag) this.stamp(g, 'equipped-tag', tag, x + w - tag.length * 6 - 18, y - 6, selected?.hot ? 0xf3ab65 : 0xb2d099, true);
    const range = model.weapons.length > 9 ? `${layout.start + 1}-${Math.min(layout.start + 9, model.weapons.length)} OF ${model.weapons.length} / Q WHEEL` : model.weapons.length > 1 ? '1-9 / Q / WHEEL' : 'BUY A WEAPON TO SWITCH';
    this.fitted('switch-hint', range, x + 90, y - 3, tag ? 260 : 356, MUTED, 1, true);
    this.fitted('equipped', model.equipped?.name ?? 'NO WEAPON', x + 12, y + 14, w - 24, TEXT, 2, true);
    this.fitted('equipped-blurb', model.equipped?.blurb ?? '', x + 12, y + 32, w - 24, MUTED, 1, true);

    this.slotRects = [];
    this.weaponIcons.forEach((icon, i) => {
      const cell = layout.weapons[i];
      if (!cell) { icon.setVisible(false); return; }
      const weapon = model.weapons[cell.index];
      const selected = weapon?.selected ?? false;
      const { x: sx, y: sy, w: size } = cell;
      g.fillStyle(selected ? 0x25283d : 0x131e2c, 1).fillRect(sx, sy, size, size);
      g.lineStyle(selected ? 2 : 1, selected ? 0xf4e4b7 : 0x53616c, 1).strokeRect(sx + 1, sy + 1, size - 2, size - 2);
      const usable = weapon ? usableItemIcon(this.scene, weapon.itemDefinitionId) : null;
      if (usable) {
        icon.setTexture(usable).setScale(Math.min((size - 10) / icon.width, (size - 10) / icon.height)).setVisible(true).setPosition(sx + size / 2, sy + size / 2);
      } else {
        icon.setVisible(false);
        if (weapon) this.text(`slot-missing-${i}`, '?', sx + size / 2 - 6, sy + size / 2 - 8, MUTED, 2, true);
      }
      if (weapon?.fused || weapon?.hot) {
        const text = weapon.hot ? 'HOT' : 'FUSED';
        const tw = text.length * 6 + 2;
        g.fillStyle(weapon.hot ? 0xf3ab65 : 0xb2d099, 1).fillRect(sx + size - tw, sy + size - 9, tw, 9);
        this.text(`slot-tag-${i}`, text, sx + size - tw, sy + size - 9, '#1b2530', 1, true, 1, 'left', weapon.hot ? '#f3ab65' : '#b2d099');
      }
      // Badges are actual inventory ordinals; only 1–9 have keyboard shortcuts.
      const key = `${weapon?.slot ?? cell.index + 1}`;
      g.fillStyle(selected ? 0xedd5b4 : 0x505e6c, 1).fillRect(sx, sy, key.length * 6 + 5, 12);
      this.text(`slot-key-${i}`, key, sx + 2, sy + 2, selected ? '#15202b' : TEXT, 1, true, 1, 'left', selected ? '#edd5b4' : '#505e6c');
      if (weapon) this.slotRects.push({ slot: weapon.slot, x: sx, y: sy, w: size, h: size });
    });

    this.passiveIcons.forEach((icon, i) => {
      const cell = layout.passives[i];
      const passive = cell ? model.passives[cell.index] : undefined;
      if (!cell || !passive) { icon.setVisible(false); return; }
      const { x: px, y: py, w: size } = cell;
      g.fillStyle(0x20302a, 1).fillRect(px, py, size, size);
      g.lineStyle(1, passive.hot ? 0xf3ab65 : 0x91aa83, 0.9).strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      const usable = usableItemIcon(this.scene, passive.itemDefinitionId);
      if (usable) icon.setTexture(usable).setScale(Math.min((size - 4) / icon.width, (size - 4) / icon.height)).setVisible(true).setPosition(px + size / 2, py + size / 2);
      else { icon.setVisible(false); this.text(`passive-missing-${i}`, '?', px + 8, py + 8, MUTED, 1, true); }
      if (passive.fused || passive.hot) this.text(`passive-tag-${i}`, passive.hot ? 'H' : 'F', px + size - 7, py, passive.hot ? '#f3ab65' : '#b2d099', 1, true);
    });
    if (model.passives.length > 0) this.text('passive-label', 'ALWAYS ON', layout.dense ? 452 : 420, layout.dense ? 516 : 546, '#c1d6ab', 1, true);
    if (layout.passiveOverflow > 0) {
      g.fillStyle(0x20302a, 1).fillRect(612, 560, 24, 24);
      this.fitted('passive-overflow', `+${layout.passiveOverflow}`, 613, 568, 23, '#c1d6ab', 1, true);
    }
    const attack = model.readiness.attackTenths > 0 ? `ATTACK ${(model.readiness.attackTenths / 10).toFixed(1)}S` : 'ATTACK READY';
    this.panel(g, layout.attack.x, layout.attack.y, layout.attack.w, layout.attack.h, CYAN);
    this.fitted('attack-ready', attack, layout.attack.x + 10, layout.attack.y + 9, layout.attack.w - 20, model.readiness.attackTenths > 0 ? '#d7bd8b' : '#c9dc9f', 1, true);
    this.panel(g, 722, 506, 226, 38, 0xc4ce98);
    this.stamp(g, 'dash-key', 'SPACE', 732, 500, YELLOW, true);
    const dash = model.readiness.dashing ? 'DASHING' : model.readiness.dashTenths > 0 ? `DASH ${(model.readiness.dashTenths / 10).toFixed(1)}S` : 'DASH READY';
    this.fitted('dash-ready', dash, 782, 520, 154, model.readiness.dashTenths > 0 ? MUTED : '#d8e3b6', 2, true);
  }

  private pushLog(state: MvpRunState): void {
    this.lastRecent = state.recentChange;
    const text = state.recentChange.toUpperCase().replace(/—/g, '-');
    // Newest on top; a long message takes two lines rather than losing its end.
    for (const line of wrapLogText(text, 33).reverse()) this.log.unshift({ text: line, tick: state.tick });
    this.log.length = Math.min(this.log.length, 4);
  }

  private drawLog(state: MvpRunState): void {
    const visible = this.log.filter((entry) => state.tick - entry.tick >= 0 && state.tick - entry.tick < 60 * 8);
    if (visible.length === 0) return;
    // The existing transient log gets receipt-paper styling; LootView retains
    // ownership of its near-player pickup receipts and success detection.
    this.bottomFrame.fillStyle(0xd6d0b7, 0.95).fillRect(722, 554, 226, 34);
    this.bottomFrame.fillStyle(0xad946b, 1).fillRect(722, 554, 4, 34);
    visible.slice(0, 2).forEach((entry, index) => this.fitted(`log-${index}`, entry.text, 734, 562 + index * 11, 202, '#29303a', 1, true, '#d6d0b7'));
  }

  private drawPrompt(model: GameHudModel, playerLow = false): void {
    const prompt = model.prompt;
    this.promptIcon.setVisible(false);
    if (!prompt) return;
    if (prompt.detail) {
      this.drawOfferCard(prompt, prompt.detail, playerLow, Math.min(hudDockLayout(model).equipment.y, model.wantedLine ? wantedPanel(wantedRows(model.wantedLine).length).y : 600));
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

  /** The Cleanup Combo: a big neon count, a draining window bar, the next payout. */
  private drawCombo(model: GameHudModel): void {
    const combo = model.combo;
    if (!combo) return;
    const x = SCREEN_W - 190;
    const y = 180;
    const hot = combo.count >= 10;
    const color = hot ? '#ffd84a' : '#ff3fc8';
    this.panel(this.frame, x, y, 178, 74, hot ? YELLOW : MAGENTA);
    this.text('combo-label', 'CLEANUP COMBO', x + 10, y + 8, '#9a8fb4', 1);
    this.text('combo-count', `X${combo.count}`, x + 10, y + 20, color, 4);
    this.frame.fillStyle(0x2a1c3a, 1).fillRect(x + 10, y + 56, 158, 6);
    this.frame.fillStyle(hot ? YELLOW : MAGENTA, 1).fillRect(x + 10, y + 56, Math.round(158 * combo.remaining), 6);
    this.text('combo-next', `$${combo.nextBonus} AT X${combo.nextBonusAt}`, x + 168, y + 26, '#6aff8a', 1, false, 1, 'right');
  }

  /**
   * The store card for the offer the janitor is standing at: icon, name and
   * price, what it does, weapon or passive, the keys (greyed when refused),
   * and the one line that decides it — how short you are, or what stealing
   * costs.
   */
  private drawOfferCard(prompt: NonNullable<GameHudModel['prompt']>, detail: HudOfferDetail, playerLow: boolean, dockTop: number): void {
    const width = 560;
    // A recipe-hint half gets one more line: what the pair makes.
    const height = detail.pair ? 122 : 104;
    const x = Math.round((SCREEN_W - width) / 2);
    // Never cover the shelf the janitor is standing at: flip to the top when
    // they are in the lower half of the room.
    const y = playerLow ? 192 : Math.min(372, dockTop - height - 8);
    this.panel(this.frame, x, y, width, height, detail.canBuy ? YELLOW : 0xff5a6a);
    // Icon well.
    this.frame.fillStyle(0x140d22, 1).fillRect(x + 12, y + 12, 80, 80);
    this.frame.lineStyle(2, detail.kind === 'WEAPON' ? CYAN : 0x6aff8a, 1).strokeRect(x + 13, y + 13, 78, 78);
    const usable = usableItemIcon(this.scene, detail.itemDefinitionId);
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
    if (detail.pair) this.text('prompt-pair', detail.pair, tx, y + 98, '#ff3fc8', 1);
    else this.labels.get('prompt-pair')?.setVisible(false);
  }

  private mannequinHintShown = false;
  /** Round 57: the coach's tips already said this shift, and whether the scene lets it speak (dev fixtures stay quiet). */
  private coachShown = new Set<CoachTipId>();
  private coachAllowed = true;
  private careerShifts: number | null = null;

  /** Dev fixtures drop the player mid-night; the coach would only be noise there. */
  public setCoachAllowed(allowed: boolean): void {
    this.coachAllowed = allowed;
  }

  /** One short how-to at a time, for a new janitor's first shifts (round 57). */
  private trackCoach(state: MvpRunState): void {
    if (state.tick === 0) {
      // A new shift: the tips start over, and the career may have counted one more.
      this.coachShown = new Set();
      this.careerShifts = null;
    }
    if (!this.coachAllowed || this.toast) return;
    this.careerShifts ??= browserCareer().load().shifts;
    if (!coachActive(gameSettings().get(), { shifts: this.careerShifts })) return;
    const tip = nextCoachTip(state, this.coachShown);
    if (!tip) return;
    this.coachShown.add(tip.id);
    // Two lines: the big one up to 44 characters, the rest small underneath.
    const sentence = tip.text.lastIndexOf('. ', 44);
    const cut = tip.text.length <= 44 ? tip.text.length : sentence >= 12 ? sentence + 1 : tip.text.lastIndexOf(' ', 44);
    this.toast = {
      title: 'COACH TIP',
      titleColor: '#6aff8a',
      body: tip.text.slice(0, cut),
      hint: tip.text.slice(cut).trim() || 'YOU CAN TURN TIPS OFF IN SETTINGS',
      startedTick: state.tick,
      life: 60 * 7,
    };
  }


  /** The first mannequin of a shift gets a one-time explanation. */
  private trackMannequins(state: MvpRunState): void {
    if (state.tick === 0) this.mannequinHintShown = false;
    if (this.mannequinHintShown) return;
    if (!state.room.combat.enemies.some((enemy) => enemy.kind === 'mannequin' && enemy.health > 0 && !enemy.dormant)) return;
    this.mannequinHintShown = true;
    this.toast = {
      title: 'MANNEQUINS',
      titleColor: '#ff5a6a',
      body: 'THEY ONLY MOVE WHEN YOU LOOK AWAY',
      hint: 'KEEP YOUR AIM ON THEM',
      startedTick: state.tick,
    };
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
        this.toast = { title: `NEW WEAPON: ${weapon.name}`, titleColor: '#3ff0ff', body: itemBlurb(weapon.itemDefinitionId), hint: weapon.slot <= 9 ? `PRESS ${weapon.slot} TO EQUIP` : 'Q / WHEEL OR CLICK TO EQUIP', startedTick: state.tick };
      }
    }
    for (const passive of model.passives) {
      if (!this.knownItems.has(passive.instanceId)) {
        this.toast = { title: `PASSIVE: ${passive.name}`, titleColor: '#6aff8a', body: itemBlurb(passive.itemDefinitionId), hint: 'ALWAYS ON - NOTHING TO EQUIP', startedTick: state.tick };
      }
    }
    this.knownItems = ids;
  }

  /** True while this room's title card is (or is about to be) on screen. */
  private titleCardBusy(state: MvpRunState): boolean {
    if (this.roomKey(state) !== this.titleRoomKey) return true;
    if (!this.titleCard) return false;
    return state.tick - this.titleCard.startedTick < 110 + 40;
  }

  private roomKey(state: MvpRunState): string {
    // Stepping into a store is a new place: its name card plays again.
    return `${state.roomIndex}:${state.wing.rooms[state.roomIndex]?.id}${state.room.interior ? ':inside' : ''}`;
  }

  private drawToast(state: MvpRunState): void {
    if (!this.toast) return;
    // Toasts share the title card's spot: they wait for it to clear.
    if (this.titleCardBusy(state)) {
      this.toast = { ...this.toast, startedTick: state.tick };
      return;
    }
    const age = state.tick - this.toast.startedTick;
    const life = this.toast.life ?? 60 * 4.5;
    if (age > life || age < 0) {
      this.toast = null;
      return;
    }
    const alpha = age < 10 ? age / 10 : age > life - 30 ? Math.max(0, 1 - (age - (life - 30)) / 30) : 1;
    // The title and body are drawn at 12 px a character, the hint at 6.
    const width = Math.max(this.toast.title.length * 12, this.toast.body.length * 12, this.toast.hint.length * 6) + 40;
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
    if (state.room.variantId === 'prop-test' || state.room.variantId === 'prop-test-return') return;
    const age = state.tick - (this.shiftStartTick ?? state.tick);
    // Once per shift: Floor 1's first wing only, not again up the stairs or the escalator.
    if (state.roomIndex !== 0 || state.wing.floor !== undefined || state.wing.part !== 1 || age > 60 * 9) return;
    const alpha = age > 60 * 8 ? Math.max(0, 1 - (age - 480) / 60) : 1;
    const rows: Array<[string, string]> = [
      ['WASD', 'MOVE'],
      ['MOUSE', 'AIM'],
      ['CLICK', 'ATTACK'],
      ['SPACE', 'DASH'],
      ['E', 'BUY / USE'],
      ['F', 'STEAL'],
      ['1-9 Q', 'SWITCH WEAPON'],
      ['X', 'DROP / SELL'],
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
    const roomKey = this.roomKey(state);
    if (roomKey !== this.titleRoomKey) {
      this.titleRoomKey = roomKey;
      this.titleCard?.images.forEach((image) => image.destroy());
      const room = state.wing.rooms[state.roomIndex];
      // Inside a shop the card names the shop; out on the concourse, the wing.
      const name = state.room.secret ? 'THE BACK ROOM' : (activeStore(state)?.name ?? room?.name ?? '').toUpperCase();
      // Floor and room events announce themselves in the title card's subtitle.
      const event = roomEventFor(state, state.roomIndex);
      const { text: subtitle, color: subtitleColor } = roomTitleSubtitle(state);
      // The boss room's card is BossIntro, which holds the fight while it plays.
      const bossRoom = (room?.bossAnchor ?? null) !== null;
      if (bossRoom) {
        this.titleCard = null;
        return;
      }
      const sign = ensureNeonSign(this.scene, { text: name, color: event === 'blackout' ? '#ff5a6a' : '#ff3fc8', scale: 4, subtitle, subtitleColor });
      const halo = this.scene.add.image(SCREEN_W / 2, 200, sign.halo).setBlendMode(Phaser.BlendModes.ADD);
      const core = this.scene.add.image(SCREEN_W / 2, 200, sign.core);
      this.root.add([halo, core]);
      this.titleCard = { images: [halo, core], startedTick: state.tick };
    }
    if (!this.titleCard) return;
    const age = state.tick - this.titleCard.startedTick;
    const hold = 110;
    const fade = age < 20 ? age / 20 : age < hold ? 1 : Math.max(0, 1 - (age - hold) / 40);
    // A wind-up must never hide behind the room title: it steps aside. Once the
    // shift is over the sim clock stops, so a young title would freeze on screen.
    const alpha = state.status !== 'playing' ? 0 : Math.min(fade, this.windupActive(state) ? 0.2 : 1);
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
