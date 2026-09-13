import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { RunScene } from './game/scenes/RunScene';
import './styles.css';

type RunMode = 'shift' | 'lab';

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`DEAD MALL startup markup is incomplete: missing ${selector}.`);
  }
  return element;
}

const startButton = requireElement<HTMLButtonElement>('#start-shift');
const labButton = requireElement<HTMLButtonElement>('#interaction-lab-launch');
const labSection = requireElement<HTMLElement>('#interaction-lab');
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
  startupStatus.textContent = 'Clocking in…';
  startScreen.hidden = true;
  runShell.hidden = false;
  runShell.dataset.mode = mode;
  document.body.dataset.mode = mode;
  labSection.hidden = mode !== 'lab';

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
      scene: [BootScene, RunScene],
    });

    startupStatus.textContent = '';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    startScreen.hidden = false;
    runShell.hidden = true;
    runShell.dataset.mode = '';
    document.body.dataset.mode = '';
    labSection.hidden = true;
    startupStatus.textContent = `Initialization failed: ${message}`;
    startButton.disabled = false;
    labButton.disabled = false;
    game?.destroy(true);
    game = undefined;
  }
}

startButton.addEventListener('click', () => {
  launch('shift');
});

labButton.addEventListener('click', () => {
  launch('lab');
});
