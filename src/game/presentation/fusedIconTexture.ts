/**
 * Draws a fused item's icon from its `fusedIconPlan` into a canvas texture
 * (once per fusion, then cached by key): the base icon at full size, each
 * other item at half size stacked on its corner, and a pixel glow around the
 * whole silhouette that widens with the part count.
 */
import type Phaser from 'phaser';
import { usableTextureKey } from './assetFallback';
import { itemIconKey } from './assets';
import { fusedIconPlan } from './fusedIcon';

const SIZE = 48;
const PAD = 4;
const BASE = 32;
const MINI = 16;
/**
 * Where the stacked items sit: bottom-right, then up the right, then along the
 * bottom, and (only a five-part signature fills it) the top-left corner.
 */
const MINI_SPOTS = [
  { x: 28, y: 28 },
  { x: 28, y: 12 },
  { x: 12, y: 28 },
  { x: 12, y: 12 },
];

type Drawable = CanvasImageSource & { width: number; height: number };

function sourceFor(scene: Phaser.Scene, itemId: string): Drawable | null {
  const key = itemIconKey(itemId);
  const usable = key ? usableTextureKey(scene.textures, key) : null;
  return usable ? (scene.textures.get(usable).getSourceImage() as Drawable) : null;
}

function drawFit(ctx: CanvasRenderingContext2D, image: Drawable, x: number, y: number, box: number): void {
  const scale = box / Math.max(image.width, image.height);
  const w = Math.round(image.width * scale);
  const h = Math.round(image.height * scale);
  ctx.drawImage(image, x + Math.floor((box - w) / 2), y + Math.floor((box - h) / 2), w, h);
}

/**
 * The texture key to draw an item with: a fused item's composite icon
 * (built on first use), or the item's own icon. Null when nothing is loaded.
 */
export function usableItemIcon(scene: Phaser.Scene, itemDefinitionId: string): string | null {
  const plan = fusedIconPlan(itemDefinitionId);
  if (!plan) {
    const key = itemIconKey(itemDefinitionId);
    return key ? usableTextureKey(scene.textures, key) : null;
  }
  if (scene.textures.exists(plan.textureKey)) return plan.textureKey;
  const base = sourceFor(scene, plan.baseItemId);
  if (!base) return null;
  const minis = plan.stackedItemIds.slice(0, MINI_SPOTS.length).map((id) => sourceFor(scene, id));

  // The icons alone, so their silhouette can be grown into the glow.
  const art = document.createElement('canvas');
  art.width = SIZE;
  art.height = SIZE;
  const actx = art.getContext('2d');
  if (!actx) return usableTextureKey(scene.textures, itemIconKey(plan.baseItemId) ?? '');
  actx.imageSmoothingEnabled = false;
  drawFit(actx, base, PAD, PAD, BASE);
  minis.forEach((mini, index) => {
    if (!mini) return;
    const spot = MINI_SPOTS[index]!;
    // A dark backing plate keeps a stacked item readable over the base art.
    actx.fillStyle = 'rgba(11, 7, 20, 0.85)';
    actx.fillRect(spot.x - 1, spot.y - 1, MINI + 2, MINI + 2);
    drawFit(actx, mini, spot.x, spot.y, MINI);
  });

  const silhouette = document.createElement('canvas');
  silhouette.width = SIZE;
  silhouette.height = SIZE;
  const sctx = silhouette.getContext('2d')!;
  sctx.drawImage(art, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = `#${plan.glow.color.toString(16).padStart(6, '0')}`;
  sctx.fillRect(0, 0, SIZE, SIZE);

  const texture = scene.textures.createCanvas(plan.textureKey, SIZE, SIZE);
  if (!texture) return null;
  const ctx = texture.getContext();
  ctx.imageSmoothingEnabled = false;
  // Stamping the silhouette at every offset within the glow width grows it
  // by whole pixels, which keeps the glow crisp at any zoom.
  const reach = plan.glow.width;
  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      if (Math.abs(dx) + Math.abs(dy) > reach + 1) continue;
      ctx.globalAlpha = Math.max(Math.abs(dx), Math.abs(dy)) === reach ? 0.55 : 0.9;
      ctx.drawImage(silhouette, dx, dy);
    }
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(art, 0, 0);
  texture.refresh();
  return plan.textureKey;
}
