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
import { wingEventFor } from '../../sim/run/wingEvents';
import { createHunterHurtRun } from '../playtest/hunterHurtFixture';
import { ITEM_CATALOG } from '../../sim/items/catalog';
import { HERO_FUSIONS } from '../../sim/fusion/heroes';
import { SECRET_MACHINE, enterSecretRoom, secretFor } from '../../sim/run/secretRoom';
import { SHORTCUT_HATCH, shortcutFor } from '../../sim/run/shortcut';
import { dailyRule } from '../run/dailyShift';
import type { NightRuleId } from '../../sim/run/nightRules';
import { propWalls } from '../../sim/combat/props';
import { roomEventFor } from '../../sim/run/roomEvents';
import { isHybridPair } from '../../sim/fusion/hybrid';
import type { HybridComposite } from '../../sim/fusion/types';
import { buildRoomCombatState } from '../../sim/run/rooms';
import { browserCareer, discoverFusion, clockIn, type FusionDiscovery } from '../career/career';
import { playFusionBanner } from '../ui/FusionReveal';
import { sellWorkbenchItem } from '../../sim/run/resale';
import { fusionRevealModel } from '../ui/fusionRevealModel';
import { NO_PERKS, type ShiftPerks } from '../../sim/run/perks';
import Phaser from 'phaser';
import { HIT_STOP_MS } from '../view/combatBeats';
import { gameSettings, hitStopScale, type GameSettings } from '../settings/settings';
import { crtLook, installCrt } from '../presentation/crtFilter';
import { ShiftCard, type ShiftCardAction } from '../ui/ShiftCard';
import { buildShiftCardModel, shareCardText } from '../ui/shiftCardModel';
import { nextShiftSeed } from '../run/shiftSeed';
import { EscalatorRide, type RideFloor } from '../ui/EscalatorRide';
import { KillCam } from '../ui/KillCam';
import { BossIntro } from '../ui/BossIntro';
import { INTERIOR_EXIT, enterStore, roomStores } from '../../sim/run/storeInterior';
import { DawnEnding } from '../ui/DawnEnding';
import { ClockIn } from '../ui/ClockIn';
import { PinkSlip } from '../ui/PinkSlip';
import { pinkSlipReason } from '../ui/pinkSlipModel';
import { PaDirector } from '../ui/paModel';
import { PaTicker } from '../ui/PaTicker';
import { shouldClockIn, type ClockInReason } from '../ui/clockInModel';
import { slowMoMs } from '../ui/killCamModel';
import { PauseCard } from '../ui/PauseCard';
import { ascend, canAscend, climbToBossWing, floorOf, nextIsBossWing } from '../../sim/run/floors';
import { FINAL_FLOOR, type FloorNumber } from '../../sim/wing/floorSpecs';
import { BenchCard, type BenchCardAction } from '../ui/BenchCard';
import { OPEN_SETTINGS_EVENT, SETTINGS_OPENED_EVENT, settingsDialogOpen } from '../ui/SettingsPanel';
import { RUN_MENU_OPENED_EVENT, RUN_MENU_CLOSED_EVENT, RunMenuPause, runMenuOpen, type RunMenuClosedDetail } from '../ui/RunMenu';
import { heartbeatIntervalMs } from '../view/playerCues';
import { GamepadReader, firstGamepad, type PadFrame } from '../input/gamepad';
import { PlaytestRecorder, type RunRecord } from '../playtest/recorder';
import { PlaytestLog } from '../playtest/log';

function playtestStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
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
  pickWorkbenchItem,
} from '../../sim/run/bench';
import { syncRunCarrier } from '../../sim/run/carrier';
import { createMvpRun } from '../../sim/run/createMvpRun';
import { createPropTestRun } from '../../sim/run/propTestRoom';
import { PROP_TEST_ASSETS } from '../presentation/propTestAssets';
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
import { isBossKind, type BossKind } from '../../sim/combat/boss';
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
  ...PROP_TEST_ASSETS,
];
const PRESENTATION_ASSET_KEYS = new Set(PRESENTATION_ASSETS.map((asset) => asset.key));

