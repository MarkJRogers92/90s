/**
 * The in-canvas end-of-shift card: SHIFT OVER on a death, CLOCKED OUT on a
 * win, the run's numbers revealed row by row, and RETRY / TITLE buttons.
 *
 * The simulation clock stops at game over, so this card runs on real time
 * (`scene.time.now`). It waits for the janitor's death fall to play before it
 * slides in. It draws `buildShiftCardModel` and nothing else; the DOM summary
 * stays in the page (off-screen) for assistive tech and the browser tests.
 */
import { floorOf } from '../../sim/run/floors';
import Phaser from 'phaser';
import type { MvpRunState } from '../../sim/run/types';
import { ensureNeonSign, ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import { buildShiftCardModel, shiftCardDelayMs, type ShiftCardModel } from './shiftCardModel';
import { browserBestRuns } from '../score/score';
import { nodeDefinitionId } from '../../sim/fusion/inventory';
import { browserCareer, localDay, recordShift, type ShiftRecord } from '../career/career';
import { browserDaily } from '../run/dailyShift';
import { flashAllowed, gameSettings } from '../settings/settings';

const DEPTH = 20_600;
const W = 960;
const H = 600;
const CARD_W = 540;
const CARD_H = 570;
const CARD_X = (W - CARD_W) / 2;
const CARD_Y = (H - CARD_H) / 2;
const ROW_MS = 120;
const ROW_H = 25;
const MAX_VALUE_CHARS = 30;

export type ShiftCardAction = 'retry' | 'title' | 'ascend';

type Rect = { x: number; y: number; w: number; h: number; action: ShiftCardAction };

/** How long the card waits after the shift ends, so the death fall reads first. */
function clip(value: string): string {
  return value.length <= MAX_VALUE_CHARS ? value : `${value.slice(0, MAX_VALUE_CHARS - 3)}...`;
}

export class ShiftCard {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly images: Phaser.GameObjects.Image[] = [];
  private endedAt: number | null = null;
  private model: ShiftCardModel | null = null;
  private buttons: Rect[] = [];
  private hovered: ShiftCardAction | null = null;
  private newBest = false;
  private submitted = false;
  private readonly bests = browserBestRuns();
  private readonly career = browserCareer();
  /** What this shift paid into the janitor's career, once it is settled. */
  private record: ShiftRecord | null = null;
  private lastState: MvpRunState | null = null;
  private lastMallSeed = 0;
  private lastDaily: string | null = null;
  private newDailyBest = false;
  private readonly dailies = browserDaily();

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.g = scene.add.graphics();
    this.root = scene.add.container(0, 0, [this.g]).setScrollFactor(0).setDepth(DEPTH).setVisible(false);
  }

  /** Which card button is under a click in game coordinates, if the card is up. */
  public buttonAt(x: number, y: number): ShiftCardAction | null {
    if (!this.root.visible) return null;
    return this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)?.action ?? null;
  }

  /** True once the card is on screen and taking input. */
  public get open(): boolean {
    return this.root.visible && this.buttons.length > 0;
  }

  /** True when the open card's main action is the escalator. */
  public get offersAscend(): boolean {
    return this.model?.ascend === true;
  }

  public hover(x: number, y: number): void {
    this.hovered = this.buttonAt(x, y);
  }

  private afterCinematic = false;

  public sync(state: MvpRunState, mallSeed: number = state.seed, afterCinematic = false, dailyDate: string | null = null): void {
    this.afterCinematic = afterCinematic;
    const model = buildShiftCardModel(state, mallSeed, dailyDate);
    if (!model) {
      this.endedAt = null;
      this.model = null;
      this.submitted = false;
      this.newBest = false;
      this.newDailyBest = false;
      this.record = null;
      this.lastState = null;
      this.buttons = [];
      this.root.setVisible(false);
      return;
    }
    const now = this.scene.time.now;
    if (this.endedAt === null || this.model?.won !== model.won) this.endedAt = now;
    this.model = model;
    this.lastState = state;
    this.lastMallSeed = mallSeed;
    this.lastDaily = dailyDate;
    // A floor-1 clear is not the end of the night: the best is judged at the finish.
    if (!model.ascend) this.settle();
    const age = now - this.endedAt - shiftCardDelayMs(model.won, this.afterCinematic);
    if (age < 0) {
      this.root.setVisible(false);
      this.buttons = [];
      return;
    }
    this.root.setVisible(true);
    this.draw(model, age);
  }

  /**
   * Closes the books on this shift once: the local best and the career's Pay
   * Stubs and polaroid. Called when the card shows a final result, and by the
   * scene when a floor-1 clear clocks out instead of taking the escalator.
   */
  public settle(): void {
    const model = this.model;
    const state = this.lastState;
    if (this.submitted || !model || !state) return;
    this.submitted = true;
    this.newBest = this.bests.submit({ score: model.score, won: model.won && !model.ascend, seconds: model.seconds });
    // Daily Shift: every finished attempt is counted, and the day keeps its best.
    if (this.lastDaily) {
      this.newDailyBest = this.dailies.submit(this.lastDaily, { score: model.score, won: model.won && !model.ascend, seconds: model.seconds });
    }
    const floor = floorOf(state);
    this.record = recordShift(this.career.load(), {
      score: model.score,
      won: model.won && floor === 3,
      floorCleared: floor > 1 || model.ascend,
      floorTwoCleared: floor === 3 || (floor === 2 && model.ascend),
      kills: state.stats.kills,
      bestCombo: state.stats.bestCombo,
      seconds: model.seconds,
      mall: this.lastMallSeed,
      fusions: state.inventory.inventory
        .filter((node) => node.kind === 'composite' && node.recipeId === 'hybrid')
        .map(nodeDefinitionId),
    }, localDay());
    this.career.save(this.record.career);
  }

  private image(index: number, key: string, x: number, y: number): Phaser.GameObjects.Image {
    let image = this.images[index];
    if (!image) {
      image = this.scene.add.image(0, 0, key);
      this.images[index] = image;
      this.root.add(image);
    }
    if (image.texture.key !== key) image.setTexture(key);
    return image.setOrigin(0.5, 0.5).setPosition(Math.round(x), Math.round(y)).setVisible(true).setAlpha(1).setScale(1).setBlendMode(Phaser.BlendModes.NORMAL);
  }

  private draw(model: ShiftCardModel, age: number): void {
    const g = this.g;
    g.clear();
    for (const image of this.images) image.setVisible(false);
    const edge = model.won ? 0x3ff0ff : 0xff3a5a;
    const enter = Math.min(1, age / 260);
    const ease = 1 - (1 - enter) * (1 - enter) * (1 - enter);
    const oy = Math.round((1 - ease) * 40);

    // Backdrop: the mall dims behind the card.
    g.fillStyle(0x05030a, 0.68 * ease).fillRect(0, 0, W, H);
    g.fillStyle(0x0b0714, 0.95 * ease).fillRect(CARD_X, CARD_Y + oy, CARD_W, CARD_H);
    g.lineStyle(3, edge, ease).strokeRect(CARD_X + 1, CARD_Y + oy + 1, CARD_W - 2, CARD_H - 2);
    g.lineStyle(1, edge, 0.4 * ease).strokeRect(CARD_X + 7, CARD_Y + oy + 7, CARD_W - 14, CARD_H - 14);
    g.fillStyle(edge, ease).fillRect(CARD_X, CARD_Y + oy, 18, 3).fillRect(CARD_X, CARD_Y + oy, 3, 18);
    g.fillRect(CARD_X + CARD_W - 18, CARD_Y + oy + CARD_H - 3, 18, 3).fillRect(CARD_X + CARD_W - 3, CARD_Y + oy + CARD_H - 18, 3, 18);

    let slot = 0;
    const sign = ensureNeonSign(this.scene, { text: model.headline, color: model.won ? '#3ff0ff' : '#ff3a5a', scale: 5 });
    // The sign buzzes on like a real neon tube before it holds steady.
    const flicker = age < 420 && flashAllowed(gameSettings().get()) ? (Math.floor(age / 60) % 3 === 1 ? 0.25 : 1) : 1;
    this.image(slot++, sign.halo, W / 2, CARD_Y + oy + 58).setBlendMode(Phaser.BlendModes.ADD).setAlpha(ease * flicker);
    this.image(slot++, sign.core, W / 2, CARD_Y + oy + 58).setAlpha(ease * flicker);
    const sub = ensurePixelLabel(this.scene, model.subline, model.won ? '#6aff8a' : '#ffd84a', 2);
    this.image(slot++, sub.key, W / 2, CARD_Y + oy + 104).setAlpha(ease);

    // Rows land one at a time, each with a little pop.
    const rowTop = CARD_Y + oy + 128;
    model.rows.forEach((row, index) => {
      const rowAge = age - 300 - index * ROW_MS;
      if (rowAge < 0) return;
      const pop = rowAge < 90 ? 1.25 - (rowAge / 90) * 0.25 : 1;
      const y = rowTop + index * ROW_H;
      g.fillStyle(0xffffff, index % 2 === 0 ? 0.04 : 0).fillRect(CARD_X + 24, y - 4, CARD_W - 48, ROW_H + 1);
      const label = ensurePixelLabel(this.scene, row.label, '#9a8fb4', 2);
      this.image(slot++, label.key, CARD_X + 40, y + 10).setOrigin(0, 0.5);
      const value = ensurePixelLabel(this.scene, clip(row.value), '#f4ecff', 2);
      this.image(slot++, value.key, CARD_X + CARD_W - 40, y + 10).setOrigin(1, 0.5).setScale(pop);
    });

    // The score lands last, with a NEW BEST stamp when it is one.
    const scoreAge = age - 300 - model.rows.length * ROW_MS;
    if (scoreAge >= 0) {
      const pop = scoreAge < 120 ? 1.4 - (scoreAge / 120) * 0.4 : 1;
      const scoreY = rowTop + model.rows.length * ROW_H + 22;
      const scoreLabel = ensurePixelLabel(this.scene, `SCORE ${model.score.toLocaleString('en-US')}`, '#ffd84a', 3);
      this.image(slot++, scoreLabel.key, W / 2, scoreY).setScale(pop);
      if (this.newDailyBest) {
        // Straight, on a plate: rotated pixel lettering breaks up.
        const daily = ensurePixelLabel(this.scene, 'NEW DAILY BEST!', '#3ff0ff', 2);
        const plateW = daily.width + 20;
        const dailyY = scoreY + 30;
        g.fillStyle(0x05030a, 1).fillRect(W / 2 - plateW / 2, dailyY - 11, plateW, 22);
        g.lineStyle(2, 0x3ff0ff, Math.floor(age / 300) % 2 === 0 ? 1 : 0.6).strokeRect(W / 2 - plateW / 2, dailyY - 11, plateW, 22);
        this.image(slot++, daily.key, W / 2, dailyY);
      }
      if (this.newBest) {
        const best = ensurePixelLabel(this.scene, 'NEW BEST!', '#ff3fc8', 2);
        this.image(slot++, best.key, W / 2 + 176, scoreY - 4).setScale(Math.floor(age / 250) % 2 === 0 ? 1.1 : 1);
      }
    }
    // Then the pay slip: Pay Stubs banked for the Break Room.
    const payAge = scoreAge - 220;
    if (this.record && payAge >= 0) {
      const pop = payAge < 120 ? 1.3 - (payAge / 120) * 0.3 : 1;
      const payY = rowTop + model.rows.length * ROW_H + (this.newDailyBest ? 84 : 54);
      const pay = ensurePixelLabel(this.scene, `+${this.record.earned} PAY STUBS`, '#6aff8a', 2);
      this.image(slot++, pay.key, W / 2, payY).setScale(pop);
      const note = this.record.employeeOfTheMonth
        ? { text: 'EMPLOYEE OF THE MONTH!', color: '#ff3fc8' }
        : this.record.polaroid
          ? { text: 'PHOTO PINNED UP', color: '#ffd84a' }
          : null;
      if (note && payAge >= 260) {
        // Straight, on a plate: pixel lettering breaks up when it is rotated.
        const stamp = ensurePixelLabel(this.scene, note.text, note.color, 2);
        const stampY = payY + 27;
        const edge = Phaser.Display.Color.HexStringToColor(note.color).color;
        const blink = this.record.employeeOfTheMonth && Math.floor(age / 300) % 2 === 0;
        const plateW = stamp.width + 20;
        g.fillStyle(0x05030a, 1).fillRect(W / 2 - plateW / 2, stampY - 11, plateW, 22);
        g.lineStyle(2, edge, blink ? 1 : 0.6).strokeRect(W / 2 - plateW / 2, stampY - 11, plateW, 22);
        this.image(slot++, stamp.key, W / 2, stampY);
      }
    }
    // Buttons appear once every row is in.
    const buttonsAge = age - 460 - model.rows.length * ROW_MS;
    this.buttons = [];
    if (buttonsAge >= 0) {
      const y = CARD_Y + oy + CARD_H - 64;
      const specs: Array<{ action: ShiftCardAction; key: string; text: string; x: number }> = [
        model.ascend
          ? { action: 'ascend', key: 'R', text: 'ESCALATOR', x: W / 2 - 200 }
          : { action: 'retry', key: 'R', text: model.won ? 'NEW SHIFT' : 'RETRY', x: W / 2 - 200 },
        { action: 'title', key: 'T', text: model.ascend ? 'CLOCK OUT' : 'TITLE', x: W / 2 + 20 },
      ];
      for (const spec of specs) {
        const w = 180;
        const h = 42;
        const hot = this.hovered === spec.action;
        const color = spec.action === 'title' ? 0x9a8fb4 : edge;
        g.fillStyle(hot ? color : 0x140d22, hot ? 0.35 : 1).fillRect(spec.x, y, w, h);
        g.lineStyle(2, color, 1).strokeRect(spec.x + 1, y + 1, w - 2, h - 2);
        // Key cap.
        g.fillStyle(0xf4ecff, 1).fillRect(spec.x + 10, y + 9, 24, 24);
        g.fillStyle(0x8a7fa8, 1).fillRect(spec.x + 10, y + 31, 24, 2);
        const cap = ensurePixelLabel(this.scene, spec.key, '#0b0714', 2, '#f4ecff');
        this.image(slot++, cap.key, spec.x + 22, y + 21).setOrigin(0.5, 0.5);
        const label = ensurePixelLabel(this.scene, spec.text, '#f4ecff', 2);
        this.image(slot++, label.key, spec.x + 46, y + 21).setOrigin(0, 0.5);
        this.buttons.push({ x: spec.x, y, w, h, action: spec.action });
      }
    }
  }

  public destroy(): void {
    this.root.destroy(true);
  }
}
