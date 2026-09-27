/**
 * Runtime-generated presentation textures.
 *
 * Everything here is drawn onto canvases at scene start instead of shipped as
 * files: the radial light sprite the lighting pass stamps, the neon lettering
 * for storefront signs, and the themed floor tiles. Text is the reason this
 * exists: generated pixel art cannot spell, so every word on a sign is set in
 * the shared pixel font and then given a glow.
 */
import Phaser from 'phaser';
import { GLYPH_HEIGHT, measurePixelText, paintPixelText } from './pixelFont';

export const FX_TEXTURES = {
  light: 'fx:light-soft',
  lightHard: 'fx:light-hard',
  shadow: 'fx:contact-shadow',
  spark: 'fx:spark',
  vignette: 'fx:vignette',
} as const;

export type FloorStyle =
  | 'terrazzo'
  | 'checker'
  | 'carpet'
  | 'concrete'
  | 'linoleum';

export function floorTextureKey(style: FloorStyle): string {
  return `floor:${style}`;
}

export type NeonSignSpec = {
  readonly text: string;
  /** CSS colour of the tube. */
  readonly color: string;
  /** Font pixels per sign pixel. */
  readonly scale: number;
  /** Optional second line underneath in a smaller size. */
  readonly subtitle?: string;
  readonly subtitleColor?: string;
};

export function neonTextureKeys(spec: NeonSignSpec): { core: string; halo: string } {
  const id = `${spec.text}|${spec.color}|${spec.scale}|${spec.subtitle ?? ''}|${spec.subtitleColor ?? ''}`;
  return { core: `neon:core:${id}`, halo: `neon:halo:${id}` };
}

