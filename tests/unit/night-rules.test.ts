import { describe, expect, it } from 'vitest';
import { dailyRule, dailyRuleLine } from '../../src/game/run/dailyShift';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { runOfferPrice } from '../../src/sim/run/economy';
import { ascend } from '../../src/sim/run/floors';
import { alarmTicksFor } from '../../src/sim/run/heist';
import { NIGHT_RULE_IDS, NIGHT_RULES, SHORT_FUSE_CUT, INFLATION_SURCHARGE, isNightRule } from '../../src/sim/run/nightRules';
import { roomClearHeal, runMaxHealth } from '../../src/sim/run/perks';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';

const idle = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

describe('night rules (round 57): the Daily Shift\'s rule of the day', () => {
  it('has four rules, each with a name and a plain line', () => {
    expect([...NIGHT_RULE_IDS].sort()).toEqual(['glass', 'inflation', 'no_breaks', 'short_fuse']);
    for (const id of NIGHT_RULE_IDS) {
      expect(NIGHT_RULES[id].name).toMatch(/^[A-Z ]+$/);
      expect(NIGHT_RULES[id].blurb.length).toBeGreaterThan(10);
      expect(isNightRule(id)).toBe(true);
    }
    expect(isNightRule('nonsense')).toBe(false);
    expect(isNightRule(undefined)).toBe(false);
  });

  it('is picked by the date: the same day gives the same rule, and a fortnight uses every one', () => {
    expect(dailyRule('2026-10-01')).toBe(dailyRule('2026-10-01'));
    const days = Array.from({ length: 14 }, (_, index) => `2026-10-${String(index + 1).padStart(2, '0')}`);
    const seen = new Set(days.map((day) => dailyRule(day)));
    expect(seen.size).toBe(NIGHT_RULE_IDS.length);
    for (const rule of seen) expect(isNightRule(rule)).toBe(true);
  });

  it('says today\'s rule on the title line', () => {
    const line = dailyRuleLine('2026-10-01');
    expect(line).toContain(NIGHT_RULES[dailyRule('2026-10-01')].name);
    expect(line.startsWith("TODAY'S RULE")).toBe(true);
  });

  it('leaves an ordinary night alone', () => {
    const plain = createMvpRun(7);
    expect(plain.rule).toBeUndefined();
    expect(runMaxHealth(plain)).toBe(6);
    expect(roomClearHeal(plain)).toBeGreaterThan(0);
  });

  it('Glass Janitor: two hearts instead of three, from the first tick and up the escalator', () => {
    const glass = createMvpRun(7, { rule: 'glass' });
    expect(runMaxHealth(glass)).toBe(4);
    expect(glass.room.combat.player.health).toBe(4);
    glass.status = 'won';
    const up = ascend(glass);
    expect(up.rule).toBe('glass');
    expect(up.room.combat.player.health).toBe(4);
  });

  it('No Breaks: a cleared fight patches nobody up', () => {
    const state = createMvpRun(7, { rule: 'no_breaks' });
    expect(roomClearHeal(state)).toBe(0);
    state.room.combat.enemies = [];
    tickMvpRun(state, idle);
    expect(enterDoorway(state, 'east').accepted).toBe(true);
    // Now in a room with a fight; hurt, then clear it.
    let guard = 0;
    while (state.room.combat.enemies.length === 0 && guard < 6) {
      guard += 1;
      expect(enterDoorway(state, 'east').accepted).toBe(true);
    }
    state.room.combat.player.health = 3;
    state.room.combat.enemies = [];
    tickMvpRun(state, idle);
    expect(state.room.cleared).toBe(true);
    expect(state.room.combat.player.health).toBe(3);
  });

  it('Inflation: every shelf price is higher by the surcharge', () => {
    const plain = createMvpRun(7);
    const costly = createMvpRun(7, { rule: 'inflation' });
    const offer = plain.wing.rooms[1]!.offers[0]!;
    expect(runOfferPrice(costly, offer)).toBe(runOfferPrice(plain, offer) + INFLATION_SURCHARGE);
  });

  it('Short Fuse: store alarms run shorter', () => {
    const plain = createMvpRun(7);
    const fuse = createMvpRun(7, { rule: 'short_fuse' });
    expect(alarmTicksFor(fuse)).toBe(alarmTicksFor(plain) - SHORT_FUSE_CUT);
    expect(alarmTicksFor(fuse)).toBeGreaterThan(60);
  });

  it('is saved with the shift and survives a resume, and an unknown rule in a save is refused', () => {
    const state = createMvpRun(7, { rule: 'inflation' });
    const saved = JSON.parse(JSON.stringify(serializeCheckpoint(state)));
    expect(saved.rule).toBe('inflation');
    const parsed = parseCheckpoint(saved);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(restoreMvpRun(parsed.checkpoint).rule).toBe('inflation');

    const plainSave = JSON.parse(JSON.stringify(serializeCheckpoint(createMvpRun(7))));
    expect('rule' in plainSave).toBe(false);
    const bad = parseCheckpoint({ ...saved, rule: 'make_it_free' });
    expect(bad.ok).toBe(false);
  });
});
