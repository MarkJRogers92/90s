/**
 * The boss kill cam: when a boss falls, the camera pushes in on the body,
 * letterbox bars slam in, the screen flashes white and a rubber-stamp verdict
 * lands (LOSS PREVENTED, YOU'RE FIRED) while the death fall plays in slow
 * motion. Timing comes from `killCamModel`; the shift is already won and the
 * simulation has stopped, so this is presentation only.
 *
 * The overlay is screen-fixed, but a camera zoom scales even screen-fixed
 * objects about the view centre, so the overlay is counter-scaled to stay put.
 */
import Phaser from 'phaser';
import type { BossKind } from '../../sim/combat/boss';
import { ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import { flashAllowed, gameSettings } from '../settings/settings';
import { killCamFrame, killCamStamp } from './killCamModel';

const DEPTH = 20_650;
const W = 960;
const H = 600;
const STAMP_AT_MS = 380;

export class KillCam {
  private readonly overlay: Phaser.GameObjects.Container;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly stamp: Phaser.GameObjects.Container;
  private elapsed = 0;
  private stamped = false;

  public constructor(
    private readonly scene: Phaser.Scene,
    kind: BossKind,
    private readonly focus: { readonly x: number; readonly y: number },
    private readonly onStamp: () => void,
  ) {
    this.g = scene.add.graphics();
    const label = ensurePixelLabel(scene, killCamStamp(kind), '#ff2a3a', 5, '#1a0006');
    const text = scene.add.image(0, 0, label.key);
    const border = scene.add.graphics();
    const bw = text.width + 36;
    const bh = text.height + 26;
    // A dark plate so the red stamp reads even over the kill's red wash.
    border.fillStyle(0x05030a, 0.88).fillRect(-bw / 2 - 10, -bh / 2 - 10, bw + 20, bh + 20);
    border.lineStyle(5, 0xff2a3a, 1).strokeRect(-bw / 2, -bh / 2, bw, bh);
    border.lineStyle(2, 0xff2a3a, 0.8).strokeRect(-bw / 2 + 8, -bh / 2 + 8, bw - 16, bh - 16);
    // Lower third: the kill word sits above the body, the verdict below it.
    this.stamp = scene.add.container(W / 2, H - 150, [border, text]).setRotation(-0.14).setAlpha(0);
    this.overlay = scene.add.container(0, 0, [this.g, this.stamp]).setScrollFactor(0).setDepth(DEPTH);
  }

  /** Advances the moment; returns true once it is over. */
  public update(elapsedMs: number): boolean {
    this.elapsed += Math.max(0, elapsedMs);
    const frame = killCamFrame(this.elapsed);
    const camera = this.scene.cameras.main;
    camera.setZoom(frame.zoom);
    // Drift the view toward the body as it pushes in (the bounds keep it in the room).
    const presence = (frame.zoom - 1) / 0.7;
    const roomCentre = { x: W / 2, y: 240 };
    camera.centerOn(roomCentre.x + (this.focus.x - roomCentre.x) * presence, roomCentre.y + (this.focus.y - 40 - roomCentre.y) * presence);
    // Hold the overlay still against the zoom.
    const z = frame.zoom;
    this.overlay.setScale(1 / z).setPosition((W / 2) * (z - 1) / z, (H / 2) * (z - 1) / z);
    const g = this.g.clear();
    if (frame.bars > 0) {
      g.fillStyle(0x05030a, 1).fillRect(0, 0, W, frame.bars).fillRect(0, H - frame.bars, W, frame.bars);
      g.fillStyle(0xff2a3a, 0.9).fillRect(0, frame.bars, W, 2).fillRect(0, H - frame.bars - 2, W, 2);
    }
    const flashes = flashAllowed(gameSettings().get());
    if (frame.flash > 0 && flashes) g.fillStyle(0xffffff, frame.flash * 0.85).fillRect(0, 0, W, H);
    this.stamp.setAlpha(frame.stampAlpha).setScale(frame.stampScale);
    if (!this.stamped && this.elapsed >= STAMP_AT_MS) {
      this.stamped = true;
      this.onStamp();
    }
    return frame.done;
  }

  public destroy(): void {
    this.scene.cameras.main.setZoom(1);
    this.overlay.destroy(true);
  }
}
