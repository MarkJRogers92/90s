/**
 * Playtest recorder: turns a shift into one small record of what happened —
 * time and damage per room (by source), kills, dashes, what was bought and
 * stolen, and what landed the final blow. Since round 30 it also answers the
 * tuning questions for the heist and the stores: how each store alarm ended
 * and with how long to spare, the peak wanted level, Loss Prevention's
 * arrivals, write-ups and shoves, every store visit, and how long each boss
 * card was watched. Those fields are optional, so older logged runs stay
 * readable.
 *
 * Like the audio cues it only compares consecutive snapshots of authoritative
 * state; it never touches the simulation. Nothing here leaves the machine:
 * records go to `PlaytestLog`, which is local and off until switched on.
 */
import { compositeLeaves } from '../../sim/fusion/inventory';
import type { FusionInventoryNode } from '../../sim/fusion/types';
import { itemDefinitionName } from '../../sim/run/economy';
import type { MvpRunState } from '../../sim/run/types';
import { isBossKind } from '../../sim/combat/boss';
import { STATIC_BURST_RADIUS } from '../../sim/combat/staticEnemy';
import { activeStore } from '../../sim/run/storeInterior';
import { wantedStars } from '../../sim/run/wanted';
import type { BossKind } from '../../sim/combat/boss';

export type DamageSource = 'hanger' | 'mannequin' | 'static' | 'shopper' | 'mascot' | 'ownerCharge' | 'glob' | 'slam' | 'bossShot' | 'stalker' | 'other';

export type RoomLog = {
  readonly roomId: string;
  readonly name: string;
  readonly enteredTick: number;
  leftTick: number | null;
  kills: number;
  readonly damage: Record<DamageSource, number>;
};

/** How one store alarm ended. */
export type AlarmLog = {
  readonly store: string;
  /**
   * `escaped`: out the door before the shutter; `lockedEscaped`: locked in,
   * fought through, got out; `locked`: the shift ended behind the shutter;
   * `dropped`: the alarm ended some other way (the room was left).
   */
  outcome: 'escaped' | 'lockedEscaped' | 'locked' | 'dropped';
  /** Seconds left on the countdown when the janitor got out in time. */
  secondsLeft: number | null;
  /** Wanted stars when the alarm went off. */
  readonly stars: number;
};

export type StoreVisitLog = {
  readonly store: string;
  seconds: number;
  bought: number;
  stolen: number;
};

export type BossCardLog = {
  readonly boss: BossKind;
  readonly seconds: number;
  readonly skipped: boolean;
};

export type RunRecord = {
  readonly version: 1;
  readonly startedAt: string;
  readonly seed: number;
  readonly outcome: 'won' | 'dead' | 'quit';
  /** Present (2 or 3) only for shifts above the ground floor. */
  readonly floor?: 2 | 3;
  readonly ticks: number;
  readonly reachedRoom: number;
  readonly rooms: readonly RoomLog[];
  readonly bought: readonly string[];
  readonly stolen: readonly string[];
  readonly dashes: number;
  readonly killedBy: DamageSource | null;
  /** Round 30 fields: absent on runs logged before them. */
  readonly peakStars?: number;
  readonly alarms?: readonly AlarmLog[];
  readonly stalker?: { readonly arrivals: number; readonly writeUps: number; readonly shoves: number };
  readonly storeVisits?: readonly StoreVisitLog[];
  readonly bossCards?: readonly BossCardLog[];
};

type Snapshot = {
  readonly tick: number;
  readonly roomIndex: number;
  readonly health: number;
  readonly living: ReadonlySet<number>;
  readonly enemyShots: number;
  readonly dashTicks: number;
  readonly stalkerPhase: string | null;
  readonly writeUps: number;
  readonly alarmOn: boolean;
  readonly shutter: string | null;
  readonly alarmTicksLeft: number;
  readonly alarmStore: string;
  readonly carried: number;
  readonly stars: number;
  readonly inside: string | null;
};

