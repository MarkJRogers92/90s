import { describe, expect, it } from 'vitest';
import { generateWing } from '../../src/sim/wing/generateWing';
import { OPENING_FOUNTAIN, ROOM_VARIANTS } from '../../src/sim/wing/templates';
import { validateWingGraph } from '../../src/sim/wing/validateWingGraph';
import {
  FACADE_TEXTURES,
  PROP_TEXTURES,
  STAGE_WIDTH,
  doorwayLaneBlocked,
  interiorWalls,
  planRoomDressing,
} from '../../src/game/presentation/rooms/roomDressing';

const SEEDS = [0, 1, 7, 42, 1993, 31337];

function allRooms() {
  return SEEDS.flatMap((seed) => generateWing(seed).rooms.map((room) => ({ seed, room })));
}

describe('room dressing plans', () => {
  it('dresses every room of every sampled wing', () => {
    for (const { room } of allRooms()) {
      const plan = planRoomDressing(room);
      expect(plan.facades.length).toBeGreaterThan(0);
      expect(plan.lights.length).toBeGreaterThan(0);
      expect(plan.areaName.length).toBeGreaterThan(0);
    }
  });

  it('lines the back wall with storefronts that stay inside the stage without overlapping', () => {
    for (const { room } of allRooms()) {
      const facades = planRoomDressing(room).facades;
      let previousRight = 0;
      for (const facade of facades) {
        const width = FACADE_TEXTURES[facade.facade].width;
        expect(facade.x).toBeGreaterThanOrEqual(previousRight);
        previousRight = facade.x + width;
      }
      expect(previousRight).toBeLessThanOrEqual(STAGE_WIDTH);
    }
  });

  it('puts a solid-looking prop on every authored interior collision rectangle', () => {
    for (const { room } of allRooms()) {
      const plan = planRoomDressing(room);
      for (const wall of interiorWalls(room)) {
        const covering = plan.props.filter((prop) => prop.covers === wall);
        expect(covering.length, `${room.id} wall ${JSON.stringify(wall)}`).toBeGreaterThan(0);
        for (const prop of covering) {
          expect(prop.x).toBeGreaterThanOrEqual(wall.x);
          expect(prop.x).toBeLessThanOrEqual(wall.x + wall.width);
        }
      }
    }
  });

  it('never parks free-standing decor in a doorway lane', () => {
    for (const { room } of allRooms()) {
      for (const prop of planRoomDressing(room).props) {
        if (prop.covers) continue;
        expect(doorwayLaneBlocked(prop.x, prop.y), `${room.id} ${prop.id}`).toBe(false);
      }
    }
  });

  it('only requests registered textures', () => {
    for (const { room } of allRooms()) {
      const plan = planRoomDressing(room);
      for (const prop of plan.props) expect(PROP_TEXTURES[prop.prop]).toBeDefined();
      for (const facade of plan.facades) expect(FACADE_TEXTURES[facade.facade]).toBeDefined();
    }
  });

  it('opens bright and gets darker the deeper the shift goes', () => {
    const wing = generateWing(7);
    const luminance = (hex: number) => ((hex >> 16) & 255) * 0.299 + ((hex >> 8) & 255) * 0.587 + (hex & 255) * 0.114;
    const ambient = Object.fromEntries(wing.rooms.map((room) => [room.id, luminance(planRoomDressing(room).ambient)]));
    expect(ambient.service_corridor).toBeGreaterThan(ambient.food_court!);
    expect(ambient.food_court).toBeGreaterThan(ambient.back_hall!);
    expect(ambient.service_corridor).toBeGreaterThan(ambient.security_office!);
  });

  it('keeps the shoppers in the opening room only', () => {
    for (const { room } of allRooms()) {
      expect(planRoomDressing(room).civilians).toBe(room.id === 'service_corridor');
    }
  });

  it('names each storefront after the store the simulation actually rolled', () => {
    for (const { room } of allRooms()) {
      if (!room.store) continue;
      const plan = planRoomDressing(room);
      const signs = plan.facades.flatMap((facade) => (facade.sign ? [facade.sign.text] : []));
      expect(signs).toContain(room.store.name.toUpperCase());
    }
  });
});

describe('opening fountain collision', () => {
  it('is authored in both Opening Concourse variants and keeps the wing graph valid', () => {
    for (const variant of ROOM_VARIANTS.service_corridor) {
      expect(variant.interiorWalls).toContainEqual(OPENING_FOUNTAIN);
    }
    for (const seed of SEEDS) {
      expect(() => validateWingGraph(generateWing(seed))).not.toThrow();
    }
  });

  it('is dressed with the globe fountain', () => {
    const opening = generateWing(0).rooms.find((room) => room.id === 'service_corridor')!;
    const fountain = planRoomDressing(opening).props.find((prop) => prop.prop === 'fountain');
    expect(fountain?.covers).toEqual(OPENING_FOUNTAIN);
  });
});
