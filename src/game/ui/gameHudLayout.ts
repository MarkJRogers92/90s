import { measurePixelText } from '../presentation/neon/pixelFont';
import type { GameHudModel } from './gameHudModel';

export type HudRect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
export type HudCell = HudRect & { readonly index: number };
/** Fixed bounds: item names and inventory size never push panels into neighbours. */
export function hudDockLayout(model: Pick<GameHudModel, 'weapons' | 'passives'>) {
  const dense = model.weapons.length > 3 || model.passives.length > 3;
  const count = Math.min(9, Math.max(3, model.weapons.length));
  const selected = Math.max(0, model.weapons.findIndex((weapon) => weapon.selected));
  const start = Math.max(0, Math.min(selected - 4, model.weapons.length - 9));
  const weapons: HudCell[] = Array.from({ length: count }, (_, i) => dense
    ? { index: start + i, x: 252 + (i % 5) * 36, y: 520 + Math.floor(i / 5) * 34, w: 32, h: 32 }
    : { index: i, x: 252 + i * 50, y: 540, w: 44, h: 44 });
  // An overflow count occupies the last passive cell; it never looks equippable.
  const passiveCount = Math.min(model.passives.length > 12 ? 11 : 12, model.passives.length);
  const passives: HudCell[] = Array.from({ length: passiveCount }, (_, i) => dense
    ? { index: i, x: 452 + (i % 6) * 32, y: 528 + Math.floor(i / 6) * 32, w: 24, h: 24 }
    : { index: i, x: 420 + i * 32, y: 558, w: 24, h: 24 });
  return {
    dense, weapons, passives, start,
    equipment: { x: 240, y: dense ? 472 : 494, w: 466, h: dense ? 116 : 94 },
    attack: dense ? { x: 722, y: 472, w: 226, h: 26 } : { x: 534, y: 550, w: 160, h: 30 },
    passiveOverflow: model.passives.length - passiveCount,
  };
}

/** Use the large pixel font when it fits, then the small one, then an ellipsis. */
export function fitHudText(text: string, width: number, preferredScale = 2): { text: string; scale: number } {
  if (measurePixelText(text) * preferredScale + 2 <= width) return { text, scale: preferredScale };
  if (measurePixelText(text) + 2 <= width) return { text, scale: 1 };
  const chars = Math.max(0, Math.floor((width - 1) / 6));
  return { text: chars >= 3 ? `${text.slice(0, chars - 3).trimEnd()}...` : text.slice(0, chars), scale: 1 };
}
