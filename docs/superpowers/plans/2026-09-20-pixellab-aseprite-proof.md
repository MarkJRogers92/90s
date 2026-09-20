# PixelLab to Aseprite Proof Asset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove a secure PixelLab-to-Aseprite-to-DEAD MALL workflow with one user-approved, palette-valid Bench Warrant kiosk sprite rendered in Night Shift.

**Architecture:** PixelLab creates one immutable 64x64 candidate through its configured MCP; the user sees and approves that raw image before any export. Aseprite then owns the editable master and native PNG export, while Phaser consumes only the local PNG and a non-secret provenance manifest. Host MCP configuration, art-production files, and game runtime files remain separate so no credential or generation dependency enters the shipped game.

**Tech Stack:** PixelLab Streamable HTTP MCP, macOS Keychain, Aseprite 1.3 batch/GUI extension, local Python 3 + Pillow art checks, Phaser 4, TypeScript, Vitest, Playwright, Vite.

**Spec:** `docs/superpowers/specs/2026-09-20-pixellab-aseprite-proof-design.md`

## Global Constraints

- Spend exactly one PixelLab generation; do not retry a completed result without new user approval.
- Show the untouched PixelLab candidate to the user and stop for approval before Aseprite cleanup, export, or game integration.
- Keep PixelLab authentication in Keychain service `pixellab-api` and environment variable `PIXELLAB_API_KEY`; never print, persist, or commit the token.
- Keep `pixellab`, `aseprite`, and `agent_bridge` as separate MCP registrations.
- Preserve the raw PixelLab output unchanged; the editable `.aseprite` file is a separate versioned master.
- The runtime asset is exactly 64x64 RGBA, transparent, native-size, palette-valid, low-top-down/3/4, non-isometric, and bottom-center anchored.
- Do not change any file under `src/sim`.
- Do not change the 960x480 viewport or begin the broader production-art pass.
- The game must make no runtime network request for the asset.
- Work only in `/Users/markrogers/Documents/Github Code/90s/.worktrees/pixellab-aseprite-proof` for repository changes; do not touch the user's dirty M5 worktree.
- Do not push, merge, publish, deploy, tag, or release.

## Review Focus

- **Missing or failed kiosk texture:** Night Shift must still launch and draw the existing vector kiosk fallback rather than crash or erase the interaction point; Task 6 adds a browser failure-path check.
- **Palette drift or semitransparent pixels:** the export must fail validation when an opaque RGB value is outside the approved palette or alpha is neither 0 nor 255; Task 3 pins both cases.
- **Broken bottom-center anchor:** the export must fail validation when its lowest occupied row is above row 63; Task 3 pins transparent bottom padding.
- **Accidental extra PixelLab spend:** a completed but rejected image must end execution at the user gate; Task 4 records the single job before displaying it and contains no retry step.
- **External runtime dependency:** the browser acceptance check must observe the kiosk loading from the local origin and no requests to PixelLab; Task 7 pins the request-origin behavior.

---

### Task 1: Register and verify the local Aseprite MCP beside PixelLab

**Files:**
- Modify: `/Users/markrogers/.codex/config.toml`
- Inspect: `/Users/markrogers/.local/bin/codex-mixed`
- Test: `/Users/markrogers/aseprite-mcp/tests/stdio_smoke.py`

**Interfaces:**
- Consumes: existing `[mcp_servers.pixellab]`, `[mcp_servers.agent_bridge]`, `/opt/homebrew/bin/uv`, and `/Users/markrogers/aseprite-mcp`.
- Produces: enabled `aseprite` MCP registration with 15 tools and a verified Aseprite Lua round trip.

- [ ] **Step 1: Capture the live MCP baseline without secrets**

Run:

```bash
/Users/markrogers/.local/bin/codex mcp list
/Users/markrogers/.local/bin/codex mcp get pixellab
/Users/markrogers/.local/bin/codex mcp get agent_bridge
```

