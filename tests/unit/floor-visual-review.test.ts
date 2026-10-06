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
        const same = (rect: { x: number; y: number; width: number; height: number } | undefined) => !!rect && rect.x === wall.x && rect.y === wall.y
          && rect.width === wall.width && rect.height === wall.height;
        const covered = plan.props.some((prop) => same(prop.covers)) || plan.blocks.some((block) => same(block.covers));
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

describe('round 58: loose decor stays off the furniture', () => {
  it('never stands a free prop on top of, or just behind, a collision rectangle', () => {
    for (const { where, plan, room } of PLANS) {
      if (plan.themeId === 'store_interior') continue;
      for (const prop of plan.props) {
        if (prop.covers) continue;
        const texture = PROP_TEXTURES[prop.prop];
        const width = prop.width ?? texture.width;
        const height = prop.height ?? texture.height;
        const sprite = { x: prop.x - width / 2, y: prop.y - height, width, height };
        for (const wall of interiorWalls(room)) {
          const drawn = { x: wall.x, y: wall.y - 40, width: wall.width, height: wall.height + 44 };
          const overlaps = sprite.x < drawn.x + drawn.width && drawn.x < sprite.x + sprite.width && sprite.y < drawn.y + drawn.height && drawn.y < sprite.y + sprite.height;
          expect(overlaps, `${where} ${prop.id} over ${JSON.stringify(wall)}`).toBe(false);
        }
      }
    }
  });
});

describe('round 58: shop interiors', () => {
  const LEGACY_FIXTURES = new Set(['gondola', 'vhsShelf', 'clothingRack', 'checkout']);
  const interiors = PLANS.filter(({ plan }) => plan.themeId === 'store_interior' && plan.areaName !== 'THE BACK ROOM');

  it('stocks the shops with full-size fixtures, not the old thumbnail shelves', () => {
    expect(interiors.length).toBeGreaterThan(20);
    for (const { where, plan } of interiors) {
      for (const prop of plan.props) expect(LEGACY_FIXTURES.has(prop.prop), `${where} ${prop.id} is a ${prop.prop}`).toBe(false);
    }
  });

  it('lines both side walls with fitted blocks and the back wall end to end', () => {
    for (const { where, plan } of interiors) {
      expect(plan.blocks.length, where).toBeGreaterThanOrEqual(2);
      const back = plan.props.filter((prop) => prop.id.startsWith('wall-')).sort((a, b) => a.x - b.x);
      const blockBack = plan.blocks.some((block) => block.id === 'back-counter');
      expect(back.length > 0 || blockBack, where).toBe(true);
      for (let i = 1; i < back.length; i += 1) {
        const gap = back[i]!.x - (back[i]!.width ?? 0) / 2 - (back[i - 1]!.x + (back[i - 1]!.width ?? 0) / 2);
        expect(gap, `${where} gap before ${back[i]!.id}`).toBeLessThanOrEqual(6);
      }
    }
  });

  it('dresses shops in more than one way', () => {
    const styles = new Set(interiors.map(({ plan }) => plan.props.filter((prop) => prop.id.startsWith('wall-')).map((prop) => prop.prop).join() || 'counter'));
    expect(styles.size).toBeGreaterThanOrEqual(5);
  });
});
