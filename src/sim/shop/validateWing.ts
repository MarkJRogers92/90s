/**
 * Content validation for the M3 wing.
 *
 * The wing is authored data, so every rule that could make a store, offer, or
 * security zone unusable is checked here instead of being discovered by the
 * central tick. Every issue names the offending content ID so a bad definition
 * points straight at the data that has to change.
 */
import type { ItemDefinition } from '../items/types';
import type { Rect, Vec2 } from '../model';
import type { WingDefinition } from './types';
import { WING_PLAYER_RADIUS } from './types';

export type WingIssueCode =
  | 'duplicate_id'
  | 'invalid_definition'
  | 'invalid_value'
  | 'invalid_reference'
  | 'invalid_geometry'
  | 'incomplete_catalog';

export type WingIssue = {
  readonly code: WingIssueCode;
  /** Offending content ID: the wing, store, offer, wall, or item that is wrong. */
  readonly contentId: string;
  readonly message: string;
};

type IssueSink = WingIssue[];

const CONTENT_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;
/** Sampled angles used to prove a swept cone stays inside its store. */
const CONE_SAMPLE_COUNT = 32;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function describe(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : String(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function checkNumber(
  value: unknown,
  issues: IssueSink,
  contentId: string,
  label: string,
  minimum: number,
  inclusive: boolean,
): boolean {
  if (!isFiniteNumber(value) || (inclusive ? value < minimum : value <= minimum)) {
    issues.push({
      code: 'invalid_value',
      contentId,
      message: `${label} must be a finite number ${inclusive ? '>=' : '>'} ${minimum}`,
    });
    return false;
  }
  return true;
}

function checkInteger(
  value: unknown,
  issues: IssueSink,
  contentId: string,
  label: string,
): boolean {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    issues.push({
      code: 'invalid_value',
      contentId,
      message: `${label} must be a positive integer`,
    });
    return false;
  }
  return true;
}

function checkFinite(
  value: unknown,
  issues: IssueSink,
  contentId: string,
  label: string,
): boolean {
  if (!isFiniteNumber(value)) {
    issues.push({
      code: 'invalid_value',
      contentId,
      message: `${label} must be a finite number`,
    });
    return false;
  }
  return true;
}

function checkName(
  value: unknown,
  issues: IssueSink,
  contentId: string,
  label: string,
): void {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push({
      code: 'invalid_definition',
      contentId,
      message: `${label} must be a non-empty string`,
    });
  }
}

function checkContentId(
  value: unknown,
  issues: IssueSink,
  contentId: string,
  label: string,
): boolean {
  if (typeof value !== 'string' || !CONTENT_ID_PATTERN.test(value)) {
    issues.push({
      code: 'invalid_definition',
      contentId,
      message: `${label} must be a non-empty lower-case content ID`,
    });
    return false;
  }
  return true;
}

function readRect(
  value: unknown,
  issues: IssueSink,
  contentId: string,
  label: string,
): Rect | null {
  if (!isRecord(value)) {
    issues.push({
      code: 'invalid_geometry',
      contentId,
      message: `${label} must be an object with x, y, width, and height`,
    });
    return null;
  }
  const valid =
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height) &&
    value.width > 0 &&
    value.height > 0;
  if (!valid) {
    issues.push({
      code: 'invalid_geometry',
      contentId,
      message: `${label} must be finite with a positive width and height`,
    });
    return null;
  }
  return { x: value.x as number, y: value.y as number, width: value.width as number, height: value.height as number };
}

function readPoint(
  value: unknown,
  issues: IssueSink,
  contentId: string,
  label: string,
): Vec2 | null {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    issues.push({
      code: 'invalid_geometry',
      contentId,
      message: `${label} must be a finite point`,
    });
    return null;
  }
  return { x: value.x, y: value.y };
}

