import { ITEM_CATALOG } from '../../sim/items/catalog';
import type { CompiledPrimary, ItemDefinition } from '../../sim/items/types';
import type { RunState } from '../../sim/model';

/**
 * One lab loadout selection.
 *
 * The lab only ever *submits* this selection: `createRun` rebuilds the run and
 * `compileLoadout` stays the authority on what the selection means, so no
 * gameplay rule (damage, statuses, geometry, economy) lives in the DOM.
 */
export type LabLoadoutSelection = {
  readonly itemIds: readonly string[];
  readonly selectedPrimaryId: string;
};

export type LoadoutChangeHandler = (
  itemIds: readonly string[],
  selectedPrimaryId: string,
) => void;

type LabPreset = LabLoadoutSelection & {
  readonly id: string;
  readonly label: string;
};

/** Curated builds. Selecting one always produces a fresh deterministic run. */
export const LAB_PRESETS: readonly LabPreset[] = [
  {
    id: 'soaker-bath-rewinder',
    label: 'Soaker + Bath + Rewinder',
    itemIds: ['pump_soaker', 'bubble_bath', 'vhs_rewinder'],
    selectedPrimaryId: 'pump_soaker',
  },
  {
    id: 'mop-rewinder',
    label: 'Mop + Rewinder',
    itemIds: ['janitor_mop', 'vhs_rewinder'],
    selectedPrimaryId: 'janitor_mop',
  },
];

const DEFAULT_PRESET_ID = 'soaker-bath-rewinder';

/** The fresh lab selection used when the lab is launched. */
export function defaultLabSelection(): LabLoadoutSelection {
  const preset =
    LAB_PRESETS.find((candidate) => candidate.id === DEFAULT_PRESET_ID) ?? LAB_PRESETS[0];
  if (!preset) {
    throw new Error('The M2 interaction lab needs at least one curated preset.');
  }
  return { itemIds: [...preset.itemIds], selectedPrimaryId: preset.selectedPrimaryId };
}

/** Catalog order keeps a selection deterministic no matter how it was built. */
function orderedItemIds(itemIds: Iterable<string>): string[] {
  const requested = new Set(itemIds);
  return ITEM_CATALOG.filter((definition) => requested.has(definition.id)).map(
    (definition) => definition.id,
  );
}

/**
 * Applies the one-primary invariant: the selected primary always exists, is
 * owned, and is a definition that authors a base attack.
 */
function normalizeSelection(itemIds: Iterable<string>, selectedPrimaryId: string): LabLoadoutSelection {
  const owned = new Set(itemIds);
  const selectable = ITEM_CATALOG.filter((definition) => definition.base).map(
    (definition) => definition.id,
  );
  const primary = selectable.includes(selectedPrimaryId) ? selectedPrimaryId : selectable[0];
  if (!primary) {
    throw new Error('The M2 item catalog has no definition that can be selected as a primary.');
  }
  owned.add(primary);
  return { itemIds: orderedItemIds(owned), selectedPrimaryId: primary };
}

function describePrimary(primary: CompiledPrimary): string {
  const kind = primary.delivery === 'direct' ? 'direct attack' : 'projectile';
  const reach =
    primary.delivery === 'direct'
      ? `${primary.range}-unit reach`
      : `${primary.speed} units/tick muzzle speed`;
  return `Primary: ${primary.name} — ${kind}, ${primary.damage} damage, ${primary.cooldownTicks}-tick cooldown, ${reach}.`;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.querySelector<T>(`#${id}`);
  if (!element) {
    throw new Error(`Interaction lab markup is incomplete: missing #${id}.`);
  }
  return element;
}

function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

/**
 * Rebuilds a list only when its content actually changed, so the panel can be
 * synced every animation frame without losing focus or thrashing the DOM.
 */
function renderList(list: HTMLElement, entries: readonly string[], emptyText: string): void {
  const key = `${entries.join('\u0000')}\u0001${emptyText}`;
  if (list.dataset.renderKey === key) {
    return;
  }
  list.dataset.renderKey = key;
  list.replaceChildren();
  if (entries.length === 0) {
    const item = document.createElement('li');
    item.className = 'lab-empty';
    item.textContent = emptyText;
    list.append(item);
    return;
  }
  for (const entry of entries) {
    const item = document.createElement('li');
    item.textContent = entry;
    list.append(item);
  }
}

