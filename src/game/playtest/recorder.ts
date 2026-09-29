/**
 * Playtest recorder: turns a shift into one small record of what happened —
 * time and damage per room (by source), kills, dashes, what was bought and
 * stolen, and what landed the final blow.
 *
 * Like the audio cues it only compares consecutive snapshots of authoritative
 * state; it never touches the simulation. Nothing here leaves the machine:
 * records go to `PlaytestLog`, which is local and off until switched on.
 */
import type { FusionInventoryNode } from '../../sim/fusion/types';
import { itemDefinitionName } from '../../sim/run/economy';
import type { MvpRunState } from '../../sim/run/types';
import { isBossKind } from '../../sim/combat/boss';
import { STATIC_BURST_RADIUS } from '../../sim/combat/staticEnemy';

export type DamageSource = 'hanger' | 'mannequin' | 'static' | 'shopper' | 'mascot' | 'ownerCharge' | 'glob' | 'slam' | 'bossShot' | 'other';

export type RoomLog = {
  readonly roomId: string;
  readonly name: string;
  readonly enteredTick: number;
  leftTick: number | null;
  kills: number;
  readonly damage: Record<DamageSource, number>;
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
};

type Snapshot = {
  readonly tick: number;
  readonly roomIndex: number;
  readonly health: number;
  readonly living: ReadonlySet<number>;
  readonly enemyShots: number;
  readonly dashTicks: number;
};

const emptyDamage = (): Record<DamageSource, number> => ({ hanger: 0, mannequin: 0, static: 0, shopper: 0, mascot: 0, ownerCharge: 0, glob: 0, slam: 0, bossShot: 0, other: 0 });

function snapshot(state: MvpRunState): Snapshot {
  const combat = state.room.combat;
  return {
    tick: state.tick,
    roomIndex: state.roomIndex,
    health: combat.player.health,
    living: new Set(combat.enemies.filter((enemy) => enemy.health > 0).map((enemy) => enemy.id)),
    enemyShots: combat.projectiles.filter((shot) => shot.faction === 'enemy').length,
    dashTicks: combat.player.dashTicks ?? 0,
  };
}

/** What most plausibly dealt a hit, from the state around it. */
function classify(state: MvpRunState, previous: Snapshot, amount: number): DamageSource {
  const combat = state.room.combat;
  const p = combat.player;
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
    const parts = node.kind === 'leaf' ? [node] : [node.primary, node.carrier];
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

  private begin(state: MvpRunState): void {
    this.previous = snapshot(state);
    this.startTick = state.tick;
    this.startedAt = new Date().toISOString();
    this.rooms = [];
    this.dashes = 0;
    this.killedBy = null;
    this.finished = false;
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
    };
  }
}
