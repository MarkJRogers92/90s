/**
 * Round 53 on screen: the mall props (carts, soda machines, clothing racks)
 * and the hero fusions' moves (Greatest Hits' records, Comedy Hour's chicken,
 * Movie Night's projector). Draws `RunState.props` and `RunState.hero` only;
 * nothing here decides anything.
 */
import Phaser from 'phaser';
import type { HeroState, MallProp, RunState } from '../../sim/model';
import { propWall } from '../../sim/combat/props';
import { DECOY_LURE_RADIUS, DECOY_TICKS, RECORD_RADIUS } from '../../sim/combat/heroes';
import { PROP_TEXTURES } from '../presentation/rooms/roomDressing';
import { presentationDepth } from '../presentation/depth';
import { usableTextureKey } from '../presentation/assetFallback';
import { usableItemIcon } from '../presentation/fusedIconTexture';

export type HeroPropLayers = {
  /** On the floor, under everyone. */
  readonly floor: Phaser.GameObjects.Graphics;
  /** Above the room's lighting. */
  readonly effects: Phaser.GameObjects.Graphics;
  readonly light: (x: number, y: number, radius: number, color: number, intensity: number) => void;
  readonly shadow: (id: string, x: number, y: number, scale: number) => void;
};

/** The colours of the clothes on a rack, standing or spilled. */
const CLOTHES = [0xff5aa8, 0x3ff0ff, 0xffd84a, 0x8a5aff, 0x6aff8a, 0xff8a3f];

export class HeroPropView {
  private readonly images = new Map<string, Phaser.GameObjects.Image>();

  public constructor(private readonly scene: Phaser.Scene) {}

  private image(id: string, key: string | null): Phaser.GameObjects.Image | null {
    if (!key) return null;
    let image = this.images.get(id);
    if (!image) {
      image = this.scene.add.image(0, 0, key);
      this.images.set(id, image);
    }
    if (image.texture.key !== key) image.setTexture(key);
    return image.setVisible(true);
  }

  /** Draws one frame; anything not drawn this frame is put away. */
  public sync(combat: RunState, tick: number, layers: HeroPropLayers): void {
    const used = new Set<string>();
    for (const prop of combat.props ?? []) this.drawProp(prop, tick, layers, used);
    if (combat.hero) this.drawHero(combat, combat.hero, tick, layers, used);
    for (const enemy of combat.enemies) {
      if (enemy.health > 0 && (enemy.dazedTicks ?? 0) > 0) this.drawDazed(enemy.x, enemy.y - enemy.radius * 2.6, tick + enemy.id * 7, layers.effects);
    }
    for (const [id, image] of this.images) {
      if (!used.has(id)) {
        image.destroy();
        this.images.delete(id);
      }
    }
  }