const emptyDamage = (): Record<DamageSource, number> => ({ hanger: 0, mannequin: 0, static: 0, shopper: 0, mascot: 0, ownerCharge: 0, glob: 0, slam: 0, bossShot: 0, stalker: 0, other: 0 });

function snapshot(state: MvpRunState): Snapshot {
  const combat = state.room.combat;
  return {
    tick: state.tick,
    roomIndex: state.roomIndex,
    health: combat.player.health,
    living: new Set(combat.enemies.filter((enemy) => enemy.health > 0).map((enemy) => enemy.id)),
    enemyShots: combat.projectiles.filter((shot) => shot.faction === 'enemy').length,
    dashTicks: combat.player.dashTicks ?? 0,
    stalkerPhase: state.stalker?.phase ?? null,
    writeUps: state.stalker?.writeUps ?? 0,
    alarmOn: state.alarm !== null,
    shutter: state.alarm?.shutter ?? null,
    alarmTicksLeft: state.alarm?.ticksLeft ?? 0,
    alarmStore: (activeStore(state)?.name ?? '').toUpperCase(),
    carried: state.carried.length,
    stars: wantedStars(state.heat),
    inside: activeStore(state)?.templateId ?? null,
  };
}

/** Items from one store the janitor holds, by how they were got. */
function heldFrom(state: MvpRunState, storeId: string, kind: 'purchased' | 'stolen'): number {
  let count = 0;
  for (const node of state.inventory.inventory) {
    const leaves = compositeLeaves(node);
    for (const leaf of leaves) if (leaf.acquisitionKind === kind && leaf.sourceLocationId === storeId) count += 1;
  }
  return count;
}

/** What most plausibly dealt a hit, from the state around it. */
function classify(state: MvpRunState, previous: Snapshot, amount: number): DamageSource {
  const combat = state.room.combat;
  const p = combat.player;
  // A write-up is counted by the stalker himself, so it is never mistaken for
  // whatever else happens to be standing next to the janitor.
  if ((state.stalker?.writeUps ?? 0) > previous.writeUps) return 'stalker';
  const touching = combat.enemies.some(
    (enemy) => enemy.kind === 'hanger' && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= enemy.radius + p.radius + 2,
  );
  if (touching) return 'hanger';
  const mannequin = combat.enemies.some(
    (enemy) => enemy.kind === 'mannequin' && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= enemy.radius + p.radius + 2,
  );
  if (mannequin) return 'mannequin';
  // A Bargain Hunter only hurts mid-charge, so one touching the janitor did it.
  const shopper = combat.enemies.some(
    (enemy) => enemy.kind === 'shopper' && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= enemy.radius + p.radius + 12,
  );
  if (shopper) return 'shopper';
  // A Mascot Brute only hurts mid-charge; the Owner's charge is its own source.
  const brute = combat.enemies.some(
    (enemy) => enemy.kind === 'mascot' && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= enemy.radius + p.radius + 14,
  );
  if (brute) return 'mascot';
  const ownerCharging = combat.enemies.some(
    (enemy) => enemy.kind === 'owner' && enemy.health > 0 && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= enemy.radius + p.radius + 14 && ((enemy.chargeTicks ?? 0) > 0 || (enemy.stunnedTicks ?? 0) > 0),
  );
  if (ownerCharging) return 'ownerCharge';
  // A Static shocks where it lands, so it is standing inside its burst.
  const shock = combat.enemies.some(
    (enemy) => enemy.kind === 'static' && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= STATIC_BURST_RADIUS + 4,
  );
  if (shock) return 'static';
  const boss = combat.enemies.some((enemy) => isBossKind(enemy.kind) && enemy.health > 0);
  if (boss && amount >= 2) return 'slam';
  const shots = combat.projectiles.filter((shot) => shot.faction === 'enemy').length;
  if (shots < previous.enemyShots || previous.enemyShots > 0) return boss ? 'bossShot' : 'glob';
  return 'other';
}

