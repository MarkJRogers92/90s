import Phaser from 'phaser';
import { installDebugBridge, installWorldToCanvas, type DebugMode } from '../../debug/DebugBridge';
import { createRun } from '../../sim/createRun';
import { tickRun } from '../../sim/tickRun';
import type { RunState } from '../../sim/model';
import { InputAdapter } from '../input/InputAdapter';
import { Hud } from '../ui/Hud';
import { InteractionLab, defaultLabSelection, type LabLoadoutSelection } from '../ui/InteractionLab';
import { EntityView } from '../view/EntityView';
import { boundCameraToPlayfield, centreCameraOn, worldToCanvas } from '../view/projection';

const STEP_MS = 1000 / 60;
const MAX_STEPS = 5;

/** One fixed seed keeps every lab selection deterministic. */
const LAB_SEED = 1997;

export class RunScene extends Phaser.Scene {
  public static readonly KEY = 'RunScene';

  private run: RunState = createRun(1997);
  private generation = 1;
  private accumulator = 0;
  private mode: DebugMode = 'shift';
  private labSelection: LabLoadoutSelection = defaultLabSelection();
  private inputAdapter: InputAdapter | undefined;
  private entityView: EntityView | undefined;
  private hud: Hud | undefined;
  private interactionLab: InteractionLab | undefined;
  private removeDebugBridge: (() => void) | undefined;

  public constructor() {
    super(RunScene.KEY);
  }

  public create(): void {
    this.generation = 1;
    this.mode = document.body.dataset.mode === 'lab' ? 'lab' : 'shift';
    if (this.mode === 'lab') {
      this.labSelection = defaultLabSelection();
    }
    this.run = this.createInitialRun();
    this.accumulator = 0;
    this.inputAdapter = new InputAdapter(
      this,
      () => this.setPaused(!this.run.paused),
      () => this.setPaused(true),
    );
    this.entityView = new EntityView(this);
    boundCameraToPlayfield(this);
    this.hud = new Hud(this.restartRun, this.mode);
    if (this.mode === 'lab') {
      this.interactionLab = new InteractionLab(this.applyLabLoadout);
    }

    if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_BRIDGE === 'true') {
      const removeBridge = installDebugBridge(
        () => this.run,
        () => this.generation,
        () => this.mode,
      );
      const removeProjection = installWorldToCanvas((x, y) => worldToCanvas(this, x, y));
      this.removeDebugBridge = () => {
        removeProjection();
        removeBridge();
      };
    }

    this.syncView();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyRun, this);
  }

  public update(_time: number, elapsedMs: number): void {
    if (!this.inputAdapter || this.run.paused || this.run.status !== 'playing') {
      this.accumulator = 0;
      this.syncView();
      return;
    }

    this.accumulator += Math.min(Math.max(elapsedMs, 0), STEP_MS * MAX_STEPS);
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < MAX_STEPS) {
      tickRun(this.run, this.inputAdapter.readFrame());
      this.accumulator -= STEP_MS;
      steps += 1;
    }
    if (steps === MAX_STEPS) {
      this.accumulator = 0;
    }
    this.syncView();
  }

  private setPaused(paused: boolean): void {
    this.run.paused = paused;
    this.accumulator = 0;
    this.inputAdapter?.clearHeld();
    this.syncView();
  }

  private createInitialRun(): RunState {
    const run =
      this.mode === 'lab'
        ? createRun(LAB_SEED, {
            itemIds: this.labSelection.itemIds,
            selectedItemId: this.labSelection.selectedPrimaryId,
          })
        : createRun(1997);
    return this.applyDevFixture(run);
  }

  /**
   * Debug-only positioning, so a test can rely on where things are.
   *
   * Applied in lab mode as well as shift mode. The lab path used to return
   * before this ran, which was invisible while the whole 960x480 room was on
   * screen; now that the camera follows the player into a 640x360 window, a
   * fixture is the only way to guarantee a target is inside the view. A target
   * off-screen is an ordinary consequence of having a camera, not a defect.
   */
  private applyDevFixture(run: RunState): RunState {
    if (!(import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_BRIDGE === 'true')) {
      return run;
    }

    const fixture = new URLSearchParams(window.location.search).get('fixture');
    if (fixture === 'pointer-proof') {
      const hanger = run.enemies.find((enemy) => enemy.kind === 'hanger');
      const spitter = run.enemies.find((enemy) => enemy.kind === 'spitter');
      if (hanger) {
        hanger.x = 800;
        hanger.y = 400;
      }
      if (spitter) {
        spitter.x = 300;
        spitter.y = 240;
        spitter.phase = 'recover';
        spitter.phaseTicks = 600;
      }
    } else if (fixture === 'restart-proof') {
      run.player.x = 300;
      const hanger = run.enemies.find((enemy) => enemy.kind === 'hanger');
      const spitter = run.enemies.find((enemy) => enemy.kind === 'spitter');
      if (hanger) {
        hanger.x = 370;
        hanger.y = 240;
        hanger.health = 4;
      }
      if (spitter) {
        spitter.x = 230;
        spitter.y = 240;
        spitter.health = 4;
        spitter.phase = 'recover';
        spitter.phaseTicks = 600;
      }
    } else if (fixture === 'death-proof' && this.generation === 1) {
      run.player.health = 0;
    }
    return run;
  }

  /**
   * Applies a lab loadout selection: one fresh deterministic run through the
   * existing `createRun` options, with input, accumulator and transient state
   * reset, and the controls re-rendered from the new authoritative state.
   */
  private readonly applyLabLoadout = (
    itemIds: readonly string[],
    selectedPrimaryId: string,
  ): void => {
    if (this.mode !== 'lab') {
      return;
    }
    this.labSelection = { itemIds: [...itemIds], selectedPrimaryId };
    this.generation += 1;
    this.run = this.createInitialRun();
    this.accumulator = 0;
    this.inputAdapter?.clearHeld();
    this.syncView();
  };

  private readonly restartRun = (): void => {
    this.generation += 1;
    this.run = this.createInitialRun();
    this.accumulator = 0;
    this.inputAdapter?.clearHeld();
    this.syncView();
  };

  private syncView(): void {
    this.entityView?.sync(this.run);
    this.hud?.sync(this.run);
    this.interactionLab?.sync(this.run);
    // The camera follows the authoritative player position. The view never
    // decides where the player is; it reads the same state everything else does.
    centreCameraOn(this, this.run.player.x, this.run.player.y);
  }

  private readonly destroyRun = (): void => {
    this.inputAdapter?.destroy();
    this.inputAdapter = undefined;
    this.entityView?.destroy();
    this.entityView = undefined;
    this.hud?.destroy();
    this.hud = undefined;
    this.interactionLab?.destroy();
    this.interactionLab = undefined;
    this.removeDebugBridge?.();
    this.removeDebugBridge = undefined;
    this.accumulator = 0;
  };
}
