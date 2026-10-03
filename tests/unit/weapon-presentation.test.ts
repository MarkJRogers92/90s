import { describe, expect, it } from 'vitest';
import { ITEM_CATALOG } from '../../src/sim/items/catalog';
import { hybridDefinitionId } from '../../src/sim/fusion/hybrid';
import { heldWeaponTransform, weaponPresentation, WEAPON_PRESENTATIONS } from '../../src/game/view/weaponPresentation';

const primaryIds = ITEM_CATALOG.filter((item) => item.base).map((item) => item.id);
const aims = Array.from({ length: 8 }, (_, n) => (n * Math.PI) / 4);

describe('authored held-weapon presentations', () => {
  it('explicitly covers every catalog primary without borrowing the unknown fallback', () => {
    expect(primaryIds).toHaveLength(80);
    expect(Object.keys(WEAPON_PRESENTATIONS).sort()).toEqual([...primaryIds].sort());
    for (const id of primaryIds) {
      const p = weaponPresentation(id);
      expect(p, id).toBe(WEAPON_PRESENTATIONS[id]);
      expect(p, id).not.toBe(weaponPresentation('unknown_future_weapon'));
      for (const point of [p.grip, p.head]) {
        expect(point.x, id).toBeGreaterThanOrEqual(0);
        expect(point.x, id).toBeLessThan(32);
        expect(point.y, id).toBeGreaterThanOrEqual(0);
        expect(point.y, id).toBeLessThan(32);
      }
      expect(Math.hypot(p.forward.x, p.forward.y), id).toBeGreaterThan(0);
      expect((p.head.x - p.grip.x) * p.forward.x + (p.head.y - p.grip.y) * p.forward.y, id).toBeGreaterThan(0);
    }
  });
  it('uses the visible business ends of reversed, diagonal and vertical source pixels', () => {
    expect(weaponPresentation('janitor_mop').head).toEqual({ x: 8, y: 24 });
    expect(weaponPresentation('broken_broom_handle').forward).toEqual({ x: 16, y: 16 });
    expect(weaponPresentation('box_cutter').forward.x).toBeLessThan(0);
    expect(weaponPresentation('mic_stand').forward).toEqual({ x: 0, y: -16 });
    expect(weaponPresentation('foam_ball_blaster').forward).toEqual({ x: -1, y: 0 });
    expect(weaponPresentation('nail_gun').forward).toEqual({ x: -1, y: 0 });
    expect(weaponPresentation('pump_soaker').forward).toEqual({ x: 1, y: 0 });
  });
  it('points marker, ball launcher and soda gun toward their visible lower-left tips', () => {
    for (const id of ['paint_marker', 'tennis_ball_launcher', 'soda_gun']) {
      const p = weaponPresentation(id);
      expect(p.forward.x, id).toBeLessThan(0);
      expect(p.forward.y, id).toBeGreaterThan(0);
      expect(p.head.x, id).toBeLessThan(p.grip.x);
    }
  });
  it('uses the CPS black nozzle, flea-spray nose and extinguisher hose rather than stocks or levers', () => {
    expect(weaponPresentation('super_soaker_cps').forward).toEqual({ x: -1, y: 0 });
    expect(weaponPresentation('flea_spray').forward).toEqual({ x: 1, y: 0 });
    expect(weaponPresentation('fire_extinguisher').head).toEqual({ x: 7, y: 25 });
    expect(weaponPresentation('fire_extinguisher').forward).toEqual({ x: 0, y: 1 });
  });
  it('keeps gun barrel axes separate from their below-barrel grips', () => {
    for (const id of ['pump_soaker', 'foam_ball_blaster', 'nail_gun']) {
      const p = weaponPresentation(id);
      expect(p.forward.y, id).toBe(0);
      expect(p.grip.y, id).toBeGreaterThan(p.head.y);
    }
  });
  it('inherits pose, pivot, barrel direction and effect family through nested hybrids', () => {
    for (const id of primaryIds) {
      const fused = hybridDefinitionId(id, 'bubble_bath');
      const nested = hybridDefinitionId(fused, hybridDefinitionId('gel_pens', 'plasma_globe'));
      expect(weaponPresentation(nested), id).toBe(weaponPresentation(id));
      for (const aimAngle of aims) {
        const input = { aimAngle, gripX: 103.5, gripY: 72.25, scale: 1.35 };
        expect(heldWeaponTransform({ ...input, definitionId: nested }), id).toEqual(heldWeaponTransform({ ...input, definitionId: id }));
      }
    }
  });
  it.each(['__proto__', 'constructor', 'toString'])('uses the safe fallback for unknown object-property id %s', (id) => {
    expect(weaponPresentation(id)).toBe(weaponPresentation('unknown_future_weapon'));
  });
  it('keeps a safe finite transform for unknown future ids', () => {
    const t = heldWeaponTransform({ definitionId: 'unknown_future_weapon', aimAngle: Math.PI, gripX: 3, gripY: 4, scale: 1 });
    expect(t.grip).toEqual({ x: 3, y: 4 });
    expect(t.head.x).toBeCloseTo(-9);
    expect(t.head.y).toBeCloseTo(4);
  });
});

