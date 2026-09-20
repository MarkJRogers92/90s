# PixelLab to Aseprite Proof Asset Design

**Date:** 2026-09-20  
**Project:** DEAD MALL (`90s`)  
**Status:** Approved in conversation; awaiting written-spec review

## Intent

Establish a secure, repeatable PixelLab-to-Aseprite-to-Phaser asset workflow and prove it with one visible Bench Warrant kiosk sprite. The proof must preserve editable source art, respect the existing DEAD MALL visual direction, avoid runtime network dependencies, and leave gameplay behavior unchanged.

Success means:

- PixelLab and Aseprite are available as separate Codex tools without disturbing `agent_bridge`.
- The official PixelLab Aseprite extension opens successfully for hands-on use.
- Exactly one PixelLab generation produces a 64x64 transparent kiosk candidate.
- The user sees and approves the raw candidate before cleanup, export, or game integration.
- An approved candidate becomes a versioned Aseprite master and native-size PNG.
- Night Shift renders the PNG at the existing Bench Warrant kiosk location.
- Focused verification demonstrates that the asset is local, correctly formed, and visible in the real game.

## Scope

### Included

- Preserve the existing Keychain-backed PixelLab authentication.
- Add the existing local Aseprite MCP server to shared Codex configuration.
- Verify PixelLab and Aseprite MCP initialization without generating an image.
- Install and open the official PixelLab Aseprite extension if the authenticated account download is accessible.
- Generate one static Bench Warrant kiosk candidate.
- Preserve generation provenance and the untouched output.
- Create an editable `.aseprite` master and native-resolution PNG export.
- Integrate the approved PNG into the M5 Night Shift renderer in this isolated worktree.
- Add targeted asset validation and perform a real browser visual check.

### Excluded

- Additional generations or automatic retries.
- Character animation, tileset production, viewport conversion, or a general production-art pass.
- Changes to simulation rules, collision, interaction range, fusion, economy, checkpointing, or room generation.
- Runtime PixelLab/API calls.
- Push, merge, deploy, release, or publication.

## Architecture and Ownership

The pipeline is:

```text
PixelLab MCP generation
  -> untouched generated original + metadata
  -> user preview and approval gate
  -> Aseprite editable master
  -> validated native PNG export
  -> local Phaser texture
```

`/Users/markrogers/deadmall-art` remains the art-production workspace. It owns the generation original, prompt/seed/job metadata, Aseprite master, and review material. The game repository receives only the approved runtime PNG and a small provenance manifest needed to trace it back to its source.

The `.aseprite` file is the editable production master. PixelLab output is never overwritten. Generated, cleaned, and exported files use distinct versioned paths.

PixelLab, Aseprite, and `agent_bridge` remain separate MCP registrations. PixelLab authentication continues to come from the macOS Keychain item `pixellab-api` through `PIXELLAB_API_KEY`; no token is written into source, configuration literals, logs, prompts, or commits.

## Tool Configuration

### PixelLab

Keep the existing Streamable HTTP configuration at `https://api.pixellab.ai/mcp` with `bearer_token_env_var = "PIXELLAB_API_KEY"`. Verify it by initialization and tool listing before any paid call.

### Aseprite MCP

Register the existing local server with the same command already used by the mixed Claude setup:

```text
/opt/homebrew/bin/uv run --project /Users/markrogers/aseprite-mcp aseprite-mcp
```

Verify it through `aseprite_status` and the repository's end-to-end stdio smoke test. The server runs Aseprite in batch mode and does not require the GUI to remain open.

### Official Aseprite Extension

Download the extension only from the user's authenticated PixelLab account. Install it using Aseprite's supported extension flow and verify that its PixelLab panel opens. This interactive extension is a convenience for the user's manual editing; the reproducible proof pipeline must remain operable through the MCP and local files.

If the account download requires a login or confirmation unavailable to automation, stop at that boundary and ask the user to complete the login. Do not substitute an unofficial download.

Configuration changes require a fresh Codex session before the new MCP catalog can be considered ready. Command-line configuration output alone is not acceptance.

## Proof Asset

The proof asset is a static **Bench Warrant kiosk**:

