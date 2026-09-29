/**
 * Emitter Mount fusion domain model (M4 Task 3).
 *
 * Renderer-independent, serializable inventory content: standalone leaves and
 * one-level composites. Gameplay rules live here; Phaser only presents them.
 */

export type FusionAcquisitionKind = 'purchased' | 'stolen';

export type InventoryLeaf = {
  readonly kind: 'leaf';
  readonly instanceId: string;
  readonly itemDefinitionId: string;
  readonly acquisitionKind: FusionAcquisitionKind;
  readonly sourceLocationId: string;
  readonly sourceStockId: string;
  readonly acquisitionTick: number;
};

export type EmitterMountComposite = {
  readonly kind: 'composite';
  readonly instanceId: string;
  readonly recipeId: 'emitter_mount';
  readonly createdTick: number;
  readonly transactionId: string;
  readonly primary: InventoryLeaf;
  readonly carrier: InventoryLeaf;
};

/**
 * Void the Warranty: any two items fused into one. `primary` is the base,
 * `carrier` the ingredient bolted onto it (the field names are shared with
 * Emitter Mount so both composites store, clone and validate alike). The
 * behaviour is derived from the two ingredient ids; see `hybrid.ts`.
 */
export type HybridComposite = {
  readonly kind: 'composite';
  readonly instanceId: string;
  readonly recipeId: 'hybrid';
  readonly createdTick: number;
  readonly transactionId: string;
  readonly primary: InventoryLeaf;
  readonly carrier: InventoryLeaf;
};

export type FusionComposite = EmitterMountComposite | HybridComposite;
export type FusionRecipeId = FusionComposite['recipeId'];

export type FusionInventoryNode = InventoryLeaf | FusionComposite;

export type FusionTransactionRecord = {
  readonly transactionId: string;
  readonly recipeId: FusionRecipeId;
  readonly primaryInstanceId: string;
  readonly carrierInstanceId: string;
  readonly compositeInstanceId: string;
  readonly fee: number;
  readonly committedRevision: number;
};

export type FusionInventoryState = {
  readonly inventory: readonly FusionInventoryNode[];
  readonly cash: number;
  readonly revision: number;
  readonly selectedPrimaryInstanceId: string;
  readonly serviceAvailable: boolean;
  readonly nextCompositeId: number;
  readonly committedTransactions: readonly FusionTransactionRecord[];
};

export type EmitterMountOperation = {
  readonly attackOrigin: 'carrier';
  readonly steering: 'pointer';
  readonly recallKey: 'R';
  readonly firingOrigin: string;
  readonly lostBehavior: string;
};

export type EmitterMountProposal = {
  readonly recipeId: 'emitter_mount';
  readonly transactionId: string;
  readonly sourceRevision: number;
  readonly primaryInstanceId: string;
  readonly carrierInstanceId: string;
  readonly primaryName: string;
  readonly carrierName: string;
  readonly primaryProvenance: FusionAcquisitionKind;
  readonly carrierProvenance: FusionAcquisitionKind;
  readonly baseFee: 6;
  readonly cleanDiscount: number;
  readonly fee: number;
  readonly retainedInstanceIds: readonly string[];
  readonly excludedNotes: readonly string[];
  readonly operation: EmitterMountOperation;
  readonly compositePreview: EmitterMountComposite;
  readonly selectedCompositeInstanceId: string;
  readonly irreversibilityNotice: string;
};

/** A proposed hybrid: which two items, what they become, and the fee. */
export type HybridProposal = {
  readonly recipeId: 'hybrid';
  readonly transactionId: string;
  readonly sourceRevision: number;
  /** The base item (a weapon when either ingredient is one). */
  readonly primaryInstanceId: string;
  /** The ingredient fused onto the base. */
  readonly carrierInstanceId: string;
  readonly primaryName: string;
  readonly carrierName: string;
  readonly primaryProvenance: FusionAcquisitionKind;
  readonly carrierProvenance: FusionAcquisitionKind;
  readonly baseFee: number;
  readonly cleanDiscount: number;
  readonly fee: number;
  readonly resultDefinitionId: string;
  readonly resultName: string;
  readonly highlights: readonly string[];
  readonly signature: boolean;
  readonly retainedInstanceIds: readonly string[];
  readonly compositePreview: HybridComposite;
  readonly selectedCompositeInstanceId: string;
  /** False when the result is a passive kit: the equipped weapon stays equipped. */
  readonly selectsResult: boolean;
  readonly irreversibilityNotice: string;
};

export type FusionProposal = EmitterMountProposal | HybridProposal;

export type HybridResolution =
  | { readonly accepted: true; readonly proposal: HybridProposal }
  | { readonly accepted: false; readonly reason: string; readonly message: string };

export type EmitterMountResolution =
  | { readonly accepted: true; readonly proposal: EmitterMountProposal }
  | { readonly accepted: false; readonly reason: string; readonly message: string };

export type CommitInput = {
  readonly primaryInstanceId: string;
  readonly carrierInstanceId: string;
  readonly expectedRevision: number;
  readonly transactionId: string;
  readonly createdTick?: number;
};

export type CommitResult =
  | {
      readonly committed: true;
      readonly state: FusionInventoryState;
      readonly record: FusionTransactionRecord;
    }
  | {
      readonly committed: false;
      readonly reason: string;
      readonly message: string;
      readonly state: FusionInventoryState;
    };

export type CancelResult = {
  readonly cancelled: true;
  readonly state: FusionInventoryState;
};

export function isInventoryLeaf(node: FusionInventoryNode): node is InventoryLeaf {
  return node.kind === 'leaf';
}