  private drawProp(prop: MallProp, tick: number, layers: HeroPropLayers, used: Set<string>): void {
    const id = `prop:${prop.id}`;
    const { floor, effects } = layers;
    // A soft warm ring on the floor: this one can be knocked about.
    // Lit like a display, so it reads in a dark room.
    const live = prop.kind === 'cart' || prop.state === 'standing';
    if (live) effects.lineStyle(2, 0xffd84a, 0.3 + 0.15 * Math.sin(tick / 14 + prop.id)).strokeEllipse(prop.x, prop.y + 14, 58, 18);
    layers.light(prop.x, prop.y - 10, 80, 0xffe6c0, live ? 0.75 : 0.4);

    if (prop.kind === 'cart') {
      const image = this.image(id, usableTextureKey(this.scene.textures, PROP_TEXTURES.cart.key));
      if (!image) return;
      used.add(id);
      const rolling = prop.state === 'rolling';
      const rattle = rolling ? Math.sin(tick * 1.7) * 1.2 : 0;
      image.setOrigin(0.5, 1).setDisplaySize(44, 41).setPosition(Math.round(prop.x), Math.round(prop.y + 14 + rattle))
        .setFlipX(prop.vx < 0).setDepth(presentationDepth('actor', prop.y));
      layers.shadow(id, prop.x, prop.y + 12, 1);
      if (rolling) {
        const back = Math.atan2(-prop.vy, -prop.vx);
        for (let i = 1; i <= 3; i += 1) {
          const a = back + 0.3 * (i - 2);
          effects.lineStyle(2, 0xffffff, 0.5 - i * 0.12).lineBetween(prop.x + Math.cos(a) * 20, prop.y + Math.sin(a) * 10, prop.x + Math.cos(a) * 36, prop.y + Math.sin(a) * 18);
        }
      }
      return;
    }

    if (prop.kind === 'soda') {
      const image = this.image(id, usableTextureKey(this.scene.textures, PROP_TEXTURES.vending.key));
      if (!image) return;
      used.add(id);
      const broken = prop.state === 'broken';
      image.setOrigin(0.5, 1).setDisplaySize(40, 68).setPosition(Math.round(prop.x), Math.round(prop.y + 14))
        .setDepth(presentationDepth('actor', prop.y)).setTint(broken ? 0x5a5266 : 0xffffff).setAngle(broken ? -4 : 0);
      layers.shadow(id, prop.x, prop.y + 12, 1.2);
      if (!broken) {
        layers.light(prop.x, prop.y - 30, 70, 0x3ff0ff, 0.45);
        return;
      }
      // Busted: a dead panel that sparks now and then, and a dribble of soda.
      if ((tick + prop.id * 13) % 50 < 6) {
        effects.lineStyle(2, 0xffffff, 0.9);
        for (let i = 0; i < 3; i += 1) effects.lineBetween(prop.x - 6, prop.y - 34, prop.x - 6 + Math.cos(i * 2.1 + tick) * 12, prop.y - 34 + Math.sin(i * 2.1 + tick) * 10);
        layers.light(prop.x, prop.y - 34, 40, 0xffffff, 0.7);
      }
      floor.fillStyle(0x7a3a1a, 0.55).fillEllipse(prop.x + 4, prop.y + 18, 30, 10);
      return;
    }

    // Clothing rack.
    if (prop.state === 'standing') {
      const image = this.image(id, usableTextureKey(this.scene.textures, PROP_TEXTURES.clothingRack.key));
      if (!image) return;
      used.add(id);
      image.setOrigin(0.5, 1).setDisplaySize(58, 55).setPosition(Math.round(prop.x), Math.round(prop.y + 12)).setDepth(presentationDepth('actor', prop.y));
      layers.shadow(id, prop.x, prop.y + 10, 1.3);
      return;
    }
    // Toppled: the chrome rail on the floor with the stock spilled along it.
    const wall = propWall(prop)!;
    const horizontal = wall.width > wall.height;
    const length = horizontal ? wall.width : wall.height;
    floor.fillStyle(0x000000, 0.35).fillRect(wall.x + 2, wall.y + 4, wall.width, wall.height);
    for (let i = 0; i < 9; i += 1) {
      const along = 6 + (i * (length - 12)) / 8;
      const color = CLOTHES[(i + prop.id) % CLOTHES.length]!;
      const jitter = ((i * 7 + prop.id * 3) % 7) - 3;
      if (horizontal) floor.fillStyle(color, 0.95).fillRect(wall.x + along - 6, wall.y + 1 + jitter, 12, wall.height - 2);
      else floor.fillStyle(color, 0.95).fillRect(wall.x + 1 + jitter, wall.y + along - 6, wall.width - 2, 12);
    }
    floor.lineStyle(3, 0xcfd6e0, 1);
    if (horizontal) floor.lineBetween(wall.x, wall.y + wall.height / 2, wall.x + wall.width, wall.y + wall.height / 2);
    else floor.lineBetween(wall.x + wall.width / 2, wall.y, wall.x + wall.width / 2, wall.y + wall.height);
  }

