import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { NO_PERKS, runDashCooldown, sanitizePerks, tokenMagnetReach, type ShiftPerks } from '../../src/sim/run/perks';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { collectTokens, TOKEN_PICKUP_RADIUS } from '../../src/sim/run/tokens';
import { tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { DASH_COOLDOWN_TICKS, DASH_TICKS } from '../../src/sim/combat/dash';
import { PERKS, newCareer, parseCareer, perksFor, type Career } from '../../src/game/career/career';
import { benefitsLine } from '../../src/game/ui/clockInModel';
import type { MvpInputFrame } from '../../src/sim/run/types';

const perks = (overrides: Partial<ShiftPerks>): ShiftPerks => ({ ...NO_PERKS, ...overrides });
const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

describe('New Sneakers (dash cooldown perk)', () => {
  it('clamps the cut and treats a missing field as none', () => {
    expect(sanitizePerks({}).dashCooldownCut).toBe(0);
    expect(sanitizePerks({ dashCooldownCut: 999 }).dashCooldownCut).toBe(20);
    expect(sanitizePerks({ dashCooldownCut: -4 }).dashCooldownCut).toBe(0);
  });

  it('shortens the run dash cooldown by the cut', () => {
    expect(runDashCooldown(createMvpRun(7))).toBe(DASH_COOLDOWN_TICKS);
    expect(runDashCooldown(createMvpRun(7, { perks: perks({ dashCooldownCut: 20 }) }))).toBe(DASH_COOLDOWN_TICKS - 20);
  });

  it('a real dash in the run cools down sooner in new sneakers', () => {
    const plain = createMvpRun(7);
    const shod = createMvpRun(7, { perks: perks({ dashCooldownCut: 10 }) });
    for (const run of [plain, shod]) tickMvpRun(run, { ...idle, moveX: 1, dash: true });
    expect(plain.room.combat.player.dashCooldownTicks).toBe(DASH_TICKS + DASH_COOLDOWN_TICKS);
    expect(shod.room.combat.player.dashCooldownTicks).toBe(DASH_TICKS + DASH_COOLDOWN_TICKS - 10);
  });
});

describe('Shop-Vac Attachment (token magnet perk)', () => {
  it('clamps the reach and treats a missing field as none', () => {
    expect(sanitizePerks({}).tokenMagnet).toBe(0);
    expect(sanitizePerks({ tokenMagnet: 5_000 }).tokenMagnet).toBe(80);
    expect(tokenMagnetReach(createMvpRun(7))).toBe(TOKEN_PICKUP_RADIUS);
    expect(tokenMagnetReach(createMvpRun(7, { perks: perks({ tokenMagnet: 40 }) }))).toBe(TOKEN_PICKUP_RADIUS + 40);
  });

  it('without the attachment a token out of reach stays where it fell', () => {
    const run = createMvpRun(7);
    const player = run.room.combat.player;
    run.room.tokens = [{ id: 't', value: 2, x: player.x + 50, y: player.y, droppedTick: 0 }];
    collectTokens(run);
    expect(run.room.tokens[0]).toMatchObject({ x: player.x + 50, y: player.y });
  });

  it('with the attachment nearby change slides in and is paid', () => {
    const run = createMvpRun(7, { perks: perks({ tokenMagnet: 40 }) });
    const player = run.room.combat.player;
    const cash = run.cash;
    run.room.tokens = [{ id: 't', value: 2, x: player.x + 50, y: player.y, droppedTick: 0 }];
    collectTokens(run);
    expect(run.room.tokens[0]!.x).toBeLessThan(player.x + 50);
    for (let i = 0; i < 30 && run.room.tokens.length > 0; i += 1) collectTokens(run);
    expect(run.room.tokens).toHaveLength(0);
    expect(run.cash).toBe(cash + 2);
    expect(run.inventory.cash).toBe(run.cash);
  });

  it('change beyond the attachment reach is left alone', () => {
    const run = createMvpRun(7, { perks: perks({ tokenMagnet: 40 }) });
    const player = run.room.combat.player;
    run.room.tokens = [{ id: 't', value: 2, x: player.x + 90, y: player.y, droppedTick: 0 }];
    collectTokens(run);
    expect(run.room.tokens[0]).toMatchObject({ x: player.x + 90 });
  });

  it('pretzels are not vacuumed up while the janitor is at full health', () => {
    const run = createMvpRun(7, { perks: perks({ tokenMagnet: 40 }) });
    const player = run.room.combat.player;
    run.room.tokens = [{ id: 's', kind: 'snack', value: 0, x: player.x + 50, y: player.y, droppedTick: 0 }];
    collectTokens(run);
    expect(run.room.tokens[0]).toMatchObject({ x: player.x + 50 });
  });
});

describe('new perks in the checkpoint', () => {
  it('survive a round trip', () => {
    const run = createMvpRun(7, { perks: perks({ dashCooldownCut: 20, tokenMagnet: 80 }) });
    const parsed = parseCheckpoint(JSON.parse(JSON.stringify(serializeCheckpoint(run))));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(restoreMvpRun(parsed.checkpoint).perks).toEqual(run.perks);
  });

  it('an older save whose perks predate them still loads, as none', () => {
    const saved = serializeCheckpoint(createMvpRun(7, { perks: perks({ bonusHealth: 2 }) }));
    const { dashCooldownCut: _cut, tokenMagnet: _magnet, ...older } = saved.perks!;
    const parsed = parseCheckpoint({ ...saved, perks: older });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(restoreMvpRun(parsed.checkpoint).perks).toMatchObject({ dashCooldownCut: 0, tokenMagnet: 0 });
  });

  it('refuses values the Break Room could never sell', () => {
    const saved = serializeCheckpoint(createMvpRun(7, { perks: perks({ dashCooldownCut: 10 }) }));
    expect(parseCheckpoint({ ...saved, perks: { ...saved.perks, dashCooldownCut: 45 } }).ok).toBe(false);
    expect(parseCheckpoint({ ...saved, perks: { ...saved.perks, tokenMagnet: 400 } }).ok).toBe(false);
  });
});

describe('the Break Room sells them', () => {
  it('lists both perk lines', () => {
    expect(PERKS.map((perk) => perk.id)).toEqual(expect.arrayContaining(['sneakers', 'shopvac']));
  });

  it('turns levels into the shift perks', () => {
    const career: Career = { ...newCareer(), perks: { ...newCareer().perks, sneakers: 2, shopvac: 1 } };
    expect(perksFor(career)).toMatchObject({ dashCooldownCut: 20, tokenMagnet: 40 });
    expect(perksFor({ ...newCareer(), perks: { ...newCareer().perks, shopvac: 2 } }).tokenMagnet).toBe(80);
  });

  it('an older career has neither and a forged one is clamped', () => {
    const old = parseCareer(JSON.stringify({ version: 1, perks: { seniority: 1 } }));
    expect(old.perks.sneakers).toBe(0);
    expect(old.perks.shopvac).toBe(0);
    const forged = parseCareer(JSON.stringify({ version: 1, perks: { sneakers: 50, shopvac: 50 } }));
    expect(forged.perks.sneakers).toBe(PERKS.find((perk) => perk.id === 'sneakers')!.costs.length);
    expect(forged.perks.shopvac).toBe(PERKS.find((perk) => perk.id === 'shopvac')!.costs.length);
  });

  it('the clock-in card names them', () => {
    expect(benefitsLine(perks({ dashCooldownCut: 10, tokenMagnet: 40 }))).toBe('BENEFITS: NEW SNEAKERS - SHOP-VAC');
  });
});