type ItemCardControls = {
  readonly definitionId: string;
  readonly owned: HTMLInputElement;
  readonly ownedLock: HTMLElement;
  readonly primary: HTMLInputElement;
};

/**
 * Accessible, renderer-free lab panel.
 *
 * The panel renders authoritative `RunState` and submits selections through
 * `onLoadoutChange`; the scene owns the deterministic rebuild.
 */
export class InteractionLab {
  private readonly presetList: HTMLElement;
  private readonly itemList: HTMLElement;
  private readonly primaryValue: HTMLElement;
  private readonly recent: HTMLElement;
  private readonly limits: HTMLElement;
  private readonly notes: HTMLElement;
  private readonly compiledTrace: HTMLElement;
  private readonly behaviorTrace: HTMLElement;
  private readonly onLoadoutChange: LoadoutChangeHandler;
  private readonly presetButtons = new Map<string, HTMLButtonElement>();
  private readonly cards: ItemCardControls[] = [];
  private ownedIds = new Set<string>();
  private selectedPrimaryId = '';

  public constructor(onLoadoutChange: LoadoutChangeHandler) {
    this.onLoadoutChange = onLoadoutChange;
    this.presetList = requireElement('lab-preset-list');
    this.itemList = requireElement('lab-item-list');
    this.primaryValue = requireElement('lab-primary');
    this.recent = requireElement('lab-recent');
    this.limits = requireElement('lab-limits');
    this.notes = requireElement('lab-notes');
    this.compiledTrace = requireElement('lab-compiled-trace');
    this.behaviorTrace = requireElement('lab-behavior-trace');

    this.buildPresets();
    this.buildItemCards();
  }

  /** Renders the authoritative run: ownership, primary, notes and trace. */
  public sync(state: RunState): void {
    const primary = state.compiledLoadout.primary;
    this.ownedIds = new Set(state.inventory.map((instance) => instance.itemId));
    this.selectedPrimaryId = primary.definitionId;

    for (const card of this.cards) {
      const owned = this.ownedIds.has(card.definitionId);
      const isPrimary = card.definitionId === this.selectedPrimaryId;
      card.owned.checked = owned;
      card.owned.disabled = isPrimary;
      card.owned.title = isPrimary ? 'The selected primary is always owned.' : '';
      card.ownedLock.hidden = !isPrimary;
      card.primary.checked = isPrimary;
    }

    for (const preset of LAB_PRESETS) {
      const button = this.presetButtons.get(preset.id);
      button?.setAttribute('aria-pressed', String(this.matchesPreset(preset)));
    }

    setText(this.primaryValue, describePrimary(primary));
    setText(
      this.recent,
      state.recentChange.length > 0 ? `RECENT: ${state.recentChange}` : 'RECENT: no action yet',
    );
    this.limits.hidden = state.limitDiagnostics.length === 0;
    setText(
      this.limits,
      state.limitDiagnostics.length === 0
        ? ''
        : `LIMIT DIAGNOSTICS: ${state.limitDiagnostics.join(' | ')}`,
    );

    renderList(
      this.notes,
      state.compiledLoadout.compatibilityNotes.map((note) => `Limited: ${note}`),
      'Every owned effect applies to the selected primary.',
    );
    renderList(this.compiledTrace, state.compiledLoadout.trace, 'No compiled behavior.');
    renderList(
      this.behaviorTrace,
      state.behaviorTrace.slice(-12),
      'No gameplay trace yet — aim and fire through the canvas.',
    );
  }

  public destroy(): void {
    this.presetList.replaceChildren();
    this.itemList.replaceChildren();
    this.presetButtons.clear();
    this.cards.length = 0;
  }

