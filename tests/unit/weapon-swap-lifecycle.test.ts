import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import type { MvpRunState } from '../../src/sim/run/types';
import { weaponPresentation } from '../../src/game/view/weaponPresentation';
import { ITEM_CATALOG } from '../../src/sim/items/catalog';
import type { PlayerBodyAction } from '../../src/game/view/combatBeats';
vi.mock('phaser', () => ({ default: { Math: { Vector2: class { constructor(public x: number, public y: number) {} } } } }));
import { WeaponView, type WeaponSnapshot } from '../../src/game/view/WeaponView';
import { MvpRunView } from '../../src/game/view/MvpRunView';

function setup() {
  const image: Record<string, unknown> = { width: 32, height: 32, texture: { key: '__DEFAULT' } };
  for (const method of ['setVisible', 'setTexture', 'setPosition', 'setRotation', 'setScale', 'setFlipY', 'setOrigin', 'setDepth']) image[method] = () => image;
  const scene = { add: { image: () => image }, textures: { exists: () => true, get: (key: string) => ({ key }) } } as unknown as Phaser.Scene;
  const graphics: Record<string, unknown> = {};
  for (const method of ['fillStyle', 'fillCircle', 'fillPoints', 'lineStyle', 'beginPath', 'arc', 'strokePath', 'fillRect']) graphics[method] = () => graphics;
  const weapon = new WeaponView(scene);
  return { weapon, graphics: graphics as unknown as Phaser.GameObjects.Graphics };
}
const sample = (definitionId: string, instanceId: string, attackActiveTicks: number): WeaponSnapshot => ({
  definitionId, instanceId, attackActiveTicks, facingX: 1, facingY: 0,
  x: 100, y: 100, delivery: ITEM_CATALOG.find((item) => item.id === definitionId)!.base!.delivery, range: 60, halfAngleRadians: Math.PI / 4,
});
const stateFor = (definitionId: string, instanceId: string, tick: number, active: number): MvpRunState => ({
  status: 'playing', tick, inventory: { selectedPrimaryInstanceId: instanceId },
  room: { combat: { player: { x: 100, y: 100, facing: { x: 1, y: 0 }, attackActiveTicks: active, invulnerableTicks: 0 },
    compiledLoadout: { primary: { definitionId, delivery: ITEM_CATALOG.find((item) => item.id === definitionId)!.base!.delivery, range: 60, halfAngleRadians: Math.PI / 4 } } } },
} as unknown as MvpRunState);
const earlyBody = Reflect.get(MvpRunView.prototype, 'playerAction') as (state: MvpRunState, fxTick: number) => PlayerBodyAction | null;
const drawPlayer = Reflect.get(MvpRunView.prototype, 'drawPlayer') as (state: MvpRunState, graphics: Phaser.GameObjects.Graphics, effects: Phaser.GameObjects.Graphics, drawBody: boolean) => void;
function runView(weapon: WeaponView) {
  return { weapon, actorSprites: new Map(), deadSince: null, scene: { time: { now: 0 } }, feedback: { playerHurtAge: () => null },
    sheetColumns: () => 7, openingConcourse: null,
    weaponEffects: { canRenderMelee: () => false, canRenderRanged: () => false, syncMelee() {}, syncMuzzle() {} } };
}

describe('equipped weapon visual lifetime', () => {
  it.each([
    ['pump_soaker', 'soaker', 'janitor_mop', 'mop'],
    ['janitor_mop', 'first-mop', 'janitor_mop', 'second-mop'],
    ['broken_broom_handle', 'broom', 'box_cutter', 'cutter'],
    ['party_popper', 'popper', 'bottle_rocket_pack', 'rocket'],
    ['fire_extinguisher', 'extinguisher', 'broken_broom_handle', 'broom'],
  ])('clears recovery when switching %s/%s to %s/%s in sync', (oldId, oldInstance, newId, newInstance) => {
    const { weapon, graphics } = setup();
    weapon.sync(sample(oldId!, oldInstance!, 6), 100, graphics, 100);
    weapon.sync(sample(oldId!, oldInstance!, 0), 107, graphics, 100);
    expect(weapon.swingAt(107)).not.toBeNull();
    weapon.sync(sample(newId!, newInstance!, 0), 108, graphics, 100);
    expect(weapon.swingAt(108)).toBeNull();
    expect(weapon.headAt()!.scale).toBe(sample(newId!, newInstance!, 0).delivery === 'direct' ? (weaponPresentation(newId!).heldSize ?? 40) / 32 * 1.05 : 28 / 32 * 1.1);
  });
  it.each([
    ['pump_soaker', 'soaker', 'janitor_mop', 'mop'],
    ['janitor_mop', 'first-mop', 'janitor_mop', 'second-mop'],
    ['broken_broom_handle', 'broom', 'box_cutter', 'cutter'],
    ['party_popper', 'popper', 'bottle_rocket_pack', 'rocket'],
    ['fire_extinguisher', 'extinguisher', 'broken_broom_handle', 'broom'],
  ])('clears the old %s/%s action before the new %s/%s body sprite is chosen', (oldId, oldInstance, newId, newInstance) => {
    const { weapon, graphics } = setup(), view = runView(weapon);
    const old = stateFor(oldId!, oldInstance!, 100, 6);
    earlyBody.call(view, old, 100); drawPlayer.call(view, old, graphics, graphics, false);
    const switched = stateFor(newId!, newInstance!, 108, 0);
    expect(earlyBody.call(view, switched, 108)).toBeNull();
    expect(weapon.swingAt(108)).toBeNull();
    drawPlayer.call(view, switched, graphics, graphics, false);
    expect(weapon.swingAt(108)).toBeNull();
  });
  it('keeps a genuine new attack on the swap tick through early body detection and drawing', () => {
    const { weapon, graphics } = setup(), view = runView(weapon);
    const old = stateFor('pump_soaker', 'soaker', 100, 6);
    earlyBody.call(view, old, 100); drawPlayer.call(view, old, graphics, graphics, false);
    earlyBody.call(view, stateFor('pump_soaker', 'soaker', 107, 0), 107);
    const switched = stateFor('janitor_mop', 'mop', 108, 6);
    expect(earlyBody.call(view, switched, 108)).toEqual({ sheet: 'swing', column: 0 });
    drawPlayer.call(view, switched, graphics, graphics, false);
    expect(weapon.swingAt(108)).toBe(0);
    expect(earlyBody.call(view, switched, 108)).toEqual({ sheet: 'swing', column: 0 });
    expect(weapon.swingAt(116)).toBe(.5);
  });
  it('does not treat the previous weapon\'s unchanged full active window as a new attack after a same-tick swap', () => {
    const { weapon, graphics } = setup();
    weapon.sync(sample('pump_soaker', 'soaker', 6), 100, graphics, 100);
    weapon.sync(sample('janitor_mop', 'mop', 6), 100, graphics, 100);
    expect(weapon.swingAt(100)).toBeNull();
  });
});
