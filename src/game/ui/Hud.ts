import type { RunState } from '../../sim/model';

export class Hud {
  private readonly healthValue: HTMLElement;
  private readonly healthFill: HTMLElement;
  private readonly runStatus: HTMLElement;

  public constructor() {
    const healthValue = document.querySelector<HTMLElement>('#health-value');
    const healthFill = document.querySelector<HTMLElement>('#health-fill');
    const runStatus = document.querySelector<HTMLElement>('#run-status');
    if (!healthValue || !healthFill || !runStatus) {
      throw new Error('Run HUD markup is incomplete.');
    }
    this.healthValue = healthValue;
    this.healthFill = healthFill;
    this.runStatus = runStatus;
  }

  public sync(state: RunState): void {
    const health = Math.max(0, state.player.health);
    this.healthValue.textContent = `${health} / 6`;
    this.healthFill.style.width = `${(health / 6) * 100}%`;
    this.runStatus.textContent = state.paused ? 'SHIFT PAUSED — PRESS ESC TO RESUME' : 'SHIFT ACTIVE';
  }
}
