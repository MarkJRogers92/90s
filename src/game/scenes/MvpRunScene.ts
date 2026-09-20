/**
 * Phaser presentation for the M5 MVP run (Night Shift).
 *
 * The scene owns input cadence and drawing only. It creates the run fresh
 * from a seed or restored from a validated checkpoint, advances the
 * authoritative simulation on a fixed step with `tickMvpRun`, renders the
 * current room through `MvpRunView`, publishes HUD state every tick, and
 * mirrors room-boundary checkpoints through the provided store. Damage,
 * movement, economy, and state transitions stay in `src/sim`.
 */
import Phaser from 'phaser';
import { installMvpRunDebugBridge } from '../../debug/DebugBridge';
import {
  InMemoryCheckpointStore,
  type CheckpointStore,
} from '../persistence/CheckpointStore';
import {
  restoreMvpRun,
  type MvpCheckpoint,
} from '../../sim/run/checkpoint';
import {
  cancelRunFusionPreview,
  confirmRunFusionPreview,
} from '../../sim/run/bench';
import { syncRunCarrier } from '../../sim/run/carrier';
import { createMvpRun } from '../../sim/run/createMvpRun';
import { refreshRunLoadout } from '../../sim/run/loadout';
import type { InventoryLeaf } from '../../sim/fusion/types';
import {
  clearMvpHeldActions,
  enterDoorway,
  tickMvpRun,
} from '../../sim/run/tickMvpRun';
import type { MvpInputFrame, MvpRunState } from '../../sim/run/types';
import {
  ALEX_FRAME_HEIGHT,
  ALEX_FRAME_WIDTH,
  ALEX_IDLE_TEXTURE,
  ALEX_IDLE_URL,
  ALEX_WALK_TEXTURE,
  ALEX_WALK_URL,
  BENCH_WARRANT_KIOSK_TEXTURE,
  BENCH_WARRANT_KIOSK_URL,
  FIXTURE_ART,
  RC_CAR_FRAME_SIZE,
  RC_CAR_TEXTURE,
  RC_CAR_URL,
} from '../assets';
import { GameAudioEngine } from '../audio/engine';
import { MvpRunHud } from '../ui/MvpRunHud';
import { MvpRunView } from '../view/MvpRunView';

const STEP_MS = 1000 / 60;
const MAX_STEPS = 5;
const RETURN_TO_TITLE_EVENT = 'dead-mall:return-to-title';

export type MvpRunLaunch = {
  readonly seed: number;
  readonly checkpoint: MvpCheckpoint | null;
  readonly store: CheckpointStore;
};

let pendingLaunch: MvpRunLaunch | null = null;

export function setMvpRunLaunch(launch: MvpRunLaunch): void {
  pendingLaunch = launch;
}

export function takeMvpRunLaunch(): MvpRunLaunch | null {
  const launch = pendingLaunch;
  pendingLaunch = null;
  return launch;
}

class MvpRunInputAdapter {
  private readonly scene: Phaser.Scene;
  private readonly keys: {
    up: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    interact: Phaser.Input.Keyboard.Key;
    steal: Phaser.Input.Keyboard.Key;
    recall: Phaser.Input.Keyboard.Key;
  };
  private readonly onEscape: () => void;
  private readonly onBlurPause: () => void;
  private readonly onToggleMute: () => void;
  private pointerHeld = false;
  private pendingInteract = false;
  private pendingSteal = false;
  private pendingRecall = false;

  private readonly handlePointerDown = (): void => {
    this.pointerHeld = true;
  };