/** Ensures every shared FX texture exists; cheap to call from every scene. */
export function ensureFxTextures(scene: Phaser.Scene): void {
  const textures = scene.textures;
  if (!textures.exists(FX_TEXTURES.light)) {
    const size = 128;
    const canvas = textures.createCanvas(FX_TEXTURES.light, size, size);
    if (canvas) {
      const context = canvas.getContext();
      const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.25, 'rgba(255,255,255,0.72)');
      gradient.addColorStop(0.6, 'rgba(255,255,255,0.22)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
      canvas.refresh();
    }
  }
  if (!textures.exists(FX_TEXTURES.lightHard)) {
    const size = 64;
    const canvas = textures.createCanvas(FX_TEXTURES.lightHard, size, size);
    if (canvas) {
      const context = canvas.getContext();
      const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.55, 'rgba(255,255,255,0.9)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
      canvas.refresh();
    }
  }
  if (!textures.exists(FX_TEXTURES.shadow)) {
    const canvas = textures.createCanvas(FX_TEXTURES.shadow, 32, 12);
    if (canvas) {
      const context = canvas.getContext();
      context.fillStyle = 'rgba(0,0,0,0.5)';
      context.beginPath();
      context.ellipse(16, 6, 15, 5, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.beginPath();
      context.ellipse(16, 6, 10, 3.5, 0, 0, Math.PI * 2);
      context.fill();
      canvas.refresh();
    }
  }
  if (!textures.exists(FX_TEXTURES.spark)) {
    const canvas = textures.createCanvas(FX_TEXTURES.spark, 4, 4);
    if (canvas) {
      const context = canvas.getContext();
      context.fillStyle = '#ffffff';
      context.fillRect(1, 0, 2, 4);
      context.fillRect(0, 1, 4, 2);
      canvas.refresh();
    }
  }
  for (const style of ['terrazzo', 'checker', 'carpet', 'concrete', 'linoleum'] as const) {
    ensureFloorTexture(scene, style);
  }
}

/**
 * Builds a sign as two textures: a crisp tube layer and a soft halo layer.
 * The halo is drawn additively above the lighting pass so signs glow into the
 * dark room; the core stays pixel-sharp so the lettering reads.
 */
export function ensureNeonSign(scene: Phaser.Scene, spec: NeonSignSpec): { core: string; halo: string; width: number; height: number } {
  const keys = neonTextureKeys(spec);
  const subScale = Math.max(1, Math.floor(spec.scale / 2));
  const titleWidth = measurePixelText(spec.text) * spec.scale;
  const subtitleWidth = spec.subtitle ? measurePixelText(spec.subtitle) * subScale : 0;
  const pad = 12;
  const lineGap = spec.subtitle ? subScale * 3 : 0;
  const contentWidth = Math.max(titleWidth, subtitleWidth);
  const contentHeight = GLYPH_HEIGHT * spec.scale + (spec.subtitle ? lineGap + GLYPH_HEIGHT * subScale : 0);
  const width = contentWidth + pad * 2;
  const height = contentHeight + pad * 2;
  const subColor = spec.subtitleColor ?? spec.color;

  const drawLetters = (context: CanvasRenderingContext2D, color: string, subtitle: string): void => {
    paintPixelText(context, spec.text, pad + Math.round((contentWidth - titleWidth) / 2), pad, spec.scale, color);
    if (spec.subtitle) {
      paintPixelText(
        context,
        spec.subtitle,
        pad + Math.round((contentWidth - subtitleWidth) / 2),
        pad + GLYPH_HEIGHT * spec.scale + lineGap,
        subScale,
        subtitle,
      );
    }
  };

  if (!scene.textures.exists(keys.core)) {
    const canvas = scene.textures.createCanvas(keys.core, width, height);
    if (canvas) {
      const context = canvas.getContext();
      // Tube body in the sign colour, then a hot near-white centre line so the
      // tube reads as lit glass rather than flat paint.
      drawLetters(context, spec.color, subColor);
      if (spec.scale >= 3) {
        context.globalCompositeOperation = 'source-atop';
        context.fillStyle = 'rgba(255,255,255,0.55)';
        for (let y = pad; y < pad + contentHeight; y += spec.scale) {
          context.fillRect(0, y + Math.floor(spec.scale / 2), width, 1);
        }
        context.globalCompositeOperation = 'source-over';
      }
      canvas.refresh();
    }
  }
  if (!scene.textures.exists(keys.halo)) {
    const canvas = scene.textures.createCanvas(keys.halo, width, height);
    if (canvas) {
      const context = canvas.getContext();
      context.shadowColor = spec.color;
      context.shadowBlur = 10;
      drawLetters(context, spec.color, subColor);
      context.shadowBlur = 5;
      drawLetters(context, spec.color, subColor);
      canvas.refresh();
    }
  }
  return { ...keys, width, height };
}

/* ------------------------------------------------------------------------ */
/* Floors                                                                     */
/* ------------------------------------------------------------------------ */

/** Deterministic tiny PRNG so every floor texture is identical run to run. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ensureFloorTexture(scene: Phaser.Scene, style: FloorStyle): void {
  const key = floorTextureKey(style);
  if (scene.textures.exists(key)) return;
  const size = 64;
  const canvas = scene.textures.createCanvas(key, size, size);
  if (!canvas) return;
  const context = canvas.getContext();
  const random = mulberry(style.length * 7919);
  const speckle = (colors: readonly string[], count: number, max = 2): void => {
    for (let i = 0; i < count; i += 1) {
      context.fillStyle = colors[Math.floor(random() * colors.length)]!;
      const s = 1 + Math.floor(random() * max);
      context.fillRect(Math.floor(random() * size), Math.floor(random() * size), s, 1);
    }
  };

  switch (style) {
    case 'terrazzo': {
      // Polished warm terrazzo in 32px slabs, alternating tone like a real
      // concourse, with chips and a thin grout seam.
      for (let ty = 0; ty < 2; ty += 1) {
        for (let tx = 0; tx < 2; tx += 1) {
          context.fillStyle = (tx + ty) % 2 === 0 ? '#b99a86' : '#a88977';
          context.fillRect(tx * 32, ty * 32, 32, 32);
        }
      }
      speckle(['#d8c2ae', '#8c6c60', '#e9d8c4', '#7a5b55', '#c4a48e'], 220);
      speckle(['#6f8f96', '#b06f7a'], 18, 1);
      context.fillStyle = '#6b5048';
      for (const p of [0, 32]) {
        context.fillRect(p, 0, 1, size);
        context.fillRect(0, p, size, 1);
      }
      context.fillStyle = 'rgba(255,255,255,0.12)';
      for (const p of [1, 33]) {
        context.fillRect(p, 0, 1, size);
        context.fillRect(0, p, size, 1);
      }
      break;
    }
    case 'checker': {
      // Food court: cream and cherry-red 16px checkerboard.
      for (let ty = 0; ty < 4; ty += 1) {
        for (let tx = 0; tx < 4; tx += 1) {
          context.fillStyle = (tx + ty) % 2 === 0 ? '#e7dcc4' : '#a8363f';
          context.fillRect(tx * 16, ty * 16, 16, 16);
        }
      }
      speckle(['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.18)'], 90);
      context.fillStyle = 'rgba(0,0,0,0.22)';
      for (let p = 0; p < size; p += 16) {
        context.fillRect(p, 0, 1, size);
        context.fillRect(0, p, size, 1);
      }
      break;
    }
    case 'carpet': {
      // Early-90s commercial carpet: navy with teal and magenta confetti.
      context.fillStyle = '#2a2a5a';
      context.fillRect(0, 0, size, size);
      speckle(['#33336d', '#23234c'], 260);
      const shapes = ['#35c6c6', '#e04aa8', '#e8c94a', '#7d5ce6'];
      for (let i = 0; i < 14; i += 1) {
        context.fillStyle = shapes[i % shapes.length]!;
        const x = Math.floor(random() * 60);
        const y = Math.floor(random() * 60);
        if (i % 3 === 0) {
          context.fillRect(x, y, 4, 1);
          context.fillRect(x + 1, y + 1, 4, 1);
        } else if (i % 3 === 1) {
          context.fillRect(x, y, 1, 3);
          context.fillRect(x + 1, y + 2, 2, 1);
        } else {
          context.fillRect(x, y, 2, 2);
        }
      }
      break;
    }
    case 'concrete': {
      context.fillStyle = '#6c6f70';
      context.fillRect(0, 0, size, size);
      speckle(['#77797a', '#5f6263', '#838586', '#555858'], 380);
      context.fillStyle = 'rgba(40,30,20,0.25)';
      context.beginPath();
      context.ellipse(44, 20, 10, 6, 0.3, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#4d5051';
      context.fillRect(0, 0, size, 1);
      context.fillRect(0, 0, 1, size);
      break;
    }
    case 'linoleum': {
      for (let ty = 0; ty < 2; ty += 1) {
        for (let tx = 0; tx < 2; tx += 1) {
          context.fillStyle = (tx + ty) % 2 === 0 ? '#8a9a84' : '#7b8b76';
          context.fillRect(tx * 32, ty * 32, 32, 32);
        }
      }
      speckle(['#99a893', '#6f7e6b', '#a5b39f'], 200);
      context.fillStyle = '#55624f';
      for (const p of [0, 32]) {
        context.fillRect(p, 0, 1, size);
        context.fillRect(0, p, size, 1);
      }
      break;
    }
  }
  canvas.refresh();
}

/* ------------------------------------------------------------------------ */
/* HUD glyphs                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Pixel-font text with a one-pixel dark outline, cached per string. Used for
 * damage numbers and every word in the in-canvas HUD, so interface text is the
 * same typeface as the storefront neon.
 */
export function ensurePixelLabel(
  scene: Phaser.Scene,
  text: string,
  color: string,
  scale = 1,
  outline = '#0a0610',
): { key: string; width: number; height: number } {
  const key = `label:${text}|${color}|${scale}|${outline}`;
  const width = measurePixelText(text) * scale + 2;
  const height = GLYPH_HEIGHT * scale + 2;
  if (!scene.textures.exists(key)) {
    const canvas = scene.textures.createCanvas(key, Math.max(1, width), height);
    if (canvas) {
      const context = canvas.getContext();
      for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2], [0, 0], [2, 2], [0, 2], [2, 0]] as const) {
        paintPixelText(context, text, dx, dy, scale, outline);
      }
      paintPixelText(context, text, 1, 1, scale, color);
      canvas.refresh();
    }
  }
  return { key, width, height };
}

