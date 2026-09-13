import { describe, expect, it } from 'vitest';
import { M3_WING } from '../../src/sim/shop/catalog';
import { createWingRun } from '../../src/sim/shop/createWingRun';
import {
  canSecuritySeePlayer,
  isPointInSightCone,
  securityFacingAtTick,
} from '../../src/sim/shop/security';

describe('deterministic store security geometry', () => {
  it('sweeps inclusively from one endpoint to the other and back', () => {
    const zone = M3_WING.stores[0]!.sightZone;

    expect(securityFacingAtTick(zone, 0)).toBeCloseTo(zone.centerRadians - zone.sweepRadians);
    expect(securityFacingAtTick(zone, 180)).toBeCloseTo(zone.centerRadians + zone.sweepRadians);
    expect(securityFacingAtTick(zone, 360)).toBeCloseTo(zone.centerRadians - zone.sweepRadians);
  });

  it('includes the range and arc boundaries of a sight cone', () => {
    const zone = M3_WING.stores[0]!.sightZone;
    const facing = Math.PI / 2;

    expect(
      isPointInSightCone(
        zone.origin,
        facing,
        { x: zone.origin.x, y: zone.origin.y + 180 },
        180,
        70,
      ),
    ).toBe(true);
    expect(
      isPointInSightCone(
        zone.origin,
        facing,
        {
          x: zone.origin.x + Math.sin((35 * Math.PI) / 180) * 100,
          y: zone.origin.y + Math.cos((35 * Math.PI) / 180) * 100,
        },
        180,
        70,
      ),
    ).toBe(true);
  });

  it('requires an unobstructed line from the authored camera to the player', () => {
    const state = createWingRun(7);
    const store = state.wing.stores[0]!;
    const sweep = state.sweeps.find((candidate) => candidate.storeId === store.id)!;

    sweep.facingRadians = Math.PI / 2;
    state.player.x = store.sightZone.origin.x;
    state.player.y = 150;
    expect(canSecuritySeePlayer(state, store)).toBe(true);

    sweep.facingRadians = (Math.PI * 3) / 2;
    state.player.y = 50;
    expect(canSecuritySeePlayer(state, store)).toBe(false);
  });
});
