"""Animate the game's original PixelLab characters (roadmap V2/V4) and pack 8-row sheets.

The characters already exist in the account (their walk/idle sheets were made from
them), so animating them keeps identity, palette and scale exact. Needs PIXELLAB_API_KEY.

    python3 art/pixellab/animate_characters.py submit   # queue jobs, write jobs.json
    python3 art/pixellab/animate_characters.py collect  # wait, then pack the sheets
    python3 art/pixellab/animate_characters.py publish <name>  # after review: copy into public/

Cost: 1 subscription generation per direction (8 per animation) at 64 px; larger characters cost more
(the 96 px Mascot redo cost about 16). Check GET /balance before and after.
"""
import io, json, os, sys, time, urllib.error, urllib.request, zipfile
from pathlib import Path
from PIL import Image

API = 'https://api.pixellab.ai/v2'
ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
JOBS = HERE / 'jobs.json'
ORDER = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east']  # ACTOR_DIRECTION_ORDER

ANIMATIONS = [
    # name, character id, frames, action, output sheet
    ('alex-aim', '943aa1b2-012d-4991-ad6b-3fbe34635d9c', 4,
     'both hands completely empty and open, holding nothing at all, raises both arms straight forward at chest height and holds them steady pointing ahead as if aiming, holds the pose',
     'public/assets/neon/player/alex-aim.png'),
    ('alex-dash', '943aa1b2-012d-4991-ad6b-3fbe34635d9c', 4,
     'both hands empty, dashes forward in a fast low sprint, body leaning far forward, legs stretched in a long stride, arms swung back',
     'public/assets/neon/player/alex-dash.png'),
    ('mascot-attack', '2370b80c-ac64-49c3-8b07-f225c9e23de7', 6,
     'big wind-up: sinks into a deep crouch with shoulders hunched and arms pulled back, then explodes into a full forward lunge, whole body leaning far forward shoulder first like a football tackle',
     'public/assets/neon/enemies/mascot-attack.png'),
    ('spritzer-attack', 'cd520aac-8bba-4d2f-a244-96fe2c7af2a5', 6,
     'draws back her perfume bottle, then thrusts it forward and sprays a cloud of perfume ahead',
     'public/assets/neon/enemies/spritzer-attack.png'),
    ('roofer-attack', 'd6eb1ca9-7b67-4f9e-909c-18eac03de22f', 6,
     'swings a bucket of hot tar back behind him, then heaves it forward and throws it overhand',
     'public/assets/neon/enemies/roofer-attack.png'),
    # Bosses: every attack starts with the same telegraph (a slam, a charge or a barrage),
    # so one big wind-up then a heavy release per boss covers all of them.
    ('manager-attack', '1daf7771-c708-4e8e-82bd-3b95a04c0b65', 6,
     'big wind-up: raises his clipboard high overhead with both hands, rising up tall, then slams it down hard onto the floor in front of him, leaning far forward',
     'public/assets/neon/enemies/manager-attack.png'),
    ('owner-attack', 'ae2fc5eb-9686-4b18-b65e-c41bbc3c3ff1', 6,
     'big wind-up: rears back and raises both huge robotic bear arms high overhead, then brings them crashing down together in a heavy ground slam, leaning forward',
     'public/assets/neon/enemies/owner-attack.png'),
    ('developer-attack', 'e3e0c843-5397-4c40-9515-e134f7113522', 6,
     'keeps his cream beige double-breasted suit, gold tie and gold aviator sunglasses exactly as he is; big wind-up: raises his rolled-up blueprints high overhead like a club, rising up tall, then smashes them down hard onto the floor in front of him, leaning far forward',
     'public/assets/neon/enemies/developer-attack.png'),
    ('santa-attack', '51e6a5de-b9ac-4f48-b127-f400b805a2f7', 6,
     'keeps his red Santa suit and his dark red sack of presents exactly as he is; big wind-up: swings the dark red sack up high overhead with both hands, then slams it down hard onto the floor in front of him, leaning far forward',
     'public/assets/neon/enemies/santa-attack.png'),
    ('glamour-queen-attack', 'a1821931-5c3e-4bcf-a119-ea88e224a8cc', 6,
     'big wind-up: raises her flash camera high overhead with both hands, arching back dramatically, then swings it down hard in front of her in a heavy strike, leaning far forward',
     'public/assets/neon/enemies/glamour-queen-attack.png'),
    ('whiskers-attack', 'aaf35aa7-d075-4c9a-8c2f-2bb1aed59eeb', 6,
     'big wind-up: crouches low and rears up on its hind legs with both clawed front paws raised high, then pounces forward and slams both front paws down onto the floor',
     'public/assets/neon/enemies/whiskers-attack.png'),
    ('zamboni-attack', '721b6f96-ab96-4a61-89a6-d73daf6b294b', 6,
     'holding the same long straight wooden-handled ice scraper pole with a flat steel blade on the end that he always carries, no other tools or effects; big wind-up: raises the long scraper pole high overhead with both hands, rising up tall, then smashes it down hard onto the floor in front of him, leaning far forward',
     'public/assets/neon/enemies/zamboni-attack.png'),
    # District monsters (92 px). The game already looks for these keys.
    ('poodle-attack', '2ea97b6f-6dba-456c-ad71-5ad4b6528780', 6,
     'keeps its pink matted fur and rhinestone collar exactly as it is; crouches low with hackles up and snarls, haunches bunched, then springs forward in a fast low lunge, body stretched out',
     'public/assets/neon/enemies/poodle-attack.png'),
    ('elf-attack', 'd0c9c0ba-7a72-43c5-8f23-514bf5f6854e', 6,
     'keeps its green felt tunic, pointy green hat with bell and red striped stockings exactly as they are; crouches deep, then springs up into the air with knees tucked, then lands hard in a stomp',
     'public/assets/neon/enemies/elf-attack.png'),
    ('goon-attack', '82aa6f6f-d930-4dc4-bb77-cf54300ae902', 6,
     'keeps its teal jersey, helmet with cage visor and padded shoulders exactly as they are; winds a hockey stick back high over the shoulder with both hands, then swings it through low in a hard slap shot',
     'public/assets/neon/enemies/goon-attack.png'),
    # V1 hurt reactions (4 frames: struck, recoil, stagger, recover). Banked art: each
    # still needs its EnemyReactionView wiring (docs/VISUAL_ROADMAP.md V1) before publishing.
    ('walker-hurt', '287ef491-a0c0-4326-a4f6-2b5fd114f5db', 4,
     'keeps its tracksuit and sneakers exactly as they are; gets hit hard in the chest, flinches back with head snapping back and arms flung up, staggers, then recovers to standing',
     'public/assets/neon/enemies/walker-hurt.png'),
    ('elf-hurt', 'd0c9c0ba-7a72-43c5-8f23-514bf5f6854e', 4,
     'keeps its green felt tunic, pointy green hat with bell and red striped stockings exactly as they are; gets hit hard, flinches back with head snapping back and arms flung up, staggers, then recovers to standing',
     'public/assets/neon/enemies/elf-hurt.png'),
    ('spritzer-hurt', 'cd520aac-8bba-4d2f-a244-96fe2c7af2a5', 4,
     'keeps its outfit, hair and perfume bottle exactly as they are; gets hit hard, flinches back with head snapping back, staggers, then recovers to standing',
     'public/assets/neon/enemies/spritzer-hurt.png'),
    ('poodle-hurt', '2ea97b6f-6dba-456c-ad71-5ad4b6528780', 4,
     'keeps its pink matted fur and rhinestone collar exactly as it is; gets hit hard, yelps and recoils backwards with head jerked up, staggers, then recovers to standing on all fours',
     'public/assets/neon/enemies/poodle-hurt.png'),
    ('goon-hurt', '82aa6f6f-d930-4dc4-bb77-cf54300ae902', 4,
     'keeps its teal jersey, helmet with cage visor and padded shoulders exactly as they are; gets hit hard, flinches back with head snapping back, staggers on its skates, then recovers to standing',
     'public/assets/neon/enemies/goon-hurt.png'),
]


