import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPanel } from '../../src/game/ui/SettingsPanel';
import { RunMenu, RunMenuPause, RUN_MENU_OPENED_EVENT, RUN_MENU_CLOSED_EVENT } from '../../src/game/ui/RunMenu';

/** Only browser primitives are faked; every assertion exercises the real controller. */
class Element extends EventTarget {
  hidden = false;
  disabled = false;
  textContent = '';
  tabIndex = 0;
  title = '';
  parent: Element | null = null;
  children: Element[] = [];
  attributes = new Map<string, string>();
  dataset: Record<string, string> = {};
  visible = true;
  requestFullscreen: (() => Promise<void>) | undefined;
  constructor(readonly owner: DocumentStub, readonly id: string) { super(); }
  focus(): void { this.owner.activeElement = this; }
  contains(node: unknown): boolean { return node === this || this.children.some((child) => child.contains(node)); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  querySelectorAll(): Element[] { return this.children.flatMap((child) => [child, ...child.querySelectorAll()]); }
  getClientRects(): unknown[] { return this.visible ? [{}] : []; }
  closest(): Element | null { return this.hidden ? this : this.parent?.closest() ?? null; }
  append(child: Element): void { this.children.push(child); child.parent = this; }
  click(): void { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}
class DocumentStub extends EventTarget {
  fullscreenElement: Element | null = null;
  fullscreenEnabled = true;
  activeElement: Element | null = null;
  exitFullscreen: (() => Promise<void>) | undefined;
  elements = new Map<string, Element>();
  getElementById(id: string): Element | null { return this.elements.get(id) ?? null; }
}
class CustomEventStub<T> extends Event {
  detail: T;
  constructor(type: string, options?: {detail?: T}) { super(type); this.detail = options?.detail as T; }
}
function key(code: string, shiftKey = false): KeyboardEvent {
  const event = new Event('keydown', { cancelable: true });
  Object.assign(event, { code, key: code === 'Space' ? ' ' : code, shiftKey, repeat: false });
  return event as KeyboardEvent;
}
const menus: RunMenu[] = [];
function setup(supported = true) {
  const doc = new DocumentStub();
  const win = new EventTarget();
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', win);
  vi.stubGlobal('HTMLElement', Element);
  vi.stubGlobal('CustomEvent', CustomEventStub);
  const ids = ['app', 'settings-panel', 'run-menu-toggle', 'run-menu-panel', 'run-menu-close', 'run-fullscreen', 'run-fullscreen-status', 'mvp-open-settings', 'mvp-restart-run', 'mvp-return'];
  for (const id of ids) doc.elements.set(id, new Element(doc, id));
  const get = (id: string): Element => doc.elements.get(id)!;
  get('settings-panel').hidden = true;
  const panel = get('run-menu-panel');
  panel.hidden = true;
  for (const id of ['run-menu-close', 'mvp-open-settings', 'mvp-restart-run', 'mvp-return']) panel.append(get(id));
  let requests = 0;
  let exits = 0;
  if (supported) {
    get('app').requestFullscreen = async () => { requests += 1; };
    doc.exitFullscreen = async () => { exits += 1; };
  }
  const menu = new RunMenu(<T extends HTMLElement>(selector: string): T => get(selector.slice(1)) as unknown as T);
  menus.push(menu);
  return { doc, win, menu, get, panel, requests: () => requests, exits: () => exits };
}
afterEach(() => { for (const menu of menus.splice(0)) menu.destroy(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Night Shift menu controller', () => {
  it('opens once, focuses Close, and closes once with focus restored', () => {
    const { menu, get, panel, doc, win } = setup();
    const changes: string[] = [];
    win.addEventListener(RUN_MENU_OPENED_EVENT, () => changes.push('open'));
    win.addEventListener(RUN_MENU_CLOSED_EVENT, () => changes.push('close'));
    get('run-menu-toggle').focus();
    menu.open(); menu.open();
    expect(panel.hidden).toBe(false);
    expect(get('run-menu-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(doc.activeElement).toBe(get('run-menu-close'));
    get('run-menu-close').click(); menu.close();
    expect(panel.hidden).toBe(true);
    expect(get('run-menu-toggle').getAttribute('aria-expanded')).toBe('false');
    expect(doc.activeElement).toBe(get('run-menu-toggle'));
    expect(changes).toEqual(['open', 'close']);
  });

  it('traps Tab in visible enabled controls and blocks gameplay key propagation', () => {
    const { menu, get, doc, win } = setup();
    menu.open();
    get('mvp-restart-run').disabled = true;
    get('mvp-open-settings').visible = false;
    win.dispatchEvent(key('Tab', true));
    expect(doc.activeElement).toBe(get('mvp-return'));
    win.dispatchEvent(key('Tab'));
    expect(doc.activeElement).toBe(get('run-menu-close'));
    const gameKey = vi.fn();
    win.addEventListener('keydown', gameKey);
    win.dispatchEvent(key('KeyE'));
    expect(gameKey).not.toHaveBeenCalled();
  });

  it('blocks backdrop pointer/click actions before contextual controls can activate', () => {
    const { menu, win, get } = setup();
    menu.open();
    const outsideAction = vi.fn();
    win.addEventListener('click', outsideAction);
    for (const type of ['pointerdown', 'click']) {
      const event = new Event(type, { cancelable: true });
      Object.defineProperty(event, 'target', { value: get('app') });
      win.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(outsideAction).not.toHaveBeenCalled();
  });

  it('Escape closes only the menu, never also the game pause handler', () => {
    const { menu, win, panel } = setup();
    const gamePause = vi.fn();
    win.addEventListener('keydown', gamePause);
    menu.open();
    const escape = key('Escape');
    win.dispatchEvent(escape);
    expect(panel.hidden).toBe(true);
    expect(escape.defaultPrevented).toBe(true);
    expect(gamePause).not.toHaveBeenCalled();
  });

  it('settings transition closes without requesting resume or stealing settings focus', () => {
    const { menu, win, panel, get, doc } = setup();
    const closes: boolean[] = [];
    win.addEventListener(RUN_MENU_CLOSED_EVENT, (event) => closes.push((event as CustomEvent<{resume: boolean}>).detail.resume));
    menu.open();
    get('app').focus();
    win.dispatchEvent(new Event('dead-mall:settings-opened'));
    expect(panel.hidden).toBe(true);
    expect(closes).toEqual([false]);
    expect(doc.activeElement).toBe(get('app'));
  });

  it('does not stack the menu over settings or block settings focus and controls', () => {
    const { menu, get, panel, doc, win } = setup();
    get('settings-panel').hidden = false;
    get('settings-panel').focus();
    get('run-menu-toggle').click();
    menu.open();
    expect(panel.hidden).toBe(true);
    expect(doc.activeElement).toBe(get('settings-panel'));
    const settingsClick = new Event('click', { cancelable: true });
    Object.defineProperty(settingsClick, 'target', { value: get('settings-panel') });
    win.dispatchEvent(settingsClick);
    expect(settingsClick.defaultPrevented).toBe(false);
  });

  it('returns from settings to the menu toggle when its original invoker is now hidden', () => {
    const { get, doc } = setup();
    const settings = { panel: get('app'), returnFocus: get('mvp-open-settings') } as unknown as SettingsPanel;
    get('app').focus();
    SettingsPanel.prototype.close.call(settings);
    expect(doc.activeElement).toBe(get('run-menu-toggle'));
  });

  it('resets before restart/title and removes listeners on destroy', () => {
    const { menu, get, panel } = setup();
    menu.open(); expect(panel.hidden).toBe(false); get('mvp-restart-run').click();
    expect(panel.hidden).toBe(true);
    menu.open(); expect(panel.hidden).toBe(false); menu.reset();
    expect(panel.hidden).toBe(true);
    menu.destroy(); get('run-menu-toggle').click();
    expect(panel.hidden).toBe(true);
  });
});

describe('Fullscreen controller', () => {
  it('disables unsupported fullscreen with a readable explanation', () => {
    const { get } = setup(false);
    expect(get('run-fullscreen').disabled).toBe(true);
    expect(get('run-fullscreen-status').textContent).toMatch(/unavailable/i);
  });

  it('guards repeated requests and labels only actual fullscreenchange state', async () => {
    const { get, doc, exits } = setup();
    let resolve!: () => void;
    let requests = 0;
    get('app').requestFullscreen = () => { requests += 1; return new Promise<void>((done) => { resolve = done; }); };
    get('run-fullscreen').dispatchEvent(new Event('click'));
    get('run-fullscreen').dispatchEvent(new Event('click'));
    expect(requests).toBe(1);
    expect(get('run-fullscreen').disabled).toBe(true);
    expect(get('run-fullscreen').textContent).toBe('Fullscreen');
    doc.fullscreenElement = get('app'); doc.dispatchEvent(new Event('fullscreenchange'));
    expect(get('run-fullscreen').textContent).toBe('Exit fullscreen');
    resolve(); await Promise.resolve(); await Promise.resolve();
    get('run-fullscreen').click();
    await Promise.resolve(); await Promise.resolve();
    expect(exits()).toBe(1);
    doc.fullscreenElement = null; doc.dispatchEvent(new Event('fullscreenchange'));
    expect(get('run-fullscreen').textContent).toBe('Fullscreen');
    expect(requests).toBe(1);
  });

  it('reports rejected entry and exit, re-enables the control, and can retry', async () => {
    const { get, doc } = setup();
    get('app').requestFullscreen = async () => { throw new Error('denied'); };
    get('run-fullscreen').click(); await Promise.resolve(); await Promise.resolve();
    expect(get('run-fullscreen-status').textContent).toMatch(/could not enter fullscreen/i);
    expect(get('run-fullscreen-status').dataset.error).toBe('true');
    expect(get('run-fullscreen').disabled).toBe(false);
    doc.fullscreenElement = get('app'); doc.dispatchEvent(new Event('fullscreenchange'));
    doc.exitFullscreen = async () => { throw new Error('denied'); };
    get('run-fullscreen').click(); await Promise.resolve(); await Promise.resolve();
    expect(get('run-fullscreen-status').textContent).toMatch(/could not exit fullscreen/i);
    expect(get('run-fullscreen').textContent).toBe('Exit fullscreen');
    expect(get('run-fullscreen').disabled).toBe(false);
  });

  it('marks fullscreenerror as visible feedback and clears it after a state change', () => {
    const { get, doc } = setup();
    doc.dispatchEvent(new Event('fullscreenerror'));
    expect(get('run-fullscreen-status').dataset.error).toBe('true');
    expect(get('run-fullscreen-status').textContent).toMatch(/fullscreen/i);
    doc.fullscreenElement = get('app'); doc.dispatchEvent(new Event('fullscreenchange'));
    expect(get('run-fullscreen-status').dataset.error).toBe('false');
  });

  it('expires visible errors after six seconds but retains their accessible text', () => {
    vi.useFakeTimers();
    const { get, doc, menu } = setup();
    doc.dispatchEvent(new Event('fullscreenerror'));
    const text = get('run-fullscreen-status').textContent;
    vi.advanceTimersByTime(3000);
    doc.dispatchEvent(new Event('fullscreenerror'));
    vi.advanceTimersByTime(3001);
    expect(get('run-fullscreen-status').dataset.error).toBe('true');
    vi.advanceTimersByTime(3000);
    expect(get('run-fullscreen-status').dataset.error).toBe('false');
    expect(get('run-fullscreen-status').textContent).toBe(text);
    doc.dispatchEvent(new Event('fullscreenerror'));
    menu.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('native fullscreen Escape never resumes gameplay or closes the open menu', () => {
    vi.useFakeTimers();
    const { menu, get, doc, win, panel } = setup();
    const gamePause = vi.fn();
    win.addEventListener('keydown', gamePause);
    menu.open();
    doc.fullscreenElement = get('app'); doc.dispatchEvent(new Event('fullscreenchange'));
    win.dispatchEvent(key('Escape'));
    expect(panel.hidden).toBe(false);
    doc.fullscreenElement = null; doc.dispatchEvent(new Event('fullscreenchange'));
    win.dispatchEvent(key('Escape'));
    expect(panel.hidden).toBe(false);
    expect(gamePause).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    win.dispatchEvent(key('Escape'));
    expect(panel.hidden).toBe(true);
    expect(gamePause).not.toHaveBeenCalled();
  });
});

describe('Menu pause ownership', () => {
  function pauseState(initial = false) {
    let paused = initial;
    let available = true;
    let clears = 0;
    const gate = new RunMenuPause({ isPaused: () => paused, canResume: () => available, setPaused: (value) => { paused = value; }, clearInput: () => { clears += 1; } });
    return { gate, paused: () => paused, clears: () => clears, unavailable: () => { available = false; } };
  }
  it('pauses a live run and restores only that acquired pause', () => {
    const state = pauseState(); state.gate.open(); state.gate.open();
    expect(state.paused()).toBe(true);
    state.gate.close(true);
    expect(state.paused()).toBe(false);
    expect(state.clears()).toBeGreaterThanOrEqual(2);
    const alreadyPaused = pauseState(true); alreadyPaused.gate.open(); alreadyPaused.gate.close(true);
    expect(alreadyPaused.paused()).toBe(true);
  });
  it('retains a pause for settings, blur, or a changed run context', () => {
    for (const reason of ['settings', 'blur', 'context']) {
      const state = pauseState(); state.gate.open();
      if (reason === 'blur') state.gate.retainPause();
      if (reason === 'context') state.unavailable();
      state.gate.close(reason !== 'settings');
      expect(state.paused()).toBe(true);
    }
  });
});
