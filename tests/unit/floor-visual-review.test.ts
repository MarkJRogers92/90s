import { describe, expect, it } from 'vitest';
import { generateRunWing, roomStores } from '../../src/sim/run/storeInterior';
import type { FloorNumber } from '../../src/sim/wing/floorSpecs';
import {
  PROP_TEXTURES,
  interiorWalls,
  planRoomDressing,
  type DressingPlan,
} from '../../src/game/presentation/rooms/roomDressing';
import { blockArt } from '../../src/game/presentation/rooms/blockArt';

/**
 * Round 58, the owner's visual review of every floor: no neon lines across a
 * room, no rings round the fountain, no pixel art squashed or stretched to fit
 * a collision box, and no mirrored sign text on floors that cannot reflect.
 */
const FLOORS: readonly FloorNumber[] = [1, 2, 3, 4];
const SEEDS = [0, 1, 3, 7, 11, 42, 1993, 31337];

type Planned = { readonly where: string; readonly plan: DressingPlan; readonly room: ReturnType<typeof generateRunWing>['rooms'][number] };

function everyPlan(): Planned[] {
  const plans: Planned[] = [];
  for (const floor of FLOORS) {
    for (const part of [undefined, 1] as const) {
      for (const seed of SEEDS) {
        const wing = generateRunWing(seed, floor, part);
        for (const room of wing.rooms) {
          const where = `f${floor}${part ? '-first' : ''}${wing.district ? `-${wing.district}` : ''} seed ${seed} ${room.id}`;
          plans.push({ where, room, plan: planRoomDressing(room, floor, null, part, wing.district) });
          roomStores(room).forEach((_, index) => {
            plans.push({ where: `${where} shop ${index}`, room, plan: planRoomDressing(room, floor, index, part, wing.district) });
          });
        }
      }
    }
  }
  return plans;
}

const PLANS = everyPlan();

describe('round 58: no stray neon on the floor', () => {
  it('draws no neon line across a room', () => {
    for (const { where, plan } of PLANS) {
      for (const strip of plan.neonStrips) {
        expect(Math.hypot(strip.x2 - strip.x1, strip.y2 - strip.y1), where).toBeLessThanOrEqual(240);
      }
    }
  });

  it('rings nothing but the Helipad', () => {
    for (const { where, plan } of PLANS) {
      if (plan.areaName === 'HELIPAD') continue;
      expect(plan.neonRings, where).toEqual([]);
    }
  });

  it('only mirrors the signs in a polished floor', () => {
    for (const { where, plan } of PLANS) {
      const polished = plan.floor === 'terrazzo' || plan.floor === 'checker' || plan.floor === 'linoleum' || plan.floor === 'ice';
      expect(plan.signReflections, where).toBe(polished);
    }
  });
});

describe('round 58: props keep their proportions', () => {
  it('never squashes or stretches a sprite out of its own aspect ratio', () => {
    for (const { where, plan } of PLANS) {
      for (const prop of plan.props) {
        if (prop.width === undefined || prop.height === undefined) continue;
        const texture = PROP_TEXTURES[prop.prop];
        const native = texture.width / texture.height;
        const drawn = prop.width / prop.height;
        expect(Math.abs(drawn / native - 1), `${where} ${prop.id} (${prop.prop}) ${prop.width}x${prop.height}`).toBeLessThanOrEqual(0.08);
      }
    }
  });

  it('dresses every collision rectangle on every floor', () => {
    for (const { where, plan, room } of PLANS) {
      if (plan.themeId === 'store_interior') continue;
      for (const wall of interiorWalls(room)) {
        const covered = plan.props.some((prop) => prop.covers && prop.covers.x === wall.x && prop.covers.y === wall.y
          && prop.covers.width === wall.width && prop.covers.height === wall.height);
        expect(covered, `${where} wall ${JSON.stringify(wall)}`).toBe(true);
      }
    }
  });
});

describe('round 58: bars that run away from the camera', () => {
  it('are drawn as a block fitted to the collision, not a ladder of sprites', () => {
    for (const { where, plan, room } of PLANS) {
      if (plan.themeId === 'store_interior') continue;
      for (const wall of interiorWalls(room).filter((candidate) => candidate.height >= candidate.width * 2)) {
        const block = plan.blocks.find((candidate) => candidate.covers === wall);
        expect(block, `${where} wall ${JSON.stringify(wall)}`).toBeDefined();
        const standing = plan.props.filter((prop) => prop.covers === wall);
        expect(standing.length, where).toBeLessThanOrEqual(Math.round(wall.height / 110) + 1);
      }
    }
  });

  it('paints a block exactly over its collision, top face lifted and near face below', () => {
    const covers = { x: 180, y: 110, width: 30, height: 260 };
    for (const material of ['planterBed', 'concrete', 'duct'] as const) {
      const art = blockArt(material, covers, 16);
      const all = [...art.top, ...art.front];
      expect(Math.min(...all.map((p) => p.x))).toBe(covers.x - 1);
      expect(Math.max(...all.map((p) => p.x + p.width))).toBe(covers.x + covers.width + 1);
      expect(Math.max(...art.front.map((p) => p.y + p.height))).toBe(covers.y + covers.height + 1);
      expect(Math.min(...art.top.map((p) => p.y))).toBe(covers.y - 16 - 1);
      expect(blockArt(material, covers, 16)).toEqual(art);
    }
  });
});
