/** Exact untrimmed local art for the three approved props and their dev fixture. */
const prop = (name: string, width: number, height: number, effect: string, frameSize: number, frames: number) => ({
  intact: `prop-test-${name}`, damaged: `prop-test-${name}-damaged`, width, height,
  effect: `prop-test-${effect}`, frameSize, frames,
});

export const PROP_TEST_ART = {
  bakery: prop('bakery', 64, 48, 'glass-break', 64, 10),
  monitors: prop('monitors', 56, 56, 'machine-chip', 48, 8),
  slush: prop('slush', 40, 56, 'soda-rupture', 64, 10),
} as const;

export const PROP_TEST_ASSETS = Object.values(PROP_TEST_ART).flatMap((art) => [
  { key: art.intact, url: `/assets/prop-test/${art.intact}.png` },
  { key: art.damaged, url: `/assets/prop-test/${art.damaged}.png` },
  { key: art.effect, url: `/assets/prop-test/${art.effect}.png` },
]);
