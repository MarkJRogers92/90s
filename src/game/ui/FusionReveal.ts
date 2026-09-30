/**
 * The NEW FUSION DISCOVERED banner (round 34): a neon plate that drops in
 * across the top of the screen the first time the janitor makes a fusion,
 * holds, and slides away. It runs on scene tweens alone, so it plays out
 * whether or not the sim is ticking, and it is screen-fixed.
 */
import Phaser from 'phaser';
import { ensureNeonSign, ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import type { FusionRevealBanner } from './fusionRevealModel';
import { flashAllowed, gameSettings } from '../settings/settings';

const DEPTH = 20_500;
const W = 960;
const H = 600;
const HOLD_MS = 2_400;
/** The stamp over the janitor plays first; the banner follows it in. */
const DELAY_MS = 650;

let current: Phaser.GameObjects.Container | null = null;

/**
 * Plays the banner on the half of the screen away from `avoidY` (the
 * janitor's screen height), so it never covers the stamp over the bench.
 */
export function playFusionBanner(scene: Phaser.Scene, banner: FusionRevealBanner, color: string, avoidY: number): void {
  current?.destroy(true);
  const accent = Phaser.Display.Color.HexStringToColor(color).color;
  const plate = scene.add.graphics();
  plate.fillStyle(0x0b0714, 0.92).fillRect(-300, -58, 600, 116);
  plate.lineStyle(3, accent, 1).strokeRect(-300, -58, 600, 116);
  plate.lineStyle(1, accent, 0.45).strokeRect(-294, -52, 588, 104);

  const headline = scene.add.image(0, -36, ensurePixelLabel(scene, banner.headline, color, 2, '#0b0714').key);
  const sign = ensureNeonSign(scene, { text: banner.name, color, scale: 3 });
  const halo = scene.add.image(0, 2, sign.halo).setBlendMode(Phaser.BlendModes.ADD);
  const core = scene.add.image(0, 2, sign.core);
  // A long name shrinks to fit the plate rather than spilling past it.
  const fit = Math.min(1, 560 / Math.max(1, core.width));
  halo.setScale(fit);
  core.setScale(fit);
  const detail = scene.add.image(0, 40, ensurePixelLabel(scene, banner.detail, '#f4ecff', 1, '#0b0714').key);

  const low = avoidY < H / 2;
  const restY = low ? H - 170 : 128;
  const offY = low ? H + 80 : -80;
  const root = scene.add.container(W / 2, offY, [plate, halo, core, headline, detail]).setScrollFactor(0, 0, true).setDepth(DEPTH);
  current = root;
  scene.tweens.add({ targets: root, y: restY, delay: DELAY_MS, duration: 320, ease: 'Back.easeOut' });
  // The neon flickers on, the way the shop signs do (a single fade with reduced flashing).
  if (flashAllowed(gameSettings().get())) scene.tweens.add({ targets: [halo, core], alpha: { from: 0.2, to: 1 }, duration: 90, repeat: 3, yoyo: true, delay: DELAY_MS + 200 });
  else scene.tweens.add({ targets: [halo, core], alpha: { from: 0.2, to: 1 }, duration: 300, delay: DELAY_MS + 200 });
  scene.tweens.add({
    targets: root, y: offY, alpha: 0, delay: DELAY_MS + HOLD_MS, duration: 360, ease: 'Cubic.easeIn',
    onComplete: () => {
      root.destroy(true);
      if (current === root) current = null;
    },
  });
}