function namesBy(nodes: readonly FusionInventoryNode[], kind: 'purchased' | 'stolen'): string[] {
  const names: string[] = [];
  for (const node of nodes) {
    const parts = compositeLeaves(node);
    for (const part of parts) {
      if (part.acquisitionKind === kind) names.push(itemDefinitionName(part.itemDefinitionId).toUpperCase());
    }
  }
  return names;
}

export class PlaytestRecorder {
  private previous: Snapshot | null = null;
  private startTick = 0;
  private startedAt = '';
  private rooms: RoomLog[] = [];
  private dashes = 0;
  private killedBy: DamageSource | null = null;
  private finished = false;
  private peakStars = 0;
  private alarms: AlarmLog[] = [];
  private openAlarm: (AlarmLog & { locked: boolean }) | null = null;
  private stalker = { arrivals: 0, writeUps: 0, shoves: 0 };
  private visits: StoreVisitLog[] = [];
  private openVisit: { log: StoreVisitLog; storeId: string; enteredTick: number; bought: number; stolen: number } | null = null;
  private bossCards: BossCardLog[] = [];

  private begin(state: MvpRunState): void {
    this.previous = snapshot(state);
    this.startTick = state.tick;
    this.startedAt = new Date().toISOString();
    this.rooms = [];
    this.dashes = 0;
    this.killedBy = null;
    this.finished = false;
    this.peakStars = wantedStars(state.heat);
    this.alarms = [];
    this.openAlarm = null;
    this.stalker = { arrivals: 0, writeUps: 0, shoves: 0 };
    this.visits = [];
    this.openVisit = null;
    this.bossCards = [];
    this.openRoom(state);
  }

  private openRoom(state: MvpRunState): void {
    const room = state.wing.rooms[state.roomIndex];
    this.rooms.push({
      roomId: room?.id ?? 'unknown',
      name: (room?.store?.name ?? room?.name ?? 'UNKNOWN').toUpperCase(),
      enteredTick: state.tick,
      leftTick: null,
      kills: 0,
      damage: emptyDamage(),
    });
  }

  /** The scene reports each boss card: how long it showed and whether it was skipped. */
  public noteBossCard(boss: BossKind, ms: number, skipped: boolean): void {
    if (this.previous === null || this.finished) return;
    this.bossCards.push({ boss, seconds: Math.round(ms / 100) / 10, skipped });
  }

  /** Alarms, stalker, stars and store visits: the heist's side of the record. */
  private observeHeist(state: MvpRunState, previous: Snapshot, current: Snapshot): void {
    this.peakStars = Math.max(this.peakStars, current.stars);
    // Store alarms: opened on the grab, closed by the door, the shutter, or leaving.
    if (current.alarmOn && !previous.alarmOn) {
      this.openAlarm = { store: current.alarmStore, outcome: 'dropped', secondsLeft: null, stars: previous.stars, locked: false };
    }
    if (this.openAlarm && current.shutter === 'closed') this.openAlarm.locked = true;
    if (this.openAlarm && !current.alarmOn) {
      const secured = current.carried < previous.carried;
      this.openAlarm.outcome = secured ? (this.openAlarm.locked ? 'lockedEscaped' : 'escaped') : 'dropped';
      this.openAlarm.secondsLeft = secured && !this.openAlarm.locked ? Math.round(previous.alarmTicksLeft / 6) / 10 : null;
      this.closeAlarm();
    }
    // Loss Prevention.
    if (previous.stalkerPhase === 'arriving' && current.stalkerPhase === 'hunting') this.stalker.arrivals += 1;
    if (current.writeUps > previous.writeUps) this.stalker.writeUps += current.writeUps - previous.writeUps;
    if (current.stalkerPhase === 'shoved' && previous.stalkerPhase !== 'shoved') this.stalker.shoves += 1;
    // Store visits.
    if (current.inside !== previous.inside) {
      this.closeVisit(state);
      if (current.inside !== null) {
        const log: StoreVisitLog = { store: current.alarmStore, seconds: 0, bought: 0, stolen: 0 };
        this.visits.push(log);
        this.openVisit = {
          log,
          storeId: current.inside,
          enteredTick: state.tick,
          bought: heldFrom(state, current.inside, 'purchased'),
          stolen: heldFrom(state, current.inside, 'stolen'),
        };
      }
    }
  }

