export interface PresentationAsset {
  key: string;
  url: string;
  frameWidth?: number;
  frameHeight?: number;
  requiredFor: 'environment' | 'actor' | 'ambience' | 'effect';
}

/** Single source of truth for environment texture requests and preload keys. */
export const ENVIRONMENT_TEXTURE_KEYS = {
  atriumFountain: 'presentation:environment:atrium-fountain',
  benchWarrantKiosk: 'presentation:environment:bench-warrant-kiosk',
  floorTerrazzo: 'presentation:environment:floor-terrazzo',
  mallBench: 'presentation:environment:mall-bench',
  mallDirectory: 'presentation:environment:mall-directory',
  planter: 'presentation:environment:planter',
  posterStand: 'presentation:environment:poster-stand',
  pottedPalm: 'presentation:environment:potted-palm',
  railingGlass: 'presentation:environment:railing-glass',
  rubbishBin: 'presentation:environment:rubbish-bin',
  securityGate: 'presentation:environment:security-gate',
  signCool: 'presentation:environment:sign-cool',
  storefrontFascia: 'presentation:environment:storefront-fascia',
  wallCorner: 'presentation:environment:wall-corner',
  wallFace: 'presentation:environment:wall-face',
  wallTop: 'presentation:environment:wall-top',
} as const;

export type EnvironmentTextureKey = (typeof ENVIRONMENT_TEXTURE_KEYS)[keyof typeof ENVIRONMENT_TEXTURE_KEYS];

export const ACTOR_TEXTURE_KEYS = {
  alexIdle: 'presentation:actor:alex-idle',
  alexWalk: 'presentation:actor:alex-walk',
  hangerIdle: 'presentation:actor:hanger-idle',
} as const;
export type ActorTextureKey = (typeof ACTOR_TEXTURE_KEYS)[keyof typeof ACTOR_TEXTURE_KEYS];

export const CIVILIAN_TEXTURE_KEYS = {
  shopperAIdle: 'presentation:civilian:shopper-a-idle',
  shopperAWalk: 'presentation:civilian:shopper-a-walk',
  shopperBIdle: 'presentation:civilian:shopper-b-idle',
  shopperBWalk: 'presentation:civilian:shopper-b-walk',
  clerkIdle: 'presentation:civilian:clerk-idle',
  clerkWalk: 'presentation:civilian:clerk-walk',
  securityIdle: 'presentation:civilian:security-idle',
  securityWalk: 'presentation:civilian:security-walk',
} as const;
export type CivilianTextureKey = (typeof CIVILIAN_TEXTURE_KEYS)[keyof typeof CIVILIAN_TEXTURE_KEYS];

const environment = (
  key: EnvironmentTextureKey,
  frameWidth: number,
  frameHeight: number,
  filename = key.slice('presentation:environment:'.length),
): PresentationAsset => ({
  key,
  url: `/assets/presentation/environment/${filename}.png`,
  frameWidth,
  frameHeight,
  requiredFor: 'environment',
});

const actor = (key: ActorTextureKey, frameWidth: number, frameHeight: number): PresentationAsset => ({
  key,
  url: `/assets/presentation/actors/${key.slice('presentation:actor:'.length)}.png`,
  frameWidth,
  frameHeight,
  requiredFor: 'actor',
});

const civilian = (key: CivilianTextureKey, frameWidth: number, frameHeight: number): PresentationAsset => ({
  key,
  url: `/assets/presentation/civilians/${key.slice('presentation:civilian:'.length)}.png`,
  frameWidth,
  frameHeight,
  requiredFor: 'ambience',
});

