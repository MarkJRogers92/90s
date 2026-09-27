export interface PresentationAsset {
  key: string;
  url: string;
  frameWidth?: number;
  frameHeight?: number;
  requiredFor: 'environment' | 'actor' | 'ambience' | 'effect';
}

const environment = (
  key: string,
  frameWidth: number,
  frameHeight: number,
  filename = key,
): PresentationAsset => ({
  key: `presentation:environment:${key}`,
  url: `/assets/presentation/environment/${filename}.png`,
  frameWidth,
  frameHeight,
  requiredFor: 'environment',
});

/** Approved presentation assets that may decorate the vector MVP scene. */
export const PRESENTATION_ASSETS: readonly PresentationAsset[] = [
  environment('atrium-fountain', 96, 64, 'atrium-fountain-96x64'),
  environment('bench-warrant-kiosk', 64, 64),
  environment('floor-terrazzo', 32, 32, 'floor-terrazzo-32'),
  environment('mall-bench', 56, 30),
  environment('mall-directory', 17, 54),
  environment('planter', 25, 25),
  environment('poster-stand', 38, 53),
  environment('potted-palm', 38, 58),
  environment('railing-glass', 32, 32, 'railing-glass-32'),
  environment('rubbish-bin', 20, 25),
  environment('security-gate', 32, 32, 'security-gate-32'),
  environment('sign-cool', 96, 24, 'sign-cool-96x24'),
  environment('storefront-fascia', 64, 32, 'storefront-fascia-64x32'),
  environment('wall-corner', 32, 64, 'wall-corner-32x64'),
  environment('wall-face', 32, 64, 'wall-face-32x64'),
  environment('wall-top', 32, 32, 'wall-top-32'),
];
