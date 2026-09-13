export type RunStatus = 'playing' | 'won' | 'dead';
export type EnemyKind = 'hanger' | 'spitter';
export type Vec2 = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

export type InputFrame = {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  fire: boolean;
};

export type PlayerState = Vec2 & {
  health: number;
  radius: number;
  facing: Vec2;
  attackCooldownTicks: number;
  attackActiveTicks: number;
  invulnerableTicks: number;
};

export type EnemyState = Vec2 & {
  id: number;
  kind: EnemyKind;
  health: number;
  radius: number;
  phase: 'pursue' | 'telegraph' | 'recover';
  phaseTicks: number;
  cooldownTicks: number;
  telegraphAimX: number;
  telegraphAimY: number;
};

export type ProjectileState = Vec2 & {
  id: number;
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  remainingTicks: number;
  faction: 'enemy' | 'player';
  damage: number;
};

export type RunState = {
  seed: number;
  tick: number;
  paused: boolean;
  status: RunStatus;
  player: PlayerState;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  walls: Rect[];
  nextEntityId: number;
  roomWasPopulated: boolean;
  rewardGranted: boolean;
};