/** Approved presentation assets that may decorate the vector MVP scene. */
export const PRESENTATION_ASSETS: readonly PresentationAsset[] = [
  environment(ENVIRONMENT_TEXTURE_KEYS.atriumFountain, 96, 64, 'atrium-fountain-96x64'),
  environment(ENVIRONMENT_TEXTURE_KEYS.benchWarrantKiosk, 64, 64),
  environment(ENVIRONMENT_TEXTURE_KEYS.floorTerrazzo, 32, 32, 'floor-terrazzo-32'),
  environment(ENVIRONMENT_TEXTURE_KEYS.mallBench, 56, 30),
  environment(ENVIRONMENT_TEXTURE_KEYS.mallDirectory, 17, 54),
  environment(ENVIRONMENT_TEXTURE_KEYS.planter, 25, 25),
  environment(ENVIRONMENT_TEXTURE_KEYS.posterStand, 38, 53),
  environment(ENVIRONMENT_TEXTURE_KEYS.pottedPalm, 38, 58),
  environment(ENVIRONMENT_TEXTURE_KEYS.railingGlass, 32, 32, 'railing-glass-32'),
  environment(ENVIRONMENT_TEXTURE_KEYS.rubbishBin, 20, 25),
  environment(ENVIRONMENT_TEXTURE_KEYS.securityGate, 32, 32, 'security-gate-32'),
  environment(ENVIRONMENT_TEXTURE_KEYS.signCool, 96, 24, 'sign-cool-96x24'),
  environment(ENVIRONMENT_TEXTURE_KEYS.storefrontFascia, 64, 32, 'storefront-fascia-64x32'),
  environment(ENVIRONMENT_TEXTURE_KEYS.wallCorner, 32, 64, 'wall-corner-32x64'),
  environment(ENVIRONMENT_TEXTURE_KEYS.wallFace, 32, 64, 'wall-face-32x64'),
  environment(ENVIRONMENT_TEXTURE_KEYS.wallTop, 32, 32, 'wall-top-32'),
  actor(ACTOR_TEXTURE_KEYS.alexIdle, 32, 48),
  actor(ACTOR_TEXTURE_KEYS.alexWalk, 32, 48),
  actor(ACTOR_TEXTURE_KEYS.hangerIdle, 48, 48),
  civilian(CIVILIAN_TEXTURE_KEYS.shopperAIdle, 32, 48),
  civilian(CIVILIAN_TEXTURE_KEYS.shopperAWalk, 32, 48),
  civilian(CIVILIAN_TEXTURE_KEYS.shopperBIdle, 32, 48),
  civilian(CIVILIAN_TEXTURE_KEYS.shopperBWalk, 32, 48),
  civilian(CIVILIAN_TEXTURE_KEYS.clerkIdle, 32, 48),
  civilian(CIVILIAN_TEXTURE_KEYS.clerkWalk, 32, 48),
  civilian(CIVILIAN_TEXTURE_KEYS.securityIdle, 32, 48),
  civilian(CIVILIAN_TEXTURE_KEYS.securityWalk, 32, 48),
];

/* ------------------------------------------------------------------------ */
/* Neon overhaul runtime art (public/assets/neon, see manifest.json)          */
/* ------------------------------------------------------------------------ */

export const ENEMY_TEXTURE_KEYS = {
  hangerIdle: 'neon:enemy:hanger-idle',
  hangerWalk: 'neon:enemy:hanger-walk',
  spitterIdle: 'neon:enemy:spitter-idle',
  lpManagerIdle: 'neon:enemy:lp-manager-idle',
  lpManagerWalk: 'neon:enemy:lp-manager-walk',
} as const;

/** Item icons keyed by the simulation's item definition id. */
export const ITEM_ICON_FILES: Readonly<Record<string, string>> = {
  janitor_mop: 'mop',
  pump_soaker: 'pump-soaker',
  bubble_bath: 'bubble-bath',
  plasma_globe: 'plasma-globe',
  vhs_rewinder: 'vhs-rewinder',
  extension_cord: 'extension-cord',
  gel_pens: 'gel-pens',
  wide_nozzle: 'wide-nozzle',
  receipt_wallet: 'receipt-wallet',
  fanny_pack: 'fanny-pack',
  rc_car: 'rc-car',
  party_popper: 'party-popper',
  bottle_rocket_pack: 'bottle-rocket-pack',
  fire_extinguisher: 'fire-extinguisher',
  paint_marker: 'paint-marker',
  foam_ball_blaster: 'foam-ball-blaster',
  slushie_cup: 'slushie-cup',
  broken_broom_handle: 'broken-broom-handle',
  box_cutter: 'box-cutter',
  grease_gun: 'grease-gun',
  anti_static_strap: 'anti-static-strap',
  car_battery: 'car-battery',
  needle_nozzle: 'needle-nozzle',
  heavy_duty_spring: 'heavy-duty-spring',
};

