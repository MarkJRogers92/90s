import type { RunState } from './model';

export function createRun(seed: number): RunState {
  return {
    seed,
    tick: 0,
    paused: false,
    status: 'playing',
    player: {
      x: 180,
      y: 240,
      health: 6,
      radius: 10,
      attackCooldownTicks: 0,
      invulnerableTicks: 0,
    },
    enemies: [
      {
        id: 1,
        kind: 'hanger',
        x: 700,
        y: 180,
        health: 8,
        radius: 14,
        phase: 'pursue',
        phaseTicks: 0,
        cooldownTicks: 0,
      },
      {
        id: 2,
        kind: 'spitter',
        x: 760,
        y: 340,
        health: 8,
        radius: 16,
        phase: 'recover',
        phaseTicks: 90,
        cooldownTicks: 0,
      },
    ],
    projectiles: [],
    walls: [
      { x: 460, y: 120, width: 40, height: 130 },
      { x: 460, y: 320, width: 40, height: 80 },
    ],
    nextEntityId: 3,
    roomWasPopulated: true,
    rewardGranted: false,
  };
}