Expected: `pixellab` and `agent_bridge` are enabled; PixelLab reports `PIXELLAB_API_KEY`, never its value.

- [ ] **Step 2: Add the Aseprite server as an independent table**

Add this exact block to `/Users/markrogers/.codex/config.toml` without editing either existing server:

```toml
[mcp_servers.aseprite]
command = "/opt/homebrew/bin/uv"
args = ["run", "--project", "/Users/markrogers/aseprite-mcp", "aseprite-mcp"]
startup_timeout_sec = 30
tool_timeout_sec = 180
enabled = true
```

- [ ] **Step 3: Verify Codex parses all three registrations**

Run:

```bash
/Users/markrogers/.local/bin/codex mcp get aseprite
/Users/markrogers/.local/bin/codex mcp list
```

Expected: `aseprite`, `pixellab`, and `agent_bridge` are enabled; the Aseprite command and arguments exactly match Step 2.

- [ ] **Step 4: Run the real Aseprite MCP end-to-end smoke**

Run:

```bash
/opt/homebrew/bin/uv run --project /Users/markrogers/aseprite-mcp python /Users/markrogers/aseprite-mcp/tests/stdio_smoke.py
```

Expected: `MCP stdio smoke PASS`, 15 tools listed, status round trip succeeds, and create/draw/layer/frame/tag/export/preview checks pass.

- [ ] **Step 5: Re-run the no-generation PixelLab health check**

Run:

```bash
/Users/markrogers/.npm-global/bin/claude-mixed --verify-pixellab
```

Expected: PixelLab initializes, `tools/list` returns its current inventory, and output explicitly says no image-generation tool was called.

- [ ] **Step 6: Record the reload boundary**

Do not claim the current Codex tool catalog hot-reloaded. Record that a fresh Codex session is required for interactive `aseprite` tools, while Steps 3-5 prove the saved configuration and both underlying servers. This host configuration is local and is not committed to the game repository.

### Task 2: Install and open the official PixelLab Aseprite extension

**Files:**
- Create through Aseprite: `/Users/markrogers/Library/Application Support/Aseprite/extensions/` (the package chooses its installed subdirectory name; record that actual name after installation)
- Inspect: `/Applications/Aseprite.app`

**Interfaces:**
- Consumes: the authenticated PixelLab account download and installed non-trial Aseprite 1.3+.
- Produces: a visible PixelLab panel reachable through `Edit > PixelLab > Open plugin`.

- [ ] **Step 1: Confirm the installed Aseprite is eligible**

Open Aseprite and check `Aseprite > About Aseprite`.

Expected: version is at least 1.3.7 and is not the trial build. The headless MCP previously observed 1.3.18.5-arm64; treat the visible About dialog as the current GUI evidence.

- [ ] **Step 2: Download only the account-provided extension**