export function itemIconKey(itemDefinitionId: string): string | null {
  const file = ITEM_ICON_FILES[itemDefinitionId];
  return file ? `neon:item:${file}` : null;
}

export const PORTRAIT_TEXTURE_KEYS = {
  alex: 'neon:portrait:alex',
  lpManager: 'neon:portrait:security-guard',
} as const;

export const DECAL_TEXTURE_KEYS = {
  bloodPool: 'neon:decal:blood-pool',
  bloodSplash: 'neon:decal:blood-splash',
  bloodDrops: 'neon:decal:blood-drops',
  bloodDrag: 'neon:decal:blood-drag',
  residue: 'neon:decal:organic-residue',
  scorch: 'neon:decal:scorch-mark',
  glass: 'neon:decal:broken-glass',
} as const;

const neon = (key: string, file: string, frameWidth?: number, frameHeight?: number): PresentationAsset => ({
  key,
  url: `/assets/neon/${file}`,
  ...(frameWidth ? { frameWidth } : {}),
  ...(frameHeight ? { frameHeight } : {}),
  requiredFor: 'actor',
});

/** Everything the neon presentation loads besides the dressing kit. */
export const NEON_ASSETS: readonly PresentationAsset[] = [
  neon(ENEMY_TEXTURE_KEYS.hangerIdle, 'enemies/hanger-idle.png', 48, 48),
  neon(ENEMY_TEXTURE_KEYS.hangerWalk, 'enemies/hanger-walk.png', 48, 48),
  neon(ENEMY_TEXTURE_KEYS.spitterIdle, 'enemies/spitter-idle.png', 48, 48),
  neon(ENEMY_TEXTURE_KEYS.lpManagerIdle, 'enemies/lp-manager-idle.png', 48, 48),
  neon(ENEMY_TEXTURE_KEYS.lpManagerWalk, 'enemies/lp-manager-walk.png', 48, 48),
  neon(PORTRAIT_TEXTURE_KEYS.alex, 'portraits/alex.png'),
  neon(PORTRAIT_TEXTURE_KEYS.lpManager, 'portraits/security-guard.png'),
  ...Object.values(DECAL_TEXTURE_KEYS).map((key) => neon(key, `decals/${key.slice('neon:decal:'.length)}.png`)),
  ...Object.values(ITEM_ICON_FILES).map((file) => neon(`neon:item:${file}`, `items/${file}.png`)),
];

/** 64px PixelLab characters: 8-facing idle strips and 8-row walk sheets. */
export const PLAYER_TEXTURE_KEYS = {
  idle: 'neon:player:alex-idle',
  walk: 'neon:player:alex-walk',
} as const;

export const NEON_CIVILIAN_KEYS = {
  'shopper-a': { idle: 'neon:civilian:neon-girl-idle', walk: 'neon:civilian:neon-girl-walk' },
  'shopper-b': { idle: 'neon:civilian:skater-idle', walk: 'neon:civilian:skater-walk' },
  clerk: { idle: 'neon:civilian:camcorder-dad-idle', walk: 'neon:civilian:camcorder-dad-walk' },
  security: { idle: 'neon:civilian:mall-guard-idle', walk: 'neon:civilian:mall-guard-walk' },
} as const;

export const CHARACTER_ASSETS: readonly PresentationAsset[] = [
  neon(PLAYER_TEXTURE_KEYS.idle, 'player/alex-idle.png'),
  neon(PLAYER_TEXTURE_KEYS.walk, 'player/alex-walk.png'),
  ...Object.values(NEON_CIVILIAN_KEYS).flatMap((keys) => [
    neon(keys.idle, `civilians/${keys.idle.slice('neon:civilian:'.length)}.png`),
    neon(keys.walk, `civilians/${keys.walk.slice('neon:civilian:'.length)}.png`),
  ]),
];

/**
 * Square frame size of a character sheet: an idle strip is one row of
 * facings, a walk sheet is eight rows. Read from the loaded texture so a
 * regenerated character at a new size needs no code change.
 */
export function characterFrameSize(textureHeight: number, rows: 1 | 8): number {
  return Math.round(textureHeight / rows);
}
