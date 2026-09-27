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
import { HIT_STOP_MS } from '../view/combatBeats';
import { ShiftCard, type ShiftCardAction } from '../ui/ShiftCard';
import { installMvpRunDebugBridge, installWorldToCanvas } from '../../debug/DebugBridge';
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
import { GameAudioEngine } from '../audio/engine';
import { CHARACTER_ASSETS, NEON_ASSETS, PRESENTATION_ASSETS } from '../presentation/assets';
import { installAdaptiveBloom } from '../presentation/lighting/LightingLayer';
import { ensureFxTextures } from '../presentation/neon/proceduralTextures';
import { STAGE_HEIGHT, STAGE_TOP, STAGE_WIDTH, dressingTextureFiles } from '../presentation/rooms/roomDressing';
import { GameHud } from '../ui/GameHud';
import { MvpRunHud } from '../ui/MvpRunHud';
import { MvpRunView } from '../view/MvpRunView';
import {
  centreCameraOn,
  pointerToWorld,
  worldToCanvas,
} from '../view/projection';

const STEP_MS = 1000 / 60;
const MAX_STEPS = 5;
const RETURN_TO_TITLE_EVENT = 'dead-mall:return-to-title';
const RUN_ASSETS = [
  ...PRESENTATION_ASSETS.map((asset) => ({ key: asset.key, url: asset.url })),
  ...NEON_ASSETS.map((asset) => ({ key: asset.key, url: asset.url })),
  ...CHARACTER_ASSETS.map((asset) => ({ key: asset.key, url: asset.url })),
  ...dressingTextureFiles(),
];
const PRESENTATION_ASSET_KEYS = new Set(PRESENTATION_ASSETS.map((asset) => asset.key));

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
  private pendingSlot = 0;
  private pendingCycle = 0;
  private pendingDash = false;
  /** Returns a weapon slot when a click lands on the HUD hotbar, else null. */
  public hudSlotAt: ((x: number, y: number) => number | null) | null = null;
  /** The end-of-shift card, when it is open: its buttons and key actions. */
  public endCard: {
    readonly isOpen: () => boolean;
    readonly buttonAt: (x: number, y: number) => ShiftCardAction | null;
    readonly act: (action: ShiftCardAction) => void;
  } | null = null;

  private readonly handlePointerDown = (pointer: Phaser.Input.Pointer): void => {
    const endAction = this.endCard?.buttonAt(pointer.x, pointer.y) ?? null;
    if (endAction !== null) {
      this.endCard?.act(endAction);
      return;
    }
    // A click on the hotbar equips that weapon instead of swinging it.
    const slot = this.hudSlotAt?.(pointer.x, pointer.y) ?? null;
    if (slot !== null) {
      this.pendingSlot = slot;
      return;
    }
    this.pointerHeld = true;
  };

  private readonly handleWheel = (_pointer: unknown, _objects: unknown, _dx: number, dy: number): void => {
    if (dy !== 0) this.pendingCycle = dy > 0 ? 1 : -1;
  };

  private readonly handlePointerUp = (): void => {
    this.pointerHeld = false;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }
    if (this.endCard?.isOpen()) {
      if (event.code === 'KeyR' || event.code === 'Enter') this.endCard.act('retry');
      else if (event.code === 'KeyT') this.endCard.act('title');
      if (event.code !== 'KeyM') return;
    }
    if (event.code === 'KeyE') {
      this.pendingInteract = true;
    } else if (event.code === 'KeyF') {
      this.pendingSteal = true;
    } else if (event.code === 'KeyR') {
      this.pendingRecall = true;
    } else if (/^Digit[1-9]$/.test(event.code)) {
      this.pendingSlot = Number(event.code.slice(5));
    } else if (event.code === 'KeyQ') {
      this.pendingCycle = event.shiftKey ? -1 : 1;
    } else if (event.code === 'Space') {
      // Space must never also scroll the page or press a focused DOM button.
      event.preventDefault();
      this.pendingDash = true;
    } else if (event.code === 'KeyM') {
      this.onToggleMute();
    } else if (event.code === 'Escape') {
      event.preventDefault();
      this.clearHeld();
      this.onEscape();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') event.preventDefault();
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
    scene.input.on('wheel', this.handleWheel);
    scene.input.on('pointerup', this.handlePointerUp);
    scene.input.on('pointerupoutside', this.handlePointerUp);
    scene.input.on('gameout', this.handlePointerUp);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  public readFrame(): MvpInputFrame {
    const pointer = this.scene.input.activePointer;
    const worldPosition = pointerToWorld(this.scene, pointer);
    const frame: MvpInputFrame = {
      moveX: Number(this.keys.right.isDown) - Number(this.keys.left.isDown),
      moveY: Number(this.keys.down.isDown) - Number(this.keys.up.isDown),
      aimX: worldPosition.x,
      aimY: worldPosition.y,
      fire: this.pointerHeld,
      interact: this.keys.interact.isDown || this.pendingInteract,
      steal: this.keys.steal.isDown || this.pendingSteal,
      recall: this.keys.recall.isDown || this.pendingRecall,
      selectSlot: this.pendingSlot,
      cycleWeapon: this.pendingCycle,
      dash: this.pendingDash,
    };
    this.pendingDash = false;
    this.pendingSlot = 0;
    this.pendingCycle = 0;
    this.pendingInteract = false;
    this.pendingSteal = false;
    this.pendingRecall = false;
    return frame;
  }

  public clearHeld(): void {
    this.pointerHeld = false;
    this.pendingDash = false;
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
    this.pendingSlot = 0;
    this.pendingCycle = 0;
  }

  public destroy(): void {
    this.scene.input.off('pointerdown', this.handlePointerDown);
    this.scene.input.off('wheel', this.handleWheel);
    this.scene.input.off('pointerup', this.handlePointerUp);
    this.scene.input.off('pointerupoutside', this.handlePointerUp);
    this.scene.input.off('gameout', this.handlePointerUp);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
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
  private hitStopMs = 0;
  private lastRoomIndex = 0;
  private lastCheckpointKey: string | null = null;
  private checkpointStatus = 'none yet';
  private inputAdapter: MvpRunInputAdapter | undefined;
  private runView: MvpRunView | undefined;
  private hud: MvpRunHud | undefined;
  private gameHud: GameHud | undefined;
  private shiftCard: ShiftCard | undefined;
  private removeBloom: (() => void) | undefined;
  private audio: GameAudioEngine | undefined;
  private removeDebugBridge: (() => void) | undefined;
  private presentationLoadFailures = 0;

  public constructor() {
    super(MvpRunScene.KEY);
  }

  public preload(): void {
    this.presentationLoadFailures = 0;
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.countPresentationLoadFailure, this);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.countPresentationLoadFailure, this);
    });
    for (const asset of RUN_ASSETS) {
      this.load.image(asset.key, asset.url);
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
    ensureFxTextures(this);
    this.runView = new MvpRunView(this);
    // The whole room is always on screen, like an Isaac room: the camera is
    // fixed on the stage (playfield plus the storefront band above it).
    this.cameras.main.setBounds(0, STAGE_TOP, STAGE_WIDTH, STAGE_HEIGHT);
    this.cameras.main.setBackgroundColor('#07050c');
    this.removeBloom = installAdaptiveBloom(this);
    this.gameHud = new GameHud(this);
    const hud = this.gameHud;
    this.inputAdapter.hudSlotAt = (x, y) => hud.weaponSlotAt(x, y);
    const card = new ShiftCard(this);
    this.shiftCard = card;
    this.inputAdapter.endCard = {
      isOpen: () => card.open,
      buttonAt: (x, y) => card.buttonAt(x, y),
      act: (action) => (action === 'retry' ? this.restartRun() : this.returnToTitle()),
    };
    this.hud = new MvpRunHud(
      () => this.restartRun(),
      () => this.returnToTitle(),
      () => this.confirmFusion(),
      () => this.cancelFusion(),
      () => this.toggleMuted(),
    );

    if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_BRIDGE === 'true') {
      const removeBridge = installMvpRunDebugBridge(
        () => this.run,
        () => this.generation,
        () => this.audio,
        () => this.presentationLoadFailures,
        () => this.runView?.presentationSnapshot() ?? null,
        () => this.runView?.actorPresentationSnapshot() ?? null,
        () => this.runView?.concourseAmbienceSnapshot() ?? null,
      );
      const removeProjection = installWorldToCanvas((x, y) => worldToCanvas(this, x, y));
      this.removeDebugBridge = () => {
        removeProjection();
        removeBridge();
      };
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

    // Hit stop: after a big hit lands the fixed-step clock holds for a few
    // frames, exactly like a very short pause. Held input stays held, queued
    // presses wait, and no simulation rule changes.
    if (this.hitStopMs > 0) {
      this.hitStopMs -= Math.max(elapsedMs, 0);
      this.accumulator = 0;
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
    this.hitStopMs = 0;
    this.lastRoomIndex = this.run.roomIndex;
    this.lastCheckpointKey = null;
    this.checkpointStatus = cleared.ok
      ? 'none yet'
      : `clear unavailable: ${cleared.reason}`;
    this.inputAdapter?.clearHeld();
    this.runView?.resetForRun();
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

  private readonly countPresentationLoadFailure = (file: Phaser.Loader.File): void => {
    if (file.type === 'image' && PRESENTATION_ASSET_KEYS.has(file.key)) {
      this.presentationLoadFailures += 1;
    }
  };

  /** Toggles mute and returns the new state, so the HUD can label its button. */
  private toggleMuted(): boolean {
    return this.audio?.toggleMuted() ?? false;
  }

  private syncView(): void {
    this.runView?.sync(this.run);
    const hold = this.runView?.takeHitStop() ?? 0;
    this.hitStopMs = Math.max(this.hitStopMs, hold);
    // Getting hurt (and the boss kill) ring the ears: the mix muffles while the frame holds.
    if (hold >= HIT_STOP_MS.playerHurt) this.audio?.muffle(hold);
    centreCameraOn(this, this.run.room.combat.player.x, this.run.room.combat.player.y);
    this.hud?.sync(this.run, this.checkpointStatus);
    this.gameHud?.sync(this.run);
    const pointer = this.input.activePointer;
    this.shiftCard?.hover(pointer.x, pointer.y);
    this.shiftCard?.sync(this.run);
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
    this.gameHud?.destroy();
    this.gameHud = undefined;
    this.shiftCard?.destroy();
    this.shiftCard = undefined;
    this.removeBloom?.();
    this.removeBloom = undefined;
    window.removeEventListener('pointerdown', this.unlockAudio);
    window.removeEventListener('keydown', this.unlockAudio);
    this.audio?.destroy();
    this.audio = undefined;
    this.removeDebugBridge?.();
    this.removeDebugBridge = undefined;
    this.accumulator = 0;
  };
}
