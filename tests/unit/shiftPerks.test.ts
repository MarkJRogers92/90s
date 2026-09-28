import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import {
  LOCKER_INSTANCE_ID,
  NO_PERKS,
  roomClearHeal,
  runMaxHealth,
  type ShiftPerks,
} from '../../src/sim/run/perks';
import { PLAYER_MAX_HEALTH } from '../../src/sim/run/rooms';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { ascendToFloorTwo } from '../../src/sim/run/floors';
import { collectTokens } from '../../src/sim/run/tokens';

const perks = (overrides: Partial<ShiftPerks>): ShiftPerks => ({ ...NO_PERKS, ...overrides });

describe('shift perks (Break Room unlocks)', () => {
  it('a run without perks starts exactly as it always has', () => {
    const run = createMvpRun(7);
    expect(run.perks).toEqual(NO_PERKS);
    expect(runMaxHealth(run)).toBe(PLAYER_MAX_HEALTH);
    expect(run.room.combat.player.health).toBe(PLAYER_MAX_HEALTH);
    expect(run.cash).toBe(run.wing.startingCash);
  });

  it('Seniority adds starting cash to the run and its inventory together', () => {
    const run = createMvpRun(7, { perks: perks({ bonusCash: 10 }) });
    expect(run.cash).toBe(run.wing.startingCash + 10);
    expect(run.inventory.cash).toBe(run.cash);
  });

  it('the Dental Plan raises the health cap and the janitor starts full', () => {
    const run = createMvpRun(7, { perks: perks({ bonusHealth: 2 }) });
    expect(runMaxHealth(run)).toBe(PLAYER_MAX_HEALTH + 2);
    expect(run.room.combat.player.health).toBe(PLAYER_MAX_HEALTH + 2);
  });

  it('a pretzel can heal up to the raised cap', () => {
    const run = createMvpRun(7, { perks: perks({ bonusHealth: 2 }) });
    const player = run.room.combat.player;
    player.health = PLAYER_MAX_HEALTH;
    run.room.tokens = [{ id: 'snack-test', kind: 'snack', value: 0, x: player.x, y: player.y, droppedTick: 0 }];
    collectTokens(run);
    expect(player.health).toBe(PLAYER_MAX_HEALTH + 1);
  });

  it('Coffee Break makes a cleared room heal more', () => {
    const plain = createMvpRun(7);
    const caffeinated = createMvpRun(7, { perks: perks({ clearHealBonus: 1 }) });
    expect(roomClearHeal(caffeinated)).toBe(roomClearHeal(plain) + 1);
  });

  it('the locker item is owned from the start and in hand', () => {
    const run = createMvpRun(7, { perks: perks({ lockerItemId: 'pump_soaker' }) });
    const leaf = run.inventory.inventory.find((node) => node.instanceId === LOCKER_INSTANCE_ID);
    expect(leaf).toMatchObject({ kind: 'leaf', itemDefinitionId: 'pump_soaker' });
    expect(run.inventory.selectedPrimaryInstanceId).toBe(LOCKER_INSTANCE_ID);
    expect(run.room.combat.selectedPrimaryInstanceId).toBe(LOCKER_INSTANCE_ID);
  });

  it('a locker item that is not allowed is left at home', () => {
    const run = createMvpRun(7, { perks: perks({ lockerItemId: 'plasma_globe' }) });
    expect(run.inventory.inventory.some((node) => node.instanceId === LOCKER_INSTANCE_ID)).toBe(false);
    expect(run.perks.lockerItemId).toBeNull();
  });

  it('out-of-range perks are clamped, not trusted', () => {
    const run = createMvpRun(7, { perks: perks({ bonusCash: 9_999, bonusHealth: 99, clearHealBonus: -3 }) });
    expect(run.cash).toBeLessThanOrEqual(run.wing.startingCash + 50);
    expect(runMaxHealth(run)).toBeLessThanOrEqual(PLAYER_MAX_HEALTH + 6);
    expect(run.perks.clearHealBonus).toBe(0);
  });

  it('perks survive a checkpoint round trip, including the higher cap', () => {
    const run = createMvpRun(7, { perks: perks({ bonusHealth: 2, clearHealBonus: 1, lockerItemId: 'pump_soaker' }) });
    const parsed = parseCheckpoint(JSON.parse(JSON.stringify(serializeCheckpoint(run))));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restored = restoreMvpRun(parsed.checkpoint);
    expect(restored.perks).toEqual(run.perks);
    expect(restored.room.combat.player.health).toBe(PLAYER_MAX_HEALTH + 2);
  });

  it('a checkpoint without perks is still read, as no perks', () => {
    const saved = serializeCheckpoint(createMvpRun(7)) as Record<string, unknown>;
    delete saved.perks;
    const parsed = parseCheckpoint(saved);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(restoreMvpRun(parsed.checkpoint).perks).toEqual(NO_PERKS);
  });

  it('a checkpoint above its own health cap is refused', () => {
    const saved = { ...serializeCheckpoint(createMvpRun(7)), playerHealth: PLAYER_MAX_HEALTH + 2 };
    expect(parseCheckpoint(saved).ok).toBe(false);
  });

  it('perks ride the escalator, and floor 2 opens at the raised cap', () => {
    const run = createMvpRun(7, { perks: perks({ bonusHealth: 2, bonusCash: 5 }) });
    run.status = 'won';
    run.room.combat.player.health = 1;
    const upstairs = ascendToFloorTwo(run);
    expect(upstairs.perks).toEqual(run.perks);
    expect(upstairs.room.combat.player.health).toBe(PLAYER_MAX_HEALTH + 2);
  });
});

describe('checkpoint perk validation', () => {
  it('refuses perks a real Break Room could never grant', () => {
    const saved = serializeCheckpoint(createMvpRun(7, { perks: perks({ bonusHealth: 2 }) }));
    expect(parseCheckpoint({ ...saved, perks: { ...saved.perks, bonusHealth: 40 } }).ok).toBe(false);
    expect(parseCheckpoint({ ...saved, perks: { ...saved.perks, lockerItemId: 'plasma_globe' } }).ok).toBe(false);
  });
});

describe('what the end card calls bought', () => {
  it('leaves out the issued mop and the locker item: neither was bought on shift', async () => {
    const { tickMvpRun } = await import('../../src/sim/run/tickMvpRun');
    const run = createMvpRun(7, { perks: perks({ lockerItemId: 'pump_soaker' }) });
    run.room.combat.player.health = 0;
    tickMvpRun(run, { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false });
    expect(run.status).toBe('dead');
    expect(run.summary?.purchasedInstanceIds).toEqual([]);
  });
});
