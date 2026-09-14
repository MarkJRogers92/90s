import { ITEM_CATALOG } from '../../sim/items/catalog';
import { BENCH_KIOSK, getBenchScenario } from '../../sim/bench/scenarios';
import type { BenchRunState, BenchScenarioId } from '../../sim/bench/types';

export type BenchHudCallbacks = {
  onConfirm: () => void;
  onCancel: () => void;
  onLatePickup: () => void;
  onScenario: (scenarioId: BenchScenarioId) => void;
  onRestart: () => void;
  onReturn: () => void;
};

function definitionName(itemDefinitionId: string): string {
  return (
    ITEM_CATALOG.find((definition) => definition.id === itemDefinitionId)?.name ?? itemDefinitionId
  );
}

function isFusionMessage(message: string): boolean {
  return /fusion|emitter mount|preview|projectile primary|emitter carrier|bench warrant|no fusion/i.test(
    message,
  );
}

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Bench HUD markup is incomplete: missing ${selector}.`);
  }
  return element;
}

export class BenchHud {
  private readonly root: HTMLElement;
  private readonly scenario: HTMLElement;
  private readonly room: HTMLElement;
  private readonly cash: HTMLElement;
  private readonly revision: HTMLElement;
  private readonly primary: HTMLElement;
  private readonly carrier: HTMLElement;
  private readonly provenance: HTMLElement;
  private readonly interaction: HTMLElement;
  private readonly retained: HTMLElement;
  private readonly late: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly recent: HTMLElement;
  private readonly trace: HTMLElement;
  private readonly preview: HTMLElement;
  private readonly previewIngredients: HTMLElement;
  private readonly previewFee: HTMLElement;
  private readonly previewRetained: HTMLElement;
  private readonly previewExcluded: HTMLElement;
  private readonly previewOperation: HTMLElement;
  private readonly previewNotice: HTMLElement;
  private readonly previewReason: HTMLElement;
  private readonly confirmButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly lateButton: HTMLButtonElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly returnButton: HTMLButtonElement;
  private readonly scenarioButtons = new Map<BenchScenarioId, { button: HTMLButtonElement; handler: () => void }>();
  private readonly callbacks: BenchHudCallbacks;

  public constructor(callbacks: BenchHudCallbacks) {
    this.root = requireElement<HTMLElement>('#bench-hud');
    this.scenario = requireElement<HTMLElement>('#bench-scenario');
    this.room = requireElement<HTMLElement>('#bench-room');
    this.cash = requireElement<HTMLElement>('#bench-cash');
    this.revision = requireElement<HTMLElement>('#bench-revision');
    this.primary = requireElement<HTMLElement>('#bench-primary');
    this.carrier = requireElement<HTMLElement>('#bench-carrier');
    this.provenance = requireElement<HTMLElement>('#bench-provenance');
    this.interaction = requireElement<HTMLElement>('#bench-interaction');
    this.retained = requireElement<HTMLElement>('#bench-retained');
    this.late = requireElement<HTMLElement>('#bench-late');
    this.prompt = requireElement<HTMLElement>('#bench-prompt');
    this.recent = requireElement<HTMLElement>('#bench-recent');
    this.trace = requireElement<HTMLElement>('#bench-trace');
    this.preview = requireElement<HTMLElement>('#bench-preview');
    this.previewIngredients = requireElement<HTMLElement>('#bench-preview-ingredients');
    this.previewFee = requireElement<HTMLElement>('#bench-preview-fee');
    this.previewRetained = requireElement<HTMLElement>('#bench-preview-retained');
    this.previewExcluded = requireElement<HTMLElement>('#bench-preview-excluded');
    this.previewOperation = requireElement<HTMLElement>('#bench-preview-operation');
    this.previewNotice = requireElement<HTMLElement>('#bench-preview-notice');
    this.previewReason = requireElement<HTMLElement>('#bench-preview-reason');
    this.confirmButton = requireElement<HTMLButtonElement>('#bench-confirm');
    this.cancelButton = requireElement<HTMLButtonElement>('#bench-cancel');
    this.lateButton = requireElement<HTMLButtonElement>('#bench-late-pickup');
    this.restartButton = requireElement<HTMLButtonElement>('#bench-restart');
    this.returnButton = requireElement<HTMLButtonElement>('#bench-return');
    const scenarios: BenchScenarioId[] = ['clean-soaker', 'stolen-popper', 'unsupported-mop'];
    for (const scenarioId of scenarios) {
      const button = document.querySelector<HTMLButtonElement>(`#bench-scenario-${scenarioId}`);
      if (!button) {
        throw new Error(`Bench HUD markup is incomplete: missing #bench-scenario-${scenarioId}.`);
      }
      const handler = (): void => callbacks.onScenario(scenarioId);
      button.addEventListener('click', handler);
      this.scenarioButtons.set(scenarioId, { button, handler });
    }
    this.callbacks = callbacks;
    this.confirmButton.addEventListener('click', this.callbacks.onConfirm);
    this.cancelButton.addEventListener('click', this.callbacks.onCancel);
    this.lateButton.addEventListener('click', this.callbacks.onLatePickup);
    this.restartButton.addEventListener('click', this.callbacks.onRestart);
    this.returnButton.addEventListener('click', this.callbacks.onReturn);
  }

  public sync(state: BenchRunState): void {
    this.root.hidden = false;
    this.scenario.textContent = state.scenarioId;
    this.room.textContent = state.activeRoom === 'service' ? 'service room' : 'test bay';
    this.cash.textContent = `$${state.fusion.cash}`;
    this.revision.textContent = `rev ${state.fusion.revision}`;

    const compiled = state.combat.compiledLoadout;
    this.primary.textContent =
      `PRIMARY: ${compiled.primary.name} (${compiled.primary.definitionId})`;
    const carrierNote = state.carrier.recalling ? ' — RECALL SENT' : '';
    this.carrier.textContent =
      `CARRIER: ${state.carrier.mode}${carrierNote} @ ${Math.round(state.carrier.x)}, ${Math.round(state.carrier.y)}`;

    const leaves = state.fusion.inventory
      .filter((node) => node.kind === 'leaf')
      .map((node) => `${node.instanceId}:${definitionName(node.itemDefinitionId)} (${node.acquisitionKind})`);
    const composites = state.fusion.inventory
      .filter((node) => node.kind === 'composite')
      .map(
        (node) =>
          `${node.instanceId}: ${definitionName(node.primary.itemDefinitionId)} (${node.primary.instanceId}, ${node.primary.acquisitionKind}) + ${definitionName(node.carrier.itemDefinitionId)} (${node.carrier.instanceId}, ${node.carrier.acquisitionKind})`,
      );
    const provenanceParts = [...leaves, ...composites];
    this.provenance.textContent = `PROVENANCE: ${provenanceParts.length > 0 ? provenanceParts.join(' · ') : 'none'}`;

    const distanceToKiosk = Math.hypot(
      state.combat.player.x - BENCH_KIOSK.x,
      state.combat.player.y - BENCH_KIOSK.y,
    );
    if (state.preview !== null) {
      this.interaction.textContent = 'PREVIEW OPEN — CONFIRM OR CANCEL';
    } else if (distanceToKiosk <= BENCH_KIOSK.range) {
      this.interaction.textContent = '[E] Preview fusion at the BENCH WARRANT';
    } else {
      this.interaction.textContent = 'APPROACH THE BENCH WARRANT TO PREVIEW FUSION';
    }

    if (state.preview !== null) {
      const retainedNames = state.preview.retainedInstanceIds.join(', ') || 'none';
      this.retained.textContent = `RETAINED MODIFIERS: ${retainedNames}`;
    } else {
      const modifierIds = state.fusion.inventory
        .filter((node) => node.kind === 'leaf')
        .map((node) => node.instanceId)
        .join(', ');
      this.retained.textContent = `RETAINED MODIFIERS: ${modifierIds || 'none'}`;
    }

    const scenario = getBenchScenario(state.scenarioId);
    const lateId = scenario.lateModifierDefinitionId;
    if (lateId === null) {
      this.late.textContent = 'LATE PICKUP: none in this scenario';
    } else {
      const owned = state.fusion.inventory.some((node) => {
        if (node.kind === 'leaf') {
          return node.itemDefinitionId === lateId;
        }
        return (
          node.primary.itemDefinitionId === lateId || node.carrier.itemDefinitionId === lateId
        );
      });
      const fused = state.carrier.mode === 'emitter';
      if (owned) {
        this.late.textContent = `LATE PICKUP: ${definitionName(lateId)} acquired`;
      } else if (fused) {
        this.late.textContent = `LATE PICKUP: ${definitionName(lateId)} available`;
      } else {
        this.late.textContent = `LATE PICKUP: ${definitionName(lateId)} after fusion`;
      }
    }

    if (state.combat.status !== 'playing') {
      this.prompt.textContent = 'BENCH COMPLETE — RESTART OR RETURN';
    } else if (state.paused && state.preview === null) {
      this.prompt.textContent = 'PAUSED — PRESS ESC TO RESUME';
    } else {
      this.prompt.textContent = 'WASD MOVE · POINTER FIRE · E PREVIEW · R RECALL · ESC PAUSE';
    }

    const recent = state.recentChange.length > 0 ? state.recentChange : 'none yet';
    this.recent.textContent = `RECENT: ${recent}`;
    const trace = state.behaviorTrace.at(-1) ?? 'none yet';
    this.trace.textContent = `TRACE: ${trace}`;

    this.syncPreview(state);
  }

  private syncPreview(state: BenchRunState): void {
    const preview = state.preview;
    if (preview === null) {
      this.preview.hidden = true;
      this.confirmButton.disabled = true;
      this.cancelButton.disabled = true;
      if (state.recentChange.length > 0 && isFusionMessage(state.recentChange)) {
        this.previewReason.hidden = false;
        this.previewReason.textContent = state.recentChange;
      } else {
        this.previewReason.hidden = true;
        this.previewReason.textContent = '';
      }
      return;
    }
    this.preview.hidden = false;
    this.previewReason.hidden = true;
    this.previewReason.textContent = '';
    this.previewIngredients.textContent =
      `Emitter Mount preview: ${preview.primaryName} (${preview.primaryInstanceId}, ${preview.primaryProvenance}) + ` +
      `${preview.carrierName} (${preview.carrierInstanceId}, ${preview.carrierProvenance})`;
    this.previewFee.textContent =
      `Fee $${preview.fee} (base $${preview.baseFee} − clean discount $${preview.cleanDiscount})`;
    this.previewRetained.textContent =
      `Retained after fusion: ${preview.retainedInstanceIds.join(', ') || 'none'}`;
    this.previewExcluded.textContent = `Excluded: ${preview.excludedNotes.join(' ')}`;
    this.previewOperation.textContent =
      `Operation: firing origin is ${preview.operation.firingOrigin}; ` +
      `steering ${preview.operation.steering}; recall key ${preview.operation.recallKey}; ` +
      `attack origin ${preview.operation.attackOrigin}`;
    this.previewNotice.textContent = preview.irreversibilityNotice;
    this.confirmButton.disabled = false;
    this.cancelButton.disabled = false;
  }

  public destroy(): void {
    this.confirmButton.removeEventListener('click', this.callbacks.onConfirm);
    this.cancelButton.removeEventListener('click', this.callbacks.onCancel);
    this.lateButton.removeEventListener('click', this.callbacks.onLatePickup);
    this.restartButton.removeEventListener('click', this.callbacks.onRestart);
    this.returnButton.removeEventListener('click', this.callbacks.onReturn);
    for (const { button, handler } of this.scenarioButtons.values()) {
      button.removeEventListener('click', handler);
    }
    this.scenarioButtons.clear();
  }
}