describe('pure held transform', () => {
  it.each(primaryIds)('%s keeps its grip fixed and forward aimed in all eight directions at idle/attack scales', (definitionId) => {
    for (const aimAngle of aims) for (const scale of [1.05, 1.35, .9625]) {
      const t = heldWeaponTransform({ definitionId, aimAngle, gripX: 106, gripY: 81, scale });
      const p = t.presentation;
      // Independently reproduce Phaser TransformerImage's full-frame flip.
      const world = (x: number, y: number) => {
        const dx = (x - t.originX * 32) * scale;
        const dy = ((t.flipY ? 32 - y : y) - t.originY * 32) * scale;
        return { x: t.grip.x + Math.cos(t.rotation) * dx - Math.sin(t.rotation) * dy,
          y: t.grip.y + Math.sin(t.rotation) * dx + Math.cos(t.rotation) * dy };
      };
      const grip = world(p.grip.x, p.grip.y), head = world(p.head.x, p.head.y);
      expect(grip.x).toBeCloseTo(106); expect(grip.y).toBeCloseTo(81);
      expect(head.x).toBeCloseTo(t.head.x); expect(head.y).toBeCloseTo(t.head.y);
      const f = world(p.grip.x + p.forward.x, p.grip.y + p.forward.y);
      const length = Math.hypot(f.x - grip.x, f.y - grip.y);
      expect((f.x - grip.x) / length).toBeCloseTo(Math.cos(aimAngle));
      expect((f.y - grip.y) / length).toBeCloseTo(Math.sin(aimAngle));
      expect((head.x - grip.x) * Math.cos(aimAngle) + (head.y - grip.y) * Math.sin(aimAngle)).toBeGreaterThan(0);
      if (p.pose === 'swing') {
        expect((head.x - grip.x) * Math.sin(aimAngle) - (head.y - grip.y) * Math.cos(aimAngle)).toBeCloseTo(0);
      }
    }
  });
  it('keeps horizontal gun handles below the barrel facing either way, with mirrored pivots', () => {
    for (const definitionId of ['pump_soaker', 'foam_ball_blaster', 'nail_gun', 'super_soaker_50', 'laser_tag_rifle']) {
      const right = heldWeaponTransform({ definitionId, aimAngle: 0, gripX: 100, gripY: 80, scale: 1 });
      const left = heldWeaponTransform({ definitionId, aimAngle: Math.PI, gripX: 100, gripY: 80, scale: 1 });
      expect(right.head.y, definitionId).toBeLessThan(right.grip.y);
      expect(left.head.y, definitionId).toBeCloseTo(right.head.y);
      expect(left.head.x - 100, definitionId).toBeCloseTo(100 - right.head.x);
      expect(left.flipY, definitionId).toBe(!right.flipY);
      expect(left.originY + right.originY, definitionId).toBeCloseTo(1);
    }
  });
});


describe('compact box-cutter held size', () => {
  it('authors a cutter-only 20px held size with identical root/nested fusion inheritance', () => {
    expect(weaponPresentation('box_cutter')).toMatchObject({ heldSize: 20 });
    expect(weaponPresentation('hybrid__(hybrid__box_cutter__party_popper)__gel_pens')).toBe(weaponPresentation('box_cutter'));
    for (const id of primaryIds.filter((id) => id !== 'box_cutter')) {
      expect(weaponPresentation(id), id).not.toHaveProperty('heldSize');
    }
  });
});
