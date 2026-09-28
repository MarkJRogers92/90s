/**
 * The mall PA on screen: an amber LED ticker along the top of the stage. A
 * ding-dong, then the announcement types itself out while a garbled PA voice
 * babbles along, holds, and fades. Lines come from `PaDirector`; timing from
 * `paTypingFrame`. It waits while a cinematic is on screen, so an
 * announcement made during the escalator ride plays once you arrive.
 */
import Phaser from 'phaser';
import type { AudioCue } from '../audio/cues';
import { ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import { paTypingFrame } from './paModel';

const DEPTH = 20_100;
const W = 960;
const Y = 6;
const H = 24;
const AMBER = 0xffb040;

export class PaTicker {
  private readonly root: Phaser.GameObjects.Container;
  private readonly frame: Phaser.GameObjects.Graphics;
  private text: Phaser.GameObjects.Image | null = null;
  private line: string | null = null;
  private queued: string | null = null;
  private elapsed = 0;
  private charsShown = 0;
  private chimed = false;

  public constructor(private readonly scene: Phaser.Scene, private readonly play: (cue: AudioCue) => void) {
    this.frame = scene.add.graphics();
    this.root = scene.add.container(0, 0, [this.frame]).setScrollFactor(0).setDepth(DEPTH).setVisible(false);
  }

  /** Queues an announcement; a newer one replaces one still waiting to start. */
  public announce(line: string): void {
    if (this.line === null) this.start(line);
    else this.queued = line;
  }

  /** Advances the ticker; `held` pauses it (and keeps it hidden) under a cinematic. */
  public update(elapsedMs: number, held: boolean): void {
    if (this.line === null) return;
    if (held) {
      this.root.setVisible(false);
      return;
    }
    this.root.setVisible(true);
    if (!this.chimed) {
      this.chimed = true;
      this.play('pa_chime');
    }
    this.elapsed += Math.max(0, elapsedMs);
    const frame = paTypingFrame(this.elapsed, this.line);
    // The PA voice: a garbled syllable every couple of letters.
    if (frame.chars > this.charsShown) {
      const fresh = this.line.slice(this.charsShown, frame.chars);
      if (Math.floor(frame.chars / 2) > Math.floor(this.charsShown / 2) && /\S/.test(fresh)) this.play('pa_voice');
      this.charsShown = frame.chars;
    }
    this.draw(frame.chars, frame.alpha);
    if (frame.done) {
      const next = this.queued;
      this.clear();
      if (next) this.start(next);
    }
  }

  public clear(): void {
    this.line = null;
    this.queued = null;
    this.text?.destroy();
    this.text = null;
    this.root.setVisible(false);
  }

  public destroy(): void {
    this.root.destroy(true);
  }

  private start(line: string): void {
    this.text?.destroy();
    this.line = line;
    this.elapsed = 0;
    this.charsShown = 0;
    this.chimed = false;
    const label = ensurePixelLabel(this.scene, line, '#ffb040', 1, '#0d0916');
    this.text = this.scene.add.image(0, Y + H / 2, label.key).setOrigin(0, 0.5);
    this.root.add(this.text);
  }

  private draw(chars: number, alpha: number): void {
    if (!this.line || !this.text) return;
    const textW = this.text.width;
    const width = textW + 64;
    const x = Math.round((W - width) / 2);
    const g = this.frame.clear();
    g.fillStyle(0x0d0916, 0.92).fillRect(x, Y, width, H);
    g.lineStyle(2, AMBER, 0.85).strokeRect(x + 1, Y + 1, width - 2, H - 2);
    // A little speaker, its sound waves pulsing while it talks.
    const sx = x + 14;
    const sy = Y + H / 2;
    g.fillStyle(AMBER, 1).fillRect(sx - 4, sy - 3, 4, 6).fillTriangle(sx, sy - 3, sx + 6, sy - 7, sx + 6, sy + 7).fillTriangle(sx, sy + 3, sx + 6, sy + 7, sx, sy - 3);
    const talking = chars < this.line.length;
    const pulse = talking ? Math.floor(this.elapsed / 120) % 3 : 2;
    for (let wave = 0; wave <= pulse; wave += 1) {
      g.lineStyle(1, AMBER, 0.9 - wave * 0.25).beginPath().arc(sx + 7, sy, 4 + wave * 3, -0.9, 0.9).strokePath();
    }
    // Monospaced pixel font: reveal the typed characters by cropping.
    const shown = Math.round((textW * chars) / this.line.length);
    this.text.setX(x + 44).setCrop(0, 0, shown, this.text.height);
    this.root.setAlpha(alpha);
  }
}
