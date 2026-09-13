import { describe, expect, it } from 'vitest';
import { M3_WING } from '../../src/sim/shop/catalog';
import { beginTheft } from '../../src/sim/shop/commands';
import { createWingRun } from '../../src/sim/shop/createWingRun';
import { securityFacingAtTick } from '../../src/sim/shop/security';
import {
  crossedStoreExit,
  nearestAvailableOffer,
  tickWingRun,
} from '../../src/sim/shop/tickWingRun';
import { advanceWing, replayWing, wingFrame } from '../helpers';

function store(id: string) {
  return M3_WING.stores.find((candidate) => candidate.id === id)!;
}

function placeInCurrentSightCone(state = createWingRun(7), storeId = 'homestyle') {
  const currentStore = store(storeId);
  const facing = securityFacingAtTick(currentStore.sightZone, state.tick + 1);
  state.player.x = currentStore.sightZone.origin.x + Math.cos(facing) * 100;
  state.player.y = currentStore.sightZone.origin.y + Math.sin(facing) * 100;
  return state;
}

describe('authoritative wing tick', () => {
  it('moves at the M1 rate while respecting the authored store walls', () => {
    const state = createWingRun(7);
    state.player.x = 180;
    state.player.y = 280;

    tickWingRun(state, wingFrame(0, 1));
    expect(state.player.y).toBe(280);

    state.player.x = 480;
    state.player.y = 390;
    advanceWing(state, wingFrame(1, 0), 60);
    expect(state.player.x).toBeCloseTo(690, 6);
  });

  it('selects an available offer by distance and then stable offer id', () => {
    const state = createWingRun(7);
    state.player.x = 240;
    state.player.y = 150;
    const tiedState = { ...state, offers: [...state.offers] };
    tiedState.offers[0] = { ...tiedState.offers[0]!, id: 'z-offer', position: { x: 220, y: 150 } };
    tiedState.offers[1] = { ...tiedState.offers[1]!, id: 'a-offer', position: { x: 260, y: 150 } };

    expect(nearestAvailableOffer(tiedState)?.id).toBe('a-offer');
  });

  it('uses locale-independent ordinal offer ids to break distance ties', () => {
    const state = createWingRun(7);
    state.player.x = 240;
    state.player.y = 150;
    const tiedState = { ...state, offers: [...state.offers] };
    tiedState.offers[0] = {
      ...tiedState.offers[0]!,
      id: 'a_thing',
      position: { x: 220, y: 150 },
    };
    tiedState.offers[1] = {
      ...tiedState.offers[1]!,
      id: 'a-thing',
      position: { x: 260, y: 150 },
    };

    expect(nearestAvailableOffer(tiedState)?.id).toBe('a-thing');
  });

  it('edge-triggers a nearby purchase once while an interaction key is held', () => {
    const state = createWingRun(7);
    state.player.x = 140;
    state.player.y = 150;

    advanceWing(state, wingFrame(0, 0, true), 2);

    expect(state.inventory).toHaveLength(1);
    expect(state.inventory[0]?.sourceOfferId).toBe('homestyle-mop');
    expect(state.cash).toBe(20);
  });

  it('publishes rejected contextual reasons without letting security erase them', () => {
    const insufficientCash = createWingRun(7);
    insufficientCash.cash = 0;
    insufficientCash.player.x = 140;
    insufficientCash.player.y = 150;

    tickWingRun(insufficientCash, wingFrame(0, 0, true));

    expect(insufficientCash.cash).toBe(0);
    expect(insufficientCash.inventory).toEqual([]);
    expect(insufficientCash.offers.find((offer) => offer.id === 'homestyle-mop')?.status).toBe(
      'available',
    );
    expect(insufficientCash.recentChange).toBe('Not enough cash.');
    expect(insufficientCash.behaviorTrace.at(-1)).toBe('[t1] Not enough cash.');

    const carrying = createWingRun(7);
    expect(beginTheft(carrying, 'homestyle-gel-pens').accepted).toBe(true);
    carrying.player.x = 480;
    carrying.player.y = 450;
    const before = JSON.stringify({
      cash: carrying.cash,
      offers: carrying.offers,
      inventory: carrying.inventory,
      carried: carrying.carried,
      heat: carrying.heat,
      suspicion: carrying.suspicion,
      player: carrying.player,
      status: carrying.status,
    });

    tickWingRun(carrying, wingFrame(0, 0, true));

    expect(JSON.stringify({
      cash: carrying.cash,
      offers: carrying.offers,
      inventory: carrying.inventory,
      carried: carrying.carried,
      heat: carrying.heat,
      suspicion: carrying.suspicion,
      player: carrying.player,
      status: carrying.status,
    })).toBe(before);
    expect(carrying.recentChange).toBe('Secure the carried item before leaving.');
    expect(carrying.behaviorTrace.slice(-2)).toEqual([
      '[t1] Secure the carried item before leaving.',
      '[t1] Hidden from security.',
    ]);
  });

  it('only secures a carried theft through its actual source exit before detection', () => {
    const state = createWingRun(7);
    const homestyle = store('homestyle');
    expect(beginTheft(state, 'homestyle-gel-pens').accepted).toBe(true);

    state.player.x = homestyle.exit.bounds.x + homestyle.exit.bounds.width / 2;
    state.player.y = homestyle.exit.bounds.y - 2;
    tickWingRun(state, wingFrame(0, 1));

    expect(state.carried).toBeNull();
    expect(state.inventory[0]).toMatchObject({ acquisitionKind: 'stolen' });
    expect(state.heat).toBe(15);
    expect(state.recentChange).toContain('Secured');

    const missedDoor = createWingRun(7);
    expect(beginTheft(missedDoor, 'homestyle-gel-pens').accepted).toBe(true);
    missedDoor.player.x = homestyle.exit.bounds.x - 20;
    missedDoor.player.y = homestyle.exit.bounds.y - 2;
    expect(
      crossedStoreExit(
        { x: missedDoor.player.x, y: missedDoor.player.y },
        { x: missedDoor.player.x, y: missedDoor.player.y + 210 / 60 },
        missedDoor.player.radius,
        homestyle,
      ),
    ).toBe(false);
    tickWingRun(missedDoor, wingFrame(0, 1));
    expect(missedDoor.carried).not.toBeNull();
  });

  it('gains suspicion in sight, drains it while hidden, and scales gain by Heat', () => {
    const seen = placeInCurrentSightCone();
    expect(beginTheft(seen, 'homestyle-gel-pens').accepted).toBe(true);
    tickWingRun(seen, wingFrame());
    expect(seen.suspicion).toBeCloseTo(0.5);
    expect(seen.recentChange).toContain('Seen');

    seen.player.x = 480;
    seen.player.y = 390;
    seen.suspicion = 5;
    tickWingRun(seen, wingFrame());
    expect(seen.suspicion).toBeCloseTo(4.25);
    expect(seen.recentChange).toContain('Hidden');

    const hot = placeInCurrentSightCone();
    hot.heat = 100;
    expect(beginTheft(hot, 'homestyle-gel-pens').accepted).toBe(true);
    tickWingRun(hot, wingFrame());
    expect(hot.suspicion).toBeCloseTo(1);
  });

  it('confiscates at full suspicion with a reset and cleared held actions', () => {
    const state = placeInCurrentSightCone();
    const homestyle = store('homestyle');
    expect(beginTheft(state, 'homestyle-gel-pens').accepted).toBe(true);
    state.suspicion = 99.5;
    state.heldActions = { interact: true, steal: true };

    tickWingRun(state, wingFrame(0, 0, true, true));

    expect(state.carried).toBeNull();
    expect(state.offers.find((offer) => offer.id === 'homestyle-gel-pens')?.status).toBe('available');
    expect(state.heat).toBe(25);
    expect(state.suspicion).toBe(0);
    expect(state.player).toMatchObject(homestyle.resetPoint);
    expect(state.heldActions).toEqual({ interact: false, steal: false });
    expect(state.recentChange).toContain('Confiscated');
  });

  it('leaves only on an interaction edge, freezes terminal state, and restarts cleanly', () => {
    const state = createWingRun(7);
    state.player.x = 480;
    state.player.y = 450;
    tickWingRun(state, wingFrame(0, 0, true));
    expect(state.status).toBe('left');
    const terminal = JSON.stringify(state);

    advanceWing(state, wingFrame(1, 1, false, true), 20);
    expect(JSON.stringify(state)).toBe(terminal);

    const restarted = createWingRun(7);
    expect(restarted).toMatchObject({
      tick: 0,
      status: 'shopping',
      cash: 30,
      carried: null,
      heat: 0,
      suspicion: 0,
      inventory: [],
      heldActions: { interact: false, steal: false },
    });
  });

  it('replays identical inputs exactly and distinguishes divergent inputs', () => {
    const inputs = [
      wingFrame(1, 0),
      wingFrame(1, 0),
      wingFrame(0, -1),
      wingFrame(0, -1, true),
      wingFrame(),
      wingFrame(-1, 0, false, true),
      wingFrame(),
    ];

    expect(replayWing(1997, inputs)).toEqual(replayWing(1997, inputs));

    const walkToExit = Array.from({ length: 17 }, () => wingFrame(0, 1));
    const left = replayWing(1997, [...walkToExit, wingFrame(0, 0, true)]);
    const stayed = replayWing(1997, [...walkToExit, wingFrame()]);

    expect(left.status).toBe('left');
    expect(stayed.status).toBe('shopping');
    expect(left).not.toEqual(stayed);
  });
});