  private buildPresets(): void {
    this.presetList.replaceChildren();
    this.presetButtons.clear();
    for (const preset of LAB_PRESETS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lab-preset';
      button.dataset.presetId = preset.id;
      button.textContent = preset.label;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        const selection = normalizeSelection(preset.itemIds, preset.selectedPrimaryId);
        this.onLoadoutChange(selection.itemIds, selection.selectedPrimaryId);
      });
      this.presetList.append(button);
      this.presetButtons.set(preset.id, button);
    }
  }

  private buildItemCards(): void {
    this.itemList.replaceChildren();
    this.cards.length = 0;
    for (const definition of ITEM_CATALOG) {
      this.cards.push(this.createItemCard(definition));
    }
  }

  private createItemCard(definition: ItemDefinition): ItemCardControls {
    const item = document.createElement('li');
    item.className = 'lab-item';
    item.dataset.itemId = definition.id;
    item.setAttribute('aria-labelledby', `lab-item-${definition.id}-name`);

    const name = document.createElement('h4');
    name.className = 'lab-item-name';
    name.id = `lab-item-${definition.id}-name`;
    name.textContent = definition.name;

    const summary = document.createElement('p');
    summary.className = 'lab-item-summary';
    summary.textContent = definition.summary;

    const primaryNote = document.createElement('p');
    primaryNote.className = 'lab-item-primary-note';
    primaryNote.id = `lab-item-${definition.id}-primary-note`;
    primaryNote.textContent = definition.base
      ? `Can be selected as a primary: ${definition.base.delivery} attack, ` +
        `${definition.base.damage} damage, ${definition.base.cooldownTicks}-tick cooldown.`
      : 'Cannot be selected as a primary: this definition has no base attack.';

    const ownedLabel = document.createElement('label');
    ownedLabel.className = 'lab-item-owned';
    const owned = document.createElement('input');
    owned.type = 'checkbox';
    owned.name = `lab-owned-${definition.id}`;
    owned.setAttribute('aria-label', `Owned: ${definition.name}`);
    owned.setAttribute('aria-describedby', primaryNote.id);
    const ownedText = document.createElement('span');
    ownedText.textContent = 'Owned';
    const ownedLock = document.createElement('span');
    ownedLock.className = 'lab-item-lock';
    ownedLock.textContent = ' · selected primary (kept owned)';
    ownedLock.hidden = true;
    ownedLabel.append(owned, ownedText, ownedLock);
    owned.addEventListener('change', () => {
      this.handleOwnedChange(definition.id, owned.checked);
    });

    const primaryLabel = document.createElement('label');
    primaryLabel.className = 'lab-item-primary';
    const primary = document.createElement('input');
    primary.type = 'radio';
    primary.name = 'lab-primary';
    primary.value = definition.id;
    primary.setAttribute('aria-label', `Primary: ${definition.name}`);
    primary.setAttribute('aria-describedby', primaryNote.id);
    primary.disabled = !definition.base;
    const primaryText = document.createElement('span');
    primaryText.textContent = definition.base ? 'Primary' : 'Primary (unavailable)';
    primaryLabel.append(primary, primaryText);
    primary.addEventListener('change', () => {
      if (primary.checked) {
        this.handlePrimaryChange(definition.id);
      }
    });

    item.append(name, summary, primaryNote, ownedLabel, primaryLabel);
    this.itemList.append(item);
    return { definitionId: definition.id, owned, ownedLock, primary };
  }

  private handleOwnedChange(definitionId: string, owned: boolean): void {
    const next = new Set(this.ownedIds);
    if (owned) {
      next.add(definitionId);
    } else {
      next.delete(definitionId);
    }
    // The primary must stay owned; the disabled primary checkbox makes this a
    // safety net rather than the normal path.
    next.add(this.selectedPrimaryId);
    const selection = normalizeSelection(next, this.selectedPrimaryId);
    this.onLoadoutChange(selection.itemIds, selection.selectedPrimaryId);
  }

  private handlePrimaryChange(definitionId: string): void {
    const next = new Set(this.ownedIds);
    next.add(definitionId);
    const selection = normalizeSelection(next, definitionId);
    this.onLoadoutChange(selection.itemIds, selection.selectedPrimaryId);
  }

  private matchesPreset(preset: LabPreset): boolean {
    const owned = [...this.ownedIds].sort().join(',');
    const presetOwned = [...preset.itemIds].sort().join(',');
    return owned === presetOwned && this.selectedPrimaryId === preset.selectedPrimaryId;
  }
}
