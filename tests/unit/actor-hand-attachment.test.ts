import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser', () => ({ default: {} }));
import { ActorSpriteView, type ActorPresentation, type ActorSnapshot, type SpriteSpec } from '../../src/game/view/ActorSpriteView';

class BodyImage {
  width = 368; height = 736; visible = false; x = 0; y = 0; depth = 0;
  originX = .5; originY = .84; scaleX = 1; scaleY = 1; rotation = 0; alpha = 1;
  setVisible(v: boolean) { this.visible = v; return this; }
  setTexture(_key: string) { return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setDepth(d: number) { this.depth = d; return this; }
  setAlpha(a: number) { this.alpha = a; return this; }
  setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this; }
  setTint(_t: number) { return this; } setTintMode(_m: number) { return this; } clearTint() { return this; }
  crop = { x: 0, y: 0, width: 0, height: 0 };
  setCrop(x: number, y: number, width: number, height: number) { this.crop = { x, y, width, height }; return this; }
  setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; }
  setRotation(r: number) { this.rotation = r; return this; }
  destroy() { this.visible = false; }
}
const actor: ActorSnapshot = { id: 'player', kind: 'alex', x: 100, y: 200, moveX: 1, moveY: 0, attackTicks: 3, damaged: true, phase: 'idle' };
const visual: ActorPresentation = { direction: 'east', walking: true, attackLean: 3, damageFlicker: true, damageFeedback: true, bobY: -2.5, lunge: 4 };
const spec: SpriteSpec = { textureKey: 'neon:player:alex-aim', frameWidth: 92, frameHeight: 92, scale: 1.2, feetY: 67.76 };
function setup() {
  const image = new BodyImage();
  let calls = 0;
  const scene = { add: { image: () => calls++ === 0 ? image : new BodyImage() } } as unknown as Phaser.Scene;
  return { image, view: new ActorSpriteView(scene, spec) };
}

describe('displayed sprite frame attachment transform', () => {
  it('transforms a frame-local palm through the exact crop origin, bob, lunge, pose scale and rotation', () => {
    const { view, image } = setup();
    view.sync(actor, { row: 6, column: 2 }, visual, true, 320, spec,
      { offsetX: -3, offsetY: 1.5, scaleX: .8, scaleY: 1.1, flash: false });
    const palm = { x: 65, y: 44 };
    // Full-sheet coordinates minus the actual Phaser origin are an independent
    // oracle for the frame-local resolver (the cropped frame isn't recentered).
    const localX = (2 * 92 + palm.x - image.originX * image.width) * image.scaleX;
    const localY = (6 * 92 + palm.y - image.originY * image.height) * image.scaleY;
    const c = Math.cos(image.rotation), s = Math.sin(image.rotation);
    const expected = { x: image.x + localX * c - localY * s, y: image.y + localX * s + localY * c };
    const got = (view as ActorSpriteView & { framePointAt?: (p: typeof palm) => typeof expected | null }).framePointAt?.(palm);
    expect(got).toEqual(expected);
  });
  it('clears an attachment when the body texture is missing instead of leaking the previous pose', () => {
    const { view } = setup();
    view.sync(actor, { row: 6, column: 2 }, visual, true, 320, spec);
    const resolver = view as ActorSpriteView & { framePointAt?: (p: { x: number; y: number }) => { x: number; y: number } | null };
    expect(resolver.framePointAt?.({ x: 65, y: 44 })).toBeDefined();
    view.sync(actor, { row: 6, column: 2 }, visual, false, 320, spec);
    expect(resolver.framePointAt?.({ x: 65, y: 44 })).toBeNull();
  });
});

import { ALEX_HAND_ANCHORS, alexHandAnchor } from '../../src/game/view/alexHandAnchors';
import type { HeldHandAttachment } from '../../src/game/view/WeaponView';

