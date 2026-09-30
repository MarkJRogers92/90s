/**
 * The title screen's playtest stats panel: the on/off switch for the local
 * log, a summary across logged runs (win rate, where shifts end, what hurts,
 * time per room, what gets bought), the latest runs, and copy/clear. Built
 * with textContent only.
 */
import { PlaytestLog, summarizeRuns } from '../playtest/log';
import type { DamageSource, RunRecord } from '../playtest/recorder';

const SOURCE_NAMES: Record<DamageSource, string> = {
  hanger: 'Hanger touch',
  mannequin: 'Mannequin',
  static: 'Static shock',
  shopper: 'Bargain Hunter charge',
  mascot: 'Mascot Brute charge',
  ownerCharge: 'Mall Owner charge',
  glob: 'Spitter glob',
  slam: 'Boss slam',
  bossShot: 'Boss volley',
  stalker: 'Loss Prevention write-up',
  other: 'Other',
};


function line(parent: HTMLElement, label: string, value: string): void {
  const row = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  row.append(strong, value);
  parent.append(row);
}

function formatTime(ticks: number): string {
  const seconds = Math.floor(ticks / 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export class PlaytestPanel {
  private readonly log: PlaytestLog;
  private readonly panel: HTMLElement;
  private readonly enabled: HTMLInputElement;
  private readonly summary: HTMLElement;
  private readonly runs: HTMLElement;
  private readonly status: HTMLElement;

  public constructor(log: PlaytestLog, find: <T extends HTMLElement>(selector: string) => T) {
    this.log = log;
    this.panel = find('#playtest-panel');
    this.enabled = find<HTMLInputElement>('#playtest-enabled');
    this.summary = find('#playtest-summary');
    this.runs = find('#playtest-runs');
    this.status = find('#playtest-status');
    find('#playtest-open').addEventListener('click', () => this.open());
    find('#playtest-close').addEventListener('click', () => this.close());
    this.enabled.addEventListener('change', () => {
      this.log.setEnabled(this.enabled.checked);
      this.status.textContent = this.enabled.checked ? 'Recording on. Play some Night Shift runs.' : 'Recording off.';
    });
    find('#playtest-clear').addEventListener('click', () => {
      this.log.clear();
      this.status.textContent = 'Log cleared.';
      this.render();
    });
    find('#playtest-copy').addEventListener('click', () => {
      const json = JSON.stringify(this.log.runs(), null, 2);
      void navigator.clipboard?.writeText(json).then(
        () => { this.status.textContent = `Copied ${this.log.runs().length} runs as JSON.`; },
        () => { this.status.textContent = 'Copy was blocked by the browser.'; },
      );
    });
  }

  public open(): void {
    this.panel.hidden = false;
    this.status.textContent = '';
    this.render();
  }

  public close(): void {
    this.panel.hidden = true;
  }

  private render(): void {
    this.enabled.checked = this.log.enabled;
    const records = this.log.runs();
    const summary = summarizeRuns(records);
    const roomName = (id: string): string => summary.roomNames[id] ?? id.replace(/_/g, ' ');
    this.summary.textContent = '';
    this.runs.textContent = '';
    if (records.length === 0) {
      line(this.summary, 'Runs logged', this.log.enabled ? 'none yet. Play a Night Shift run.' : 'none. Switch recording on above.');
      return;
    }
    line(this.summary, 'Runs logged', `${summary.runs} (${summary.wins} won, ${Math.round((summary.wins / summary.runs) * 100)}%)`);
    const deaths = Object.entries(summary.deathsByRoom).sort((a, b) => b[1] - a[1]);
    line(this.summary, 'Shifts end in', deaths.length ? deaths.map(([id, n]) => `${roomName(id)} ×${n}`).join(', ') : 'no deaths yet');
    const hurt = (Object.entries(summary.damageBySource) as Array<[DamageSource, number]>).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    line(this.summary, 'Damage taken from', hurt.length ? hurt.map(([source, n]) => `${SOURCE_NAMES[source]} ${n}`).join(', ') : 'nothing');
    const times = Object.entries(summary.avgSecondsByRoom);
    line(this.summary, 'Average time in room', times.map(([id, s]) => `${roomName(id)} ${s}s`).join(', '));
    if (summary.topBought.length) line(this.summary, 'Most bought', summary.topBought.map((b) => `${b.name} ×${b.count}`).join(', '));
    const { alarms, avgSecondsLeft, peakStars, stalker } = summary.heist;
    const alarmCount = alarms.escaped + alarms.lockedEscaped + alarms.locked + alarms.dropped;
    if (alarmCount > 0) {
      const spare = avgSecondsLeft === null ? '' : ` (${avgSecondsLeft}s to spare on average)`;
      line(this.summary, 'Store alarms', `${alarmCount}: out in time ${alarms.escaped}${spare}, locked in then out ${alarms.lockedEscaped}, ended locked in ${alarms.locked}, other ${alarms.dropped}`);
    }
    if (peakStars > 0) line(this.summary, 'Highest wanted level', `${'*'.repeat(peakStars)} (${peakStars})`);
    if (stalker.arrivals + stalker.writeUps > 0) line(this.summary, 'Loss Prevention', `arrived ${stalker.arrivals}×, wrote you up ${stalker.writeUps}×, shoved away ${stalker.shoves}×`);
    if (summary.stores.length) line(this.summary, 'Stores visited', summary.stores.map((s) => `${s.store} ×${s.visits} (${s.avgSeconds}s, ${s.bought} bought, ${s.stolen} stolen)`).join(', '));
    const f = summary.fusions;
    if (f.made) line(this.summary, 'Fusions', `${f.made} made (${f.signatures} signature, ${f.discoveries} new), ${f.avgParts} items on average`);
    if (f.recipeHintsSeen) line(this.summary, 'Recipe hints', `${f.recipeHintsSeen} seen on the shelf, both halves taken ${f.recipeHintsTaken} times`);
    if (summary.bossCards.shown) line(this.summary, 'Boss cards', `${summary.bossCards.shown} shown, ${summary.bossCards.skipped} skipped, ${summary.bossCards.avgSeconds}s watched on average`);
    for (const record of [...records].reverse().slice(0, 10)) this.runs.append(this.runItem(record));
  }

  private runItem(record: RunRecord): HTMLLIElement {
    const item = document.createElement('li');
    const when = new Date(record.startedAt);
    const date = Number.isNaN(when.getTime()) ? '' : `${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · `;
    const how = record.outcome === 'dead' ? `died (${record.killedBy ? SOURCE_NAMES[record.killedBy] : 'unknown'})` : record.outcome;
    item.textContent = `${date}${how} · reached ${record.floor !== undefined ? `floor ${record.floor}, ` : ''}room ${record.reachedRoom} · ${formatTime(record.ticks)} · ${record.dashes} dash${record.dashes === 1 ? '' : 'es'}`;
    return item;
  }
}
