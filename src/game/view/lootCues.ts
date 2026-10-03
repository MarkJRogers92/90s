/** Presentation only. No pickup rules, inventory writes, or random numbers. */
import type { MallTokenPickup } from '../../sim/run/tokens';
import { itemDefinitionName } from '../../sim/run/economy';

export type LootMarker = 'cash' | 'snack' | 'item' | 'rare';
export type LootPose = { x: number; y: number; scale: number; alpha: number; marker: LootMarker; color: number };
export function lootPose(pickup: MallTokenPickup, tick: number, quiet: boolean): LootPose {
  const item = pickup.kind === 'item';
  const snack = pickup.kind === 'snack';
  const marker: LootMarker = item ? pickup.rare ? 'rare' : 'item' : snack ? 'snack' : 'cash';
  const age = tick - pickup.droppedTick;
  const hop = !quiet && age >= 0 && age < 16 ? Math.round(Math.sin(age / 16 * Math.PI) * 7) : 0;
  return { x: Math.round(pickup.x), y: Math.round(pickup.y - (item ? 12 : snack ? 8 : 6) - hop), scale: item ? 1 : 2,
    alpha: pickup.awaitingStepOff ? 0.65 : 1, marker,
    color: marker === 'rare' ? 0xffd84a : marker === 'item' ? 0x8be9df : marker === 'snack' ? 0xffbb80 : 0xffcc55 };
}

export function lootLabel(pickup: MallTokenPickup, hungry: boolean): string {
  if (pickup.kind === 'snack') return hungry ? 'PRETZEL - HALF A HEART' : 'PRETZEL - HEALTH FULL';
  if (pickup.kind !== 'item') return `$${pickup.value} - WALK OVER`;
  const name = pickup.itemDefinitionId ? itemDefinitionName(pickup.itemDefinitionId).toUpperCase() : 'ITEM';
  return `${pickup.rare ? 'RARE: ' : ''}${name} - ${pickup.awaitingStepOff ? 'STEP AWAY FIRST' : 'WALK OVER'}`;
}

/** Inspection distance is visual only. No new action or collection eligibility. */
export function nearbyLoot(pickups: readonly MallTokenPickup[], player: { x: number; y: number }, blocked: boolean): MallTokenPickup | null {
  if (blocked) return null;
  return [...pickups].filter(p => Math.hypot(p.x - player.x, p.y - player.y) <= 80)
    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y) || a.id.localeCompare(b.id))[0] ?? null;
}

export type LootReceipt = { kind: 'cash' | 'snack' | 'item' | 'rare'; text: string; cash?: number };
/** Match only success messages emitted by tokens.ts/drops.ts. Contract tested against real sim calls. */
export function parseLootReceipt(line: string): LootReceipt | null {
  const match = /^\[t\d+\] (.+)$/.exec(line);
  if (!match) return null;
  const body = match[1]!;
  const cash = /^\+(\d+) Mall Tokens? \(\$(\d+)\)\.$/.exec(body);
  if (cash && cash[1] === cash[2]) return { kind: 'cash', cash: Number(cash[1]), text: `+$${cash[1]}` };
  const snack = /^Food court pretzel! \+(half a heart|\d+(?:\.\d+)? hearts)\.$/.exec(body);
  if (snack) return { kind: 'snack', text: `+${snack[1]!.toUpperCase()}` };
  const boss = /^RARE FIND: the boss dropped the (.+)!$/.exec(body);
  if (boss) return { kind: 'rare', text: `RARE: ${boss[1]!.toUpperCase()}` };
  const found = /^(RARE FIND|Found): ([^.]+)\.$/.exec(body);
  if (found) return { kind: found[1] === 'RARE FIND' ? 'rare' : 'item', text: `${found[1] === 'RARE FIND' ? 'RARE' : 'FOUND'}: ${found[2]!.toUpperCase()}` };
  const retained = /^Picked up the ([^.]+)\.$/.exec(body);
  return retained ? { kind: 'item', text: `PICKED UP: ${retained[1]!.toUpperCase()}` } : null;
}

/** Timestamp/occurrence cursor: combat trims this shared log, so array length is not an offset. */
export class LootReceiptCursor {
  private scope = '';
  private tick = -1;
  private trace: readonly string[] | null = null;
  private seenAtTick = new Map<string, number>();
  reset(): void { this.scope = ''; this.tick = -1; this.trace = null; this.seenAtTick.clear(); }
  read(scope: string, tick: number, trace: readonly string[]): LootReceipt[] {
    const reset = this.trace !== trace || this.scope !== scope || tick < this.tick;
    const counts = new Map<string, number>();
    const nextSeen = new Map<string, number>();
    const entries: LootReceipt[] = [];
    for (const line of trace) {
      const receipt = parseLootReceipt(line);
      if (!receipt) continue;
      const eventTick = Number(/^\[t(\d+)\]/.exec(line)![1]);
      const count = (counts.get(line) ?? 0) + 1; counts.set(line, count);
      if (!reset && (eventTick > this.tick || (eventTick === this.tick && count > (this.seenAtTick.get(line) ?? 0)))) entries.push(receipt);
      if (eventTick === tick) nextSeen.set(line, count);
    }
    this.scope = scope; this.tick = tick; this.trace = trace; this.seenAtTick = nextSeen;
    const totalCash = entries.reduce((n, receipt) => n + (receipt.cash ?? 0), 0);
    return [...(totalCash ? [{ kind: 'cash' as const, cash: totalCash, text: `+$${totalCash}` }] : []), ...entries.filter(receipt => receipt.kind !== 'cash')];
  }
}