export type MvpRunLaunch = {
  readonly seed: number;
  /** True when the address bar chose the seed: every shift keeps it. */
  readonly seedPinned?: boolean;
  readonly checkpoint: MvpCheckpoint | null;
  readonly store: CheckpointStore;
  /** 'daily': today's pinned mall with the standard-issue kit; `date` is that day (YYYY-MM-DD). */
  readonly mode?: 'night' | 'daily';
  readonly date?: string;
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

/** Let native controls receive their normal keyboard click, including keyup. */
function pageControlActivation(event: KeyboardEvent): boolean {
  return ['Space', 'Enter', 'NumpadEnter'].includes(event.code)
    && typeof HTMLElement !== 'undefined' && event.target instanceof HTMLElement
    && event.target.closest('button, summary, input, select, textarea, a[href]') !== null;
}

export class MvpRunInputAdapter {
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
  /** Round 36: X drops the held weapon. */
  private pendingDrop = false;
  private pendingDash = false;
  /** The controller's reading for this frame, set by the scene before ticking. */
  private pad: PadFrame | null = null;
  private padEdgesUsed = false;
  /** Whichever the player touched last aims: the mouse or the right stick. */
  private aimSource: 'mouse' | 'pad' = 'mouse';
  /** Returns a weapon slot when a click lands on the HUD hotbar, else null. */
  public hudSlotAt: ((x: number, y: number) => number | null) | null = null;
  /** The Bench Warrant card, when a fusion preview is open. */
  public benchCard: {
    readonly isOpen: () => boolean;
    readonly buttonAt: (x: number, y: number) => BenchCardAction | null;
    readonly act: (action: BenchCardAction) => void;
    readonly tileForKey: (key: number) => string | null;
  } | null = null;
  /** N toggles the soundtrack on its own. */
  public onToggleMusic: (() => void) | null = null;
  /** The dev prop fixture uses R for reset instead of carrier recall. */
  public onPropTestReset: (() => void) | null = null;
  /** The end-of-shift card, when it is open: its buttons and key actions. */
  public endCard: {
    readonly isOpen: () => boolean;
    readonly ascends: () => boolean;
    readonly buttonAt: (x: number, y: number) => ShiftCardAction | null;
    readonly act: (action: ShiftCardAction) => void;
  } | null = null;
  /** True while the escalator ride plays: it owns every key and click. */
  public riding: () => boolean = () => false;

  private readonly handlePointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (this.riding() || runMenuOpen() || settingsDialogOpen()) return;
    const benchAction = this.benchCard?.buttonAt(pointer.x, pointer.y) ?? null;
    if (benchAction !== null) {
      this.benchCard?.act(benchAction);
      return;
    }
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

  private readonly handlePointerMove = (): void => {
    this.aimSource = 'mouse';
  };

  /** Called once per rendered frame with the controller's state. */
  public setPad(frame: PadFrame): void {
    this.pad = frame;
    this.padEdgesUsed = false;
    if (frame.aiming) this.aimSource = 'pad';
  }

  private readonly handleWheel = (_pointer: unknown, _objects: unknown, _dx: number, dy: number): void => {
    if (runMenuOpen() || settingsDialogOpen()) return;
    if (dy !== 0) this.pendingCycle = dy > 0 ? 1 : -1;
  };

  private readonly handlePointerUp = (): void => {
    this.pointerHeld = false;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || settingsDialogOpen() || runMenuOpen() || this.riding() || pageControlActivation(event)) {
      return;
    }
    if (event.code === 'KeyO') {
      window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
      return;
    }
    if (this.benchCard?.isOpen()) {
      if (event.code === 'Enter' || event.code === 'NumpadEnter') {
        this.benchCard.act('fuse');
        return;
      }
      if (event.code === 'Escape') {
        event.preventDefault();
        this.benchCard.act('cancel');
        return;
      }
      if (event.code === 'KeyX') {
        this.benchCard.act('sell');
        return;
      }
      // Round 52: more than nine things pages the bench.
      if (event.code === 'KeyQ' || event.code === 'ArrowLeft' || event.code === 'KeyE' || event.code === 'ArrowRight') {
        this.benchCard.act(event.code === 'KeyQ' || event.code === 'ArrowLeft' ? 'prev' : 'next');
        return;
      }
      // Number keys pick items on the bench instead of switching weapons.
      if (/^Digit[1-9]$/.test(event.code)) {
        const tile = this.benchCard.tileForKey(Number(event.code.slice(5)));
        if (tile) this.benchCard.act({ pick: tile });
        return;
      }
    }
    if (this.endCard?.isOpen()) {
      if (event.code === 'KeyR' || event.code === 'Enter') this.endCard.act(this.endCard.ascends() ? 'ascend' : 'retry');
      else if (event.code === 'KeyT') this.endCard.act('title');
      else if (event.code === 'KeyC') this.endCard.act('copy');
      if (event.code !== 'KeyM') return;
    }
    if (event.code === 'KeyE') {
      this.pendingInteract = true;
    } else if (event.code === 'KeyF') {
      this.pendingSteal = true;
    } else if (event.code === 'KeyR') {
      if (this.onPropTestReset) this.onPropTestReset();
      else this.pendingRecall = true;
    } else if (/^Digit[1-9]$/.test(event.code)) {
      this.pendingSlot = Number(event.code.slice(5));
    } else if (event.code === 'KeyQ') {
      this.pendingCycle = event.shiftKey ? -1 : 1;
    } else if (event.code === 'KeyX') {
      this.pendingDrop = true;
    } else if (event.code === 'Space') {
      // Space must never also scroll the page or press a focused DOM button.
      event.preventDefault();
      this.pendingDash = true;
    } else if (event.code === 'KeyM') {
      this.onToggleMute();
    } else if (event.code === 'KeyN') {
      this.onToggleMusic?.();
    } else if (event.code === 'Escape') {
      event.preventDefault();
      this.clearHeld();
      this.onEscape();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space' && !pageControlActivation(event)) event.preventDefault();
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
    scene.input.on('pointermove', this.handlePointerMove);
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
    const pad = this.pad;
    // Pad presses are one-shot: they count on the first tick of the frame only.
    const edges = pad !== null && !this.padEdgesUsed;
    this.padEdgesUsed = true;
    const keyX = Number(this.keys.right.isDown) - Number(this.keys.left.isDown);
    const keyY = Number(this.keys.down.isDown) - Number(this.keys.up.isDown);
    const padAim = this.aimSource === 'pad' ? pad?.aim ?? null : null;
    const frame: MvpInputFrame = {
      moveX: keyX !== 0 || keyY !== 0 ? keyX : pad?.moveX ?? 0,
      moveY: keyX !== 0 || keyY !== 0 ? keyY : pad?.moveY ?? 0,
      aimX: padAim?.x ?? worldPosition.x,
      aimY: padAim?.y ?? worldPosition.y,
      fire: this.pointerHeld || pad?.fire === true,
      interact: this.keys.interact.isDown || this.pendingInteract || (edges && pad.interact),
      steal: this.keys.steal.isDown || this.pendingSteal || (edges && pad.steal),
      recall: this.keys.recall.isDown || this.pendingRecall || (edges && pad.recall),
      selectSlot: this.pendingSlot,
      cycleWeapon: this.pendingCycle || (edges ? pad.cycle : 0),
      dash: this.pendingDash || (edges && pad.dash),
      drop: this.pendingDrop,
    };
    this.pendingDash = false;
    this.pendingSlot = 0;
    this.pendingCycle = 0;
    this.pendingDrop = false;
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
    this.pendingDrop = false;
  }

  public destroy(): void {
    this.scene.input.off('pointerdown', this.handlePointerDown);
    this.scene.input.off('pointermove', this.handlePointerMove);
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
  private readonly menuPause = new RunMenuPause({
    isPaused: () => this.run.paused,
    canResume: () => this.run.status === 'playing' && this.run.preview === null && this.run.workbench === null,
    setPaused: (paused) => this.setPaused(paused),
    clearInput: () => {
      this.accumulator = 0;
      this.inputAdapter?.clearHeld();
      clearMvpHeldActions(this.run);
    },
  });
  private readonly openRunMenu = (): void => this.menuPause.open();
  private readonly closeRunMenu = (event: Event): void => {
    this.menuPause.close((event as CustomEvent<RunMenuClosedDetail>).detail.resume);
    this.syncView();
  };
  private seed = 0;
  private seedPinned = true;
  /** The date of a Daily Shift (null for a normal or continued run). */
  private dailyDate: string | null = null;
  private store: CheckpointStore = new InMemoryCheckpointStore();
  private generation = 1;
  private accumulator = 0;
  private hitStopMs = 0;
  private lastHeartbeat = -Infinity;
  private readonly gamepad = new GamepadReader();
  /** Local, opt-in playtest log (off until switched on from the title). */
  private readonly playtestLog = new PlaytestLog(playtestStorage());
  private playtest = new PlaytestRecorder();
  /** The finished shift's record, for the end card's heist line. */
  private lastRecord: RunRecord | null = null;
  private lastRoomIndex = 0;
  private lastCheckpointKey: string | null = null;
  private checkpointStatus = 'none yet';
  private inputAdapter: MvpRunInputAdapter | undefined;
  private runView: MvpRunView | undefined;
  private hud: MvpRunHud | undefined;
  private gameHud: GameHud | undefined;
  private shiftCard: ShiftCard | undefined;
  /** The ride up to the next floor, while it plays (the run does not tick). */
  private ride: EscalatorRide | null = null;
  /** The boss kill cam, while it plays; the end card waits for it. */
  private killCam: KillCam | null = null;
  /** The boss title card while it holds the fight on entering a boss room. */
  private bossIntro: BossIntro | null = null;
  /**
   * Boss rooms whose card has played, by mall (seed), floor and room. Kept
   * across retries of the same mall, so the card plays on the first entry
   * only; a new shift is a new mall and plays it again.
   */
  private readonly bossCardsSeen = new Set<string>();
  /** The walk out at dawn after the Mall Manager; the end card waits for it. */
  private ending: DawnEnding | null = null;
  /** The clock-in cold open over a fresh shift (it never holds the run). */
  private clockIn: ClockIn | null = null;
  /** The Notice of Termination after a death; the end card waits for it. */
  private pinkSlip: PinkSlip | null = null;
  /** The mall PA: who decides what it says, and the ticker that says it. */
  private readonly paDirector = new PaDirector();
  private paTicker: PaTicker | undefined;
  /** True once a kill cam or pink slip has played this shift's final beat. */
  private endBeatPlayed = false;
  /** True once the ending has played out and holds its last shot under the card. */
  private endingHeld = false;
  /** The live boss last frame, so its fall can be framed once it is gone. */
  private lastBoss: { kind: BossKind; x: number; y: number } | null = null;
  private lastStatus: MvpRunState['status'] = 'playing';
  private pauseCard: PauseCard | undefined;
  private benchCard: BenchCard | undefined;
  private removeBloom: (() => void) | undefined;
  /** Roadmap V6: the CRT look while it is switched on, and the settings listener that follows it. */
  private removeCrt: (() => void) | undefined;
  private unsubscribeCrt: (() => void) | undefined;
  private crtKey = '';
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
    if (this.devFixture() === 'mvp-prop-test') this.store = new InMemoryCheckpointStore();
    this.seed = launch?.checkpoint ? launch.checkpoint.seed : (launch?.seed ?? 0);
    this.seedPinned = launch?.seedPinned ?? true;
    // A restored checkpoint does not carry the daily flag, so it is never a daily run.
    this.dailyDate = launch?.mode === 'daily' && launch.date && !launch.checkpoint ? launch.date : null;
    this.run =
      launch?.checkpoint !== null && launch?.checkpoint !== undefined
        ? restoreMvpRun(launch.checkpoint)
        : createMvpRun(this.seed, { part: 1, perks: this.shiftPerks(), ...this.ruleOption() });
    this.run = this.applyDevFixture(this.run);
    this.startClockIn('launch', launch?.checkpoint != null);
    this.generation = 1;
    this.accumulator = 0;
    this.lastRoomIndex = this.run.roomIndex;
    this.lastCheckpointKey = null;
    this.checkpointStatus = 'none yet';
    this.audio = new GameAudioEngine();
    this.inputAdapter = new MvpRunInputAdapter(
      this,
      () => this.setPaused(!this.run.paused),
      () => { this.menuPause.retainPause(); this.setPaused(true); },
      // The M key routes through the HUD, not straight to the engine, so the
      // button label follows a keyboard toggle exactly as it follows a click.
      () => this.hud?.toggleMute(),
    );
    if (this.devFixture() === 'mvp-prop-test') {
      this.inputAdapter.onPropTestReset = () => this.restartRun();
      this.add.text(480, 150, 'WASD move · Click swing · R reset\nEast door out + back resets props', { fontFamily: 'monospace', fontSize: '12px', color: '#fff4c8', align: 'center' }).setOrigin(0.5).setDepth(8000);
    }
    // Web Audio may only start from a real user gesture, so the first pointer or
    // key press anywhere unlocks it; until then the engine is silent, not broken.
    window.addEventListener('pointerdown', this.unlockAudio);
    window.addEventListener('keydown', this.unlockAudio);
    window.addEventListener(SETTINGS_OPENED_EVENT, this.pauseForSettings);
    window.addEventListener(RUN_MENU_OPENED_EVENT, this.openRunMenu);
    window.addEventListener(RUN_MENU_CLOSED_EVENT, this.closeRunMenu);
    ensureFxTextures(this);
    this.runView = new MvpRunView(this);
    // The whole room is always on screen, like an Isaac room: the camera is
    // fixed on the stage (playfield plus the storefront band above it).
    this.cameras.main.setBounds(0, STAGE_TOP, STAGE_WIDTH, STAGE_HEIGHT);
    this.cameras.main.setBackgroundColor('#07050c');
    this.removeBloom = installAdaptiveBloom(this);
    this.syncCrt(gameSettings().get());
    this.unsubscribeCrt = gameSettings().subscribe((settings) => this.syncCrt(settings));
    this.gameHud = new GameHud(this);
    this.gameHud.setCoachAllowed(this.devFixture() === null);
    const hud = this.gameHud;
    this.inputAdapter.hudSlotAt = (x, y) => hud.weaponSlotAt(x, y);
    this.inputAdapter.onToggleMusic = () => {
      this.audio?.toggleMusic();
    };
    this.pauseCard = new PauseCard(this);
    const bench = new BenchCard(this);
    this.benchCard = bench;
    this.inputAdapter.benchCard = {
      isOpen: () => bench.open,
      buttonAt: (x, y) => bench.buttonAt(x, y),
      act: (action) => (action === 'fuse' ? this.confirmFusion() : action === 'cancel' ? this.cancelFusion() : action === 'sell' ? this.sellBenchItem() : action === 'prev' || action === 'next' ? bench.turnPage(action === 'prev' ? -1 : 1) : this.pickBenchItem(action.pick)),
      tileForKey: (key) => bench.tileForKey(key),
    };
    this.paTicker = new PaTicker(this, (cue) => this.audio?.play(cue));
    const card = new ShiftCard(this);
    this.shiftCard = card;
    // Cinematic moments own every key and click while they play.
    this.inputAdapter.riding = () => this.ride !== null || this.bossIntro !== null || this.killCam !== null || this.pinkSlip !== null || (this.ending !== null && !this.endingHeld);
    this.inputAdapter.endCard = {
      isOpen: () => card.open,
      ascends: () => card.offersAscend,
      buttonAt: (x, y) => card.buttonAt(x, y),
      act: (action) => (action === 'ascend' ? this.ascend() : action === 'retry' ? this.restartRun(true) : action === 'copy' ? this.copyShareCard() : this.returnToTitle()),
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
        () => this.clockIn !== null || this.bossIntro !== null || this.killCam !== null || this.ride !== null || this.ending !== null || this.pinkSlip !== null,
      );
      const removeProjection = installWorldToCanvas((x, y) => worldToCanvas(this, x, y));
      this.removeDebugBridge = () => {
        removeProjection();
        removeBridge();
      };
    }

    if (runMenuOpen()) this.openRunMenu();
    this.syncCheckpoint();
    this.syncView();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyRun, this);
  }

  /**
   * Reads the controller once per frame: feeds the input adapter, and drives
   * the cards (pause, bench, end of shift) that hold the sim clock.
   */
  private pollGamepad(): void {
    if (!this.inputAdapter) return;
    const pad = this.gamepad.read(firstGamepad(), this.run.room.combat.player);
    this.inputAdapter.setPad(pad);
    if (!pad.active || settingsDialogOpen() || runMenuOpen()) return;
    if (this.ride || (this.ending && !this.endingHeld)) {
      if (pad.confirm || pad.cancel || pad.pause) (this.ride ?? this.ending)?.requestSkip();
      return;
    }
    if (this.bossIntro) {
      if (pad.confirm || pad.cancel || pad.pause) this.bossIntro.requestSkip();
      return;
    }
    if (this.benchCard?.open) {
      if (pad.confirm) this.confirmFusion();
      else if (pad.cancel) this.cancelFusion();
      return;
    }
    if (this.shiftCard?.open) {
      if (pad.confirm) {
        if (this.shiftCard.offersAscend) this.ascend();
        else this.restartRun(true);
      }
      else if (pad.cancel) this.returnToTitle();
      return;
    }
    if (pad.pause || (this.run.paused && pad.cancel)) this.setPaused(!this.run.paused);
  }

  public update(_time: number, elapsedMs: number): void {
    this.pollGamepad();
    if (runMenuOpen()) {
      this.accumulator = 0;
      this.syncView();
      return;
    }
    if (this.clockIn && this.clockIn.update(elapsedMs)) this.stopClockIn();
    // The PA waits out any cinematic, and stops talking once the shift is over.
    if (this.run.status !== 'playing') this.paTicker?.clear();
    this.paTicker?.update(elapsedMs, this.clockIn !== null || this.ride !== null || this.bossIntro !== null || this.killCam !== null || this.run.paused);
    if (this.ride) {
      this.accumulator = 0;
      if (this.ride.update(elapsedMs)) this.endRide();
      return;
    }
    if (this.bossIntro) {
      // The title card holds the fight clock, like a pause the player didn't ask for.
      this.accumulator = 0;
      if (this.bossIntro.update(elapsedMs)) this.endBossIntro();
      // The boss finishes stepping in under the card, rather than freezing mid-spawn.
      this.runView?.advanceHeldEffects(elapsedMs);
      this.syncView();
      return;
    }
    if (!this.inputAdapter || this.run.paused || this.run.status !== 'playing') {
      this.accumulator = 0;
      if (this.killCam && this.killCam.update(elapsedMs)) this.endKillCam(true);
      if (this.ending && !this.endingHeld && this.ending.update(elapsedMs)) this.endingHeld = true;
      if (this.pinkSlip && this.pinkSlip.update(elapsedMs)) this.endPinkSlip();
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
      this.runView?.observeStep(this.run);
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
      // A quick fade from the mall's own dark, so a door reads as a door.
      this.cameras.main.fadeIn(240, 7, 5, 12);
      this.inputAdapter.clearHeld();
      clearMvpHeldActions(this.run);
      this.startBossIntro();
    }
    this.syncCheckpoint();
    this.syncView();
  }

  /** Walking into a boss room: the title card names who runs this floor. */
  private startBossIntro(): void {
    if (this.bossIntro || this.run.status !== 'playing') return;
    const boss = this.run.room.combat.enemies.find((enemy) => isBossKind(enemy.kind) && enemy.health > 0);
    if (!boss || !isBossKind(boss.kind)) return;
    const key = `${this.run.seed}:${this.run.wing.floor ?? 1}:${this.run.roomIndex}`;
    if (this.bossCardsSeen.has(key)) return;
    this.bossCardsSeen.add(key);
    this.bossIntro = new BossIntro(this, boss.kind, { x: boss.x, y: boss.y }, { x: 480, y: 240 });
    this.gameHud?.setHidden(true);
    this.audio?.play('stamp');
  }

  private endBossIntro(): void {
    if (this.bossIntro) {
      this.gameHud?.setHidden(false);
      const watched = this.bossIntro.watched();
      this.playtest.noteBossCard(this.bossIntro.kind, watched.ms, watched.skipped);
    }
    this.bossIntro?.destroy();
    this.bossIntro = null;
    this.accumulator = 0;
    this.inputAdapter?.clearHeld();
    clearMvpHeldActions(this.run);
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
    const preview = this.run.preview;
    const result = confirmRunFusionPreview(this.run);
    if (result.accepted && preview) {
      this.audio?.play('fuse');
      const discovery = preview.recipeId === 'hybrid' ? this.discoverFusion(preview.resultDefinitionId) : null;
      const reveal = fusionRevealModel(preview, discovery);
      if (preview.recipeId === 'hybrid') {
        this.playtest.noteFusion({ name: preview.resultName, parts: reveal.parts, signature: preview.signature, firstTime: discovery?.firstTime ?? false });
      }
      this.runView?.celebrateFusion(reveal);
      if (reveal.banner) playFusionBanner(this, reveal.banner, reveal.color, this.run.room.combat.player.y - this.cameras.main.scrollY);
      this.resumeAfterPreview();
    }
    this.syncView();
  }

  /** Logs a fusion in the career as it is made, so a discovery survives a quit mid-shift. */
  private discoverFusion(fusionId: string): FusionDiscovery {
    const store = browserCareer();
    const { career, discovery } = discoverFusion(store.load(), fusionId);
    if (discovery.firstTime) store.save(career);
    return discovery;
  }

  /** Round 36: sells the one item picked on the bench. */
  private sellBenchItem(): void {
    if (sellWorkbenchItem(this.run).accepted) this.audio?.play('purchase');
    this.syncView();
  }

  private pickBenchItem(instanceId: string): void {
    pickWorkbenchItem(this.run, instanceId);
    this.audio?.play('bench_pick');
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

  /** Puts the shareable seed card on the clipboard (the player's own paste; nothing is sent anywhere). */
  private copyShareCard(): void {
    const model = buildShiftCardModel(this.run, this.seed, this.dailyDate, this.lastRecord);
    const text = shareCardText(model, this.seed, this.dailyDate, this.run.rule ?? null);
    if (!text) return;
    void navigator.clipboard?.writeText(text).then(() => this.shiftCard?.markCopied(), () => undefined);
  }

  /** The Daily Shift's rule of the day (round 57); an ordinary night has none. */
  private ruleOption(): { readonly rule?: NightRuleId } {
    return this.dailyDate ? { rule: dailyRule(this.dailyDate) } : {};
  }

  /** A Daily Shift is standard issue; any other shift takes the janitor's Break Room perks. */
  private shiftPerks(): ShiftPerks {
    if (this.dailyDate || this.devFixture() === 'mvp-prop-test') return NO_PERKS;
    // Clocking in eats one of each vending snack in the bag (round 49).
    const store = browserCareer();
    const shift = clockIn(store.load());
    store.save(shift.career);
    return shift.perks;
  }

  /** From the end card, a won shift clocks into a new mall; otherwise the same one. */
  private restartRun(fromEndCard = false): void {
    this.endBeatPlayed = false;
    this.paTicker?.clear();
    this.endKillCam();
    this.endBossIntro();
    this.endPinkSlip();
    this.lastStatus = 'playing';
    const won = fromEndCard && this.run.status === 'won';
    this.seed = nextShiftSeed({ seed: this.seed, pinned: this.seedPinned }, won);
    this.recordQuit();
    this.playtest = new PlaytestRecorder();
    this.lastRecord = null;
    this.generation += 1;
    const cleared = this.store.clear();
    // Re-read the career: the Break Room is only open between shifts, but a
    // retry should still start with everything the janitor owns.
    this.run = createMvpRun(this.seed, { part: 1, perks: this.shiftPerks(), ...this.ruleOption() });
    if (this.devFixture() === 'mvp-prop-test') this.run = createPropTestRun(this.seed);
    this.startClockIn(won ? 'new-shift' : 'retry', false);
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

  /**
   * Up the escalator: a won floor-1 (or floor-2) run becomes the next floor's
   * run carrying the janitor's gear, cash, stats and perks. The lower record
   * closes as a win; the new floor gets its own checkpoint so Continue resumes
   * there.
   */
  private ascend(): void {
    if (!canAscend(this.run)) return;
    // A first wing's stairs lead to the same floor's boss wing: a fade, not the escalator ride.
    const stairs = nextIsBossWing(this.run);
    this.endBeatPlayed = false;
    this.stopClockIn();
    this.endKillCam();
    this.endBossIntro();
    this.lastStatus = 'playing';
    this.run = ascend(this.run);
    this.playtest = new PlaytestRecorder();
    this.lastRecord = null;
    this.generation += 1;
    this.audio?.resetBaseline();
    this.accumulator = 0;
    this.hitStopMs = 0;
    this.lastRoomIndex = this.run.roomIndex;
    this.lastCheckpointKey = null;
    this.inputAdapter?.clearHeld();
    this.runView?.resetForRun();
    this.syncCheckpoint();
    this.syncView();
    this.ride?.destroy();
    this.ride = null;
    if (stairs) {
      this.cameras.main.fadeIn(900, 7, 5, 12);
      this.audio?.play('pa_chime');
      return;
    }
    // Ride up before the landing appears; the run waits underneath.
    this.ride = new EscalatorRide(this, floorOf(this.run) as RideFloor);
    this.audio?.play('escalator');
  }

  private endRide(): void {
    this.ride?.destroy();
    this.ride = null;
    this.inputAdapter?.clearHeld();
    this.accumulator = 0;
    this.cameras.main.fadeIn(700, 7, 5, 12);
    this.audio?.play('pa_chime');
    this.syncView();
  }

  /** Opening settings mid-shift pauses it, like Esc. */
  private readonly pauseForSettings = (): void => {
    this.menuPause.retainPause();
    if (this.run.status === 'playing' && !this.run.paused && this.run.preview === null && this.run.workbench === null) this.setPaused(true);
  };

  private readonly returnToTitle = (): void => {
    // Clocking out after floor 1 (skipping the escalator) still ends the night's pay.
    this.shiftCard?.settle();
    this.recordQuit();
    window.dispatchEvent(new CustomEvent(RETURN_TO_TITLE_EVENT));
  };

  private syncCheckpoint(): void {
    // Several sim ticks can precede this rendered frame. A marker from an
    // earlier living tick cannot be saved using the later tick's dead state.
    const playerHealth = this.run.room.combat.player.health;
    if (this.run.checkpoint !== null && (!Number.isInteger(playerHealth) || playerHealth < 1)) return;
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

  /** The cold open for a fresh shift: not for a retry, a continued run or a dev fixture. */
  private startClockIn(reason: ClockInReason, restored: boolean): void {
    this.stopClockIn();
    if (!shouldClockIn({ reason, fixture: this.devFixture(), restored })) return;
    this.clockIn = new ClockIn(this, this.seed, () => this.audio?.play('stamp'), this.run.perks, this.dailyDate);
  }

  private stopClockIn(): void {
    this.clockIn?.destroy();
    this.clockIn = null;
  }

  private devFixture(): string | null {
    if (!(import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_BRIDGE === 'true')) return null;
    return new URLSearchParams(window.location.search).get('fixture');
  }

  /** Frames a boss's fall: starts the kill cam on the frame the shift is won. */
  private watchBossKill(): void {
    if (this.run.status === 'playing') {
      const boss = this.run.room.combat.enemies.find((enemy) => isBossKind(enemy.kind) && enemy.health > 0);
      this.lastBoss = boss && isBossKind(boss.kind) ? { kind: boss.kind, x: boss.x, y: boss.y } : null;
    } else if (this.lastStatus === 'playing' && this.run.status === 'dead' && !this.pinkSlip) {
      const reason = pinkSlipReason(this.playtest.lastDamageSource, floorOf(this.run));
      this.endBeatPlayed = true;
      this.pinkSlip = new PinkSlip(this, reason, { fall: () => this.audio?.play('paper'), stamp: () => this.audio?.play('stamp') });
    } else if (this.lastStatus === 'playing' && this.run.status === 'won' && this.lastBoss && !this.killCam) {
      this.endBeatPlayed = true;
      this.killCam = new KillCam(this, this.lastBoss.kind, this.lastBoss, () => this.audio?.play('stamp'));
      this.runView?.setEffectsTimeWarp(slowMoMs);
      this.gameHud?.setHidden(true);
    }
    this.lastStatus = this.run.status;
  }

  /** `finished` is true when the kill cam played out (not cut short by a restart). */
  private endKillCam(finished = false): void {
    const played = this.killCam !== null;
    this.killCam?.destroy();
    this.killCam = null;
    // Beating the final boss ends the night: walk out into the sunrise first.
    if (finished && played && this.run.status === 'won' && floorOf(this.run) === FINAL_FLOOR) {
      this.ending = new DawnEnding(this);
      this.endingHeld = false;
      this.audio?.play('dawn');
      return;
    }
    this.endEnding();
  }

  private endPinkSlip(): void {
    this.pinkSlip?.destroy();
    this.pinkSlip = null;
  }

  private endEnding(): void {
    this.ending?.destroy();
    this.ending = null;
    this.endingHeld = false;
    this.gameHud?.setHidden(false);
  }

  private syncView(): void {
    this.runView?.sync(this.run);
    this.recordPlaytest();
    // After the recorder has seen this frame, so a death knows what did it.
    this.watchBossKill();
    const announcement = this.paDirector.observe(this.run);
    if (announcement) this.paTicker?.announce(announcement);
    this.syncHeartbeat();
    const rawHold = this.runView?.takeHitStop() ?? 0;
    const hold = rawHold * hitStopScale(gameSettings().get());
    this.hitStopMs = Math.max(this.hitStopMs, hold);
    // Getting hurt (and the boss kill) ring the ears: the mix muffles while the frame holds.
    if (rawHold >= HIT_STOP_MS.playerHurt) this.audio?.muffle(Math.max(hold, 120));
    if (!this.killCam && !this.bossIntro) centreCameraOn(this, this.run.room.combat.player.x, this.run.room.combat.player.y);
    this.hud?.sync(this.run, this.checkpointStatus);
    this.gameHud?.sync(this.run);
    // Dev capture (&clean=1, the trailer): the room alone, no HUD or PA ticker.
    if (this.cleanCapture) {
      this.gameHud?.setHidden(true);
      this.paTicker?.clear();
    }
    const pointer = this.input.activePointer;
    this.shiftCard?.hover(pointer.x, pointer.y);
    this.benchCard?.hover(pointer.x, pointer.y);
    this.benchCard?.sync(this.run);
    // The end card waits for the kill cam to finish framing the fall.
    if (!this.killCam && !this.pinkSlip && (!this.ending || this.endingHeld)) this.shiftCard?.sync(this.run, this.seed, this.endBeatPlayed, this.dailyDate, this.run.status === 'playing' ? null : this.lastRecord);
    // A fusion preview also holds the clock; it has its own panel, not the pause card.
    this.pauseCard?.sync(!runMenuOpen() && this.run.paused && this.run.status === 'playing' && this.run.preview === null && this.run.workbench === null, firstGamepad() !== null);
    // Derived from authoritative state each frame, so the sound layer can never
    // disagree with what the simulation actually did.
    this.audio?.syncTo(this.run);
  }

  private recordPlaytest(): void {
    const record = this.playtest.observe(this.run);
    if (record) {
      this.lastRecord = record;
      this.playtestLog.append(record);
    }
  }

  /** A shift abandoned mid-run still belongs in the playtest log. */
  private recordQuit(): void {
    if (this.run.status !== 'playing') return;
    const record = this.playtest.finish(this.run, 'quit');
    if (record) this.playtestLog.append(record);
  }

  /** At the last heart the janitor's pulse is audible and visible, on real time. */
  private syncHeartbeat(): void {
    const interval = this.run.status === 'playing' && !this.run.paused
      ? heartbeatIntervalMs(this.run.room.combat.player.health)
      : null;
    const now = this.time.now;
    if (interval !== null && now - this.lastHeartbeat >= interval) {
      this.lastHeartbeat = now;
      this.audio?.play('heartbeat');
    }
    this.runView?.heartbeat(interval !== null, now - this.lastHeartbeat);
  }

  private readonly cleanCapture = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_BRIDGE === 'true'
    && new URLSearchParams(window.location.search).get('clean') === '1';

  /** Puts the CRT look on, takes it off, or rebuilds it when the setting (or Flashes) changes. */
  private syncCrt(settings: GameSettings): void {
    const look = crtLook(settings);
    const key = look ? JSON.stringify(look) : '';
    if (key === this.crtKey) return;
    this.crtKey = key;
    this.removeCrt?.();
    this.removeCrt = look ? installCrt(this, look) : undefined;
  }

  private applyDevFixture(state: MvpRunState): MvpRunState {
    if (!(import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_BRIDGE === 'true')) {
      return state;
    }
    const fixture = new URLSearchParams(window.location.search).get('fixture');
    if (fixture === 'mvp-hunter-hurt') return createHunterHurtRun(state.seed);
    if (fixture === 'mvp-prop-test') return createPropTestRun(state.seed);
    // Every fixture below was authored on a floor's boss wing; a new shift now
    // opens on the first wing (round 45), so fixtures start from the boss wing.
    if (fixture && fixture !== 'mvp-lockdown' && state.wing.part === 1 && state.tick === 0) {
      state = createMvpRun(state.seed, { perks: state.perks });
    }
    if (fixture === 'mvp-lockdown') {
      // At the Lockdown door of a first wing (&floor=N), every fight before it cleared.
      let run = state;
      for (let floor = 1; floor < Number(new URLSearchParams(window.location.search).get('floor') ?? 1) && floor < FINAL_FLOOR; floor += 1) {
        run.status = 'won';
        run = ascend(run);
        run.status = 'won';
        run = ascend(run);
      }
      let guard = 0;
      while (run.roomIndex < run.wing.rooms.length - 2 && guard < 10) {
        guard += 1;
        run.room.combat.enemies = [];
        tickMvpRun(run, { moveX: 0, moveY: 0, aimX: run.room.combat.player.x, aimY: run.room.combat.player.y, fire: false, interact: false, steal: false, recall: false });
        if (!enterDoorway(run, 'east').accepted) break;
      }
      run.room.combat.enemies = [];
      tickMvpRun(run, { moveX: 0, moveY: 0, aimX: run.room.combat.player.x, aimY: run.room.combat.player.y, fire: false, interact: false, steal: false, recall: false });
      const door = run.wing.rooms[run.roomIndex]!.doorways.find((entry) => entry.side === 'east');
      if (door) {
        run.room.combat.player.x = door.rect.x - 40;
        run.room.combat.player.y = door.rect.y + door.rect.height / 2;
      }
      // &enter=1 steps through into the Lockdown itself (the elites and their traits).
      if (new URLSearchParams(window.location.search).get('enter') === '1') enterDoorway(run, 'east');
      return run;
    }
    if (fixture === 'mvp-storefront') {
      // Inside the first store, at the shelf with the straightest run to the door.
      if (enterDoorway(state, 'east').accepted && enterStore(state, 0).accepted) {
        const doorX = INTERIOR_EXIT.x + INTERIOR_EXIT.width / 2;
        const inside = state.wing.rooms[state.roomIndex]?.store?.templateId;
        const offer = [...(state.wing.rooms[state.roomIndex]?.offers ?? [])]
          .filter((candidate) => candidate.storeId === inside && (state.offerStatus[candidate.id] ?? 'available') === 'available')
          .sort((first, second) => Math.abs(first.position.x - doorX) - Math.abs(second.position.x - doorX) || second.position.y - first.position.y)[0];
        if (offer) {
          state.room.combat.player.x = offer.position.x + 12;
          state.room.combat.player.y = offer.position.y;
        }
      }
      return state;
    }
    if (fixture === 'mvp-store') {
      // Inside the named store (&store=arcade-annex etc.), when this mall has it.
      // &floor=N climbs first; &at=<item id> stands at that shelf item (round 44).
      const params = new URLSearchParams(window.location.search);
      const wanted = params.get('store');
      let run = state;
      for (let floor = 1; floor < Number(params.get('floor') ?? 1) && floor < FINAL_FLOOR; floor += 1) {
        run.status = 'won';
        run = climbToBossWing(run);
      }
      let guard = 0;
      while (guard < 10) {
        guard += 1;
        const shops = roomStores(run.wing.rooms[run.roomIndex]!);
        const index = shops.findIndex((shop) => shop.templateId === wanted);
        if (index >= 0) {
          enterStore(run, index);
          break;
        }
        run.room.combat.enemies = [];
        tickMvpRun(run, { moveX: 0, moveY: 0, aimX: run.room.combat.player.x, aimY: run.room.combat.player.y, fire: false, interact: false, steal: false, recall: false });
        if (!enterDoorway(run, 'east').accepted) break;
      }
      const at = run.wing.rooms[run.roomIndex]!.offers.find((offer) => offer.storeId === wanted && offer.itemDefinitionId === params.get('at'));
      if (at) {
        run.room.combat.player.x = at.position.x;
        run.room.combat.player.y = at.position.y + 20;
      }
      return run;
    }
    if (fixture === 'mvp-store-front') {
      // On the first storefront's concourse, between its two shop doors.
      if (enterDoorway(state, 'east').accepted) {
        state.room.combat.player.x = 480;
        state.room.combat.player.y = 130;
      }
      return state;
    }
    if (fixture === 'mvp-elites') {
      // One dormant elite of each trait in a row (plain, Swift, Volatile), to compare their marks (roadmap V10).
      let guard = 0;
      while (state.wing.rooms[state.roomIndex]?.id !== 'food_court' && guard < 10) {
        guard += 1;
        state.room.combat.enemies = [];
        tickMvpRun(state, { moveX: 0, moveY: 0, aimX: state.room.combat.player.x, aimY: state.room.combat.player.y, fire: false, interact: false, steal: false, recall: false });
        if (!enterDoorway(state, 'east').accepted) break;
      }
      const combat = state.room.combat;
      combat.player.x = 300;
      combat.player.y = 380;
      const posed = combat.enemies.slice(0, 3);
      posed.forEach((enemy, index) => {
        const trait = ([undefined, 'swift', 'volatile'] as const)[index];
        Object.assign(enemy, { elite: true, health: 400, x: 380 + index * 150, y: 260, dormant: true });
        if (trait) enemy.trait = trait; else delete enemy.trait;
      });
      combat.enemies = posed;
      return state;
    }
    if (fixture === 'mvp-volatile') {
      // The first fight room with one posed Volatile elite at a single hit, 40 px east of the
      // janitor (round 57): one swing kills it, so its fuse and burst can be seen and measured.
      let guard = 0;
      while (state.wing.rooms[state.roomIndex]?.id !== 'food_court' && guard < 10) {
        guard += 1;
        state.room.combat.enemies = [];
        tickMvpRun(state, { moveX: 0, moveY: 0, aimX: state.room.combat.player.x, aimY: state.room.combat.player.y, fire: false, interact: false, steal: false, recall: false });
        if (!enterDoorway(state, 'east').accepted) break;
      }
      const combat = state.room.combat;
      combat.player.x = 480;
      combat.player.y = 300;
      combat.player.facing = { x: 1, y: 0 };
      const posed = combat.enemies[0];
      if (posed) {
        Object.assign(posed, { elite: true, trait: 'volatile', health: 1, x: 520, y: 300, dormant: true });
        combat.enemies = [posed];
      }
      return state;
    }
    if (fixture === 'mvp-hatch') {
      // Beside the staff passage's hatch (round 57); needs a seed that has one, such as &seed=7.
      const spot = shortcutFor(state.wing);
      let guard = 0;
      while (spot && state.roomIndex < spot.from && guard < 10) {
        guard += 1;
        state.room.combat.enemies = [];
        tickMvpRun(state, { moveX: 0, moveY: 0, aimX: state.room.combat.player.x, aimY: state.room.combat.player.y, fire: false, interact: false, steal: false, recall: false });
        if (!enterDoorway(state, 'east').accepted) break;
      }
      state.room.combat.player.x = SHORTCUT_HATCH.x + 20;
      state.room.combat.player.y = SHORTCUT_HATCH.y + 30;
      return state;
    }
    if (fixture === 'mvp-arsenal' || fixture === 'mvp-thrown' || fixture === 'mvp-water' || fixture === 'mvp-spray') {
      // The food court fight holding every weapon and the visible modifiers,
      // so each weapon's look and each status effect can be seen (keys 1-9).
      // mvp-thrown, mvp-water and mvp-spray hold those weapon families instead (roadmap V3).
      let guard = 0;
      while (state.wing.rooms[state.roomIndex]?.id !== 'food_court' && guard < 10) {
        guard += 1;
        state.room.combat.enemies = [];
        tickMvpRun(state, { moveX: 0, moveY: 0, aimX: state.room.combat.player.x, aimY: state.room.combat.player.y, fire: false, interact: false, steal: false, recall: false });
        if (!enterDoorway(state, 'east').accepted) break;
      }
      const ids = fixture === 'mvp-thrown'
        ? ['dodgeball', 'football', 'pog_slammer', 'laserdisc', 'jawbreaker', 'squeaky_toy', 'garden_gnome', 'hockey_puck']
        : fixture === 'mvp-water'
          ? ['garden_hose', 'super_soaker_50', 'super_soaker_cps', 'soda_gun', 'watering_can', 'water_balloons']
          : fixture === 'mvp-spray'
            ? ['hairspray', 'flea_spray', 'ketchup_bottle', 'whoopee_cushion', 'fire_extinguisher']
            : ['pump_soaker', 'party_popper', 'bottle_rocket_pack', 'fire_extinguisher', 'paint_marker', 'foam_ball_blaster', 'slushie_cup', 'box_cutter', 'broken_broom_handle', 'grease_gun', 'plasma_globe', 'extension_cord'];
      state.inventory = {
        ...state.inventory,
        inventory: [
          ...state.inventory.inventory,
          ...ids.map((id): InventoryLeaf => ({ kind: 'leaf', instanceId: `dev-${id}`, itemDefinitionId: id, acquisitionKind: 'purchased', sourceLocationId: 'dev-fixture', sourceStockId: `dev-${id}-offer`, acquisitionTick: state.tick })),
        ],
        selectedPrimaryInstanceId: `dev-${ids[0]}`,
        revision: state.inventory.revision + 1,
      };
      refreshRunLoadout(state);
      // Two far, idle targets to shoot at, one already Wet so a chain has somewhere to go.
      const targets = state.room.combat.enemies.filter((enemy) => enemy.kind === 'spitter' || enemy.kind === 'hanger').slice(0, 2);
      targets.forEach((enemy, index) => {
        enemy.x = 760;
        enemy.y = 180 + index * 110;
        enemy.health = 400;
        enemy.phase = 'recover';
        enemy.phaseTicks = 1_000_000;
        enemy.kind = 'spitter';
      });
      if (targets[1]?.statuses) targets[1].statuses.wetTicks = 100_000;
      if (targets[0]?.statuses) targets[0].statuses.stickyTicks = 100_000;
      state.room.combat.enemies = targets;
      state.room.combat.player.x = 300;
      state.room.combat.player.y = 235;
      return state;
    }
    if (fixture === 'mvp-workbench') {
      // At the service-corridor Bench Warrant holding a shooter and three
      // modifiers, with cash to spare, so any fusion can be tried at once.
      // `&items=N` fills the bag to N things (round 52: the bench's pages).
      const fill = Number(new URLSearchParams(window.location.search).get('items') ?? 0);
      const base = ['pump_soaker', 'plasma_globe', 'gel_pens', 'party_popper'];
      const ids = [...base, ...ITEM_CATALOG.map((item) => item.id).filter((id) => !base.includes(id)).slice(0, Math.max(0, fill - base.length - 1))];
      state.inventory = {
        ...state.inventory,
        inventory: [
          ...state.inventory.inventory,
          ...ids.map((id): InventoryLeaf => ({ kind: 'leaf', instanceId: `dev-${id}`, itemDefinitionId: id, acquisitionKind: 'purchased', sourceLocationId: 'dev-fixture', sourceStockId: `dev-${id}-offer`, acquisitionTick: state.tick })),
        ],
        cash: 60,
        revision: state.inventory.revision + 1,
      };
      state.cash = 60;
      refreshRunLoadout(state);
      const kiosk = state.wing.rooms[state.roomIndex]?.benchKiosk;
      if (kiosk) {
        state.room.combat.player.x = kiosk.x;
        state.room.combat.player.y = kiosk.y;
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
    if (fixture === 'mvp-floor-four' || fixture === 'mvp-floor-four-lobby' || fixture === 'mvp-floor-four-roofer' || fixture === 'mvp-floor-four-boss' || fixture === 'mvp-floor-four-boss-win') {
      // Up all three escalators to the Roof, optionally on to the HVAC Yard fight or the Developer.
      let roof = state;
      for (let floor = 1; floor < 4; floor += 1) {
        roof.status = 'won';
        roof = climbToBossWing(roof);
      }
      if (fixture !== 'mvp-floor-four') {
        const stop = fixture === 'mvp-floor-four-lobby' || fixture === 'mvp-floor-four-roofer' ? 'food_court' : roof.wing.rooms.at(-1)?.id;
        let guard = 0;
        while (roof.wing.rooms[roof.roomIndex]?.id !== stop && guard < 10) {
          guard += 1;
          roof.room.combat.enemies = [];
          tickMvpRun(roof, { moveX: 0, moveY: 0, aimX: roof.room.combat.player.x, aimY: roof.room.combat.player.y, fire: false, interact: false, steal: false, recall: false });
          if (!enterDoorway(roof, 'east').accepted) break;
        }
      }
      if (fixture === 'mvp-floor-four-roofer') {
        // One Roofer across the HVAC Yard, about to throw.
        const player = roof.room.combat.player;
        roof.room.combat.enemies = [{
          id: 1, kind: 'roofer', x: player.x + 300, y: player.y, health: 20, radius: 15, phase: 'pursue',
          phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0,
        }];
      }
      if (fixture === 'mvp-floor-four-boss-win') {
        // One swing from the ending: the Developer at a single point of health.
        const boss = roof.room.combat.enemies.find((enemy) => isBossKind(enemy.kind));
        if (boss) {
          boss.health = 1;
          roof.room.combat.player.x = boss.x - 80;
          roof.room.combat.player.y = boss.y;
        }
      }
      return roof;
    }
    if (fixture === 'mvp-floor-three' || fixture === 'mvp-floor-three-lobby' || fixture === 'mvp-floor-three-brute' || fixture === 'mvp-floor-three-boss' || fixture === 'mvp-floor-three-boss-win') {
      // Straight up both escalators, optionally on to the Arcade fight or the Mall Owner.
      state.status = 'won';
      const upstairs = climbToBossWing(state);
      upstairs.status = 'won';
      const top = climbToBossWing(upstairs);
      if (fixture !== 'mvp-floor-three') {
        const stop = fixture === 'mvp-floor-three-lobby' || fixture === 'mvp-floor-three-brute' ? 'food_court' : top.wing.rooms.at(-1)?.id;
        let guard = 0;
        while (top.wing.rooms[top.roomIndex]?.id !== stop && guard < 10) {
          guard += 1;
          top.room.combat.enemies = [];
          tickMvpRun(top, { moveX: 0, moveY: 0, aimX: top.room.combat.player.x, aimY: top.room.combat.player.y, fire: false, interact: false, steal: false, recall: false });
          if (!enterDoorway(top, 'east').accepted) break;
        }
      }
      if (fixture === 'mvp-floor-three-brute') {
        // One Mascot Brute across the Arcade, about to wind up.
        const player = top.room.combat.player;
        top.room.combat.enemies = [{
          id: 1, kind: 'mascot', x: player.x + 300, y: player.y, health: 34, radius: 18, phase: 'pursue',
          phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0,
        }];
      }
      if (fixture === 'mvp-floor-three-boss-win') {
        // One swing from the ending: the Mall Owner at a single point of health.
        const boss = top.room.combat.enemies.find((enemy) => isBossKind(enemy.kind));
        if (boss) {
          boss.health = 1;
          top.room.combat.player.x = boss.x - 80;
          top.room.combat.player.y = boss.y;
        }
      }
      return top;
    }
    if (fixture === 'mvp-floor-two' || fixture === 'mvp-floor-two-lobby' || fixture === 'mvp-floor-two-hunter' || fixture === 'mvp-floor-two-boss' || fixture === 'mvp-floor-two-boss-win') {
      // Straight up the escalator, optionally on to the Cinema Lobby fight or the Mall Manager.
      state.status = 'won';
      const upstairs = climbToBossWing(state);
      if (fixture !== 'mvp-floor-two') {
        const stop = fixture === 'mvp-floor-two-lobby' || fixture === 'mvp-floor-two-hunter' ? 'food_court' : upstairs.wing.rooms.at(-1)?.id;
        let guard = 0;
        while (upstairs.wing.rooms[upstairs.roomIndex]?.id !== stop && guard < 10) {
          guard += 1;
          upstairs.room.combat.enemies = [];
          tickMvpRun(upstairs, { moveX: 0, moveY: 0, aimX: upstairs.room.combat.player.x, aimY: upstairs.room.combat.player.y, fire: false, interact: false, steal: false, recall: false });
          if (!enterDoorway(upstairs, 'east').accepted) break;
        }
      }
      if (fixture === 'mvp-floor-two-hunter') {
        // One Bargain Hunter across the Cinema Lobby, about to line up its charge.
        const player = upstairs.room.combat.player;
        upstairs.room.combat.enemies = [{
          id: 1, kind: 'shopper', x: player.x + 300, y: player.y, health: 18, radius: 16, phase: 'pursue',
          phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0,
        }];
      }
      if (fixture === 'mvp-floor-two-boss-win') {
        // One swing from the ending: the Mall Manager at a single point of health.
        const boss = upstairs.room.combat.enemies.find((enemy) => isBossKind(enemy.kind));
        if (boss) {
          boss.health = 1;
          upstairs.room.combat.player.x = boss.x - 80;
          upstairs.room.combat.player.y = boss.y;
        }
      }
      return upstairs;
    }
    if (fixture === 'mvp-room') {
      // Any room of any floor for a visual sweep: &floor=N &room=<room id> &part=1 (the first
      // wing; default the boss wing) &store=1|2 (step inside) &enemies=1 (keep its monsters).
      const params = new URLSearchParams(window.location.search);
      const floor = Math.min(FINAL_FLOOR, Math.max(1, Number(params.get('floor') ?? 1))) as FloorNumber;
      const options = { floor, ...(params.get('part') === '1' ? { part: 1 as const } : {}), perks: state.perks };
      let run = createMvpRun(state.seed, options);
      // &event=none walks on to the first seed whose wing and rooms roll no event (no outage hiding the room).
      const evented = (candidate: MvpRunState) => wingEventFor(candidate.wing) !== null || candidate.wing.rooms.some((_, index) => roomEventFor(candidate, index) !== null);
      for (let seed = state.seed + 1; params.get('event') === 'none' && evented(run) && seed < state.seed + 200; seed += 1) {
        run = createMvpRun(seed, options);
      }
      const stop = params.get('room') ?? run.wing.rooms[0]!.id;
      while (run.wing.rooms[run.roomIndex]?.id !== stop && run.roomIndex < run.wing.rooms.length - 1) {
        run.room.combat.enemies = [];
        tickMvpRun(run, { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false });
        if (!enterDoorway(run, 'east').accepted) break;
      }
      const shop = Number(params.get('store') ?? 0);
      if (shop > 0) enterStore(run, shop - 1);
      if (params.get('enemies') !== '1') run.room.combat.enemies = [];
      // &arm=<item id>,<item id> hands the janitor those (the first in hand), or one hero fusion by its id.
      const arm = (params.get('arm') ?? '').split(',').filter(Boolean);
      if (arm.length > 0) {
        const leaf = (id: string): InventoryLeaf => ({ kind: 'leaf', instanceId: `dev-${id}`, itemDefinitionId: id, acquisitionKind: 'purchased', sourceLocationId: 'dev-fixture', sourceStockId: `dev-${id}-offer`, acquisitionTick: run.tick });
        const hero = HERO_FUSIONS.find((entry) => entry.id === arm[0]);
        const items = hero
          ? [((): HybridComposite => {
            const [a, b] = hero.pair;
            const [base, ingredient] = isHybridPair(a, b) ? [a, b] : [b, a];
            return { kind: 'composite', instanceId: 'dev-hero', recipeId: 'hybrid', createdTick: run.tick, transactionId: 'dev-hero-fusion', primary: leaf(base), carrier: leaf(ingredient) };
          })()]
          : arm.map(leaf);
        run.inventory = { ...run.inventory, inventory: [...run.inventory.inventory, ...items], selectedPrimaryInstanceId: items[0]!.instanceId, revision: run.inventory.revision + 1 };
        refreshRunLoadout(run);
      }
      // &tough=1: a janitor who can take a whole take's worth of hits.
      if (params.get('tough') === '1') run.room.combat.player.health = 99;
      return run;
    }
    if (fixture === 'mvp-district') {
      // Round 50: the first night whose &floor=N first wing is its district, walked to
      // &room=<room id> (default the fight room) with its monsters there; &store=1 or 2 steps into that shop.
      const params = new URLSearchParams(window.location.search);
      const floor = Math.min(FINAL_FLOOR, Math.max(1, Number(params.get('floor') ?? 1))) as FloorNumber;
      const stop = params.get('room') ?? 'food_court';
      for (let seed = 1; seed < 400; seed += 1) {
        const run = createMvpRun(seed, { floor, part: 1 });
        if (!run.wing.district) continue;
        while (run.wing.rooms[run.roomIndex]?.id !== stop && run.roomIndex < run.wing.rooms.length - 1) {
          run.room.combat.enemies = [];
          tickMvpRun(run, { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false });
          if (!enterDoorway(run, 'east').accepted) break;
        }
        const shop = Number(params.get('store') ?? 0);
        if (shop > 0) enterStore(run, shop - 1);
        return run;
      }
    }
    if (fixture === 'mvp-hero') {
      // Round 53: the first food court with all three props, holding a hero
      // fusion (`&hero=greatest_hits|comedy_hour|movie_night`).
      const hero = HERO_FUSIONS.find((entry) => entry.id === new URLSearchParams(window.location.search).get('hero')) ?? HERO_FUSIONS[0]!;
      for (let seed = 1; seed < 400; seed += 1) {
        const run = createMvpRun(seed);
        const index = run.wing.rooms.findIndex((room) => room.id === 'food_court');
        if (wingEventFor(run.wing) !== null || roomEventFor(run, index) !== null) continue;
        if ((buildRoomCombatState(run.wing, index, 'west', run.inventory, run.seed).props ?? []).length < 3) continue;
        while (run.roomIndex < index) {
          run.room.combat.enemies = [];
          tickMvpRun(run, { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false });
          if (!enterDoorway(run, 'east').accepted) break;
        }
        const [a, b] = hero.pair;
        const [base, ingredient] = isHybridPair(a, b) ? [a, b] : [b, a];
        const leaf = (id: string): InventoryLeaf => ({ kind: 'leaf', instanceId: `dev-${id}`, itemDefinitionId: id, acquisitionKind: 'purchased', sourceLocationId: 'dev-fixture', sourceStockId: `dev-${id}-offer`, acquisitionTick: run.tick });
        const fused: HybridComposite = { kind: 'composite', instanceId: 'dev-hero', recipeId: 'hybrid', createdTick: run.tick, transactionId: 'dev-hero-fusion', primary: leaf(base), carrier: leaf(ingredient) };
        run.inventory = { ...run.inventory, inventory: [...run.inventory.inventory, fused], selectedPrimaryInstanceId: 'dev-hero', revision: run.inventory.revision + 1 };
        refreshRunLoadout(run);
        // `&props=used`: the rack already down and the soda machine burst, to see them.
        if (new URLSearchParams(window.location.search).get('props') === 'used') {
          for (const prop of run.room.combat.props ?? []) {
            if (prop.kind === 'rack') Object.assign(prop, { state: 'fallen', fall: { axis: 'x', sign: 1 } });
            if (prop.kind === 'soda') prop.state = 'broken';
          }
          run.room.combat.walls = [...run.wing.rooms[run.roomIndex]!.walls.map((wall) => ({ ...wall })), ...propWalls(run.room.combat.props ?? [])];
        }
        // Tough monsters and a janitor who can take it, so the moves can be watched.
        run.room.combat.player.health = 99;
        for (const enemy of run.room.combat.enemies) enemy.health = 200;
        return run;
      }
    }
    if (fixture === 'mvp-secret') {
      // Round 53: the first night with a secret, at its machine (`&inside=1`: already through it).
      for (let seed = 1; seed < 200; seed += 1) {
        const run = createMvpRun(seed);
        const secret = secretFor(run.wing);
        if (!secret) continue;
        while (run.roomIndex < secret.roomIndex) {
          run.room.combat.enemies = [];
          tickMvpRun(run, { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false });
          if (!enterDoorway(run, 'east').accepted) break;
        }
        run.room.combat.player.x = SECRET_MACHINE.x;
        run.room.combat.player.y = SECRET_MACHINE.y + 40;
        if (new URLSearchParams(window.location.search).get('inside') === '1') enterSecretRoom(run);
        return run;
      }
    }
    if (fixture === 'mvp-walker') {
      // The first Floor 1 mall whose food court has a Mall Walker doing laps (round 48).
      for (let seed = 1; seed < 200; seed += 1) {
        const run = createMvpRun(seed);
        const index = run.wing.rooms.findIndex((room) => room.id === 'food_court');
        if (!buildRoomCombatState(run.wing, index, 'west', run.inventory, run.seed).enemies.some((enemy) => enemy.kind === 'walker')) continue;
        while (run.roomIndex < index) {
          run.room.combat.enemies = [];
          tickMvpRun(run, { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false });
          if (!enterDoorway(run, 'east').accepted) break;
        }
        return run;
      }
    }
    if (fixture === 'mvp-event') {
      // A Floor 2 boss wing with the floor event named in &event= (outage, sprinklers,
      // clearance), standing in its first fight with the monsters still there.
      const wanted = new URLSearchParams(window.location.search).get('event');
      for (let seed = 1; seed < 500; seed += 1) {
        const evented = createMvpRun(seed, { floor: 2 });
        if (wingEventFor(evented.wing) !== wanted) continue;
        while (evented.wing.rooms[evented.roomIndex]?.id !== 'food_court') {
          evented.room.combat.enemies = [];
          tickMvpRun(evented, { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false });
          if (!enterDoorway(evented, 'east').accepted) break;
        }
        return evented;
      }
    }
    if (fixture === 'mvp-boss-door') {
      // The room before the boss, cleared, at its east door: walk in for the title card.
      let guard = 0;
      while (state.wing.rooms[state.roomIndex + 1]?.bossAnchor == null && guard < 10) {
        guard += 1;
        state.room.combat.enemies = [];
        tickMvpRun(state, { moveX: 0, moveY: 0, aimX: state.room.combat.player.x, aimY: state.room.combat.player.y, fire: false, interact: false, steal: false, recall: false });
        if (!enterDoorway(state, 'east').accepted) break;
      }
      state.room.combat.enemies = [];
      const door = state.wing.rooms[state.roomIndex]?.doorways.find((entry) => entry.side === 'east');
      if (door) {
        state.room.combat.player.x = door.rect.x - 40;
        state.room.combat.player.y = door.rect.y + door.rect.height / 2;
      }
      return state;
    }
    if (fixture === 'mvp-wanted') {
      // Five stars in the opening corridor: Loss Prevention arrives in 3 s.
      state.heat = 100;
      return state;
    }
    if (fixture === 'mvp-last-heart') {
      // Into the food court fight on the last point of health (for death flows).
      let guard = 0;
      while (state.wing.rooms[state.roomIndex]?.id !== 'food_court' && guard < 10) {
        guard += 1;
        state.room.combat.enemies = [];
        tickMvpRun(state, { moveX: 0, moveY: 0, aimX: state.room.combat.player.x, aimY: state.room.combat.player.y, fire: false, interact: false, steal: false, recall: false });
        if (!enterDoorway(state, 'east').accepted) break;
      }
      state.room.combat.player.health = 1;
      return state;
    }
    if (fixture === 'mvp-back-hall') {
      // Skips to the back hall, where the display mannequins always stand.
      let guard = 0;
      while (state.wing.rooms[state.roomIndex]?.id !== 'back_hall' && guard < 10) {
        guard += 1;
        state.room.combat.enemies = [];
        tickMvpRun(state, { moveX: 0, moveY: 0, aimX: state.room.combat.player.x, aimY: state.room.combat.player.y, fire: false, interact: false, steal: false, recall: false });
        if (!enterDoorway(state, 'east').accepted) break;
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
        const boss = state.room.combat.enemies.find((enemy) => isBossKind(enemy.kind));
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
    this.stopClockIn();
    this.paTicker?.destroy();
    this.paTicker = undefined;
    this.endPinkSlip();
    this.killCam?.destroy();
    this.killCam = null;
    this.bossIntro?.destroy();
    this.bossIntro = null;
    this.ending?.destroy();
    this.ending = null;
    this.ride?.destroy();
    this.ride = null;
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
    this.pauseCard?.destroy();
    this.pauseCard = undefined;
    this.benchCard?.destroy();
    this.benchCard = undefined;
    this.removeBloom?.();
    this.removeBloom = undefined;
    this.unsubscribeCrt?.();
    this.unsubscribeCrt = undefined;
    this.removeCrt?.();
    this.removeCrt = undefined;
    this.crtKey = '';
    window.removeEventListener('pointerdown', this.unlockAudio);
    window.removeEventListener('keydown', this.unlockAudio);
    window.removeEventListener(SETTINGS_OPENED_EVENT, this.pauseForSettings);
    window.removeEventListener(RUN_MENU_OPENED_EVENT, this.openRunMenu);
    window.removeEventListener(RUN_MENU_CLOSED_EVENT, this.closeRunMenu);
    this.menuPause.close(false);
    this.audio?.destroy();
    this.audio = undefined;
    this.removeDebugBridge?.();
    this.removeDebugBridge = undefined;
    this.accumulator = 0;
  };
}