  private readonly handlePointerUp = (): void => {
    this.pointerHeld = false;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }
    if (event.code === 'KeyE') {
      this.pendingInteract = true;
    } else if (event.code === 'KeyF') {
      this.pendingSteal = true;
    } else if (event.code === 'KeyR') {
      this.pendingRecall = true;
    } else if (event.code === 'KeyM') {
      this.onToggleMute();
    } else if (event.code === 'Escape') {
      event.preventDefault();
      this.clearHeld();
      this.onEscape();
    }
  };

  private readonly handleBlur = (): void => {
    this.clearHeld();
    this.onBlurPause();
  };

  public constructor(
    scene: Phaser.Scene,
    onEscape: () => void,
    onBlurPause: () => void,
    onToggleMute: () => void,
  ) {
    this.scene = scene;
    this.onEscape = onEscape;
    this.onBlurPause = onBlurPause;
    this.onToggleMute = onToggleMute;

    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }
    this.keys = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      interact: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      steal: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F),
      recall: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R),
    };

    scene.input.on('pointerdown', this.handlePointerDown);
    scene.input.on('pointerup', this.handlePointerUp);
    scene.input.on('pointerupoutside', this.handlePointerUp);
    scene.input.on('gameout', this.handlePointerUp);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('blur', this.handleBlur);
  }

  public readFrame(): MvpInputFrame {
    const pointer = this.scene.input.activePointer;
    const worldPosition = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
    const frame: MvpInputFrame = {
      moveX: Number(this.keys.right.isDown) - Number(this.keys.left.isDown),
      moveY: Number(this.keys.down.isDown) - Number(this.keys.up.isDown),
      aimX: worldPosition.x,
      aimY: worldPosition.y,
      fire: this.pointerHeld,
      interact: this.keys.interact.isDown || this.pendingInteract,
      steal: this.keys.steal.isDown || this.pendingSteal,
      recall: this.keys.recall.isDown || this.pendingRecall,
    };
    this.pendingInteract = false;
    this.pendingSteal = false;
    this.pendingRecall = false;
    return frame;
  }

  public clearHeld(): void {
    this.pointerHeld = false;
    this.keys.up.reset();
    this.keys.left.reset();
    this.keys.down.reset();
    this.keys.right.reset();
    this.keys.interact.reset();
    this.keys.steal.reset();
    this.keys.recall.reset();
    this.pendingInteract = false;
    this.pendingSteal = false;
    this.pendingRecall = false;
  }

  public destroy(): void {
    this.scene.input.off('pointerdown', this.handlePointerDown);
    this.scene.input.off('pointerup', this.handlePointerUp);
    this.scene.input.off('pointerupoutside', this.handlePointerUp);
    this.scene.input.off('gameout', this.handlePointerUp);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('blur', this.handleBlur);
    this.clearHeld();
  }
}

export class MvpRunScene extends Phaser.Scene {
  public static readonly KEY = 'MvpRunScene';

  private run: MvpRunState = createMvpRun(0);
  private seed = 0;
  private store: CheckpointStore = new InMemoryCheckpointStore();
  private generation = 1;
  private accumulator = 0;
  private lastRoomIndex = 0;
  private lastCheckpointKey: string | null = null;
  private checkpointStatus = 'none yet';
  private inputAdapter: MvpRunInputAdapter | undefined;
  private runView: MvpRunView | undefined;
  private hud: MvpRunHud | undefined;
  private audio: GameAudioEngine | undefined;
  private removeDebugBridge: (() => void) | undefined;

  public constructor() {
    super(MvpRunScene.KEY);
  }

  public preload(): void {
    this.load.image(BENCH_WARRANT_KIOSK_TEXTURE, BENCH_WARRANT_KIOSK_URL);
    // Alex is loaded as two sheets rather than 56 separate images: one row per
    // facing in the walk sheet, one frame per facing in the idle sheet.
    this.load.spritesheet(ALEX_IDLE_TEXTURE, ALEX_IDLE_URL, {
      frameWidth: ALEX_FRAME_WIDTH,
      frameHeight: ALEX_FRAME_HEIGHT,
    });
    this.load.spritesheet(ALEX_WALK_TEXTURE, ALEX_WALK_URL, {
      frameWidth: ALEX_FRAME_WIDTH,
      frameHeight: ALEX_FRAME_HEIGHT,
    });
    // One row of eight facings; the car has no heading in the sim, so the view
    // picks a frame from its movement delta.
    this.load.spritesheet(RC_CAR_TEXTURE, RC_CAR_URL, {
      frameWidth: RC_CAR_FRAME_SIZE,
      frameHeight: RC_CAR_FRAME_SIZE,
    });
    for (const art of Object.values(FIXTURE_ART)) {
      this.load.image(art.texture, art.url);
    }
  }

  public create(): void {
    const launch = takeMvpRunLaunch();
    this.store = launch?.store ?? new InMemoryCheckpointStore();
    this.seed = launch?.checkpoint ? launch.checkpoint.seed : (launch?.seed ?? 0);
    this.run =
      launch?.checkpoint !== null && launch?.checkpoint !== undefined
        ? restoreMvpRun(launch.checkpoint)
        : createMvpRun(this.seed);
    this.run = this.applyDevFixture(this.run);
    this.generation = 1;
    this.accumulator = 0;
    this.lastRoomIndex = this.run.roomIndex;
    this.lastCheckpointKey = null;
    this.checkpointStatus = 'none yet';
    this.audio = new GameAudioEngine();
    this.inputAdapter = new MvpRunInputAdapter(
      this,
      () => this.setPaused(!this.run.paused),
      () => this.setPaused(true),
      // The M key routes through the HUD, not straight to the engine, so the
      // button label follows a keyboard toggle exactly as it follows a click.
      () => this.hud?.toggleMute(),
    );
    // Web Audio may only start from a real user gesture, so the first pointer or
    // key press anywhere unlocks it; until then the engine is silent, not broken.
    window.addEventListener('pointerdown', this.unlockAudio);
    window.addEventListener('keydown', this.unlockAudio);
    this.runView = new MvpRunView(this);
    this.hud = new MvpRunHud(
      () => this.restartRun(),
      () => this.returnToTitle(),
      () => this.confirmFusion(),
      () => this.cancelFusion(),
      () => this.toggleMuted(),
    );

    if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_BRIDGE === 'true') {
      this.removeDebugBridge = installMvpRunDebugBridge(
        () => this.run,
        () => this.generation,
        () => this.audio,
      );
    }

