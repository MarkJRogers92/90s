import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { RunScene } from './game/scenes/RunScene';
import './styles.css';

const startButton = document.querySelector<HTMLButtonElement>('#start-shift');
const startScreen = document.querySelector<HTMLElement>('#start-screen');
const runShell = document.querySelector<HTMLElement>('#run-shell');
const startupStatus = document.querySelector<HTMLElement>('#startup-status');

if (!startButton || !startScreen || !runShell || !startupStatus) {
  throw new Error('DEAD MALL startup markup is incomplete.');
}

let game: Phaser.Game | undefined;

startButton.addEventListener(
  'click',
  () => {
    startButton.disabled = true;
    startupStatus.textContent = 'Clocking in…';
    startScreen.hidden = true;
    runShell.hidden = false;

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
      startupStatus.textContent = `Initialization failed: ${message}`;
      startButton.disabled = false;
      game?.destroy(true);
      game = undefined;
    }
  },
  { once: true },
);
