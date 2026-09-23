import Phaser from 'phaser';
import { BenchScene } from './game/scenes/BenchScene';
import { BootScene } from './game/scenes/BootScene';
import { MvpRunScene, setMvpRunLaunch } from './game/scenes/MvpRunScene';
import { RunScene } from './game/scenes/RunScene';
import { WingScene } from './game/scenes/WingScene';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './game/view/viewport';
import {
  LocalStorageCheckpointStore,
  type CheckpointStorageLike,
} from './game/persistence/LocalStorageCheckpointStore';
import type { MvpCheckpoint } from './sim/run/checkpoint';
import './styles.css';

export const RETURN_TO_TITLE_EVENT = 'dead-mall:return-to-title';

/**
 * Re-exported so the viewport has a single definition, in a module free of DOM
 * and renderer side effects. `src/main.ts` itself cannot be imported by a test:
 * it queries the startup markup at load and throws when it is absent.
 */
export { VIEWPORT_HEIGHT, VIEWPORT_WIDTH };

type RunMode = 'shift' | 'lab' | 'shop' | 'bench' | 'run';

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`DEAD MALL startup markup is incomplete: missing ${selector}.`);
  }
  return element;
}

function browserCheckpointStorage(): CheckpointStorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Snap the canvas to the largest WHOLE multiple of the internal resolution, and
 * keep it there across resizes.
 *
 * Phaser has no integer scale mode — the modes are `NONE`, `FIT`, `ENVELOP`,
 * `RESIZE` and the two single-axis controls — so whole-multiple scaling is done by
 * hand. With `mode: NONE` the canvas buffer stays at the internal resolution and
 * `setZoom(n)` sets its CSS size to exactly n times that, which is the only way an
 * art pixel keeps a whole number of screen pixels.
 *
 * Why it matters: at a fractional factor (FIT gave 1.563x at a 1000px window and
 * 2.911x even at 1080p) one art pixel covers two screen pixels and its neighbour
 * covers one, so every edge lands on an irregular grid. `pixelArt: true` means
 * nearest-neighbour sampling, so the result is uneven rather than blurred — but it
 * still reads as a low-resolution image, which is what it was reported as.
 */
function pinIntegerZoom(instance: Phaser.Game): void {
  const host = requireElement<HTMLElement>('#game-host');
  const apply = (): void => {
    // Return to title and every mode swap destroy the game and clear the module
    // handle. This observer outlives that, and scaling a destroyed game throws on
    // a null canvas (`Cannot read properties of null (reading 'style')`), so it
    // must bail on anything that is no longer the live instance.
    if (game !== instance) {
      return;
    }
    const zoom = Math.max(
      1,
      Math.floor(Math.min(host.clientWidth / VIEWPORT_WIDTH, host.clientHeight / VIEWPORT_HEIGHT)),
    );
    game.scale.setZoom(zoom);
  };
  apply();
  // A ResizeObserver catches layout changes that never resize the window (the HUD
  // appearing, a mode swap), which a window listener alone would miss.
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(apply).observe(host);
  } else {
    window.addEventListener('resize', apply);
  }
}

