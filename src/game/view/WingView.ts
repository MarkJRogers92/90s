import Phaser from 'phaser';
import type { WingState } from '../../sim/shop/types';

export class WingView {
  private readonly graphics: Phaser.GameObjects.Graphics;

  public constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
  }

  public sync(state: WingState): void {
    const graphics = this.graphics;
    graphics.clear();

    graphics.fillStyle(0x1d2124, 1);
    graphics.fillRect(0, 0, state.wing.width, state.wing.height);

    graphics.fillStyle(0x8c8873, 1);
    graphics.fillRect(0, 0, state.wing.width, state.wing.height);
    graphics.lineStyle(1, 0x74705f, 0.35);
    for (let x = 0; x <= state.wing.width; x += 32) {
      graphics.lineBetween(x, 0, x, state.wing.height);
    }
    for (let y = 0; y <= state.wing.height; y += 32) {
      graphics.lineBetween(0, y, state.wing.width, y);
    }

    for (const store of state.wing.stores) {
      const highlight = state.carried?.sourceStoreId === store.id;
      graphics.fillStyle(highlight ? 0x4a3f57 : 0x35383a, 1);
      graphics.fillRect(store.bounds.x, store.bounds.y, store.bounds.width, store.bounds.height);
      graphics.lineStyle(2, highlight ? 0xf6d365 : 0xc4b878, highlight ? 1 : 0.6);
      graphics.strokeRect(store.bounds.x, store.bounds.y, store.bounds.width, store.bounds.height);
    }

    for (const wall of state.wing.walls) {
      graphics.fillStyle(0x41453f, 1);
      graphics.fillRect(wall.x, wall.y, wall.width, wall.height);
      graphics.lineStyle(2, 0xc4b878, 0.45);
      graphics.strokeRect(wall.x, wall.y, wall.width, wall.height);
    }

    for (const store of state.wing.stores) {
      const exit = store.exit.bounds;
      graphics.fillStyle(0x8bc9b8, 1);
      graphics.fillRect(exit.x, exit.y, exit.width, exit.height);
      graphics.lineStyle(2, 0x12130f, 0.8);
      graphics.strokeRect(exit.x, exit.y, exit.width, exit.height);
    }

    const mallExit = state.wing.mallExit.bounds;
    graphics.fillStyle(0xf6d365, 1);
    graphics.fillRect(mallExit.x, mallExit.y, mallExit.width, mallExit.height);
    graphics.lineStyle(2, 0x12130f, 0.9);
    graphics.strokeRect(mallExit.x, mallExit.y, mallExit.width, mallExit.height);

    for (const store of state.wing.stores) {
      const sweep = state.sweeps.find((candidate) => candidate.storeId === store.id);
      if (!sweep) {
        continue;
      }
      const zone = store.sightZone;
      const halfArc = ((zone.arcDegrees * Math.PI) / 180) / 2;
      const first = sweep.facingRadians - halfArc;
      const second = sweep.facingRadians + halfArc;
      const firstX = zone.origin.x + Math.cos(first) * zone.range;
      const firstY = zone.origin.y + Math.sin(first) * zone.range;
      const secondX = zone.origin.x + Math.cos(second) * zone.range;
      const secondY = zone.origin.y + Math.sin(second) * zone.range;
      graphics.fillStyle(0xffd45d, 0.22);
      graphics.fillTriangle(zone.origin.x, zone.origin.y, firstX, firstY, secondX, secondY);
      graphics.lineStyle(1, 0xffd45d, 0.6);
      graphics.lineBetween(zone.origin.x, zone.origin.y, firstX, firstY);
      graphics.lineBetween(zone.origin.x, zone.origin.y, secondX, secondY);
      graphics.fillStyle(0xffd45d, 1);
      graphics.fillCircle(zone.origin.x, zone.origin.y, 4);
    }

    for (const offer of state.offers) {
      if (offer.status === 'available') {
        graphics.fillStyle(0x8bc9b8, 1);
        graphics.fillCircle(offer.position.x, offer.position.y, 7);
        graphics.lineStyle(2, 0x12130f, 0.9);
        graphics.strokeCircle(offer.position.x, offer.position.y, 7);
      } else if (offer.status === 'carried') {
        graphics.lineStyle(2, 0xf6d365, 1);
        graphics.strokeCircle(offer.position.x, offer.position.y, 7);
      } else {
        graphics.lineStyle(2, 0x5a5e55, 0.8);
        graphics.lineBetween(offer.position.x - 6, offer.position.y - 6, offer.position.x + 6, offer.position.y + 6);
        graphics.lineBetween(offer.position.x - 6, offer.position.y + 6, offer.position.x + 6, offer.position.y - 6);
      }
    }

    graphics.fillStyle(0x2f5f62, 1);
    graphics.fillCircle(state.player.x, state.player.y, state.player.radius);
    graphics.lineStyle(2, 0xf4edd8, 0.9);
    graphics.strokeCircle(state.player.x, state.player.y, state.player.radius);
    graphics.lineStyle(3, 0xf6d365, 1);
    graphics.lineBetween(
      state.player.x,
      state.player.y,
      state.player.x + state.player.facing.x * (state.player.radius + 6),
      state.player.y + state.player.facing.y * (state.player.radius + 6),
    );
  }

  public destroy(): void {
    this.graphics.destroy();
  }
}