def call(method, path, body=None, raw=False):
    req = urllib.request.Request(f'{API}{path}', method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={'Authorization': f'Bearer {os.environ["PIXELLAB_API_KEY"]}', 'Content-Type': 'application/json'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = r.read()
                return data if raw else json.loads(data)
        except urllib.error.HTTPError:
            raise
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            # Large ZIP exports occasionally drop through the proxy; back off and retry.
            time.sleep(2 ** (attempt + 1))
    raise SystemExit(f'{method} {path}: network kept failing')


def submit(only=None):
    """Queue each animation in turn; the plan limits concurrent jobs (HTTP 429), so wait it out."""
    done = json.loads(JOBS.read_text()) if JOBS.exists() else {}
    for name, character, frames, action, _ in ANIMATIONS:
        if name in done or (only and name not in only):
            continue
        for _ in range(120):
            try:
                res = call('POST', '/characters/animations', {
                    'character_id': character, 'mode': 'v3', 'animation_name': name, 'action_description': action,
                    'frame_count': frames, 'keep_first_frame': False, 'directions': ORDER})
                break
            except urllib.error.HTTPError as error:
                if error.code not in (423, 429):
                    raise
                time.sleep(20)
        done[name] = {'group': res['animation_group_id'], 'jobs': dict(zip(res['directions'], res['background_job_ids']))}
        JOBS.write_text(json.dumps(done, indent=2))
        print(name, 'queued', len(res['background_job_ids']), 'directions', flush=True)


def topup(only=None):
    """The API accepts only as many directions as there are free job slots and drops the
    rest, so queue each animation's missing directions onto its group until all 8 are in."""
    done = json.loads(JOBS.read_text())
    for name, character, frames, action, _ in ANIMATIONS:
        if (only and name not in only) or name not in done or not done[name]['jobs']:
            continue
        while missing := [d for d in ORDER if d not in done[name]['jobs']]:
            try:
                res = call('POST', '/characters/animations', {
                    'character_id': character, 'mode': 'v3', 'animation_group_id': done[name]['group'],
                    'animation_name': name, 'action_description': action,
                    'frame_count': frames, 'keep_first_frame': False, 'directions': missing})
            except urllib.error.HTTPError as error:
                if error.code not in (423, 429):
                    raise
                time.sleep(20)
                continue
            done[name]['jobs'].update(dict(zip(res['directions'], res['background_job_ids'])))
            JOBS.write_text(json.dumps(done, indent=2))
            print(name, 'queued', res['directions'], flush=True)
            if not res['directions']:
                time.sleep(20)


def group_of(character, name):
    for anim in call('GET', f'/characters/{character}')['animations']:
        if anim.get('display_name') == name:
            return anim['animation_group_id']
    raise SystemExit(f'{name}: no animation on {character}')


def redo(args):
    """Regenerate drifted directions: redo <name> <direction> [<direction> ...] [<name> <direction> ...]."""
    specs = {a[0]: a for a in ANIMATIONS}
    pairs, name = [], None
    for word in args:
        if word in specs:
            name = word
        elif word in ORDER and name:
            pairs.append((name, word))
        else:
            raise SystemExit(f'redo: {word!r} is neither an animation nor a direction')
    for name, direction in pairs:
        _, character, frames, action, _ = specs[name]
        group = group_of(character, name)
        call('DELETE', f'/characters/{character}/animations/{group}/directions/{direction}')
        while True:
            try:
                res = call('POST', '/characters/animations', {
                    'character_id': character, 'mode': 'v3', 'animation_group_id': group, 'animation_name': name,
                    'action_description': action, 'frame_count': frames, 'keep_first_frame': False, 'directions': [direction]})
                if res['directions']:
                    break
            except urllib.error.HTTPError as error:
                if error.code not in (423, 429):
                    raise
            time.sleep(20)
        print(name, direction, 'regenerating', flush=True)


def export(character):
    """The character ZIP (api host) carries every animation's frames; 423 while jobs run."""
    for _ in range(120):
        try:
            return zipfile.ZipFile(io.BytesIO(call('GET', f'/characters/{character}/zip', raw=True)))
        except urllib.error.HTTPError as error:
            if error.code != 423:
                raise
            time.sleep(15)
    raise SystemExit(f'{character}: still generating')


WALK_SHEETS = {
    'public/assets/neon/player/': 'public/assets/neon/player/alex-walk.png',
}


def walk_sheet_for(out):
    folder, name = out.rsplit('/', 1)
    if folder + '/' in WALK_SHEETS:
        return ROOT / WALK_SHEETS[folder + '/']
    return ROOT / folder / (name.rsplit('-', 1)[0] + '-walk.png')


def register(sheet, size, count, out):
    """PixelLab places a character anywhere in its (often larger) canvas. The renderer
    assumes an action canvas is the walk canvas grown evenly, so shift each facing row
    until its rest frame's feet and centre sit where the walk sheet puts them."""
    walk = Image.open(walk_sheet_for(out)).convert('RGBA')
    wsize = walk.height // 8
    grow = (size - wsize) / 2
    fixed = Image.new('RGBA', sheet.size, (0, 0, 0, 0))
    for row in range(8):
        wb = walk.crop((0, row * wsize, wsize, (row + 1) * wsize)).getchannel('A').getbbox()
        ab = sheet.crop((0, row * size, size, (row + 1) * size)).getchannel('A').getbbox()
        dx = round((wb[0] + wb[2]) / 2 + grow - (ab[0] + ab[2]) / 2)
        dy = round(wb[3] + grow - ab[3])
        for column in range(count):
            cell = sheet.crop((column * size, row * size, (column + 1) * size, (row + 1) * size))
            shifted = Image.new('RGBA', (size, size), (0, 0, 0, 0))
            shifted.alpha_composite(cell, (dx, dy)) if dx >= 0 and dy >= 0 else shifted.paste(cell.transform(cell.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy)), (0, 0))
            fixed.alpha_composite(shifted, (column * size, row * size))
        print(f'  row {row}: shift ({dx:+d}, {dy:+d})')
    return fixed


def drift(sheet, size, out):
    """Warn when the animation drew a different figure from the walk sheet: v3 sometimes
    re-scales a large character or swaps a colour (the Developer's cream suit came back navy)."""
    walk = Image.open(walk_sheet_for(out)).convert('RGBA')
    wsize = walk.height // 8
    ratios = []
    for row in range(8):
        w = walk.crop((0, row * wsize, wsize, (row + 1) * wsize))
        a = sheet.crop((0, row * size, size, (row + 1) * size))
        wb, ab = w.getchannel('A').getbbox(), a.getchannel('A').getbbox()
        ratio = (ab[3] - ab[1]) / (wb[3] - wb[1])
        ratios.append(ratio)
        mean = lambda im: [sum(c) / max(1, len(c)) for c in zip(*[p[:3] for p in im.get_flattened_data() if p[3] > 200])]
        dc = max(abs(x - y) for x, y in zip(mean(w), mean(a)))
        if not 0.92 <= ratio <= 1.08 or dc > 30:
            print(f'  WARNING row {row} ({ORDER[row]}): height x{ratio:.2f}, mean colour off by {dc:.0f}; look before publishing')
    median = sorted(ratios)[4]
    if median > 1.04:
        key = 'neon:enemy:' + out.rsplit('/', 1)[1][:-4]
        print(f"  figure is x{median:.2f} its walk size: add '{key}': {1 / median:.2f} to ACTION_FIGURE_SCALE (ActorSpriteView.ts)")


def collect(only=None):
    archives = {}
    for name, character, frames, action, out in ANIMATIONS:
        if only and name not in only:
            continue
        archive = archives.get(character) or archives.setdefault(character, export(character))
        meta = json.loads(archive.read('metadata.json'))
        anims = meta['states'][0]['frames']['animations'][name]
        rows = {d: [Image.open(io.BytesIO(archive.read(path))).convert('RGBA') for path in anims[d]] for d in ORDER}
        size = rows[ORDER[0]][0].size[0]
        count = min(len(r) for r in rows.values())
        sheet = Image.new('RGBA', (size * count, size * 8), (0, 0, 0, 0))
        for row, direction in enumerate(ORDER):
            for column, frame in enumerate(rows[direction][:count]):
                sheet.alpha_composite(frame, (column * size, row * size))
        sheet = register(sheet, size, count, out)
        drift(sheet, size, out)
        raw_path = HERE / f'{name}.png'
        sheet.save(raw_path)
        print(f'{name}: {count} frames x 8 facings at {size}px -> {raw_path.relative_to(ROOT)}', flush=True)


def publish(only=None):
    """After reviewing art/pixellab/<name>.png, copy it to its runtime path, losslessly recompressed."""
    for name, _, _, _, out in ANIMATIONS:
        if only and name not in only:
            continue
        src = Image.open(HERE / f'{name}.png').convert('RGBA')
        for path in (HERE / f'{name}.png', ROOT / out):
            src.save(path, optimize=True, compress_level=9)
        assert Image.open(ROOT / out).convert('RGBA').tobytes() == src.tobytes()
        print(f'{name}: published {out} ({(ROOT / out).stat().st_size // 1024} KB)')


if __name__ == '__main__':
    if sys.argv[1] == 'redo':
        redo(sys.argv[2:])
        raise SystemExit
    only = set(sys.argv[2:]) or None
    {'submit': submit, 'topup': topup, 'collect': collect, 'publish': publish}[sys.argv[1]](only)