  private closeAlarm(): void {
    if (!this.openAlarm) return;
    const { locked: _locked, ...log } = this.openAlarm;
    this.alarms.push(log);
    this.openAlarm = null;
  }

  private closeVisit(state: MvpRunState): void {
    const visit = this.openVisit;
    if (!visit) return;
    visit.log.seconds = Math.round((state.tick - visit.enteredTick) / 6) / 10;
    visit.log.bought = heldFrom(state, visit.storeId, 'purchased') - visit.bought;
    // A theft counts once it is secured: carried goods are not held yet.
    visit.log.stolen = heldFrom(state, visit.storeId, 'stolen') - visit.stolen;
    this.openVisit = null;
  }

  /** What landed the most recent blow on the janitor this shift, if anything. */
  public get lastDamageSource(): DamageSource | null {
    return this.killedBy;
  }

  /** Feed every rendered frame; returns the finished record once, when the shift ends. */
  public observe(state: MvpRunState): RunRecord | null {
    const previous = this.previous;
    // A fresh run (the tick went backwards) starts a fresh record.
    if (previous === null || state.tick < previous.tick) {
      this.begin(state);
      return null;
    }
    if (this.finished) return null;
    const current = snapshot(state);
    const room = this.rooms.at(-1)!;
    if (current.roomIndex !== previous.roomIndex) {
      room.leftTick = state.tick;
      this.openRoom(state);
    } else {
      for (const id of previous.living) if (!current.living.has(id)) room.kills += 1;
    }
    const lost = previous.health - current.health;
    if (lost > 0) {
      const source = classify(state, previous, lost);
      this.rooms.at(-1)!.damage[source] += lost;
      this.killedBy = source;
    }
    if (current.dashTicks > previous.dashTicks) this.dashes += 1;
    this.observeHeist(state, previous, current);
    this.previous = current;
    if (state.status === 'won' || state.status === 'dead') return this.finish(state, state.status);
    return null;
  }

  /** Closes the record now (a shift ended, or the player quit mid-shift). */
  public finish(state: MvpRunState, outcome: RunRecord['outcome']): RunRecord | null {
    if (this.previous === null || this.finished) return null;
    this.finished = true;
    const last = this.rooms.at(-1);
    if (last && last.leftTick === null) last.leftTick = state.tick;
    this.closeVisit(state);
    if (this.openAlarm) {
      this.openAlarm.outcome = this.openAlarm.locked ? 'locked' : 'dropped';
      this.closeAlarm();
    }
    return {
      version: 1,
      startedAt: this.startedAt,
      seed: state.seed,
      outcome,
      ...(state.wing.floor === 2 || state.wing.floor === 3 ? { floor: state.wing.floor } : {}),
      ticks: state.tick - this.startTick,
      reachedRoom: state.roomIndex + 1,
      rooms: this.rooms.map((room) => ({ ...room, damage: { ...room.damage } })),
      bought: namesBy(state.inventory.inventory, 'purchased'),
      stolen: namesBy(state.inventory.inventory, 'stolen'),
      dashes: this.dashes,
      killedBy: outcome === 'dead' ? this.killedBy : null,
      peakStars: this.peakStars,
      alarms: this.alarms.map((alarm) => ({ ...alarm })),
      stalker: { ...this.stalker },
      storeVisits: this.visits.map((visit) => ({ ...visit })),
      bossCards: [...this.bossCards],
    };
  }
}
