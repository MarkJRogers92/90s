import Phaser from 'phaser';
import { BenchScene } from './game/scenes/BenchScene';
import { BootScene } from './game/scenes/BootScene';
import { MvpRunScene, setMvpRunLaunch } from './game/scenes/MvpRunScene';
import { firstShiftSeed, type ShiftSeed } from './game/run/shiftSeed';
import { RunScene } from './game/scenes/RunScene';
import { WingScene } from './game/scenes/WingScene';
import {
  LocalStorageCheckpointStore,
  type CheckpointStorageLike,
} from './game/persistence/LocalStorageCheckpointStore';
import type { MvpCheckpoint } from './sim/run/checkpoint';
import './styles.css';
import { PlaytestLog } from './game/playtest/log';
import { PlaytestPanel } from './game/ui/PlaytestPanel';
import { OPEN_SETTINGS_EVENT, SettingsPanel } from './game/ui/SettingsPanel';
import { browserBestRuns } from './game/score/score';
import { BreakRoomPanel } from './game/ui/BreakRoomPanel';
import { browserCareer, localDay } from './game/career/career';
import { browserDaily, dailyRuleLine, dailySeed, formatDailyDate, summarizeDaily } from './game/run/dailyShift';

export const RETURN_TO_TITLE_EVENT = 'dead-mall:return-to-title';

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

/** The address bar's `?seed=` pins the mall; without it every shift rolls one. */
function seedFromUrl(): ShiftSeed {
  return firstShiftSeed(new URLSearchParams(window.location.search).get('seed'));
}

const startButton = requireElement<HTMLButtonElement>('#start-shift');
const labButton = requireElement<HTMLButtonElement>('#interaction-lab-launch');
const shopButton = requireElement<HTMLButtonElement>('#shoplifting-loop-launch');
const benchButton = requireElement<HTMLButtonElement>('#void-warranty-launch');
const nightShiftButton = requireElement<HTMLButtonElement>('#night-shift-launch');
const dailyShiftButton = requireElement<HTMLButtonElement>('#daily-shift-launch');
const dailyRunLine = requireElement<HTMLElement>('#daily-run');
const dailyRuleElement = requireElement<HTMLElement>('#daily-rule');
const settingsPanel = new SettingsPanel((selector) => requireElement(selector));
window.addEventListener(OPEN_SETTINGS_EVENT, () => settingsPanel.open());
new PlaytestPanel(
  new PlaytestLog((() => { try { return window.localStorage; } catch { return null; } })()),
  (selector) => requireElement(selector),
);
const continueButton = requireElement<HTMLButtonElement>('#continue-run');
const labSection = requireElement<HTMLElement>('#interaction-lab');
const runHud = requireElement<HTMLElement>('#run-hud');
const wingHud = requireElement<HTMLElement>('#wing-hud');
const benchHud = requireElement<HTMLElement>('#bench-hud');
const mvpHud = requireElement<HTMLElement>('#mvp-run-hud');
const startScreen = requireElement<HTMLElement>('#start-screen');
const bestRunLine = requireElement<HTMLElement>('#best-run');

const breakRoom = new BreakRoomPanel(browserCareer(), (selector) => requireElement(selector));

/** The title's best-run line and Break Room balance, refreshed whenever the title is shown. */
function showBestRun(): void {
  breakRoom.refreshButton();
  const today = localDay();
  dailyShiftButton.textContent = `Daily Shift · ${formatDailyDate(today)}`;
  dailyRunLine.textContent = summarizeDaily(today, browserDaily().today(today));
  dailyRuleElement.textContent = dailyRuleLine(today);
  const best = browserBestRuns().best();
  bestRunLine.hidden = best === null;
  if (best) {
    const time = `${Math.floor(best.seconds / 60)}:${String(best.seconds % 60).padStart(2, '0')}`;
    bestRunLine.textContent = `BEST SHIFT: ${best.score.toLocaleString('en-US')} · ${best.won ? `CLOCKED OUT IN ${time}` : 'DID NOT CLOCK OUT'}`;
  }
}
showBestRun();
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
  dailyShiftButton.disabled = disabled;
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
      // 640x360, not the playfield's 960x480: the playfield is the room the
      // simulation is authored against, this is the window onto it. 640x360
      // integer-scales to 1920x1080 exactly, which 960x480 cannot (x2 leaves a
      // 120px letterbox, x2.25 is uneven). The camera in each scene follows the
      // player, so a viewport smaller than the room is the intended arrangement.
      width: 640,
      height: 360,
      backgroundColor: '#252926',
      render: {
        antialias: false,
        pixelArt: true,
        roundPixels: true,
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [BootScene, RunScene, WingScene, BenchScene],
    });

    startupStatus.textContent = '';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    startScreen.hidden = false;
    showBestRun();
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

function launchRun(checkpoint: MvpCheckpoint | null, shift: ShiftSeed, daily: string | null = null): void {
  if (game) {
    return;
  }
  setMvpRunLaunch({ seed: shift.seed, seedPinned: shift.pinned, checkpoint, store: checkpointStore, ...(daily ? { mode: 'daily' as const, date: daily } : {}) });
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
  // The previous shift's HUD stays hidden while assets load. The new scene
  // reveals it in MvpRunHud.sync once its authoritative state is ready.
  mvpHud.hidden = true;

  try {
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-host',
      // Night Shift frames each whole room at once, Isaac-style: the 960x480
      // playfield plus a 120px band above it where the back wall's storefronts
      // stand in 3/4 view. 960x600 scales to 1920x1200 at exactly x2.
      width: 960,
      height: 600,
      backgroundColor: '#07050c',
      render: {
        antialias: false,
        pixelArt: true,
        roundPixels: true,
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [MvpRunScene],
    });

    startupStatus.textContent = '';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    startScreen.hidden = false;
    showBestRun();
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
  showBestRun();
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
  dailyShiftButton.disabled = false;
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

dailyShiftButton.addEventListener('click', () => {
  // Today's mall, pinned: a retry keeps it, and everyone playing today gets the same one.
  const today = localDay();
  launchRun(null, { seed: dailySeed(today), pinned: true }, today);
});

continueButton.addEventListener('click', () => {
  const result = checkpointStore.read();
  if (!result.ok) {
    refreshContinueAvailability();
    return;
  }
  launchRun(result.checkpoint, { seed: result.checkpoint.seed, pinned: false });
});

window.addEventListener(RETURN_TO_TITLE_EVENT, returnToTitle);

refreshContinueAvailability();