export const HEART_TEXTURES = { full: 'hud:heart-full', half: 'hud:heart-half', empty: 'hud:heart-empty' } as const;

const HEART_ROWS = [
  '.##.##.',
  '#######',
  '#######',
  '#######',
  '.#####.',
  '..###..',
  '...#...',
];

/** Isaac-style hearts: each heart is two health, drawn full, half or empty. */
export function ensureHeartTextures(scene: Phaser.Scene): void {
  const scale = 2;
  const size = { w: 7 * scale + 2, h: 7 * scale + 2 };
  const draw = (key: string, fillColumns: number): void => {
    if (scene.textures.exists(key)) return;
    const canvas = scene.textures.createCanvas(key, size.w, size.h);
    if (!canvas) return;
    const context = canvas.getContext();
    HEART_ROWS.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell !== '#') return;
        context.fillStyle = '#12060c';
        context.fillRect(x * scale, y * scale, scale + 2, scale + 2);
      });
    });
    HEART_ROWS.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell !== '#') return;
        const lit = x < fillColumns;
        context.fillStyle = lit ? (y < 2 && x < 3 ? '#ff9aa8' : '#e8243c') : '#3a2230';
        context.fillRect(x * scale + 1, y * scale + 1, scale, scale);
      });
    });
    canvas.refresh();
  };
  draw(HEART_TEXTURES.full, 7);
  draw(HEART_TEXTURES.half, 4);
  draw(HEART_TEXTURES.empty, 0);
}
