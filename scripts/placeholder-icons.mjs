#!/usr/bin/env node
/**
 * Placeholder item icons for the round-32 store roster.
 *
 * Draws each 32x32 icon from a hand-authored 16x16 silhouette (doubled), in
 * the item's own two colours with a dark outline, so every new item reads as
 * its kind of thing until the PixelLab pass replaces it. Writes PNGs with a
 * tiny built-in encoder (node:zlib only) and records each file in the neon
 * manifest as a placeholder.
 *
 *   node scripts/placeholder-icons.mjs
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

// '.' clear, 'o' outline, 'a' main colour, 'b' second colour, 'h' highlight.
const SPRITES = {
  bat: [
    '..............oo',
    '.............oao',
    '............oaho',
    '...........oaao.',
    '..........oaao..',
    '.........oaao...',
    '........oaao....',
    '.......oaao.....',
    '......oaao......',
    '.....oaao.......',
    '....obbo........',
    '...obbo.........',
    '..obbo..........',
    '.obbo...........',
    'oobo............',
    'oo..............',
  ],
  stick: [
    '............oo..',
    '...........oao..',
    '..........oao...',
    '.........oao....',
    '........oao.....',
    '.......oao......',
    '......oao.......',
    '.....oao........',
    '....oao.........',
    '...oao..........',
    '..oao...........',
    '.oao............',
    'oaoooooo........',
    'obbbbbbbo.......',
    'ooooooooo.......',
    '................',
  ],
  hammer: [
    '................',
    '...oooooooo.....',
    '..obbbbbbbbo....',
    '..obhbbbbbbo....',
    '...oooaaoooo....',
    '......oaao......',
    '......oaao......',
    '......oaao......',
    '......oaao......',
    '......oaao......',
    '......oaao......',
    '......oaao......',
    '......oaao......',
    '......oaao......',
    '.......oo.......',
    '................',
  ],
  blade: [
    '................',
    '.........ooo....',
    '........obhbo...',
    '.......obbbbo...',
    '......obbbbo....',
    '.....obbbbo.....',
    '....obbbbo......',
    '...oobbbo.......',
    '..oaaoboo.......',
    '..oaaao.........',
    '.oaaao..........',
    'oaaao...........',
    'oaao............',
    '.oo.............',
    '................',
    '................',
  ],
  guitar: [
    '.............oo.',
    '............oboo',
    '...........obo..',
    '..........obo...',
    '.........obo....',
    '....oooooob.....',
    '...oaaaaaoo.....',
    '..oaaahaaao.....',
    '..oaaaboaao.....',
    '.oaaabbbaao.....',
    '.oaaaaboaaao....',
    '.oaaaaaaaaao....',
    '..oaaaaaaaao....',
    '...oaaaaaao.....',
    '....oooooo......',
    '................',
  ],
  gun: [
    '................',
    '................',
    '..ooooooooooooo.',
    '.oaaaaaaaaaahbao',
    '.oaaaaaaaaaaaaao',
    '.oaaaaooooooooo.',
    '.oaaaao.........',
    '.oabbao.........',
    '.oabbao.........',
    '..obbbo.........',
    '..obbbo.........',
    '..obbbo.........',
    '...ooo..........',
    '................',
    '................',
    '................',
  ],
  blaster: [
    '................',
    '....oooooooo....',
    '...obbbbbbbbo...',
    '..oaaaaaaaaaaoo.',
    '.oaahaaaaaaaaabo',
    '.oaaaaaaaaaaaaao',
    '..oaaaaoooooooo.',
    '..obbbao........',
    '..obbbao........',
    '...obbao........',
    '...obbo.........',
    '....oo..........',
    '................',
    '................',
    '................',
    '................',
  ],
  ball: [
    '................',
    '.....oooooo.....',
    '...ooaaaaaaoo...',
    '..oaahhaaaaaao..',
    '..oahhaaaaaaao..',
    '.oaaaaaaaaaaaao.',
    '.obbbbbbbbbbbbo.',
    '.oaaaaaaaaaaaao.',
    '.oaaaaaaaaaaaao.',
    '.obbbbbbbbbbbbo.',
    '..oaaaaaaaaaao..',
    '..oaaaaaaaaaao..',
    '...ooaaaaaaoo...',
    '.....oooooo.....',
    '................',
    '................',
  ],
  disc: [
    '................',
    '.....oooooo.....',
    '...ooaaaaaaoo...',
    '..oaahaaaaaaao..',
    '..oahaaaaaaaao..',
    '.oaaaaobbbaaaao.',
    '.oaaaobooboaaao.',
    '.oaaaboo.boaaao.',
    '.oaaaobooboaaao.',
    '.oaaaaobbbaaaao.',
    '..oaaaaaaaaaao..',
    '..oaaaaaaaaaao..',
    '...ooaaaaaaoo...',
    '.....oooooo.....',
    '................',
    '................',
  ],
  bottle: [
    '......oooo......',
    '......obbo......',
    '......oaao......',
    '.....oaaaao.....',
    '....oaaaaaao....',
    '...oaahaaaaao...',
    '...oahaaaaaao...',
    '...obbbbbbbbo...',
    '...obhbbbbbbo...',
    '...obbbbbbbbo...',
    '...obbbbbbbbo...',
    '...oaaaaaaaao...',
    '...oaaaaaaaao...',
    '...oaaaaaaaao...',
    '....oooooooo....',
    '................',
  ],
  box: [
    '................',
    '................',
    '..oooooooooooo..',
    '.oaaaaaaaaaaaaao',
    '.oahaaaaaaaaaaao',
    '.oaabbbbbbbbaaao',
    '.oaabhbbbbbbaaao',
    '.oaabbbbbbbbaaao',
    '.oaabbbbbbbbaaao',
    '.oaaaaaaaaaaaaao',
    '.oaaoaaoaaaaaaao',
    '.oaaaaaaaaaaaaao',
    '..oooooooooooo..',
    '................',
    '................',
    '................',
  ],
  tape: [
    '................',
    '................',
    '....oooooooo....',
    '..ooaaaaaaaaoo..',
    '.oaahaaaaaaaaao.',
    '.oaaaaooooaaaao.',
    'oaaaao....oaaaao',
    'oaaao......oaaao',
    'oaaao......oaaao',
    'oaaaao....oaaaao',
    '.oaaaaooooaaaaob',
    '.oaaaaaaaaaaaaobb',
    '..ooaaaaaaaaoobbo',
    '....oooooooo.oo.',
    '................',
    '................',
  ],
  battery: [
    '................',
    '......oooo......',
    '.....obbbbo.....',
    '....oooooooo....',
    '....oaahaaao....',
    '....oahaaaao....',
    '....oaaaaaao....',
    '....obbbbbbo....',
    '....obhbbbbo....',
    '....obbbbbbo....',
    '....obbbbbbo....',
    '....oaaaaaao....',
    '....oaaaaaao....',
    '....oooooooo....',
    '................',
    '................',
  ],
  gadget: [
    '................',
    '..oooooooooooo..',
    '.oaaaaaaaaaaaaao',
    '.oaoooooooooaaao',
    '.oaobbbbbbboaaao',
    '.oaobhbbbbboahao',
    '.oaobbbbbbboaaao',
    '.oaoooooooooaaao',
    '.oaaaaaaaaaaaaao',
    '.oaooaooaooaaaao',
    '.oaaaaaaaaaaaaao',
    '.oaooaooaooaaaao',
    '..oooooooooooo..',
    '................',
    '................',
    '................',
  ],
  cassette: [
    '................',
    '................',
    '.oooooooooooooo.',
    'oaaaaaaaaaaaaaao',
    'oahaaaaaaaaaaaao',
    'oaaoooooooooaaao',
    'oaaobbooobbboaao',
    'oaaobooooooboaao',
    'oaaobbooobbboaao',
    'oaaoooooooooaaao',
    'oaaaaaaaaaaaaaao',
    'oaaaoooooooaaaao',
    '.oooooooooooooo.',
    '................',
    '................',
    '................',
  ],
  wheel: [
    '................',
    '....oooooo......',
    '..ooaaaaaaoo....',
    '.oaahaaaaaaao...',
    '.oahaaoooaaao...',
    'oaaaaobboaaaao..',
    'oaaaaobboaaaao..',
    'oaaaaaoooaaaao..',
    '.oaaaaaaaaaaao..',
    '.oaaaaaaaaaao...',
    '..ooaaaaaaoob...',
    '....oooooo.obb..',
    '...........obbb.',
    '............obbo',
    '.............oo.',
    '................',
  ],
  mic: [
    '.....oooo.......',
    '....obhbbo......',
    '....obbbbo......',
    '....obbbbo......',
    '.....oaao.......',
    '......oao.......',
    '......oao.......',
    '......oao.......',
    '......oao.......',
    '......oao.......',
    '......oao.......',
    '......oao.......',
    '.....oaaao......',
    '...ooaaaaaoo....',
    '..oaaaaaaaaao...',
    '...ooooooooo....',
  ],
};

// Each new item: silhouette and two colours.
const ICONS = {
  aluminum_bat: ['bat', 0xc8d0dc, 0x303848],
  hockey_stick: ['stick', 0x8a5a2a, 0x202020],
  golf_club: ['stick', 0xd8dce4, 0x2a6a3a],
  tennis_ball_launcher: ['blaster', 0x3a8a4a, 0xd8f040],
  dodgeball: ['ball', 0xe03a3a, 0xa01a2a],
  sweatband: ['tape', 0xf0f0f0, 0xe03a3a],
  lacrosse_stick: ['stick', 0xf0f0f0, 0x3a6aff],
  football: ['ball', 0xff7a2a, 0xf0f0f0],
  nail_gun: ['gun', 0xffb020, 0x303030],
  pipe_wrench: ['hammer', 0xb02a2a, 0x9aa0a8],
  duct_tape: ['tape', 0xa8b0b8, 0x606870],
  leaf_blower: ['blaster', 0xff8a1a, 0x303030],
  staple_gun: ['gun', 0x2a5ab0, 0x9aa0a8],
  claw_hammer: ['hammer', 0x8a5a2a, 0x6a7078],
  garden_hose: ['tape', 0x3aaa4a, 0xffd040],
  jumper_cables: ['battery', 0x202020, 0xe03a3a],
  super_soaker_50: ['blaster', 0x3ad0ff, 0xffd84a],
  yo_yo: ['disc', 0x6aff8a, 0xff3fc8],
  slingshot: ['stick', 0x8a5a2a, 0xe03a3a],
  slime_tub: ['bottle', 0x6aff4a, 0xb06aff],
  pog_slammer: ['disc', 0xffd84a, 0x3a3a8a],
  water_balloons: ['ball', 0x4ac8ff, 0xff6fa8],
  foam_sword: ['blade', 0x3a6aff, 0xffd84a],
  slinky: ['tape', 0xd8dce4, 0x9aa0a8],
  laser_pointer: ['gadget', 0x404048, 0xff3a4a],
  walkman: ['cassette', 0x3a5aa8, 0xffd84a],
  nine_volt_pack: ['battery', 0xffd84a, 0x202020],
  boombox: ['gadget', 0x9aa0a8, 0x303030],
  rc_blimp_remote: ['gadget', 0x303848, 0x6aff8a],
  satellite_dish: ['disc', 0xd8dce4, 0x9aa0a8],
  tesla_coil_kit: ['battery', 0xb06aff, 0x3ff0ff],
  camcorder: ['gadget', 0x202028, 0xff3fc8],
  electric_guitar: ['guitar', 0xe03a3a, 0xf0f0f0],
  record_toss: ['disc', 0x202028, 0xff6fa8],
  mic_stand: ['mic', 0x9aa0a8, 0x303030],
  drumsticks: ['stick', 0xd8a86a, 0x8a5a2a],
  mixtape: ['cassette', 0xff6fa8, 0x3ff0ff],
  cd_shuriken: ['disc', 0xc8e8ff, 0xb06aff],
  fog_machine: ['box', 0x404048, 0xb8c8e8],
  keytar: ['guitar', 0x3ff0ff, 0xff3fc8],
  pizza_cutter: ['wheel', 0xd8dce4, 0xe03a3a],
  pizza_peel: ['stick', 0xd8a86a, 0xb87a4a],
  cheese_pump: ['bottle', 0xffc020, 0xff8a1a],
  soda_gun: ['gun', 0x9aa0a8, 0x3ad0ff],
  dough_roller: ['bat', 0xe8c890, 0xb87a4a],
  pepperoni_launcher: ['blaster', 0xb02a2a, 0xffd84a],
  hot_sauce: ['bottle', 0xe03a3a, 0xff8a1a],
  ketchup_bottle: ['bottle', 0xd02020, 0xf0f0f0],
  vhs_tape: ['cassette', 0x202028, 0xf0f0f0],
  cardboard_standee: ['box', 0xc89a5a, 0x3a6aff],
  popcorn_bucket: ['box', 0xe03a3a, 0xfff0a0],
  rewind_button: ['gadget', 0x303030, 0xffd84a],
  laserdisc: ['disc', 0xd8e8ff, 0xffd84a],
  late_fee_stamp: ['hammer', 0x8a5a2a, 0xe03a3a],
  // Rare finds (drops only).
  golden_mop: ['stick', 0xffd84a, 0xfff0a0],
  power_glove: ['gadget', 0x505058, 0xe03a3a],
  super_soaker_cps: ['blaster', 0xff8a1a, 0x6aff4a],
  game_brick: ['gadget', 0xb8b8a8, 0x6a8a3a],
  laser_tag_rifle: ['blaster', 0x202028, 0xff3a4a],
  virtual_pet: ['ball', 0xff6fa8, 0x3ff0ff],
  trapper_keeper: ['box', 0xb06aff, 0x3ff0ff],
  moon_shoes: ['box', 0x3a6aff, 0xd8dce4],
  pager: ['gadget', 0x202028, 0x6aff8a],
  lightsaber_toy: ['blade', 0x3ff0ff, 0x9aa0a8],
};

function lighten(color, amount) {
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function png(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]), rgba.subarray(y * width * 4, (y + 1) * width * 4));
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function render(sprite, main, second) {
  const palette = { o: 0x14101c, a: main, b: second, h: lighten(main, 0.6) };
  const rgba = Buffer.alloc(32 * 32 * 4);
  sprite.forEach((row, y) => {
    for (let x = 0; x < 16; x += 1) {
      const color = palette[row[x]];
      if (color === undefined) continue;
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const index = ((y * 2 + dy) * 32 + x * 2 + dx) * 4;
          rgba[index] = (color >> 16) & 255;
          rgba[index + 1] = (color >> 8) & 255;
          rgba[index + 2] = color & 255;
          rgba[index + 3] = 255;
        }
      }
    }
  });
  return png(32, 32, rgba);
}

const manifestPath = 'public/assets/neon/manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const entries = Array.isArray(manifest) ? manifest : manifest.assets;
for (const [id, [shape, main, second]] of Object.entries(ICONS)) {
  const sprite = SPRITES[shape];
  if (!sprite) throw new Error(`No sprite "${shape}" for ${id}`);
  const path = `public/assets/neon/items/${id.replace(/_/g, '-')}.png`;
  const data = render(sprite.map((row) => row.padEnd(16, '.').slice(0, 16)), main, second);
  writeFileSync(path, data);
  const entry = {
    path,
    source: 'scripts/placeholder-icons.mjs',
    generator: `PLACEHOLDER (${shape} silhouette): replace with PixelLab`,
    size: [32, 32],
    sha256: createHash('sha256').update(data).digest('hex'),
  };
  const existing = entries.findIndex((candidate) => candidate.path === path);
  if (existing >= 0) entries[existing] = entry;
  else entries.push(entry);
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${Object.keys(ICONS).length} placeholder icons.`);
