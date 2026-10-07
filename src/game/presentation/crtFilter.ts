/**
 * Roadmap V6: an opt-in CRT/VHS look, off by default (Settings: CRT filter).
 *
 * Built from Phaser 4's own camera filters plus one cheap overlay, so there is
 * no custom shader to maintain:
 * - a slight barrel curve and a vignette (built-in filters);
 * - a horizontal-only blur, the colour bleed of a worn VHS tape;
 * - scanlines: a tiled 1x3 pattern laid over the whole screen;
 * - a faint bright band rolling slowly down, only when flashes are allowed.
 * The curve is kept slight because it bends the picture and not the mouse, so a
 * strong one would pull aim off near the edges. Presentation only.
 */
import Phaser from 'phaser';
import { flashAllowed, type GameSettings } from '../settings/settings';

export type CrtLook = {
  /** Phaser's barrel amount: 1 is flat. */
  readonly barrel: number;
  readonly vignette: number;
  /** Horizontal blur strength (the VHS bleed). */
  readonly bleed: number;
  readonly scanlineAlpha: number;
  readonly rollingBar: boolean;
};

export const CRT_SCANLINE_TEXTURE = 'fx:crt-scanlines';
/** Tuned by eye on the Roof (round 63); the dev URL `&crt=v,b,s` overrides it for side-by-side checks. */
const CRT_TUNE = devTune({ vignette: 0.2, bleed: 0.2, scanlines: 0.16 });

function devTune(base: { vignette: number; bleed: number; scanlines: number }) {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return base;
  const raw = new URLSearchParams(window.location.search).get('crt');
  const [vignette, bleed, scanlines] = (raw ?? '').split(',').map(Number);
  return raw ? { vignette: vignette ?? base.vignette, bleed: bleed ?? base.bleed, scanlines: scanlines ?? base.scanlines } : base;
}
/** Above every world band and the HUD (20 000), so the whole picture is on the tube. */
const CRT_DEPTH = 30_000;
const ROLL_TICKS = 420;

export function crtLook(settings: GameSettings): CrtLook | null {
  if (!settings.crt) return null;
  return { barrel: 1.03, vignette: CRT_TUNE.vignette, bleed: CRT_TUNE.bleed, scanlineAlpha: CRT_TUNE.scanlines, rollingBar: flashAllowed(settings) };
}

/** Where the rolling bar's centre is at `tick`: it drifts down the screen and wraps. */
export function rollingBarY(tick: number, height: number): number {
  const span = height + 120;
  return ((tick % ROLL_TICKS) / ROLL_TICKS) * span - 60;
}

type FilterList = {
  addBarrel: (amount: number) => unknown;
  addVignette: (x: number, y: number, radius: number, strength: number) => unknown;
  addBlur: (quality: number, x: number, y: number, strength: number, color?: number, steps?: number) => unknown;
  remove: (filter: unknown) => void;
};

function ensureScanlines(scene: Phaser.Scene): void {
  if (scene.textures.exists(CRT_SCANLINE_TEXTURE)) return;
  const canvas = scene.textures.createCanvas(CRT_SCANLINE_TEXTURE, 4, 3);
  if (!canvas) return;
  const context = canvas.getContext();
  context.clearRect(0, 0, 4, 3);
  context.fillStyle = 'rgba(0,0,0,1)';
  context.fillRect(0, 2, 4, 1);
  canvas.refresh();
}

/** Puts the look on the scene's camera; returns a disposer that takes all of it off again. */
export function installCrt(scene: Phaser.Scene, look: CrtLook): () => void {
  const filters = (scene.cameras.main as unknown as { filters?: { internal?: FilterList } }).filters?.internal;
  const applied: unknown[] = [];
  if (filters) {
    applied.push(filters.addBarrel(look.barrel));
    // One low-quality pass, sideways only, so text stays legible: a smear, not a fog.
    if (look.bleed > 0) applied.push(filters.addBlur(0, look.bleed, 0, 1, 0xffffff, 1));
    applied.push(filters.addVignette(0.5, 0.5, 0.95, look.vignette));
  }
  ensureScanlines(scene);
  const { width, height } = scene.scale;
  const scanlines = scene.add.tileSprite(0, 0, width, height, CRT_SCANLINE_TEXTURE)
    .setOrigin(0, 0).setScrollFactor(0).setDepth(CRT_DEPTH).setAlpha(look.scanlineAlpha);
  let bar: Phaser.GameObjects.Graphics | null = null;
  let tick = 0;
  const roll = (): void => {
    tick += 1;
    const y = rollingBarY(tick, height);
    bar?.clear().fillStyle(0xffffff, 0.035).fillRect(0, y - 20, width, 40).fillStyle(0xffffff, 0.03).fillRect(0, y - 6, width, 12);
  };
  if (look.rollingBar) {
    bar = scene.add.graphics().setScrollFactor(0).setDepth(CRT_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, roll);
  }
  return () => {
    for (const filter of applied) filters?.remove(filter);
    scanlines.destroy();
    if (bar) {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, roll);
      bar.destroy();
    }
  };
}
