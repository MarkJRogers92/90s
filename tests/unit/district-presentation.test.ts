// @ts-expect-error Vitest provides this Node built-in at test runtime.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { ascend } from '../../src/sim/run/floors';
import { DISTRICT_IDS, DISTRICT_FOR_FLOOR, districtSpec } from '../../src/sim/wing/districts';
import { FLOOR_NUMBERS, type FloorNumber } from '../../src/sim/wing/floorSpecs';
import { planRoomDressing } from '../../src/game/presentation/rooms/roomDressing';
import { buildGameHudModel, roomTitleSubtitle } from '../../src/game/ui/gameHudModel';
import { bossIntroCopy } from '../../src/game/ui/bossIntroModel';
import { killCamStamp } from '../../src/game/ui/killCamModel';
import { PA_LINES, PaDirector } from '../../src/game/ui/paModel';
import { DISTRICT_SPRITES } from '../../src/game/view/ActorSpriteView';
import type { MvpRunState } from '../../src/sim/run/types';

function districtRun(floor: FloorNumber): MvpRunState {
  for (let seed = 1; seed < 400; seed += 1) {
    const state = createMvpRun(seed, { floor, part: 1 });
    if (state.wing.district) return state;
  }
  throw new Error('no district');
}

describe('districts on screen (round 50)', () => {
  it('every district room wears the district, and the rink has ice', () => {
    for (const floor of FLOOR_NUMBERS) {
      const state = districtRun(floor);
      const plans = state.wing.rooms.map((room) => planRoomDressing(room, floor, null, 1, state.wing.district));
      plans.forEach((plan, index) => expect(plan.areaName).toBe(state.wing.rooms[index]!.name.toUpperCase()));
      // The fight room and the mini-boss room always get the district's own walls.
      for (const id of ['food_court', 'security_office'] as const) {
        const plan = plans[state.wing.rooms.findIndex((room) => room.id === id)]!;
        const usual = planRoomDressing(state.wing.rooms.find((room) => room.id === id)!, floor, null, 1);
        expect(plan.facades.map((facade) => facade.facade), `${floor} ${id}`).not.toEqual(usual.facades.map((facade) => facade.facade));
      }
    }
    const rink = districtRun(4);
    expect(planRoomDressing(rink.wing.rooms.find((room) => room.id === 'food_court')!, 4, null, 1, 'rink').floor).toBe('ice');
  });

  it('the HUD names the district, sends the janitor to the mini-boss and names it on the bar', () => {
    for (const floor of FLOOR_NUMBERS) {
      const state = districtRun(floor);
      const hud = buildGameHudModel(state);
      const boss = districtSpec(state.wing.district!).miniBoss;
      expect(hud.objectives[0]!.text).toMatch(/^REACH /);
      expect(hud.objectives[0]!.text).not.toMatch(/LOCKDOWN/);
      expect(roomTitleSubtitle(state).text.length).toBeGreaterThan(0);
      state.room.combat.enemies = [{ id: 1, kind: boss, x: 600, y: 300, health: 50, radius: 26, phase: 'pursue', phaseTicks: 1, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0 }];
      expect(buildGameHudModel(state).boss?.name).toBe(bossIntroCopy(boss).name);
    }
  });

  it('each mini-boss has its own card and kill stamp, not Loss Prevention\'s', () => {
    for (const id of DISTRICT_IDS) {
      const boss = districtSpec(id).miniBoss;
      expect(bossIntroCopy(boss).name).not.toBe(bossIntroCopy('lp_manager').name);
      expect(killCamStamp(boss)).not.toBe(killCamStamp('lp_manager'));
    }
  });

  it('the PA greets a district on arrival up the escalator', () => {
    // A boss wing below whose floor-up first wing is a district.
    for (let seed = 1; seed < 300; seed += 1) {
      const below = createMvpRun(seed);
      below.status = 'won';
      const up = ascend(below);
      if (!up.wing.district) continue;
      const pa = new PaDirector();
      pa.observe(below);
      expect(pa.observe(up)).toBe(PA_LINES[`district_${DISTRICT_FOR_FLOOR[2]}`][0]);
      return;
    }
    throw new Error('no district up the escalator in 300 nights');
  });

  it('every district monster and mini-boss has its idle, walk and death sheets on disk', () => {
    for (const sprite of Object.values(DISTRICT_SPRITES)) {
      for (const kind of ['idle', 'walk', 'death']) {
        expect(existsSync(`public/assets/neon/enemies/${sprite.prefix}-${kind}.png`), `${sprite.prefix}-${kind}`).toBe(true);
      }
    }
  });
});