- Canvas: 64x64 pixels.
- Background: transparent.
- View: low top-down / 3/4 top-down, not isometric.
- Anchor: bottom-center with no transparent margin below the contact point.
- Style: detailed late-SNES pixel art consistent with the existing DEAD MALL reference pack.
- Palette: the existing DEAD MALL palette supplied as PixelLab's forced color image.
- Content: a compact, slightly improvised mall-service kiosk that reads as the in-world fusion station at normal gameplay scale.

Use `create_image_pixflux`, which costs one generation and supports a forced palette image. Record the exact description, dimensions, seed, returned job ID, reported cost, tool name, and timestamp.

No second generation is authorized. If the job fails without charging, retry only when PixelLab explicitly reports that it did not consume a generation. If the result completes but is unsuitable, preserve and show it, then stop for user direction.

## Preview and Approval Gate

The raw completed PixelLab image must be shown to the user before any Aseprite cleanup, palette correction, export, or game integration.

Approval applies only to the displayed candidate. Rejection ends the proof at that point unless the user separately authorizes another generation. Do not interpret approval of this design as approval to spend more than one generation.

## Aseprite Processing

After raw-image approval:

1. Preserve the PixelLab PNG unchanged.
2. Open or import it through Aseprite and save a new versioned `.aseprite` master.
3. Check dimensions, transparency, bottom-center contact point, and palette membership.
4. Correct only objective production defects: stray isolated pixels, unintended semitransparency, palette mismatches, or transparent padding that breaks the anchor.
5. Preserve the approved silhouette and design. Do not redraw it into a different asset without another preview.
6. Export one 64x64 RGBA PNG at native size with no filtering or scaling.

The cleaned Aseprite result should also be previewed for the user before game integration if cleanup changes visible pixels beyond mechanical palette snapping or transparent-padding removal.

## Game Integration

The implementation stays in the presentation layer:

- Store the runtime PNG at `public/assets/props/bench-warrant-kiosk.png`.
- Preload it in `MvpRunScene` under one stable texture key.
- Update `MvpRunView` to draw the texture at `room.benchKiosk` with a bottom-center origin.
- Keep the existing label and interaction presentation readable.
- Retain a vector fallback when the texture is unavailable so an asset-loading problem does not erase the kiosk.

No file under `src/sim` changes for this proof. The game remains fully offline after build; it never contacts PixelLab at runtime.

## Error Handling and Safety

- Never overwrite the PixelLab original or an existing Aseprite master.
- Never print or persist the API token.
- Stop before paid generation if authentication, tool inventory, palette preparation, or output paths are not verified.
- Stop after an unsuitable completed generation rather than spending again.
- Preserve the user's dirty M5 worktree; all repository changes occur on `codex/pixellab-aseprite-proof` in its isolated worktree.
- If the official extension cannot be installed automatically, report the exact remaining manual step without weakening the MCP proof.
- Do not push, merge, publish, deploy, tag, or release.

## Verification

### Tooling

- Codex reports `pixellab`, `aseprite`, and `agent_bridge` enabled after a fresh-session reload.
- PixelLab `initialize` and `tools/list` succeed without a generation call.
- `aseprite_status` reports a successful Lua round trip.
- The Aseprite MCP stdio smoke test passes.
- The official extension opens inside Aseprite, or the exact authenticated manual-install boundary is recorded.

### Asset

- Raw generation preview approved by the user.
- Original PNG, `.aseprite` master, runtime PNG, and metadata manifest exist at their intended versioned paths.
- Runtime PNG is exactly 64x64 RGBA with a transparent background.
- Opaque pixels belong to the approved palette after cleanup.
- Bottom-center anchoring and contact padding are validated.
- Original and cleaned hashes are recorded so provenance is auditable.

### Game

- Targeted renderer/asset tests pass.
- `npm run typecheck` passes.
- `npm run build` passes.
- A focused Night Shift browser check shows the kiosk at gameplay scale with no page or console errors and no external runtime requests.
- The resulting screenshot is shown to the user before the proof is called complete.

## Completion Boundary

The proof is complete only after both user-visible gates pass: approval of the raw PixelLab candidate before export and approval of the real in-game screenshot after integration. Completion does not authorize a broader asset pass or the next game milestone.
