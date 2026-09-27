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
