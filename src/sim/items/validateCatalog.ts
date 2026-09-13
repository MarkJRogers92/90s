import type { ItemDefinition } from './types';
import { EFFECT_KINDS, EFFECT_STAGE_BY_KIND } from './types';

export type CatalogIssueCode =
  | 'duplicate_id'
  | 'invalid_definition'
  | 'invalid_value'
  | 'invalid_reference'
  | 'unsupported_effect';

export type CatalogIssue = {
  readonly code: CatalogIssueCode;
  /** Offending content ID: the item definition (or effect) that caused the issue. */
  readonly contentId: string;
  readonly message: string;
};

type IssueSink = CatalogIssue[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const ITEM_ID_PATTERN = /^[a-z][a-z0-9_]*$/;
const DELIVERIES: readonly string[] = ['direct', 'projectile'];

function describe(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : String(value);
}

function missing(issues: IssueSink, contentId: string, what: string): void {
  issues.push({ code: 'invalid_value', contentId, message: `${what} is required` });
}

function checkNumber(
  record: Record<string, unknown>,
  field: string,
  context: { contentId: string; describe: string; issues: IssueSink },
  minimum: number,
  inclusive: boolean,
): void {
  const value = record[field];
  const valid =
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (inclusive ? value >= minimum : value > minimum);
  if (!valid) {
    context.issues.push({
      code: 'invalid_value',
      contentId: context.contentId,
      message: `${context.describe} ${field} must be a finite number ${inclusive ? '>=' : '>'} ${minimum}`,
    });
  }
}

function checkFlag(
  record: Record<string, unknown>,
  field: string,
  context: { contentId: string; describe: string; issues: IssueSink },
): void {
  if (typeof record[field] !== 'boolean') {
    context.issues.push({
      code: 'invalid_value',
      contentId: context.contentId,
      message: `${context.describe} ${field} must be a boolean`,
    });
  }
}

function checkEnum(
  record: Record<string, unknown>,
  field: string,
  allowed: readonly string[],
  context: { contentId: string; describe: string; issues: IssueSink },
): void {
  const value = record[field];
  if (typeof value !== 'string' || !allowed.includes(value)) {
    context.issues.push({
      code: 'invalid_value',
      contentId: context.contentId,
      message: `${context.describe} ${field} must be one of ${allowed.join(', ')}`,
    });
  }
}

function validateBaseAttack(
  base: unknown,
  contentId: string,
  issues: IssueSink,
): void {
  if (base === undefined) {
    return;
  }
  const context = { contentId, describe: 'base attack', issues };
  if (!isRecord(base)) {
    issues.push({ code: 'invalid_definition', contentId, message: 'base attack must be an object' });
    return;
  }

  checkEnum(base, 'delivery', DELIVERIES, context);
  checkNumber(base, 'damage', context, 0, true);
  checkNumber(base, 'cooldownTicks', context, 0, true);
  checkNumber(base, 'range', context, 0, true);
  checkNumber(base, 'halfAngleRadians', context, 0, true);
  checkNumber(base, 'speed', context, 0, true);

  if (base.delivery === 'direct') {
    checkNumber(base, 'range', context, 0, false);
    checkNumber(base, 'halfAngleRadians', context, 0, false);
    if (typeof base.halfAngleRadians === 'number' && base.halfAngleRadians > Math.PI) {
      issues.push({
        code: 'invalid_value',
        contentId,
        message: 'base attack halfAngleRadians must be at most half a turn',
      });
    }
  } else if (base.delivery === 'projectile') {
    checkNumber(base, 'speed', context, 0, false);
  }
}

const PAYLOAD_KINDS: readonly string[] = ['water', 'physical'];
const ITEM_CAPABILITIES: readonly string[] = ['emitter_carrier'];
const MAX_PATTERN_OFFSETS = 16;

function validateCapabilities(
  capabilities: unknown,
  contentId: string,
  issues: IssueSink,
): void {
  if (capabilities === undefined) {
    return;
  }
  if (!Array.isArray(capabilities)) {
    issues.push({
      code: 'invalid_definition',
      contentId,
      message: 'item definition capabilities must be an array',
    });
    return;
  }
  const seen = new Set<string>();
  for (const capability of capabilities) {
    if (typeof capability !== 'string' || !ITEM_CAPABILITIES.includes(capability)) {
      issues.push({
        code: 'invalid_value',
        contentId,
        message: `unknown item capability ${describe(capability)}`,
      });
      continue;
    }
    if (seen.has(capability)) {
      issues.push({
        code: 'invalid_value',
        contentId,
        message: `duplicate item capability "${capability}"`,
      });
    }
    seen.add(capability);
  }
}

function validatePattern(
  pattern: unknown,
  context: { contentId: string; describe: string; issues: IssueSink },
): void {
  if (!Array.isArray(pattern) || pattern.length === 0) {
    context.issues.push({
      code: 'invalid_value',
      contentId: context.contentId,
      message: `${context.describe} angularOffsetsRadians must list 1 to ${MAX_PATTERN_OFFSETS} offsets`,
    });
    return;
  }
  if (pattern.length > MAX_PATTERN_OFFSETS) {
    context.issues.push({
      code: 'invalid_value',
      contentId: context.contentId,
      message: `${context.describe} angularOffsetsRadians must list at most ${MAX_PATTERN_OFFSETS} offsets`,
    });
  }
  for (const offset of pattern) {
    if (typeof offset !== 'number' || !Number.isFinite(offset)) {
      context.issues.push({
        code: 'invalid_value',
        contentId: context.contentId,
        message: `${context.describe} angularOffsetsRadians offsets must be finite numbers`,
      });
      return;
    }
  }
}

function validatePayloadOnHit(
  payloadKind: unknown,
  onHit: unknown,
  context: { contentId: string; describe: string; issues: IssueSink },
): void {
  if (onHit === null) {
    return;
  }
  if (!isRecord(onHit)) {
    missing(context.issues, context.contentId, `${context.describe} onHit`);
    return;
  }
  checkEnum(onHit, 'status', ['wet'], context);
  checkNumber(onHit, 'ticks', context, 0, false);
  if (payloadKind === 'physical') {
    context.issues.push({
      code: 'invalid_value',
      contentId: context.contentId,
      message: `${context.describe} physical payloads cannot carry a Wet onHit`,
    });
  }
}

function validateWetPatch(
  patch: unknown,
  context: { contentId: string; describe: string; issues: IssueSink },
): void {
  if (!isRecord(patch)) {
    missing(context.issues, context.contentId, `${context.describe} terminalWetPatch`);
    return;
  }
  checkNumber(patch, 'radius', context, 0, false);
  checkNumber(patch, 'ticks', context, 0, false);
}

function validateEffectNumbers(
  kind: string,
  effect: Record<string, unknown>,
  context: { contentId: string; describe: string; issues: IssueSink },
): void {
  switch (kind) {
    case 'projectile_payload':
      checkEnum(effect, 'payloadKind', PAYLOAD_KINDS, context);
      validatePattern(effect.angularOffsetsRadians, context);
      checkNumber(effect, 'damage', context, 0, true);
      checkNumber(effect, 'speed', context, 0, false);
      checkNumber(effect, 'radius', context, 0, false);
      checkNumber(effect, 'lifetimeTicks', context, 0, false);
      validatePayloadOnHit(effect.payloadKind, effect.onHit, context);
      return;
    case 'projectile_conversion':
      checkEnum(effect, 'converts', ['water_projectile'], context);
      checkEnum(effect, 'result', ['drifting_bubble'], context);
      checkNumber(effect, 'speed', context, 0, false);
      checkNumber(effect, 'minRadius', context, 0, false);
      checkNumber(effect, 'lifetimeTicks', context, 0, false);
      checkFlag(effect, 'penetrates', context);
      checkFlag(effect, 'recordsHitPerPass', context);
      validateWetPatch(effect.terminalWetPatch, context);
      return;
    case 'status_modifier':
      checkEnum(effect, 'status', ['sticky'], context);
      checkNumber(effect, 'ticks', context, 0, false);
      checkNumber(effect, 'slowMultiplier', context, 0, false);
      checkNumber(effect, 'slowFloor', context, 0, false);
      if (
        typeof effect.slowMultiplier === 'number' &&
        typeof effect.slowFloor === 'number' &&
        effect.slowMultiplier < effect.slowFloor
      ) {
        context.issues.push({
          code: 'invalid_value',
          contentId: context.contentId,
          message: `${context.describe} slowMultiplier must not be below slowFloor`,
        });
      }
      return;
    case 'conductive_reaction':
      checkNumber(effect, 'chainStartsPerRoot', context, 0, false);
      checkNumber(effect, 'maxAdditionalTargets', context, 0, false);
      checkNumber(effect, 'baseRange', context, 0, false);
      checkFlag(effect, 'visitsEachTargetOnce', context);
      return;
    case 'conductive_range':
      checkNumber(effect, 'range', context, 0, false);
      checkFlag(effect, 'weakDischarge', context);
      return;
    case 'trajectory_replay':
      checkNumber(effect, 'returnPasses', context, 0, false);
      checkFlag(effect, 'activatesOncePerRoot', context);
      return;
    case 'projectile_geometry':
      checkNumber(effect, 'radiusBonus', context, 0, false);
      checkNumber(effect, 'speedMultiplier', context, 0, false);
      return;
    default:
      return;
  }
}

function validateEffect(effect: unknown, definitionId: string, index: number, issues: IssueSink): void {
  const contentId = definitionId;
  if (!isRecord(effect)) {
    issues.push({
      code: 'unsupported_effect',
      contentId,
      message: `effect ${index} must be an object`,
    });
    return;
  }

  const kind = effect.kind;
  if (typeof kind !== 'string' || !(EFFECT_KINDS as readonly string[]).includes(kind)) {
    issues.push({
      code: 'unsupported_effect',
      contentId,
      message: `effect ${index} uses unsupported kind ${describe(kind)}`,
    });
    return;
  }

  const context = { contentId, describe: `effect ${index} (${kind})`, issues };
  const expectedStage = EFFECT_STAGE_BY_KIND[kind as keyof typeof EFFECT_STAGE_BY_KIND];
  if (effect.stage !== expectedStage) {
    issues.push({
      code: 'invalid_value',
      contentId,
      message: `effect ${index} (${kind}) must use stage "${expectedStage}"`,
    });
  }
  if (effect.sourceItemId !== definitionId) {
    issues.push({
      code: 'invalid_reference',
      contentId,
      message: `effect ${index} (${kind}) references source item ${describe(effect.sourceItemId)}`,
    });
  }
  if (
    typeof effect.priority !== 'number' ||
    !Number.isInteger(effect.priority) ||
    effect.priority < 0
  ) {
    issues.push({
      code: 'invalid_value',
      contentId,
      message: `effect ${index} (${kind}) priority must be a non-negative integer`,
    });
  }
  if (typeof effect.label !== 'string' || effect.label.length === 0) {
    issues.push({
      code: 'invalid_value',
      contentId,
      message: `effect ${index} (${kind}) needs a non-empty label`,
    });
  }
  validateEffectNumbers(kind, effect, context);
}

/** Collects every catalog problem instead of stopping at the first. */
export function findCatalogIssues(definitions: unknown): CatalogIssue[] {
  const issues: IssueSink = [];
  if (!Array.isArray(definitions)) {
    issues.push({
      code: 'invalid_definition',
      contentId: '<catalog>',
      message: 'item catalog must be an array of definitions',
    });
    return issues;
  }
  if (definitions.length === 0) {
    issues.push({
      code: 'invalid_definition',
      contentId: '<catalog>',
      message: 'item catalog must define at least one item',
    });
    return issues;
  }

  const seenIds = new Set<string>();
  definitions.forEach((definition: unknown, index: number) => {
    if (!isRecord(definition)) {
      issues.push({
        code: 'invalid_definition',
        contentId: `<index ${index}>`,
        message: 'item definition must be an object',
      });
      return;
    }

    const id = definition.id;
    if (typeof id !== 'string' || !ITEM_ID_PATTERN.test(id)) {
      issues.push({
        code: 'invalid_definition',
        contentId: typeof id === 'string' ? id : `<index ${index}>`,
        message: 'item definition id must be a non-empty lower_snake_case string',
      });
      return;
    }
    if (seenIds.has(id)) {
      issues.push({ code: 'duplicate_id', contentId: id, message: 'duplicate item definition id' });
      return;
    }
    seenIds.add(id);

    for (const field of ['name', 'summary'] as const) {
      const value = definition[field];
      if (typeof value !== 'string' || value.length === 0) {
        issues.push({
          code: 'invalid_definition',
          contentId: id,
          message: `item definition ${field} must be a non-empty string`,
        });
      }
    }

    validateCapabilities(definition.capabilities, id, issues);

    validateBaseAttack(definition.base, id, issues);

    const effects = definition.effects;
    if (!Array.isArray(effects)) {
      issues.push({
        code: 'invalid_definition',
        contentId: id,
        message: 'item definition effects must be an array',
      });
      return;
    }
    effects.forEach((effect: unknown, effectIndex: number) => {
      validateEffect(effect, id, effectIndex, issues);
    });
  });

  return issues;
}

/**
 * Throws with every offending content ID when a catalog is malformed: duplicate
 * IDs, invalid finite values, unsupported effect kinds, and invalid references.
 */
export function validateCatalog(definitions: readonly ItemDefinition[]): void {
  const issues = findCatalogIssues(definitions);
  if (issues.length === 0) {
    return;
  }
  const details = issues
    .map((issue) => `- [${issue.code}] ${issue.contentId}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid item catalog:\n${details}`);
}