Open the authenticated PixelLab account page and use its extension download button, following [PixelLab's official installation guide](https://www.pixellab.ai/docs/installation).

Expected: an official Aseprite extension package downloads. If login or account confirmation is required, pause and ask the user to complete that step; do not fetch an unofficial mirror.

- [ ] **Step 3: Install the downloaded package**

First try double-clicking the extension file. If macOS does not hand it to Aseprite, use:

```text
Aseprite > Edit > Preferences > Extensions > Add Extension
```

Select the downloaded official package and restart Aseprite.

- [ ] **Step 4: Grant the documented plugin permissions**

Accept access to the extension's `package.json` and WebSocket network access. Leave full trust disabled for this proof, so the extension cannot overwrite itself for auto-update; do not broaden filesystem access beyond Aseprite's prompt.

- [ ] **Step 5: Verify the visible panel without generating**

Open:

```text
Edit > PixelLab > Open plugin
```

Expected: the PixelLab panel appears and reaches its signed-in/ready screen. Do not press Generate. Capture the extension name/version from Aseprite Preferences for the verification notes.

### Task 3: Add a deterministic art-export validator

**Files:**
- Create: `/Users/markrogers/deadmall-art/tools/validate_runtime_asset.py`
- Create: `/Users/markrogers/deadmall-art/tools/test_validate_runtime_asset.py`
- Read: `/Users/markrogers/deadmall-art/work/deadmall-global.json`

**Interfaces:**
- Consumes: `validate(path: Path, palette_path: Path, width: int, height: int) -> list[str]` inputs.
- Produces: exit 0 for a valid 64x64 binary-alpha, palette-contained, bottom-contact PNG; exit 1 plus concrete errors otherwise.

- [ ] **Step 1: Write failing validator tests**

Create `test_validate_runtime_asset.py` with this helper and temporary Pillow images:

```python
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

from validate_runtime_asset import validate


def write_png(path: Path, size=(64, 64), color=(10, 20, 30, 255), bottom=True) -> Path:
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    y = size[1] - 1 if bottom else size[1] - 2
    image.putpixel((size[0] // 2, y), color)
    image.save(path)
    return path


def test_accepts_palette_valid_rgba_with_bottom_contact():
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        palette_json = root / "palette.json"
        palette_json.write_text('{"grid":[{"swatches":[{"rgb":[10,20,30]}]}]}')
        assert validate(write_png(root / "valid.png"), palette_json, 64, 64) == []

def test_rejects_wrong_size_off_palette_semialpha_and_bottom_gap():
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        palette_json = root / "palette.json"
        palette_json.write_text('{"grid":[{"swatches":[{"rgb":[10,20,30]}]}]}')
        cases = {
            "expected 64x64": write_png(root / "wrong.png", size=(32, 32)),
            "outside approved palette": write_png(root / "off.png", color=(11, 20, 30, 255)),
            "alpha must be 0 or 255": write_png(root / "alpha.png", color=(10, 20, 30, 127)),
            "bottom row has no opaque anchor pixel": write_png(root / "gap.png", bottom=False),
        }
        for message, path in cases.items():
            assert any(message in error for error in validate(path, palette_json, 64, 64))
```

The test palette JSON uses the same nested `grid` / `swatches` / `rgb` shape as `deadmall-global.json`, so the test does not depend on production palette values.

- [ ] **Step 2: Run the tests and observe the intended failure**

Run:

```bash
cd /Users/markrogers/deadmall-art
python3 tools/test_validate_runtime_asset.py
```

Expected: FAIL because `validate_runtime_asset` does not exist.

- [ ] **Step 3: Implement the minimal validator**

Implement these exact checks in `validate_runtime_asset.py`:

```python
def load_palette(path: Path) -> set[tuple[int, int, int]]:
    data = json.loads(path.read_text())
    return {
        tuple(swatch["rgb"])
        for ramp in data["grid"]
        for swatch in ramp["swatches"]
    }


def validate(path: Path, palette_path: Path, width: int, height: int) -> list[str]:
    image = Image.open(path).convert("RGBA")
    errors: list[str] = []
    if image.size != (width, height):
        errors.append(f"expected {width}x{height}, got {image.width}x{image.height}")
    pixels = list(image.getdata())
    if any(alpha not in (0, 255) for _, _, _, alpha in pixels):
        errors.append("alpha must be 0 or 255")
    palette = load_palette(palette_path)
    extras = sorted({tuple(rgb) for *rgb, alpha in pixels if alpha == 255 and tuple(rgb) not in palette})
    if extras:
        errors.append(f"{len(extras)} opaque colors outside approved palette")
    if image.height and not any(image.getpixel((x, image.height - 1))[3] == 255 for x in range(image.width)):
        errors.append("bottom row has no opaque anchor pixel")
    return errors
```

Add a CLI taking `IMAGE --palette PATH --width 64 --height 64`; print every error to stderr and exit 1, otherwise print a concise PASS record and exit 0.

- [ ] **Step 4: Run the validator tests**

Run:

```bash
cd /Users/markrogers/deadmall-art
python3 tools/test_validate_runtime_asset.py
```

Expected: all five valid/invalid cases pass.

- [ ] **Step 5: Verify the production palette source before generation**

Run:

```bash
cd /Users/markrogers/deadmall-art
python3 tools/palette_report.py work/extracted-strip.png --json
python3 tools/test_palette_report.py
```

Expected: the strip is 95 or fewer exact opaque colors with `EXACT` verdict; palette-report tests pass 4/4. If the strip fails, stop before generation and repair the palette input from `deadmall-global.json` rather than sending an ambiguous color source.

### Task 4: Generate exactly one raw kiosk candidate and stop for user review

**Files:**
- Create: `/Users/markrogers/deadmall-art/work/pixellab/bench-warrant-kiosk/v1/original/pixellab-bench-warrant-kiosk.png`
- Create: `/Users/markrogers/deadmall-art/work/pixellab/bench-warrant-kiosk/v1/manifest.json`
- Create: `/Users/markrogers/deadmall-art/work/pixellab/bench-warrant-kiosk/v1/review/raw-preview.png`

**Interfaces:**
- Consumes: PixelLab MCP tool `create_image_pixflux`, `get_image`, and `/Users/markrogers/deadmall-art/work/extracted-strip.png` encoded as the tool's `color_image_base64`.
- Produces: one immutable raw PNG, its single-job metadata, and a displayed user-approval checkpoint.

- [ ] **Step 1: Create versioned directories without overwriting anything**

Create `original`, `review`, `source`, and `exports` beneath the exact `v1` directory. Abort if `original/pixellab-bench-warrant-kiosk.png` or `manifest.json` already exists; never recycle `v1`.

- [ ] **Step 2: Write the preflight manifest before spending**

Write `manifest.json` with:

```json
{
  "schemaVersion": 1,
  "asset": "bench-warrant-kiosk",
  "version": "v1",
  "status": "preflight",
  "tool": "create_image_pixflux",
  "costLimitGenerations": 1,
  "seed": 19950920,
  "width": 64,
  "height": 64,
  "paletteSource": "/Users/markrogers/deadmall-art/work/extracted-strip.png",
  "rawApproved": false
}
```

Do not include the API token or any authorization header.

- [ ] **Step 3: Submit the one authorized generation through the MCP tool**

Read `/Users/markrogers/deadmall-art/work/extracted-strip.png`, base64-encode its exact bytes, and build these arguments. Pass the resulting `arguments` mapping to `create_image_pixflux` exactly once:

```python
import base64
from pathlib import Path

palette_b64 = base64.b64encode(
    Path("/Users/markrogers/deadmall-art/work/extracted-strip.png").read_bytes()
).decode("ascii")
arguments = {
    "description": "Static Bench Warrant fusion kiosk for a haunted abandoned 1990s American shopping mall, an improvised mall service counter built from mauve laminate, tarnished brass and beige trim, with a small CRT terminal, coiled cables and tool drawers, readable chunky silhouette, detailed late-SNES pixel art, low top-down three-quarter view, non-isometric, centered, base touches the bottom of the canvas, no words, no logos, no people",
    "width": 64,
    "height": 64,
    "no_background": True,
    "view": "low top-down",
    "isometric": False,
    "outline": "selective outline",
    "shading": "detailed shading",
    "detail": "highly detailed",
    "text_guidance_scale": 8.0,
    "color_image_base64": palette_b64,
    "seed": 19950920,
}
```

The MCP schema documents this call as one generation. Do not call `create_image_pro`, object generation, edit, correct, reduce-colors, or retry.

- [ ] **Step 4: Record the returned job before polling**

Immediately add the returned job ID, reported cost, submission timestamp, and `status: "processing"` to the manifest. If submission returns no job ID, record the full non-secret error and stop; do not resubmit until PixelLab confirms whether a generation was charged.

- [ ] **Step 5: Poll only the same job**

Read `job_id` back from the manifest and call `get_image` with that exact string until it reports `completed` or `failed`. Do not create a second job. On failure, record the server's non-secret error and charged-cost evidence, then stop.

- [ ] **Step 6: Preserve and hash the untouched result**

Save the completed image exactly as returned to `original/pixellab-bench-warrant-kiosk.png`, copy the same bytes to `review/raw-preview.png`, and record SHA-256, completion timestamp, native dimensions, and `status: "raw_pending_review"` in the manifest.

- [ ] **Step 7: Show the raw image and stop**

Display `review/raw-preview.png` to the user in the conversation. State the recorded one-generation cost and ask for approve/reject. **Do not continue to Task 5 in the same turn.** A rejection ends execution with `status: "raw_rejected"`; no other PixelLab call is authorized.

### Task 5: Create the Aseprite master and validated runtime export

**Files:**
- Create: `/Users/markrogers/deadmall-art/work/pixellab/bench-warrant-kiosk/v1/source/bench-warrant-kiosk-v1.aseprite`
- Create: `/Users/markrogers/deadmall-art/work/pixellab/bench-warrant-kiosk/v1/exports/bench-warrant-kiosk.png`
- Create: `public/assets/props/bench-warrant-kiosk.png`
- Create: `artifacts/provenance/bench-warrant-kiosk.json`

**Interfaces:**
- Consumes: user-approved raw PNG and Aseprite MCP tools `run_lua`, `sprite_info`, `preview`, and `export_png`.
- Produces: editable 64x64 Aseprite master, validated native PNG, local game asset, and non-secret provenance record.

- [ ] **Step 1: Record explicit raw approval**

Update the art manifest to `rawApproved: true`, `status: "raw_approved"`, and record the approval timestamp. Do not proceed from an ambiguous response.

- [ ] **Step 2: Create the Aseprite master without changing the raw file**

Use Aseprite MCP `run_lua` to open the raw PNG and save it to the exact `.aseprite` source path. Name the initial layer `PixelLab approved raw`. Then call `sprite_info` and assert width 64, height 64, one frame, and at least one cel.

- [ ] **Step 3: Validate the unmodified Aseprite export**

Use `export_png` with `scale: 1` and the exact exports path. Run:

```bash
python3 /Users/markrogers/deadmall-art/tools/validate_runtime_asset.py \
  /Users/markrogers/deadmall-art/work/pixellab/bench-warrant-kiosk/v1/exports/bench-warrant-kiosk.png \
  --palette /Users/markrogers/deadmall-art/work/deadmall-global.json \
  --width 64 --height 64
```

Expected: PASS. If palette, alpha, or bottom-contact validation fails, correct only those objective defects in a new Aseprite layer or palette-remap step; preserve the approved layer unchanged underneath.

- [ ] **Step 4: Preview visible cleanup before copying it into the game**

Call Aseprite MCP `preview` at a readable integer scale. If any visible pixel changed beyond exact palette snapping, binary-alpha normalization, or removal of transparent rows below the base, show this cleaned preview and wait for user approval before continuing.

- [ ] **Step 5: Re-export and revalidate the final master**

Export at scale 1, rerun the validator, and record the master and export SHA-256 values plus validator result in the art manifest.

- [ ] **Step 6: Copy the validated PNG and write repository provenance**

Copy the validated bytes to `public/assets/props/bench-warrant-kiosk.png`. Write `artifacts/provenance/bench-warrant-kiosk.json` with schema version, asset version, prompt, seed, PixelLab job ID, reported cost, raw SHA-256, master SHA-256, runtime SHA-256, palette source name, dimensions, anchor `bottom-center`, and generation/approval timestamps. Exclude absolute credential paths and all secrets.

- [ ] **Step 7: Commit the approved asset checkpoint**

Run:

```bash
git add public/assets/props/bench-warrant-kiosk.png artifacts/provenance/bench-warrant-kiosk.json
git commit -m "art: add approved Bench Warrant kiosk proof"
```

Expected: one asset/provenance commit with no source-code change.

### Task 6: Load and render the kiosk with a safe fallback

**Files:**
- Create: `src/game/assets.ts`
- Modify: `src/game/scenes/MvpRunScene.ts:189-256`
- Modify: `src/game/view/MvpRunView.ts:10-75` and its `destroy()` method
- Modify: `tests/browser/night-shift.spec.ts`

**Interfaces:**
- Consumes: `BENCH_WARRANT_KIOSK_TEXTURE` and `BENCH_WARRANT_KIOSK_URL` from `src/game/assets.ts`.
- Produces: scene preload, bottom-center kiosk image when texture exists, and current vector rendering when it does not.

- [ ] **Step 1: Add browser tests for local loading and missing-texture survival**

Add one test that starts a response watcher before `launchRun(page)` and asserts:

```ts
const kioskResponse = page.waitForResponse(
  (response) => response.url().endsWith('/assets/props/bench-warrant-kiosk.png'),
);
await launchRun(page);
expect((await kioskResponse).status()).toBe(200);
expect(errors.pageErrors).toEqual([]);
expect(errors.consoleErrors).toEqual([]);
```

Add a second test that calls `page.route('**/assets/props/bench-warrant-kiosk.png', route => route.abort())` before launch, then asserts one visible canvas, one M5 HUD, `roomId === 'service_corridor'`, and no page errors. Do not require an empty console-error list for this intentional loader failure.

- [ ] **Step 2: Run the focused browser tests and observe the intended failures**

Run:

```bash
npx playwright test tests/browser/night-shift.spec.ts --grep "kiosk texture"
```

Expected: the local-loading test fails because no scene requests the PNG; the missing-texture test may pass only after the named test exists, but the pair is not green.

- [ ] **Step 3: Define the asset interface**

Create `src/game/assets.ts`:

```ts
export const BENCH_WARRANT_KIOSK_TEXTURE = 'bench-warrant-kiosk';
export const BENCH_WARRANT_KIOSK_URL = '/assets/props/bench-warrant-kiosk.png';
```

- [ ] **Step 4: Preload the local texture**

Import both constants into `MvpRunScene.ts` and add before `create()`:

```ts
public preload(): void {
  this.load.image(BENCH_WARRANT_KIOSK_TEXTURE, BENCH_WARRANT_KIOSK_URL);
}
```

Do not add any URL outside the local `/assets` path.

- [ ] **Step 5: Render the texture or current vector fallback**

In `MvpRunView`, add:

```ts
private benchKioskSprite: Phaser.GameObjects.Image | undefined;
```

Extract the current kiosk vector block into `drawBenchKioskFallback(x, y)`. Add `syncBenchKiosk(x, y)` that:

1. Always draws the existing 48-unit interaction ring and retains the `BENCH WARRANT` label.
2. Checks `this.scene.textures.exists(BENCH_WARRANT_KIOSK_TEXTURE)`.
3. Lazily creates `scene.add.image(x, y, BENCH_WARRANT_KIOSK_TEXTURE)` with `.setOrigin(0.5, 1)` and integer position.
4. Reuses and shows the image on later syncs.
5. Calls the extracted vector fallback when the texture is absent.
6. Hides the image and clears the label when the room has no kiosk.

Set the kiosk image to the smallest display depth that keeps it above the room background. Do not resize, smooth, rotate, or mutate the texture; the game configuration already has `pixelArt`, `roundPixels`, and antialiasing disabled.

- [ ] **Step 6: Destroy the image with the view**

In `MvpRunView.destroy()`, call `this.benchKioskSprite?.destroy()` and clear the reference before destroying graphics/labels. This prevents restart loops from accumulating image objects.

- [ ] **Step 7: Run focused browser and type checks**

Run:

```bash
npx playwright test tests/browser/night-shift.spec.ts --grep "kiosk texture"
npm run typecheck
```

Expected: both kiosk tests pass and TypeScript exits 0.

- [ ] **Step 8: Commit the renderer checkpoint**

Run:

```bash
git add src/game/assets.ts src/game/scenes/MvpRunScene.ts src/game/view/MvpRunView.ts tests/browser/night-shift.spec.ts
git commit -m "feat: render the Bench Warrant kiosk sprite"
```

### Task 7: Verify the full proof and show the in-game result

**Files:**
- Modify: `STATUS.md`
- Modify: `TEST_EVIDENCE.md`
- Modify: `NEXT_SESSION.md`
- Create: `artifacts/pixellab-bench-warrant-kiosk-in-game.png`

**Interfaces:**
- Consumes: completed host setup, approved asset checkpoint, and renderer checkpoint.
- Produces: reproducible verification evidence, a real gameplay screenshot, and a continuation-safe handoff.

- [ ] **Step 1: Run targeted asset and Aseprite checks**

Run:

```bash
python3 /Users/markrogers/deadmall-art/tools/test_validate_runtime_asset.py
python3 /Users/markrogers/deadmall-art/tools/validate_runtime_asset.py \
  public/assets/props/bench-warrant-kiosk.png \
  --palette /Users/markrogers/deadmall-art/work/deadmall-global.json \
  --width 64 --height 64
/opt/homebrew/bin/uv run --project /Users/markrogers/aseprite-mcp python /Users/markrogers/aseprite-mcp/tests/stdio_smoke.py
```

Expected: validator unit checks, runtime asset validation, and Aseprite MCP smoke all pass.

- [ ] **Step 2: Run the relevant game gate**

Run in order:

```bash
npm run typecheck
npm test -- --run tests/integration/mvp-run.test.ts --no-file-parallelism
npx playwright test tests/browser/night-shift.spec.ts
npm run build
```

Expected: typecheck, focused integration suite, Night Shift Chromium suite, and production build all exit 0. Do not run unrelated browser specs unless one of these checks exposes a shared regression.

- [ ] **Step 3: Inspect runtime requests and capture the gameplay screenshot**

Start the local development server with the existing M5 debug bridge, open `/?fixture=mvp-bench&seed=4242`, and capture `artifacts/pixellab-bench-warrant-kiosk-in-game.png` at 1440x900 after the scene stabilizes.

Record:

- one canvas and one visible M5 HUD;
- the kiosk visible at gameplay scale;
- kiosk PNG response from `http://127.0.0.1:5173/assets/props/bench-warrant-kiosk.png`;
- zero requests to `pixellab.ai` or any other external origin;
- zero page errors and zero unexpected console errors.

- [ ] **Step 4: Show the screenshot and stop for the final visual gate**

Display `artifacts/pixellab-bench-warrant-kiosk-in-game.png` to the user. Do not call the proof complete until the user approves the real game view.

- [ ] **Step 5: Update the checkpoint documents with actual evidence**

After visual approval, add a concise dated entry to `STATUS.md`, `TEST_EVIDENCE.md`, and `NEXT_SESSION.md` containing exact commands/results, PixelLab one-generation cost, raw approval, Aseprite extension/MCP status, runtime screenshot path, known limitations, and the explicit statement that no broader art pass, push, merge, deploy, or release occurred.

- [ ] **Step 6: Run final diff and production-boundary checks**

Run:

```bash
git diff --check
git status --short
rg -n "PIXELLAB_API_KEY|pixellab-api|Authorization: Bearer|api\.pixellab\.ai" \
  src public artifacts docs STATUS.md TEST_EVIDENCE.md NEXT_SESSION.md
```

Expected: `git diff --check` is clean; secret/API scan has no credential or runtime endpoint in shipped files. Documentation may name PixelLab but must not include a token.

- [ ] **Step 7: Commit the verified handoff**

Run:

```bash
git add STATUS.md TEST_EVIDENCE.md NEXT_SESSION.md artifacts/pixellab-bench-warrant-kiosk-in-game.png
git commit -m "docs: verify the PixelLab Aseprite proof"
```

Expected: clean `codex/pixellab-aseprite-proof` worktree with three local commits after the design commit: approved asset, renderer, and verified handoff. No external release action follows.
