#!/usr/bin/env node
/**
 * Renders each soundtrack loop offline in Chromium (the real synth code, via
 * the dev server's modules) to WAV, and reports loudness and peak so a track
 * that clips or goes silent is caught. Development-only.
 *
 *   node scripts/render-music.mjs <baseUrl> <outDir> [track...]
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [baseUrl = 'http://127.0.0.1:4180', outDir = 'artifacts/neon-overhaul/music', ...only] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${baseUrl}/`);
const renders = [
  ['muzak', 1, 1, false],
  ['combat', 1, 0.3, false],
  ['combat', 1, 1, false],
  ['boss', 1, 1, false],
  ['boss', 1.12, 1, false],
  ['blackout', 1, 1, true],
  ['upstairs', 1, 0.3, false],
  ['upstairs', 1, 1, false],
  ['manager', 1, 0.4, false],
  ['manager', 1.12, 1, false],
];
for (const [track, tempoScale, intensity, tension] of renders.filter(([track]) => only.length === 0 || only.includes(track))) {
  const result = await page.evaluate(async ([track, tempoScale, intensity, tension]) => {
    const { MusicPlayer, TRACKS } = await import('/src/game/audio/music.ts');
    const t = TRACKS[track];
    const seconds = Math.min(48, (t.bars * 4 * 60) / (t.bpm * tempoScale)) + 2.5;
    const rate = 44100;
    const ctx = new OfflineAudioContext(2, Math.floor(rate * seconds), rate);
    const noise = ctx.createBuffer(1, rate, rate);
    const d = noise.getChannelData(0); let s = 0x9e3779b9;
    for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 0xffffffff) * 2 - 1; }
    const master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
    const player = new MusicPlayer(ctx, master, noise);
    player.update({ track, tempoScale, volume: 1, intensity, tension }, true, seconds - 2.5);
    const buf = await ctx.startRendering();
    let sum = 0, peak = 0, n = 0;
    const channels = [buf.getChannelData(0), buf.getChannelData(1)];
    for (const ch of channels) for (let i = 0; i < ch.length; i++) { sum += ch[i] * ch[i]; peak = Math.max(peak, Math.abs(ch[i])); n++; }
    // 16-bit stereo WAV.
    const frames = buf.length, bytes = 44 + frames * 4;
    const out = new DataView(new ArrayBuffer(bytes));
    const str = (o, v) => [...v].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); out.setUint32(4, bytes - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, rate, true);
    out.setUint32(28, rate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, frames * 4, true);
    for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) out.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, channels[c][i])) * 32767, true);
    let binary = ''; const u8 = new Uint8Array(out.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) binary += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return { seconds: Math.round(seconds), rms: +Math.sqrt(sum / n).toFixed(3), peak: +peak.toFixed(3), wav: btoa(binary) };
  }, [track, tempoScale, intensity, tension]);
  const name = `${track}${tempoScale !== 1 ? '-phase3' : ''}${intensity < 1 ? '-low' : ''}`;
  writeFileSync(join(outDir, `${name}.wav`), Buffer.from(result.wav, 'base64'));
  console.log(JSON.stringify({ name, seconds: result.seconds, rms: result.rms, peak: result.peak }));
}
console.log('errors', errors);
await browser.close();