  private drawHero(_combat: RunState, hero: HeroState, tick: number, layers: HeroPropLayers, used: Set<string>): void {
    const { effects, floor } = layers;
    // Greatest Hits: spinning vinyl, pink labels, a groove glint.
    for (const record of hero.records) {
      const spin = tick * 0.5 + record.id;
      effects.fillStyle(0x0b0714, 1).fillCircle(record.x, record.y, RECORD_RADIUS);
      effects.lineStyle(1, 0x3a3450, 1).strokeCircle(record.x, record.y, RECORD_RADIUS * 0.7);
      effects.fillStyle(0xff3fc8, 1).fillCircle(record.x, record.y, RECORD_RADIUS * 0.35);
      effects.lineStyle(2, 0xffffff, 0.7).beginPath().arc(record.x, record.y, RECORD_RADIUS * 0.85, spin, spin + 0.9).strokePath();
      layers.light(record.x, record.y, 30, 0xff3fc8, record.mode === 'flying' ? 0.7 : 0.4);
      if (record.mode === 'flying') {
        effects.lineStyle(3, 0xff3fc8, 0.35).lineBetween(record.x, record.y, record.x - record.vx * 3, record.y - record.vy * 3);
      }
    }

    // Comedy Hour: the chicken, wobbling, with the pull it has and its fuse.
    if (hero.decoy) {
      const decoy = hero.decoy;
      const id = 'hero:decoy';
      const image = this.image(id, usableItemIcon(this.scene, 'rubber_chicken'));
      const left = decoy.ticks / DECOY_TICKS;
      const panic = left < 0.25;
      if (image) {
        used.add(id);
        image.setOrigin(0.5, 1).setScale(1.6).setPosition(Math.round(decoy.x), Math.round(decoy.y + 8 - Math.abs(Math.sin(tick / (panic ? 3 : 7))) * 6))
          .setAngle(Math.sin(tick / (panic ? 2 : 5)) * 14).setDepth(presentationDepth('actor', decoy.y));
      }
      floor.lineStyle(1, 0xffd84a, 0.18).strokeCircle(decoy.x, decoy.y, DECOY_LURE_RADIUS * (0.96 + 0.04 * Math.sin(tick / 10)));
      effects.lineStyle(3, panic ? 0xff5a6a : 0xffd84a, 0.9).beginPath().arc(decoy.x, decoy.y - 34, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left).strokePath();
      layers.light(decoy.x, decoy.y - 10, 60, 0xffd84a, panic ? 0.9 : 0.5);
    }
    for (const burst of hero.bursts) {
      const t = 1 - burst.ticks / 20;
      effects.lineStyle(4, 0xffd84a, 1 - t).strokeCircle(burst.x, burst.y, 20 + t * 70);
      effects.fillStyle(0xffffff, 0.5 * (1 - t)).fillCircle(burst.x, burst.y, 30 * (1 - t));
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        effects.fillStyle(0xfff4c8, 1 - t).fillRect(burst.x + Math.cos(a) * (20 + t * 60), burst.y + Math.sin(a) * (14 + t * 40), 4, 3);
      }
      layers.light(burst.x, burst.y, 120, 0xffd84a, 1 - t);
    }

    // Movie Night: a cone of projector light, flicker and grain, and a
    // horror-movie shadow lurching across the far end.
    for (const beam of hero.beams) {
      const fade = Math.min(1, beam.ticks / 10);
      const dx = beam.toX - beam.x;
      const dy = beam.toY - beam.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length;
      const ny = dx / length;
      const flicker = 0.8 + 0.2 * Math.sin(tick * 2.3);
      effects.fillStyle(0xfff4c8, 0.34 * fade * flicker).fillTriangle(beam.x, beam.y, beam.toX + nx * 30, beam.toY + ny * 30, beam.toX - nx * 30, beam.toY - ny * 30);
      effects.fillStyle(0xffffff, 0.2 * fade).fillTriangle(beam.x, beam.y, beam.toX + nx * 12, beam.toY + ny * 12, beam.toX - nx * 12, beam.toY - ny * 12);
      for (let i = 0; i < 10; i += 1) {
        const along = ((i * 53 + tick * 7) % 100) / 100;
        const across = (((i * 29 + tick * 3) % 60) - 30) * along;
        effects.fillStyle(0xffffff, 0.6 * fade).fillRect(beam.x + dx * along + nx * across, beam.y + dy * along + ny * across, 2, 2);
      }
      // The silhouette: a hunched thing with its claws up.
      const sx = beam.x + dx * 0.72;
      const sy = beam.y + dy * 0.72 - 20;
      const sway = Math.sin(tick / 4) * 3;
      effects.fillStyle(0x000000, 0.75 * fade);
      effects.fillEllipse(sx + sway, sy, 34, 46);
      effects.fillCircle(sx + sway * 1.4, sy - 30, 13);
      effects.fillTriangle(sx - 14 + sway, sy - 8, sx - 34 + sway * 2, sy - 40, sx - 22 + sway, sy - 4);
      effects.fillTriangle(sx + 14 + sway, sy - 8, sx + 34 + sway * 2, sy - 40, sx + 22 + sway, sy - 4);
      effects.fillStyle(0xff3a3a, fade).fillRect(sx + sway * 1.4 - 6, sy - 33, 3, 3).fillRect(sx + sway * 1.4 + 3, sy - 33, 3, 3);
      layers.light(beam.x + dx * 0.5, beam.y + dy * 0.5, length * 0.5, 0xfff4c8, 0.6 * fade);
    }
  }

  /** Little stars circling a dazed monster's head. */
  private drawDazed(x: number, y: number, tick: number, effects: Phaser.GameObjects.Graphics): void {
    for (let i = 0; i < 3; i += 1) {
      const a = tick / 8 + (i * Math.PI * 2) / 3;
      const sx = x + Math.cos(a) * 12;
      const sy = y + Math.sin(a) * 4;
      effects.fillStyle(0xffd84a, 1).fillRect(sx - 1, sy - 3, 2, 6).fillRect(sx - 3, sy - 1, 6, 2);
    }
  }

  public destroy(): void {
    for (const image of this.images.values()) image.destroy();
    this.images.clear();
  }
}