    this.syncCheckpoint();
    this.syncView();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyRun, this);
  }

  public update(_time: number, elapsedMs: number): void {
    if (!this.inputAdapter || this.run.paused || this.run.status !== 'playing') {
      this.accumulator = 0;
      this.syncCheckpoint();
      this.syncView();
      return;
    }

    const roomBefore = this.run.roomIndex;
    this.accumulator += Math.min(Math.max(elapsedMs, 0), STEP_MS * MAX_STEPS);
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < MAX_STEPS) {
      const frame = this.inputAdapter.readFrame();
      tickMvpRun(this.run, frame);
      this.accumulator -= STEP_MS;
      steps += 1;
      if (this.run.roomIndex !== roomBefore || this.run.status !== 'playing') {
        this.inputAdapter.clearHeld();
        clearMvpHeldActions(this.run);
        break;
      }
    }
    if (steps === MAX_STEPS) {
      this.accumulator = 0;
    }
    if (this.run.roomIndex !== this.lastRoomIndex) {
      this.lastRoomIndex = this.run.roomIndex;
      this.inputAdapter.clearHeld();
      clearMvpHeldActions(this.run);
    }
    this.syncCheckpoint();
    this.syncView();
  }

  private setPaused(paused: boolean): void {
    if (this.run.status !== 'playing') {
      return;
    }
    this.run.paused = paused;
    this.accumulator = 0;
    this.inputAdapter?.clearHeld();
    clearMvpHeldActions(this.run);
    this.syncView();
  }

  /**
   * Confirms the open Bench Warrant preview.
   *
   * The commit revalidates against the proposal's own revision, so a preview
   * that went stale behind a purchase is refused rather than fused. Either way
   * the run is left unpaused and the held actions are cleared, so a click that
   * also moved the pointer cannot leak into the next tick.
   */
  private confirmFusion(): void {
    const result = confirmRunFusionPreview(this.run);
    if (result.accepted) {
      this.resumeAfterPreview();
    }
    this.syncView();
  }

  private cancelFusion(): void {
    const result = cancelRunFusionPreview(this.run);
    if (result.accepted) {
      this.resumeAfterPreview();
    }
    this.syncView();
  }

  private resumeAfterPreview(): void {
    this.accumulator = 0;
    this.inputAdapter?.clearHeld();
    clearMvpHeldActions(this.run);
  }

  private restartRun(): void {
    this.generation += 1;
    const cleared = this.store.clear();
    this.run = createMvpRun(this.seed);
    // A fresh run has no previous tick to compare against, so the next sync
    // would read every field as a change and fire a burst of cues.
    this.audio?.resetBaseline();
    this.accumulator = 0;
    this.lastRoomIndex = this.run.roomIndex;
    this.lastCheckpointKey = null;
    this.checkpointStatus = cleared.ok
      ? 'none yet'
      : `clear unavailable: ${cleared.reason}`;
    this.inputAdapter?.clearHeld();
    this.syncCheckpoint();
    this.syncView();
  }

  private readonly returnToTitle = (): void => {
    window.dispatchEvent(new CustomEvent(RETURN_TO_TITLE_EVENT));
  };

  private syncCheckpoint(): void {
    const key = JSON.stringify(this.run.checkpoint);
    if (key === this.lastCheckpointKey) {
      return;
    }
    this.lastCheckpointKey = key;
    if (this.run.checkpoint === null) {
      // A win clears the checkpoint, so a refused clear has to stay visible
      // instead of claiming the stored checkpoint is gone.
      const cleared = this.store.clear();
      this.checkpointStatus = cleared.ok
        ? 'cleared — night shift survived'
        : `clear unavailable: ${cleared.reason}`;
      return;
    }
    const result = this.store.write(this.run);
    if (result.ok) {
      this.checkpointStatus =
        `saved · room ${this.run.checkpoint.roomIndex + 1} of ${this.run.wing.rooms.length} · tick ${this.run.checkpoint.tick}`;
    } else {
      this.checkpointStatus = `save unavailable: ${result.reason}`;
    }
  }

  private readonly unlockAudio = (): void => {
    this.audio?.resume();
  };

  /** Toggles mute and returns the new state, so the HUD can label its button. */
  private toggleMuted(): boolean {
    return this.audio?.toggleMuted() ?? false;
  }

  private syncView(): void {
    this.runView?.sync(this.run);
    this.hud?.sync(this.run, this.checkpointStatus);
    // Derived from authoritative state each frame, so the sound layer can never
    // disagree with what the simulation actually did.
    this.audio?.syncTo(this.run);
  }

  private applyDevFixture(state: MvpRunState): MvpRunState {
    if (!(import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_BRIDGE === 'true')) {
      return state;
    }
    const fixture = new URLSearchParams(window.location.search).get('fixture');
    if (fixture === 'mvp-storefront') {
      if (enterDoorway(state, 'east').accepted) {
        const offer = state.wing.rooms[state.roomIndex]?.offers.find(
          (candidate) => (state.offerStatus[candidate.id] ?? 'available') === 'available',
        );
        if (offer) {
          state.room.combat.player.x = offer.position.x + 12;
          state.room.combat.player.y = offer.position.y;
        }
      }
      return state;
    }
    if (fixture === 'mvp-bench') {
      // Stands the shift at the service-corridor Bench Warrant kiosk already
      // owning the car and a projectile primary, so browser acceptance can
      // press E, read the real proposal, confirm it, and then fire from the
      // car with honest input instead of replaying a whole store purchase.
      const devLeaf = (instanceId: string, itemDefinitionId: string): InventoryLeaf => ({
        kind: 'leaf',
        instanceId,
        itemDefinitionId,
        acquisitionKind: 'purchased',
        sourceLocationId: 'dev-fixture',
        sourceStockId: `dev-${itemDefinitionId}-offer`,
        acquisitionTick: state.tick,
      });
      state.inventory = {
        ...state.inventory,
        inventory: [
          ...state.inventory.inventory,
          devLeaf('dev-rc_car', 'rc_car'),
          devLeaf('dev-party_popper', 'party_popper'),
        ],
        selectedPrimaryInstanceId: 'dev-party_popper',
        revision: state.inventory.revision + 1,
      };
      refreshRunLoadout(state);
      syncRunCarrier(state);
      const kiosk = state.wing.rooms[state.roomIndex]?.benchKiosk;
      if (kiosk) {
        state.room.combat.player.x = kiosk.x;
        state.room.combat.player.y = kiosk.y;
      }
      return state;
    }
    if (fixture === 'mvp-boss-entry') {
      let guard = 0;
      while (state.wing.rooms[state.roomIndex]?.id !== 'security_office' && guard < 10) {
        guard += 1;
        state.room.combat.enemies = [];
        tickMvpRun(state, {
          moveX: 0,
          moveY: 0,
          aimX: state.room.combat.player.x,
          aimY: state.room.combat.player.y,
          fire: false,
          interact: false,
          steal: false,
          recall: false,
        });
        if (!enterDoorway(state, 'east').accepted) {
          break;
        }
      }
      return state;
    }
    if (fixture === 'mvp-boss-win') {
      let guard = 0;
      while (state.wing.rooms[state.roomIndex]?.id !== 'security_office' && guard < 10) {
        guard += 1;
        state.room.combat.enemies = [];
        tickMvpRun(state, {
          moveX: 0,
          moveY: 0,
          aimX: state.room.combat.player.x,
          aimY: state.room.combat.player.y,
          fire: false,
          interact: false,
          steal: false,
          recall: false,
        });
        if (!enterDoorway(state, 'east').accepted) {
          break;
        }
      }
      // Leave the run one real attack from winning: the boss stands at a
      // single point of health inside the security office and the player is
      // one mop swing away, so browser acceptance can prove the terminal
      // summary and the checkpoint clearing with honest input.
      if (state.wing.rooms[state.roomIndex]?.id === 'security_office') {
        const boss = state.room.combat.enemies.find((enemy) => enemy.kind === 'lp_manager');
        if (boss) {
          boss.health = 1;
          state.room.combat.player.x = boss.x - 80;
          state.room.combat.player.y = boss.y;
        }
      }
      return state;
    }
    return state;
  }

  private readonly destroyRun = (): void => {
    this.inputAdapter?.destroy();
    this.inputAdapter = undefined;
    this.runView?.destroy();
    this.runView = undefined;
    this.hud?.destroy();
    this.hud = undefined;
    window.removeEventListener('pointerdown', this.unlockAudio);
    window.removeEventListener('keydown', this.unlockAudio);
    this.audio?.destroy();
    this.audio = undefined;
    this.removeDebugBridge?.();
    this.removeDebugBridge = undefined;
    this.accumulator = 0;
  };
}
