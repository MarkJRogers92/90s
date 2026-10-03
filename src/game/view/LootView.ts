/** Floor pickup visuals and bounded, authoritative collection acknowledgements. */
import type Phaser from 'phaser';
import type { MvpRunState } from '../../sim/run/types';
import { runMaxHealth } from '../../sim/run/perks';
import { nearestMvpInteraction } from '../../sim/run/tickMvpRun';
import { itemIconKey } from '../presentation/assets';
import { usableTextureKey } from '../presentation/assetFallback';
import { presentationDepth } from '../presentation/depth';
import { FX_TEXTURES, ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import { flashAllowed, gameSettings } from '../settings/settings';
import { LootReceiptCursor, lootLabel, lootPose, nearbyLoot, type LootReceipt } from './lootCues';

type Layers = {
  shadow(id: string, x: number, y: number, scale: number): void;
  light(light: { x: number; y: number; radius: number; color: number; intensity: number }): void;
};
const RECEIPT_TICKS = 78;
const MAX_PENDING = 5;
export class LootView {
  private readonly sprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly markers: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Image | null = null;
  private receipt: Phaser.GameObjects.Image | null = null;
  private readonly cursor = new LootReceiptCursor();
  private pending: LootReceipt[] = [];
  private current: { value: LootReceipt; born: number } | null = null;
  private wonReceiptAt: number | null = null;
  private scope = '';
  private tick = -1;
  private room: MvpRunState['room'] | null = null;
  constructor(private readonly scene: Phaser.Scene) {
    this.markers = scene.add.graphics().setDepth(presentationDepth('lowProp', 950));
  }

  sync(state: MvpRunState, scope: string, layers: Layers, quiet = this.quiet()): void {
    this.observe(state, scope);
    this.markers.clear();
    const live = new Set<string>();
    for (const pickup of state.room.tokens) {
      live.add(pickup.id);
      const pose = lootPose(pickup, state.tick, quiet);
      const requested = pickup.kind === 'item' ? itemIconKey(pickup.itemDefinitionId ?? '') : pickup.kind === 'snack' ? FX_TEXTURES.pretzel : FX_TEXTURES.token;
      const texture = (requested ? usableTextureKey(this.scene.textures, requested) : null)
        ?? ensurePixelLabel(this.scene, '?', '#8be9df', 2).key;
      let sprite = this.sprites.get(pickup.id);
      if (!sprite) { sprite = this.scene.add.image(0, 0, texture); this.sprites.set(pickup.id, sprite); }
      sprite.setTexture(texture).setPosition(pose.x, pose.y).setScale(pose.scale).setAlpha(pose.alpha)
        .setDepth(presentationDepth('actor', pickup.y - 1));
      layers.shadow(`token:${pickup.id}`, pickup.x, pickup.y, pickup.kind === 'item' ? 0.5 : 0.4);
      // Small, steady floor markers survive dark floors without washing out the item art.
      const x = Math.round(pickup.x); const y = Math.round(pickup.y);
      this.markers.fillStyle(0x090c14, 0.8).fillRect(x - 12, y + 2, 24, 5);
      this.markers.fillStyle(pose.color, pose.alpha * 0.85).fillRect(x - 10, y + 4, 20, 1);
      if (pose.marker === 'rare') {
        this.markers.fillStyle(0x090c14, 1).fillTriangle(x + 19, y - 17, x + 12, y - 10, x + 26, y - 10)
          .fillTriangle(x + 19, y - 3, x + 12, y - 10, x + 26, y - 10);
        this.markers.fillStyle(pose.color, 1).fillTriangle(x + 19, y - 15, x + 14, y - 10, x + 24, y - 10)
          .fillTriangle(x + 19, y - 5, x + 14, y - 10, x + 24, y - 10);
        this.markers.fillStyle(0x090c14, 1).fillRect(x + 18, y - 11, 3, 3);
      }
      if (pose.marker === 'snack') {
        this.markers.fillStyle(pose.color, 0.9).fillRect(x + 17, y - 7, 2, 8).fillRect(x + 14, y - 4, 8, 2);
      }
      layers.light({ x, y: y - 5, radius: 24, color: pose.color, intensity: 0.35 });
    }
    for (const [id, sprite] of this.sprites) if (!live.has(id)) { sprite.destroy(); this.sprites.delete(id); }

    const wonExpired = this.wonReceiptAt !== null && this.scene.time.now - this.wonReceiptAt >= RECEIPT_TICKS * (1000 / 60);
    if (this.current && (state.tick - this.current.born >= RECEIPT_TICKS || wonExpired)) { this.current = null; this.wonReceiptAt = null; }
    if (!this.current && this.pending.length) this.current = { value: this.pending.shift()!, born: state.tick };
    if (this.current && state.status === 'won' && this.wonReceiptAt === null) this.wonReceiptAt = this.scene.time.now;
    const player = state.room.combat.player;
    this.receipt?.setVisible(false);
    if (this.current && state.status !== 'dead') {
      const value = this.current.value;
      const color = value.kind === 'rare' || value.kind === 'cash' ? '#ffd84a' : value.kind === 'snack' ? '#ffbb80' : '#8be9df';
      this.receipt = this.text(this.receipt, value.text, color, player.x, player.y + 30, player.y + 2);
    }
    // Name inspection waits during attacks, rather than covering a telegraph with text.
    // Existing contextual controls always win; floor pickups never advertise an action key.
    const blocked = !!this.current || state.status !== 'playing' || state.paused || state.preview !== null || state.workbench !== null
      || nearestMvpInteraction(state).kind !== 'none' || state.room.combat.enemies.some(e => e.health > 0) || state.room.combat.projectiles.length > 0;
    const near = nearbyLoot(state.room.tokens, player, blocked);
    this.label?.setVisible(false);
    if (near) this.label = this.text(this.label, lootLabel(near, player.health < runMaxHealth(state)), '#eee9db', near.x, near.y + 18, near.y + 1);
  }

  /** Observe every fixed step, before the next combat step can evict a pickup from the bounded log. */
  observe(state: MvpRunState, scope: string): void {
    if (scope !== this.scope || state.room !== this.room || state.tick < this.tick) this.reset();
    this.scope = scope; this.room = state.room; this.tick = state.tick;
    const incoming = this.cursor.read(scope, state.tick, state.behaviorTrace);
    for (const value of incoming) {
      // Coalesce rapid cash arrivals. Never grow an unbounded particle/notice pool.
      const cash = value.kind === 'cash' ? this.pending.find(r => r.kind === 'cash') : undefined;
      if (cash) { cash.cash = (cash.cash ?? 0) + (value.cash ?? 0); cash.text = `+$${cash.cash}`; }
      else this.pending.push(value);
    }
    if (this.pending.length > MAX_PENDING) {
      // Preserve rare finds first when a very large batch arrives between renders.
      this.pending = [...this.pending.filter(r => r.kind === 'rare'), ...this.pending.filter(r => r.kind !== 'rare')].slice(0, MAX_PENDING);
    }
    if (state.status === 'won' && incoming.some(value => value.kind === 'rare')) {
      this.current = { value: incoming.find(value => value.kind === 'rare')!, born: state.tick };
      this.pending = [];
      this.wonReceiptAt = this.scene.time.now;
    }
  }

  private text(image: Phaser.GameObjects.Image | null, text: string, color: string, x: number, y: number, depthY: number): Phaser.GameObjects.Image {
    const spec = ensurePixelLabel(this.scene, text, color);
    const label = image ?? this.scene.add.image(0, 0, spec.key).setOrigin(0.5, 0);
    // Canvas world is 960 wide. Keep the entire label onstage; prompt/effect bands remain above it.
    return label.setTexture(spec.key).setPosition(Math.round(Math.max(spec.width / 2 + 10, Math.min(950 - spec.width / 2, x))), Math.round(Math.min(456, Math.max(32, y))))
      .setDepth(presentationDepth('actor', depthY)).setVisible(true);
  }
  private quiet(): boolean {
    return !flashAllowed(gameSettings().get()) || (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  reset(): void {
    for (const sprite of this.sprites.values()) sprite.destroy(); this.sprites.clear();
    this.label?.destroy(); this.label = null; this.receipt?.destroy(); this.receipt = null;
    this.markers.clear(); this.cursor.reset(); this.pending = []; this.current = null;
    this.scope = ''; this.tick = -1; this.room = null; this.wonReceiptAt = null;
  }
  destroy(): void { this.reset(); this.markers.destroy(); }
}
