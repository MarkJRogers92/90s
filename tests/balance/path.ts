/**
 * Grid pathfinding for the balance bot.
 *
 * The room is 960x480 and every solid thing in it (walls, pillars, shutters,
 * soda machines, fallen racks) is in `combat.walls`, so one grid built from
 * that list is the whole map. Cells are blocked when a janitor-sized circle
 * centred in them would touch a wall. A breadth-first distance field is grown
 * out from the goal; the way on is the neighbouring cell with the smallest
 * distance. When a straight line is already clear the field is skipped, which
 * keeps fights (where the goal moves every tick) cheap.
 */
import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH, circleIntersectsRect } from '../../src/sim/core/geometry';
import type { Rect, Vec2 } from '../../src/sim/model';

const CELL = 8;
const COLS = Math.ceil(PLAYFIELD_WIDTH / CELL);
const ROWS = Math.ceil(PLAYFIELD_HEIGHT / CELL);
const UNREACHED = 0xffff;
/** Padding beyond the body so the route keeps off walls the body would graze. */
const MARGIN = 2;
const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const wallsKey = (walls: readonly Rect[]): string => walls.map((wall) => `${wall.x},${wall.y},${wall.width},${wall.height}`).join('|');
const cellOf = (point: Vec2): number => Math.min(ROWS - 1, Math.max(0, Math.floor(point.y / CELL))) * COLS + Math.min(COLS - 1, Math.max(0, Math.floor(point.x / CELL)));
const centreOf = (cell: number): Vec2 => ({ x: (cell % COLS) * CELL + CELL / 2, y: Math.floor(cell / COLS) * CELL + CELL / 2 });

export class Navigator {
  private key = '';
  private blocked = new Uint8Array(COLS * ROWS);
  private field = new Uint16Array(COLS * ROWS);
  private fieldGoal = -1;
  private fieldKey = '';

  /** A circle of `radius` can stand at `at` without touching a wall or leaving the room. */
  static clear(walls: readonly Rect[], radius: number, at: Vec2): boolean {
    if (at.x < radius || at.y < radius || at.x > PLAYFIELD_WIDTH - radius || at.y > PLAYFIELD_HEIGHT - radius) return false;
    return !walls.some((wall) => circleIntersectsRect(at.x, at.y, radius, wall));
  }

  /** True when a body walking the straight line from `from` to `to` meets nothing. */
  static lineClear(walls: readonly Rect[], radius: number, from: Vec2, to: Vec2): boolean {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(length / 5));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      if (!Navigator.clear(walls, radius, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })) return false;
    }
    return true;
  }

  private ensureBlocked(walls: readonly Rect[], radius: number): void {
    const key = `${radius}:${wallsKey(walls)}`;
    if (key === this.key) return;
    this.key = key;
    for (let cell = 0; cell < COLS * ROWS; cell += 1) {
      this.blocked[cell] = Navigator.clear(walls, radius + MARGIN, centreOf(cell)) ? 0 : 1;
    }
    this.fieldGoal = -1;
  }

  /** The nearest unblocked cell to a goal that may itself sit inside a wall. */
  private openCellNear(goal: Vec2): number {
    const origin = cellOf(goal);
    if (this.blocked[origin] === 0) return origin;
    const seen = new Set<number>([origin]);
    let ring = [origin];
    for (let depth = 0; depth < 12 && ring.length > 0; depth += 1) {
      const next: number[] = [];
      for (const cell of ring) {
        for (const [dx, dy] of NEIGHBOURS) {
          const column = (cell % COLS) + dx;
          const row = Math.floor(cell / COLS) + dy;
          if (column < 0 || row < 0 || column >= COLS || row >= ROWS) continue;
          const neighbour = row * COLS + column;
          if (seen.has(neighbour)) continue;
          seen.add(neighbour);
          if (this.blocked[neighbour] === 0) return neighbour;
          next.push(neighbour);
        }
      }
      ring = next;
    }
    return origin;
  }

  private grow(goalCell: number): void {
    this.field.fill(UNREACHED);
    this.field[goalCell] = 0;
    const queue: number[] = [goalCell];
    for (let head = 0; head < queue.length; head += 1) {
      const cell = queue[head]!;
      const column = cell % COLS;
      const row = Math.floor(cell / COLS);
      const here = this.field[cell]!;
      for (const [dx, dy] of NEIGHBOURS) {
        const nextColumn = column + dx;
        const nextRow = row + dy;
        if (nextColumn < 0 || nextRow < 0 || nextColumn >= COLS || nextRow >= ROWS) continue;
        const neighbour = nextRow * COLS + nextColumn;
        if (this.blocked[neighbour] === 1 || this.field[neighbour]! !== UNREACHED) continue;
        // No cutting a corner between two blocked cells.
        if (dx !== 0 && dy !== 0 && (this.blocked[row * COLS + nextColumn] === 1 || this.blocked[nextRow * COLS + column] === 1)) continue;
        this.field[neighbour] = here + 1;
        queue.push(neighbour);
      }
    }
  }

  /**
   * A unit vector for the next stretch of the way from `from` to `goal`, or
   * null when the goal cannot be reached from here.
   */
  direction(walls: readonly Rect[], radius: number, from: Vec2, goal: Vec2): Vec2 | null {
    const toGoal = (point: Vec2): Vec2 => {
      const length = Math.hypot(point.x - from.x, point.y - from.y);
      return length < 1e-6 ? { x: 0, y: 0 } : { x: (point.x - from.x) / length, y: (point.y - from.y) / length };
    };
    if (Navigator.lineClear(walls, radius, from, goal)) return toGoal(goal);

    this.ensureBlocked(walls, radius);
    const goalCell = this.openCellNear(goal);
    const fieldKey = this.key;
    if (goalCell !== this.fieldGoal || fieldKey !== this.fieldKey) {
      this.grow(goalCell);
      this.fieldGoal = goalCell;
      this.fieldKey = fieldKey;
    }

    // Walk the gradient a few cells, as far as the straight line to it stays clear.
    let cell = cellOf(from);
    let waypoint: Vec2 | null = null;
    for (let hop = 0; hop < 12; hop += 1) {
      const column = cell % COLS;
      const row = Math.floor(cell / COLS);
      let best = -1;
      let bestValue = this.field[cell]!;
      for (const [dx, dy] of NEIGHBOURS) {
        const nextColumn = column + dx;
        const nextRow = row + dy;
        if (nextColumn < 0 || nextRow < 0 || nextColumn >= COLS || nextRow >= ROWS) continue;
        const neighbour = nextRow * COLS + nextColumn;
        if (this.blocked[neighbour] === 1) continue;
        const value = this.field[neighbour]!;
        if (value < bestValue) {
          bestValue = value;
          best = neighbour;
        }
      }
      if (best < 0) break;
      const point = centreOf(best);
      if (waypoint !== null && !Navigator.lineClear(walls, radius, from, point)) break;
      waypoint = point;
      cell = best;
      if (this.field[best] === 0) break;
    }
    return waypoint === null ? null : toGoal(waypoint);
  }
}