function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function pointInRect(point: Vec2, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/** Edge-touching rectangles do not count as overlapping. */
function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/**
 * The authored zone sweeps between `center - sweep` and `center + sweep`, so
 * the reachable union is a sector at most `arcDegrees` wide around each facing.
 * Sampling the full and half range is enough to prove containment in a convex
 * rectangle while staying deterministic.
 */
function coneInsideStore(
  origin: Vec2,
  range: number,
  arcDegrees: number,
  centerRadians: number,
  sweepRadians: number,
  storeBounds: Rect,
): boolean {
  const halfArc = ((arcDegrees / 2) * Math.PI) / 180;
  const minAngle = centerRadians - sweepRadians - halfArc;
  const maxAngle = centerRadians + sweepRadians + halfArc;

  for (let index = 0; index <= CONE_SAMPLE_COUNT; index += 1) {
    const angle = minAngle + ((maxAngle - minAngle) * index) / CONE_SAMPLE_COUNT;
    for (const radius of [range, range / 2]) {
      const point = {
        x: origin.x + Math.cos(angle) * radius,
        y: origin.y + Math.sin(angle) * radius,
      };
      if (!pointInRect(point, storeBounds)) {
        return false;
      }
    }
  }
  return true;
}

type StoreFacts = {
  readonly id: string;
  readonly bounds: Rect | null;
  readonly offerIds: readonly string[];
};

function readStoreOfferIds(value: unknown, issues: IssueSink, contentId: string): readonly string[] {
  if (!Array.isArray(value)) {
    issues.push({
      code: 'invalid_definition',
      contentId,
      message: 'store offerIds must be an array',
    });
    return [];
  }
  if (value.length === 0) {
    issues.push({
      code: 'invalid_value',
      contentId,
      message: 'store must reference at least one offer',
    });
  }
  const seen = new Set<string>();
  for (const offerId of value) {
    if (typeof offerId !== 'string' || !CONTENT_ID_PATTERN.test(offerId)) {
      issues.push({
        code: 'invalid_definition',
        contentId,
        message: `store offerIds must be content IDs, found ${describe(offerId)}`,
      });
      continue;
    }
    if (seen.has(offerId)) {
      issues.push({
        code: 'duplicate_id',
        contentId,
        message: `store lists offer ${offerId} more than once`,
      });
      continue;
    }
    seen.add(offerId);
  }
  return value.filter((offerId): offerId is string => typeof offerId === 'string');
}

function validateStore(
  raw: Record<string, unknown>,
  wingBounds: Rect | null,
  walls: readonly Rect[],
  storeIds: Set<string>,
  issues: IssueSink,
): StoreFacts {
  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : '<store>';
  if (checkContentId(raw.id, issues, id, 'store id') && storeIds.has(id)) {
    issues.push({ code: 'duplicate_id', contentId: id, message: 'duplicate store id' });
  } else {
    storeIds.add(id);
  }
  checkName(raw.name, issues, id, 'store name');

  const bounds = readRect(raw.bounds, issues, id, 'store bounds');
  if (bounds && wingBounds && !rectContains(wingBounds, bounds)) {
    issues.push({
      code: 'invalid_geometry',
      contentId: id,
      message: 'store bounds must lie inside the wing bounds',
    });
  }

  const resetPoint = readPoint(raw.resetPoint, issues, id, 'store reset point');
  if (resetPoint) {
    if (wingBounds && !pointInRect(resetPoint, wingBounds)) {
      issues.push({
        code: 'invalid_geometry',
        contentId: id,
        message: 'store reset point must lie inside the wing bounds',
      });
    }
    if (walls.some((wall) => pointInRect(resetPoint, wall))) {
      issues.push({
        code: 'invalid_geometry',
        contentId: id,
        message: 'store reset point must not sit inside a wall',
      });
    }
  }

  const exit = isRecord(raw.exit) ? raw.exit : null;
  if (!exit) {
    issues.push({
      code: 'invalid_definition',
      contentId: id,
      message: 'store exit must be an object with a stable id and bounds',
    });
  } else {
    checkContentId(exit.id, issues, id, 'store exit id');
    checkName(exit.label, issues, id, 'store exit label');
    const exitBounds = readRect(exit.bounds, issues, id, 'store exit bounds');
    if (exitBounds) {
      if (bounds && !rectContains(bounds, exitBounds)) {
        issues.push({
          code: 'invalid_geometry',
          contentId: id,
          message: 'store exit must lie inside the store bounds',
        });
      } else if (bounds && exitBounds.y + exitBounds.height !== bounds.y + bounds.height) {
        issues.push({
          code: 'invalid_geometry',
          contentId: id,
          message: 'store exit must sit on the store front edge',
        });
      }
      if (walls.some((wall) => rectsOverlap(wall, exitBounds))) {
        issues.push({
          code: 'invalid_geometry',
          contentId: id,
          message: 'store exit must not be blocked by a wall',
        });
      }
      if (exitBounds.width < WING_PLAYER_RADIUS * 2) {
        issues.push({
          code: 'invalid_geometry',
          contentId: id,
          message: `store exit must be at least ${WING_PLAYER_RADIUS * 2} wide to be usable`,
        });
      }
    }
  }

  const zone = isRecord(raw.sightZone) ? raw.sightZone : null;
  if (!zone) {
    issues.push({
      code: 'invalid_definition',
      contentId: id,
      message: 'store sight zone must be an object',
    });
  } else {
    const origin = readPoint(zone.origin, issues, id, 'store sight zone origin');
    const rangeOk = checkNumber(zone.range, issues, id, 'store sight zone range', 0, false);
    const arcOk = checkNumber(zone.arcDegrees, issues, id, 'store sight zone arcDegrees', 0, false);
    const centerOk = checkFinite(zone.centerRadians, issues, id, 'store sight zone centerRadians');
    const sweepOk = checkNumber(
      zone.sweepRadians,
      issues,
      id,
      'store sight zone sweepRadians',
      0,
      true,
    );
    checkInteger(zone.sweepTicksPerEndpoint, issues, id, 'store sight zone sweepTicksPerEndpoint');
    if (arcOk && (zone.arcDegrees as number) > 180) {
      issues.push({
        code: 'invalid_value',
        contentId: id,
        message: 'store sight zone arcDegrees must not exceed a half turn',
      });
    }
    if (sweepOk && (zone.sweepRadians as number) > Math.PI / 2) {
      issues.push({
        code: 'invalid_value',
        contentId: id,
        message: 'store sight zone sweepRadians must not exceed a quarter turn either side',
      });
    }
    if (origin && bounds) {
      if (!pointInRect(origin, bounds)) {
        issues.push({
          code: 'invalid_geometry',
          contentId: id,
          message: 'store sight zone origin must lie inside the store bounds',
        });
      } else if (rangeOk && arcOk && centerOk && sweepOk) {
        const contained = coneInsideStore(
          origin,
          zone.range as number,
          zone.arcDegrees as number,
          zone.centerRadians as number,
          zone.sweepRadians as number,
          bounds,
        );
        if (!contained) {
          issues.push({
            code: 'invalid_geometry',
            contentId: id,
            message: 'store sight zone must stay inside the store bounds',
          });
        }
      }
    }
  }

  const offerIds = readStoreOfferIds(raw.offerIds, issues, id);
  return { id, bounds, offerIds };
}

function findWingIssues(input: unknown, itemDefinitions: readonly ItemDefinition[]): WingIssue[] {
  const issues: IssueSink = [];

  if (!isRecord(input)) {
    issues.push({
      code: 'invalid_definition',
      contentId: '<wing>',
      message: 'wing definition must be an object',
    });
    return issues;
  }

  const wingId =
    typeof input.id === 'string' && input.id.length > 0 ? input.id : '<orchard-gate-wing>';
  checkContentId(input.id, issues, wingId, 'wing id');
  checkName(input.name, issues, wingId, 'wing name');
  const widthOk = checkNumber(input.width, issues, wingId, 'wing width', 0, false);
  const heightOk = checkNumber(input.height, issues, wingId, 'wing height', 0, false);
  checkNumber(input.startingCash, issues, wingId, 'wing startingCash', 0, true);

  const wingBounds = readRect(input.bounds, issues, wingId, 'wing bounds');
  if (
    wingBounds &&
    widthOk &&
    heightOk &&
    !rectContains(
      { x: 0, y: 0, width: input.width as number, height: input.height as number },
      wingBounds,
    )
  ) {
    issues.push({
      code: 'invalid_geometry',
      contentId: wingId,
      message: 'wing bounds must lie inside the wing width and height',
    });
  }

  const walls: Rect[] = [];
  if (!Array.isArray(input.walls)) {
    issues.push({
      code: 'invalid_definition',
      contentId: wingId,
      message: 'wing walls must be an array',
    });
  } else {
    input.walls.forEach((raw, index) => {
      const contentId = `wall-${index}`;
      const rect = readRect(raw, issues, contentId, 'wall');
      if (!rect) {
        return;
      }
      walls.push(rect);
      if (wingBounds && !rectContains(wingBounds, rect)) {
        issues.push({
          code: 'invalid_geometry',
          contentId,
          message: 'wall must lie inside the wing bounds',
        });
      }
    });
  }

  const spawn = readPoint(input.playerSpawn, issues, wingId, 'wing playerSpawn');
  if (spawn) {
    if (wingBounds && !pointInRect(spawn, wingBounds)) {
      issues.push({
        code: 'invalid_geometry',
        contentId: wingId,
        message: 'wing playerSpawn must lie inside the wing bounds',
      });
    }
    if (walls.some((wall) => pointInRect(spawn, wall))) {
      issues.push({
        code: 'invalid_geometry',
        contentId: wingId,
        message: 'wing playerSpawn must not sit inside a wall',
      });
    }
  }

  const mallExit = isRecord(input.mallExit) ? input.mallExit : null;
  if (!mallExit) {
    issues.push({
      code: 'invalid_definition',
      contentId: wingId,
      message: 'wing mallExit must be an object',
    });
  } else {
    const mallExitId =
      typeof mallExit.id === 'string' && mallExit.id.length > 0 ? mallExit.id : '<mall-exit>';
    checkContentId(mallExit.id, issues, mallExitId, 'mall exit id');
    checkName(mallExit.label, issues, mallExitId, 'mall exit label');
    const mallExitBounds = readRect(mallExit.bounds, issues, mallExitId, 'mall exit bounds');
    if (mallExitBounds && wingBounds && !rectContains(wingBounds, mallExitBounds)) {
      issues.push({
        code: 'invalid_geometry',
        contentId: mallExitId,
        message: 'mall exit bounds must lie inside the wing bounds',
      });
    }
  }

  const stores: StoreFacts[] = [];
  const storeIds = new Set<string>();
  if (!Array.isArray(input.stores) || input.stores.length === 0) {
    issues.push({
      code: 'invalid_definition',
      contentId: wingId,
      message: 'wing must define at least one store',
    });
  } else {
    for (const raw of input.stores) {
      if (!isRecord(raw)) {
        issues.push({
          code: 'invalid_definition',
          contentId: '<store>',
          message: 'store definition must be an object',
        });
        continue;
      }
      stores.push(validateStore(raw, wingBounds, walls, storeIds, issues));
    }
  }

  const itemList = Array.isArray(itemDefinitions) ? itemDefinitions : [];
  if (itemList.length === 0) {
    issues.push({
      code: 'invalid_definition',
      contentId: '<item-catalog>',
      message: 'item catalog must define at least one item',
    });
  }
  const knownItemIds = new Set(itemList.map((definition) => definition?.id));

  if (!Array.isArray(input.offers)) {
    issues.push({
      code: 'invalid_definition',
      contentId: wingId,
      message: 'wing offers must be an array',
    });
    return issues;
  }

  const offeredItemIds: string[] = [];
  const offerStoreIds = new Map<string, string>();
  const offerIds = new Set<string>();

  for (const raw of input.offers) {
    if (!isRecord(raw)) {
      issues.push({
        code: 'invalid_definition',
        contentId: '<offer>',
        message: 'offer definition must be an object',
      });
      continue;
    }
    const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : '<offer>';
    if (checkContentId(raw.id, issues, id, 'offer id') && offerIds.has(id)) {
      issues.push({ code: 'duplicate_id', contentId: id, message: 'duplicate offer id' });
    } else {
      offerIds.add(id);
    }

    const itemDefinitionId =
      typeof raw.itemDefinitionId === 'string' ? raw.itemDefinitionId : '<offer>';
    if (!knownItemIds.has(itemDefinitionId)) {
      issues.push({
        code: 'invalid_reference',
        contentId: id,
        message: `offer references unknown item definition ${describe(raw.itemDefinitionId)}`,
      });
    } else {
      offeredItemIds.push(itemDefinitionId);
    }

    const storeId = typeof raw.storeId === 'string' && raw.storeId.length > 0 ? raw.storeId : id;
    const store = stores.find((candidate) => candidate.id === storeId);
    if (!store) {
      issues.push({
        code: 'invalid_reference',
        contentId: id,
        message: `offer references unknown store ${describe(raw.storeId)}`,
      });
    } else {
      offerStoreIds.set(id, store.id);
      if (!store.offerIds.includes(id)) {
        issues.push({
          code: 'invalid_reference',
          contentId: id,
          message: `offer is not listed by store ${store.id}`,
        });
      }
    }

    checkNumber(raw.price, issues, id, 'offer price', 0, false);

    const position = readPoint(raw.position, issues, id, 'offer position');
    if (position && store?.bounds && !pointInRect(position, store.bounds)) {
      issues.push({
        code: 'invalid_geometry',
        contentId: id,
        message: `offer position must lie inside store ${store.id}`,
      });
    }
  }

  for (const store of stores) {
    for (const offerId of store.offerIds) {
      if (!offerIds.has(offerId)) {
        issues.push({
          code: 'invalid_reference',
          contentId: store.id,
          message: `store references unknown offer ${offerId}`,
        });
      } else if (offerStoreIds.get(offerId) !== store.id) {
        issues.push({
          code: 'invalid_reference',
          contentId: store.id,
          message: `store ${store.id} references offer ${offerId} owned by another store`,
        });
      }
    }
  }

  for (const definition of itemList) {
    const itemId = definition?.id;
    if (typeof itemId !== 'string') {
      continue;
    }
    const offered = offeredItemIds.filter((candidate) => candidate === itemId).length;
    if (offered !== 1) {
      issues.push({
        code: 'incomplete_catalog',
        contentId: itemId,
        message:
          offered === 0
            ? 'wing must offer this item exactly once'
            : `wing offers this item ${offered} times; exactly one is required`,
      });
    }
  }

  return issues;
}

/**
 * Throws with every offending content ID when a wing is malformed. Validating
 * before a run exists keeps unusable stores, offers, and sight zones out of the
 * authoritative state entirely.
 */
export function validateWing(
  definition: WingDefinition,
  itemDefinitions: readonly ItemDefinition[],
): void {
  const issues = findWingIssues(definition as unknown, itemDefinitions);
  if (issues.length === 0) {
    return;
  }
  const details = issues
    .map((issue) => `- [${issue.code}] ${issue.contentId}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid wing definition:\n${details}`);
}
