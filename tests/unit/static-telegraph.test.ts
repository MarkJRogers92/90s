import { afterEach, describe, expect, it, vi } from 'vitest';
import { MvpRunView } from '../../src/game/view/MvpRunView';
import { CombatFeedback } from '../../src/game/view/CombatFeedback';
import { enemyWindups } from '../../src/game/view/combatBeats';
import { DEFAULT_SETTINGS, gameSettings } from '../../src/game/settings/settings';
import { STATIC_BURST_RADIUS } from '../../src/sim/combat/staticEnemy';
import { enemyRenderer } from '../support/enemy-renderer';
import type { EnemyState } from '../../src/sim/model';
vi.mock('phaser', () => ({ default: { BlendModes: { ADD: 1 }, TintModes: { FILL: 1, MULTIPLY: 0 }, Math: { Vector2: class { constructor(public x: number, public y: number) {} } } } }));
const player = { x: 400, y: 200, health: 6, invulnerableTicks: 0 };
const enemy = (health = 8): EnemyState => ({ id: 1, kind: 'static', x: 100, y: 200, health, radius: 14, phase: 'telegraph', phaseTicks: 1, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0, blinkX: 300, blinkY: 250 } as EnemyState);
afterEach(() => gameSettings().update(DEFAULT_SETTINGS));
describe('Static material reactions preserve the real teleport warning', () => {
  it.each(['full', 'reduced'] as const)('keeps exact landing geometry and fixed overlay in %s flashes during hurt', (flashes) => {
    gameSettings().update({ flashes });
    const { scene } = enemyRenderer(), feedback = new CombatFeedback(scene);
    feedback.sync('room', 0, [enemy()], player, false, [], () => 'north');
    feedback.sync('room', 1, [enemy(7)], player, false, [], () => 'north');
    expect(feedback.hurtFor('enemy:1', 1)).not.toBeNull();
    expect(feedback.hurtFor('enemy:1', 1, true)).toBeNull();
    const windups = enemyWindups(enemy(7), player);
    expect(windups[0]).toMatchObject({ kind: 'blink', targetX: 300, targetY: 250, reach: STATIC_BURST_RADIUS });
    const ellipses: number[][] = [], colors: number[] = [], lines: number[][] = [];
    const effects = {
      fillStyle: () => effects, fillEllipse: () => effects, fillRect: () => effects,
      lineStyle: (_width: number, color: number) => { colors.push(color); return effects; },
      lineBetween: (...coords: number[]) => { lines.push(coords); return effects; },
      strokeEllipse: (...coords: number[]) => { ellipses.push(coords); return effects; },
    };
    Reflect.get(MvpRunView.prototype, 'drawWindups').call({ drawAlert: Reflect.get(MvpRunView.prototype, 'drawAlert') }, enemy(7), windups, effects, 6);
    expect(ellipses).toContainEqual([300, 250, STATIC_BURST_RADIUS * 2, STATIC_BURST_RADIUS * 1.1]);
    expect(lines).toContainEqual([100, 170, 300, 250]);
    if (flashes === 'reduced') expect(colors).not.toContain(0xffffff);
  });
});
