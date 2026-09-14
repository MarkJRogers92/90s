import Phaser from 'phaser';
import { BenchScene } from './game/scenes/BenchScene';
import { BootScene } from './game/scenes/BootScene';
import { RunScene } from './game/scenes/RunScene';
import { WingScene } from './game/scenes/WingScene';
import './styles.css';

export const RETURN_TO_TITLE_EVENT = 'dead-mall:return-to-title';

type RunMode = 'shift' | 'lab' | 'shop' | 'bench';

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`DEAD MALL startup markup is incomplete: missing ${selector}.`);
  }
  return element;
}

const startButton = requireElement<HTMLButtonElement>('#start-shift');
const labButton = requireElement<HTMLButtonElement>('#interaction-lab-launch');
const shopButton = requireElement<HTMLButtonElement>('#shoplifting-loop-launch');
const benchButton = requireElement<HTMLButtonElement>('#void-warranty-launch');
const labSection = requireElement<HTMLElement>('#interaction-lab');
const runHud = requireElement<HTMLElement>('#run-hud');
const wingHud = requireElement<HTMLElement>('#wing-hud');
const benchHud = requireElement<HTMLElement>('#bench-hud');
const startScreen = requireElement<HTMLElement>('#start-screen');
const runShell = requireElement<HTMLElement>('#run-shell');
const startupStatus = requireElement<HTMLElement>('#startup-status');

let game: Phaser.Game | undefined;

function launch(mode: RunMode): void {
  if (game) {
    return;
  }
  startButton.disabled = true;
  labButton.disabled = true;
  shopButton.disabled = true;
  benchButton.disabled = true;
  startupStatus.textContent = 'Clocking in…';
  startScreen.hidden = true;
  runShell.hidden = false;
  runShell.dataset.mode = mode;
  document.body.dataset.mode = mode;
  labSection.hidden = mode !== 'lab';
  runHud.hidden = mode === 'shop' || mode === 'bench';
  wingHud.hidden = mode !== 'shop';
  benchHud.hidden = mode !== 'bench';

  try {
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-host',
      width: 960,
      height: 480,
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
    runShell.hidden = true;
    runShell.dataset.mode = '';
    document.body.dataset.mode = '';
    labSection.hidden = true;
    wingHud.hidden = true;
    benchHud.hidden = true;
    runHud.hidden = false;
    startupStatus.textContent = `Initialization failed: ${message}`;
    startButton.disabled = false;
    labButton.disabled = false;
    shopButton.disabled = false;
    benchButton.disabled = false;
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
  runHud.hidden = false;
  startupStatus.textContent = '';
  startButton.disabled = false;
  labButton.disabled = false;
  shopButton.disabled = false;
  benchButton.disabled = false;
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

window.addEventListener(RETURN_TO_TITLE_EVENT, returnToTitle);