function seedFromUrl(): number {
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null || raw.trim() === '') {
    return 0;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

const startButton = requireElement<HTMLButtonElement>('#start-shift');
const labButton = requireElement<HTMLButtonElement>('#interaction-lab-launch');
const shopButton = requireElement<HTMLButtonElement>('#shoplifting-loop-launch');
const benchButton = requireElement<HTMLButtonElement>('#void-warranty-launch');
const nightShiftButton = requireElement<HTMLButtonElement>('#night-shift-launch');
const continueButton = requireElement<HTMLButtonElement>('#continue-run');
const labSection = requireElement<HTMLElement>('#interaction-lab');
const runHud = requireElement<HTMLElement>('#run-hud');
const wingHud = requireElement<HTMLElement>('#wing-hud');
const benchHud = requireElement<HTMLElement>('#bench-hud');
const mvpHud = requireElement<HTMLElement>('#mvp-run-hud');
const startScreen = requireElement<HTMLElement>('#start-screen');
const runShell = requireElement<HTMLElement>('#run-shell');
const startupStatus = requireElement<HTMLElement>('#startup-status');

const checkpointStore = new LocalStorageCheckpointStore(browserCheckpointStorage());

let game: Phaser.Game | undefined;

function setLaunchButtonsDisabled(disabled: boolean): void {
  startButton.disabled = disabled;
  labButton.disabled = disabled;
  shopButton.disabled = disabled;
  benchButton.disabled = disabled;
  nightShiftButton.disabled = disabled;
}

function refreshContinueAvailability(): void {
  const result = checkpointStore.read();
  continueButton.disabled = !result.ok;
  continueButton.title = result.ok ? 'Resume the night shift from the last checkpoint.' : result.reason;
}

function launch(mode: RunMode): void {
  if (game) {
    return;
  }
  setLaunchButtonsDisabled(true);
  continueButton.disabled = true;
  startupStatus.textContent = 'Clocking in…';
  startScreen.hidden = true;
  runShell.hidden = false;
  runShell.dataset.mode = mode;
  document.body.dataset.mode = mode;
  labSection.hidden = mode !== 'lab';
  runHud.hidden = mode !== 'shift' && mode !== 'lab';
  wingHud.hidden = mode !== 'shop';
  benchHud.hidden = mode !== 'bench';

  try {
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-host',
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      backgroundColor: '#252926',
      render: {
        antialias: false,
        pixelArt: true,
        roundPixels: true,
      },
      scale: {
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [BootScene, RunScene, WingScene, BenchScene],
    });
    pinIntegerZoom(game);

    startupStatus.textContent = '';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    startScreen.hidden = false;
    runShell.hidden = true;
    runShell.dataset.mode = '';
    document.body.dataset.mode = '';
    labSection.hidden = true;
    wingHud.hidden = true;
    benchHud.hidden = true;
    runHud.hidden = false;
    startupStatus.textContent = `Initialization failed: ${message}`;
    setLaunchButtonsDisabled(false);
    refreshContinueAvailability();
    game?.destroy(true);
    game = undefined;
  }
}

function launchRun(checkpoint: MvpCheckpoint | null, seed: number): void {
  if (game) {
    return;
  }
  setMvpRunLaunch({ seed, checkpoint, store: checkpointStore });
  setLaunchButtonsDisabled(true);
  continueButton.disabled = true;
  startupStatus.textContent = 'Clocking in…';
  startScreen.hidden = true;
  runShell.hidden = false;
  runShell.dataset.mode = 'run';
  document.body.dataset.mode = 'run';
  labSection.hidden = true;
  runHud.hidden = true;
  wingHud.hidden = true;
  benchHud.hidden = true;
  mvpHud.hidden = false;

  try {
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-host',
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      backgroundColor: '#252926',
      render: {
        antialias: false,
        pixelArt: true,
        roundPixels: true,
      },
      scale: {
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [MvpRunScene],
    });
    pinIntegerZoom(game);

    startupStatus.textContent = '';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    startScreen.hidden = false;
    runShell.hidden = true;
    runShell.dataset.mode = '';
    document.body.dataset.mode = '';
    labSection.hidden = true;
    wingHud.hidden = true;
    benchHud.hidden = true;
    mvpHud.hidden = true;
    runHud.hidden = false;
    startupStatus.textContent = `Initialization failed: ${message}`;
    setLaunchButtonsDisabled(false);
    refreshContinueAvailability();
    game?.destroy(true);
    game = undefined;
  }
}

function returnToTitle(): void {
  game?.destroy(true);
  game = undefined;
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_BRIDGE === 'true') {
    delete window.__DEAD_MALL_DEBUG__;
  }
  startScreen.hidden = false;
  runShell.hidden = true;
  runShell.dataset.mode = '';
  document.body.dataset.mode = '';
  labSection.hidden = true;
  wingHud.hidden = true;
  benchHud.hidden = true;
  mvpHud.hidden = true;
  runHud.hidden = false;
  startupStatus.textContent = '';
  startButton.disabled = false;
  labButton.disabled = false;
  shopButton.disabled = false;
  benchButton.disabled = false;
  nightShiftButton.disabled = false;
  refreshContinueAvailability();
}

startButton.addEventListener('click', () => {
  launch('shift');
});

labButton.addEventListener('click', () => {
  launch('lab');
});

shopButton.addEventListener('click', () => {
  launch('shop');
});

benchButton.addEventListener('click', () => {
  launch('bench');
});

nightShiftButton.addEventListener('click', () => {
  launchRun(null, seedFromUrl());
});

continueButton.addEventListener('click', () => {
  const result = checkpointStore.read();
  if (!result.ok) {
    refreshContinueAvailability();
    return;
  }
  launchRun(result.checkpoint, result.checkpoint.seed);
});

window.addEventListener(RETURN_TO_TITLE_EVENT, returnToTitle);

refreshContinueAvailability();
