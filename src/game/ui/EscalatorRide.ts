/**
 * The ride up to Floor 2: a short in-canvas scene over the whole stage.
 *
 * Alex rides a neon escalator up the diagonal while the ground floor's shops
 * drop away below and the upper level's cinema and arcade come down into
 * frame, then UPPER LEVEL lights up and the stage fades to the landing. The
 * run is already upstairs (the simulation ascends instantly) and does not
 * tick while this plays; all timing comes from `escalatorRideModel`.
 * Any key, click or pad button skips it once the choosing press has passed.
 */
import Phaser from 'phaser';
import { FACADE_TEXTURES, type FacadeId } from '../presentation/rooms/roomDressing';
import { PLAYER_TEXTURE_KEYS } from '../presentation/assets';
import { ensureNeonSign, ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import { croppedFrameOrigin } from '../view/ActorSpriteView';
import { ESCALATOR, rideFrame, rideSkippable, type RideFrame } from './escalatorRideModel';
import type { FloorNumber } from '../../sim/wing/floorSpecs';

/** Every floor the escalator rides up to. */
export type RideFloor = Exclude<FloorNumber, 1>;

/** What the ride shows: the floor left behind, the floor arrived at, and its sign. */
const RIDES: Readonly<Record<RideFloor, {
  readonly lowerRow: readonly FacadeId[];
  readonly upperRow: readonly FacadeId[];
  readonly sign: { readonly text: string; readonly color: string; readonly subtitle: string; readonly subtitleColor: string };
}>> = {
  2: {
    lowerRow: ['video', 'electronics', 'music'],
    upperRow: ['cinema', 'arcade', 'cinema'],
    sign: { text: 'UPPER LEVEL', color: '#3ff0ff', subtitle: 'CINEMA - ARCADE - MANAGEMENT', subtitleColor: '#ff3fc8' },
  },
  3: {
    lowerRow: ['cinema', 'arcade', 'cinema'],
    upperRow: ['pizza', 'burger', 'wok'],
    sign: { text: 'FOOD COURT', color: '#ff8a3a', subtitle: 'AFTER DARK - ARCADE - THE OWNER', subtitleColor: '#3ff0ff' },
  },
  // Up past the dark food court and out under the sky: machinery, not shops.
  4: {
    lowerRow: ['pizza', 'burger', 'wok'],
    upperRow: ['roofHvac', 'roofBillboard', 'roofAccess'],
    sign: { text: 'THE ROOF', color: '#ffb02a', subtitle: 'HVAC - HELIPAD - THE DEVELOPER', subtitleColor: '#3ff0ff' },
  },
};

const DEPTH = 20_700;
const W = 960;
const H = 600;
const STEP = 22;
/** How far the incline runs past each end, off the stage. */
const RUN_OUT = 420;

export class EscalatorRide {
  private readonly root: Phaser.GameObjects.Container;
  private readonly back: Phaser.GameObjects.Graphics;
  private readonly lowerShops: Phaser.GameObjects.Image[] = [];
  private readonly upperShops: Phaser.GameObjects.Image[] = [];
  private readonly escalator: Phaser.GameObjects.Graphics;
  private readonly rider: Phaser.GameObjects.Image | null;
  private readonly title: Phaser.GameObjects.Image[];
  private readonly hint: Phaser.GameObjects.Image;
  private readonly curtain: Phaser.GameObjects.Graphics;
  private readonly front: Phaser.GameObjects.Graphics;
  private readonly levelSign: Phaser.GameObjects.Image;
  private elapsed = 0;
  private skip = false;

  /** `toFloor` is the floor being ridden to (see RIDES). */
  public constructor(private readonly scene: Phaser.Scene, toFloor: RideFloor = 2) {
    this.back = scene.add.graphics();
    const ride = RIDES[toFloor];
    this.shopRow(ride.lowerRow, this.lowerShops, 0x9a8ab0);
    this.shopRow(ride.upperRow, this.upperShops, 0xffffff);
    this.escalator = scene.add.graphics();
    this.rider = this.makeRider();
    const sign = ensureNeonSign(scene, { scale: 5, ...ride.sign });
    this.title = [
      scene.add.image(W / 2, 64, sign.halo).setBlendMode(Phaser.BlendModes.ADD),
      scene.add.image(W / 2, 64, sign.core),
    ];
    const hint = ensurePixelLabel(scene, 'ANY KEY: SKIP', '#8a7aa8', 1, '#05030a');
    this.hint = scene.add.image(W - 16, H - 14, hint.key).setOrigin(1, 1);
    this.front = scene.add.graphics();
    const level = ensurePixelLabel(scene, `LEVEL ${toFloor} >`, '#3ff0ff', 2, '#05030a');
    this.levelSign = scene.add.image(0, 0, level.key);
    this.curtain = scene.add.graphics();
    this.root = scene.add
      .container(0, 0, [this.back, ...this.lowerShops, ...this.upperShops, this.escalator, ...(this.rider ? [this.rider] : []), this.front, this.levelSign, ...this.title, this.hint, this.curtain])
      .setScrollFactor(0)
      .setDepth(DEPTH);
    window.addEventListener('keydown', this.requestSkip);
    scene.input.on('pointerdown', this.requestSkip);
    this.draw(rideFrame(0));
  }

  /** Advances the ride; returns true once it has finished or been skipped. */
  public update(elapsedMs: number): boolean {
    this.elapsed += Math.max(0, elapsedMs);
    const frame = rideFrame(this.elapsed);
    this.draw(frame);
    return frame.done || this.skip;
  }

  public readonly requestSkip = (): void => {
    if (rideSkippable(this.elapsed)) this.skip = true;
  };

  public destroy(): void {
    window.removeEventListener('keydown', this.requestSkip);
    this.scene.input.off('pointerdown', this.requestSkip);
    this.root.destroy(true);
  }

  private shopRow(ids: readonly FacadeId[], into: Phaser.GameObjects.Image[], tint: number): void {
    let x = 0;
    const total = ids.reduce((sum, id) => sum + FACADE_TEXTURES[id].width, 0);
    const offset = (W - total) / 2;
    for (const id of ids) {
      const texture = FACADE_TEXTURES[id];
      if (!this.scene.textures.exists(texture.key)) {
        x += texture.width;
        continue;
      }
      into.push(this.scene.add.image(offset + x, 0, texture.key).setOrigin(0, 0).setTint(tint));
      x += texture.width;
    }
  }

  private makeRider(): Phaser.GameObjects.Image | null {
    const key = PLAYER_TEXTURE_KEYS.idle;
    if (!this.scene.textures.exists(key)) return null;
    // The idle strip holds eight 64px facings; north-east (index 5) rides up and right.
    // Crop the whole sheet: adding a frame changes its shared gameplay default.
    const image = this.scene.add.image(0, 0, key, '__BASE');
    const origin = croppedFrameOrigin({ row: 0, column: 5 }, image, { width: 64, height: 64 }, 64 * 0.9);
    return image.setCrop(5 * 64, 0, 64, 64).setOrigin(origin.x, origin.y).setScale(2);
  }

  private draw(frame: RideFrame): void {
    for (const image of this.lowerShops) image.setY(frame.lowerShopsY);
    for (const image of this.upperShops) image.setY(frame.upperShopsY);
    this.drawAtrium(frame);
    this.drawEscalator(frame);
    this.rider?.setPosition(Math.round(frame.rider.x), Math.round(frame.rider.y));
    this.drawGlass();
    for (const image of this.title) image.setAlpha(frame.titleAlpha);
    this.hint.setAlpha(rideSkippable(this.elapsed) ? 0.8 : 0);
    this.curtain.clear().fillStyle(0x07050c, frame.fade).fillRect(0, 0, W, H);
  }

  /** A point on the incline `d` px along it, `lift` px above the tread line. */
  private at(d: number, lift: number): Phaser.Math.Vector2 {
    const dx = ESCALATOR.top.x - ESCALATOR.bottom.x;
    const dy = ESCALATOR.top.y - ESCALATOR.bottom.y;
    const length = Math.hypot(dx, dy);
    return new Phaser.Math.Vector2(ESCALATOR.bottom.x + (dx / length) * (d - RUN_OUT), ESCALATOR.bottom.y + (dy / length) * (d - RUN_OUT) - lift);
  }

  private get total(): number {
    return Math.hypot(ESCALATOR.top.x - ESCALATOR.bottom.x, ESCALATOR.top.y - ESCALATOR.bottom.y) + RUN_OUT * 2;
  }

  /** The two floors, the upper slab's underside, pendant lamps and skylight. */
  private drawAtrium(frame: RideFrame): void {
    const g = this.back;
    g.clear();
    g.fillGradientStyle(0x07050c, 0x07050c, 0x2a0f3a, 0x2a0f3a, 1).fillRect(0, 0, W, H);
    // Skylight beams slanting down through the atrium.
    for (const [x, w] of [[180, 90], [470, 60], [720, 110]] as const) {
      g.fillStyle(0xb8a0ff, 0.05).fillPoints([
        new Phaser.Math.Vector2(x, 0), new Phaser.Math.Vector2(x + w, 0),
        new Phaser.Math.Vector2(x + w + 160, H), new Phaser.Math.Vector2(x + 160, H),
      ], true);
    }
    // Ground floor: tiles under its shops.
    const lowerFloor = frame.lowerShopsY + 160;
    g.fillStyle(0x2a2030, 1).fillRect(0, lowerFloor, W, H);
    g.fillStyle(0x3ff0ff, 0.6).fillRect(0, lowerFloor, W, 2);
    for (let x = 0; x < W; x += 48) g.fillStyle(0x3a2e44, 1).fillRect(x, lowerFloor + 2, 1, H);
    // Upper floor: carpet edge, a thick slab, and downlights in its underside.
    const upperFloor = frame.upperShopsY + 160;
    g.fillStyle(0x1e1638, 1).fillRect(0, upperFloor, W, 18);
    g.fillStyle(0xff3fc8, 0.85).fillRect(0, upperFloor, W, 2);
    g.fillStyle(0x0d0916, 1).fillRect(0, upperFloor + 18, W, 58);
    g.fillStyle(0x3ff0ff, 0.9).fillRect(0, upperFloor + 18, W, 2);
    g.fillStyle(0x2a2040, 1).fillRect(0, upperFloor + 74, W, 2);
    for (let x = 40; x < W; x += 120) {
      g.fillStyle(0xfff0c8, 0.9).fillRect(x, upperFloor + 72, 14, 3);
      g.fillStyle(0xfff0c8, 0.06).fillTriangle(x + 7, upperFloor + 76, x - 50, upperFloor + 240, x + 64, upperFloor + 240);
    }
    // Pendant lamps hanging from the slab into the atrium.
    for (const x of [110, 330, 610, 880]) {
      const cord = upperFloor + 76;
      const lamp = cord + 150 + (x % 3) * 30;
      g.lineStyle(1, 0x4a3d62, 1).lineBetween(x, cord, x, lamp);
      g.fillStyle(0xffb040, 0.12).fillCircle(x, lamp + 6, 34);
      g.fillStyle(0xffb040, 0.25).fillCircle(x, lamp + 6, 16);
      g.fillStyle(0x2a2040, 1).fillTriangle(x - 12, lamp + 4, x + 12, lamp + 4, x, lamp - 8);
      g.fillStyle(0xffe0a0, 1).fillRect(x - 4, lamp + 4, 8, 3);
    }
  }

  private drawEscalator(frame: RideFrame): void {
    const g = this.escalator;
    g.clear();
    const at = (d: number, lift: number) => this.at(d, lift);
    const total = this.total;
    // The truss: a dark bolted side panel under the steps, with a magenta underglow.
    g.fillStyle(0x1a1428, 1).fillPoints([at(0, -12), at(total, -12), at(total, -76), at(0, -76)], true);
    g.fillStyle(0x241c36, 1).fillPoints([at(0, -12), at(total, -12), at(total, -22), at(0, -22)], true);
    for (let d = 30; d < total; d += 60) {
      const bolt = at(d, -44);
      g.fillStyle(0x4a3d62, 1).fillRect(bolt.x - 1, bolt.y - 1, 3, 3);
    }
    g.lineStyle(3, 0xff3fc8, 0.95).lineBetween(at(0, -72).x, at(0, -72).y, at(total, -72).x, at(total, -72).y);
    g.lineStyle(10, 0xff3fc8, 0.12).lineBetween(at(0, -78).x, at(0, -78).y, at(total, -78).x, at(total, -78).y);
    // Steps rolling up: grooved blocks with a yellow safety edge on each nose.
    const scroll = frame.stepScroll % STEP;
    for (let d = scroll - STEP, index = 0; d < total; d += STEP, index += 1) {
      const a = Math.max(0, d);
      const b = Math.min(total, d + STEP);
      if (b <= a) continue;
      g.fillStyle(index % 2 === 0 ? 0x4a4468 : 0x3e3858, 1).fillPoints([at(a, 0), at(b, 0), at(b, -12), at(a, -12)], true);
      if (d >= 0) {
        const nose = at(d, 0);
        const foot = at(d, -12);
        g.lineStyle(2, 0xffd84a, 0.95).lineBetween(nose.x, nose.y, foot.x, foot.y);
      }
    }
    g.lineStyle(1, 0x8a80b0, 0.8).lineBetween(at(0, 0).x, at(0, 0).y, at(total, 0).x, at(total, 0).y);
  }

  /** Glass and handrail in front of the rider, so they ride behind the balustrade. */
  private drawGlass(): void {
    const g = this.front;
    g.clear();
    const at = (d: number, lift: number) => this.at(d, lift);
    const total = this.total;
    g.fillStyle(0x3ff0ff, 0.09).fillPoints([at(0, 0), at(total, 0), at(total, 56), at(0, 56)], true);
    for (let d = 60; d < total; d += 140) {
      g.lineStyle(1, 0x9af8ff, 0.25).lineBetween(at(d, 2).x, at(d, 2).y, at(d, 54).x, at(d, 54).y);
    }
    g.lineStyle(9, 0x05030a, 1).lineBetween(at(0, 58).x, at(0, 58).y, at(total, 58).x, at(total, 58).y);
    g.lineStyle(2, 0x6a6090, 1).lineBetween(at(0, 61).x, at(0, 61).y, at(total, 61).x, at(total, 61).y);
    g.lineStyle(2, 0x3ff0ff, 0.9).lineBetween(at(0, 55).x, at(0, 55).y, at(total, 55).x, at(total, 55).y);
    // The rubber rail moves with the steps.
    const scroll = (this.elapsed * 0.09) % 70;
    for (let d = scroll; d < total; d += 70) {
      const p = at(d, 58);
      g.fillStyle(0x3ff0ff, 0.9).fillRect(p.x - 1, p.y - 1, 3, 2);
    }
    // LEVEL 2 at the top of the run.
    const top = at(RUN_OUT + Math.hypot(ESCALATOR.top.x - ESCALATOR.bottom.x, ESCALATOR.top.y - ESCALATOR.bottom.y), 92);
    this.levelSign.setPosition(Math.round(top.x), Math.round(top.y));
  }
}