describe('authored palms feed the displayed body transform', () => {
  it.each(Object.entries(ALEX_HAND_ANCHORS))('%s resolves every frame including body deformation and actual palm depth', (textureKey, rows) => {
    const { view, image } = setup();
    const frameWidth = textureKey.startsWith('presentation:') ? 32 : textureKey.endsWith('idle') || textureKey.endsWith('walk') ? 64 : 92;
    const frameHeight = textureKey.startsWith('presentation:') ? 48 : frameWidth;
    image.width = rows[0]!.length * frameWidth;
    image.height = rows.length * frameHeight;
    const sheetSpec = { ...spec, textureKey, frameWidth, frameHeight, feetY: frameHeight * .84 };
    for (const [row, columns] of rows.entries()) for (const [column, anchor] of columns.entries()) {
      view.sync(actor, { row, column }, visual, true, 321, sheetSpec,
        { offsetX: -2, offsetY: 3, scaleX: 1.1, scaleY: .9, flash: false });
      const attachment = (view as ActorSpriteView & { handAt?: () => HeldHandAttachment | null }).handAt?.();
      expect(attachment).toEqual({ ...view.framePointAt(anchor), behind: anchor.behind, depth: 321, alpha: .45 });
    }
  });
  it('does not leave a previous palm on missing, destroyed or death sprites', () => {
    const { view } = setup();
    const read = () => (view as ActorSpriteView & { handAt?: () => HeldHandAttachment | null }).handAt?.();
    view.sync(actor, { row: 6, column: 2 }, visual, true, 321, spec);
    expect(read()).toBeTruthy();
    view.sync(actor, { row: 6, column: 2 }, visual, false, 321, spec);
    expect(read()).toBeNull();
    view.sync(actor, { row: 6, column: 2 }, visual, true, 321, { ...spec, textureKey: 'neon:player:alex-death' });
    expect(read()).toBeNull();
    view.destroy();
    expect(read()).toBeNull();
  });
  it('uses source pose overlap rather than north aim for the reused hurt frames', () => {
    expect(alexHandAnchor('neon:player:alex-hurt', { row: 4, column: 2 })?.behind).toBe(false);
    expect(alexHandAnchor('neon:player:alex-dash', { row: 4, column: 2 })?.behind).toBe(true);
  });
});


describe('minimal original-palm occlusion', () => {
  it('redraws only the authored palm pixels over a front-layer weapon and clears the patch behind the body', () => {
    const images: BodyImage[] = [];
    const scene = { add: { image: () => { const image = new BodyImage(); images.push(image); return image; } } } as unknown as Phaser.Scene;
    const view = new ActorSpriteView(scene, spec);
    const frame = { row: 6, column: 2 };
    view.sync(actor, frame, { ...visual, damageFlicker: false }, true, 320, spec);
    expect(images).toHaveLength(2);
    const body = images[0]!, patch = images[1]!;
    const authored = alexHandAnchor(spec.textureKey, frame)!.handPatch!;
    expect(patch.crop).toEqual({ x: 2 * 92 + authored.x, y: 6 * 92 + authored.y, width: 3, height: 3 });
    expect(patch.visible).toBe(true);
    expect(patch.depth).toBe(322);
    for (const key of ['x', 'y', 'scaleX', 'scaleY', 'originX', 'originY', 'rotation', 'alpha'] as const) expect(patch[key]).toBe(body[key]);
    view.sync(actor, { row: 4, column: 2 }, visual, true, 320, spec);
    expect(patch.visible).toBe(false);
    view.sync(actor, frame, { ...visual, damageFlicker: false }, true, 320, spec);
    expect(patch.visible).toBe(true);
    view.sync(actor, frame, visual, false, 320, spec);
    expect(patch.visible).toBe(false);
    view.destroy();
    expect(patch.visible).toBe(false);
  });
});


it('does not double-composite original palm pixels during translucent hurt flicker', () => {
  const images: BodyImage[] = [];
  const scene = { add: { image: () => { const image = new BodyImage(); images.push(image); return image; } } } as unknown as Phaser.Scene;
  const view = new ActorSpriteView(scene, spec);
  view.sync(actor, { row: 6, column: 2 }, { ...visual, damageFlicker: false }, true, 320, spec);
  expect(images[1]!.visible).toBe(true);
  view.sync(actor, { row: 6, column: 2 }, { ...visual, damageFlicker: true }, true, 320, spec);
  expect(images[0]!.alpha).toBe(.45);
  expect(images[1]!.visible).toBe(false);
  view.sync(actor, { row: 6, column: 2 }, { ...visual, damageFlicker: false }, true, 320, spec);
  expect(images[1]!.visible).toBe(true);
});
