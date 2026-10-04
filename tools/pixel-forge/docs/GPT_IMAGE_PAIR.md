# GPT mockup + associated sprite sheet

## What this adds

`forge image-pair` and the MCP tool `forge_image_pair` operate one durable job:

1. Snapshot the original character/style references, any original edit target, and the game format.
2. Request exactly one initial mockup from a real image provider.
3. Request its associated sprite sheet, passing the original references and current authoritative mockup as images.
4. Check the returned PNG, exact native grid, cell occupancy and binary alpha.
5. Preserve every raw result. Request targeted follow-ups only when necessary, within the explicit follow-up budget. Every follow-up carries the original references; a sheet follow-up also carries its prior sheet and current mockup.

A corrected mockup supersedes older mockups as the visual target. Older versions remain in history; a new sheet is required after the mockup changes.

This is developer-side authoring only. It does not change the game runtime, register assets, start a hosted service, configure credentials, publish, or claim production art approval.

## Honest execution capabilities

- **Native caller tool:** an agent that actually has GPT image generation claims the pending request, invokes its own image tool, then accepts the returned local PNG. Pixel Forge Python cannot reach into an arbitrary GPT/Claude host's tool namespace. An unfulfilled request is `pending` or `in_flight`, never a generated result.
- **Private native Codex worker:** the opt-in [native stdio bridge](CODEX_NATIVE_BRIDGE.md) connects a same-host Claude-compatible client to a dedicated Codex worker. Its protocol/MCP transport is offline-tested; signed-in native image execution is still unverified. It requires separately authorized worker setup and is not a hosted subscription API.
- **Configured Images API:** a server owner may inject `OpenAIImagesBackend` with an already-authorized client, an explicit model/config revision, and `enabled=True`. Then a Claude, GPT, or cloud MCP caller can use the same `run` action. No native GPT tool is assumed in Claude. This route may incur API charges and requires independently configured account/model/network access.
- **Legacy Codex CLI:** `make --artist gpt-image` remains available where the installed CLI supports image generation and a request-owned output-file handoff. It is not used by the new native-caller job. The painter now fails closed on unsupported models, nonzero exit, missing output, symlinks, or invalid PNGs. It does not scan global image folders or silently retry another model.

`capabilities` reports local configuration, not proof of a live provider account. Importing these modules calls no provider. There is no hidden native-to-API fallback and no automatic retry after ambiguous completion.

## Claude (or any agent) in a cloud session: `image-pair run`

`forge/openai_http.py` is a dependency-free client shaped like the OpenAI SDK, so the
existing `OpenAIImagesBackend` can run from the command line with no extra install:

```bash
python -m forge image-pair begin --root ./image-jobs --spec ./pair.json
python -m forge image-pair run   --root ./image-jobs --key KEY --model gpt-image-1   # the mockup
# inspect results/000-mockup/accepted.png, then:
python -m forge image-pair run   --root ./image-jobs --key KEY --model gpt-image-1   # its sheet
```

Each `run` makes **one** request for the job's next pending stage and records the provider,
model and revision. It never retries.
- **4xx refusal:** an HTTP 4xx answer (for example `credit_balance_exhausted`, a bad key or an
  unsupported parameter) is a `PROVIDER_REJECTED` error with the API's error code. The request
  never ran and wasn't charged, so the job stays `pending` and you can `run` it again after
  fixing the cause.
- **Any other failure:** a 5xx, a timeout or a dropped connection leaves the stage `in_flight`
  with `unknown` completion. Reconcile it before calling again, because it may have been
  charged.
- **Billing:** API usage is billed from prepaid OpenAI API credits
  (platform.openai.com/settings/organization/billing), not from a ChatGPT subscription.

**What the environment needs:**
- **`OPENAI_API_KEY`** set as an environment variable. Use `--api-key-env NAME` to read a
  different one. The key is never printed or stored in the job ledger.
- **`api.openai.com`** allowed by the environment's network policy.

HTTPS uses the standard `HTTPS_PROXY` and `SSL_CERT_FILE` settings.

Without a key, `run` exits before sending anything. `--model` has no default: pass an
image model your account can use. `--revision` labels your model/config for provenance.
`tests/test_openai_http.py` covers the client and the CLI against a local fake server only.

## Job specification

Example for the DEAD MALL format; use actual readable local PNG paths:

```json
{
  "prompt": "Bargain Hunter shoulder charge: four planted-foot wind-up frames, then two shoulder-first release frames.",
  "style": "Match the original walk-sheet proportions, outfit, pixel clusters, palette and top-left lighting.",
  "references": ["/absolute/path/shopper-walk.png"],
  "frame_size": 128,
  "frames": 6,
  "facings": ["south", "south-west", "west", "north-west", "north", "north-east", "east", "south-east"],
  "durations_ms": [142, 142, 142, 141, 133, 133],
  "pivot": [64, 111],
  "constraints": ["Keep the bag in the anatomical-left hand; do not mirror asymmetric facings."],
  "max_followups": 2,
  "revision": "trial-1"
}
```

`start_png` optionally names an existing image to edit. It is always the first initial edit input and remains an original reference in the sheet and later revisions. There must be 1–5 explicit original reference PNGs; inferred project style is not silently substituted.

The source images are snapshotted by exact byte hash. PNG limits are 32 MiB/file, 4,194,304 decoded pixels/image and 64 MiB total initial source bytes. Sheets have 1–16 columns, 1–8 unique named facing rows, square 1–512px frames, bounded durations and pivot coordinates. The default sheet alpha threshold is 128; set `alpha_threshold: null` to reject soft alpha rather than normalize it. No palette quantization occurs.

Change `revision` when requesting a deliberately new job or a new provider/model configuration. Repeating `begin` with identical source bytes and specification resumes that job, including an in-flight or failed-review state; it never reissues a provider call. This is a resumable job identity, not a provider billing-cache claim.

## Native caller workflow

Run from `tools/pixel-forge` with its existing supported Python environment:

```bash
python -m forge image-pair begin --root ./image-jobs --spec ./pair.json
python -m forge image-pair dispatch --root ./image-jobs --key KEY --native-image-tool
```

`dispatch` requires an explicit caller capability and returns one ticket, prompt, input-image paths and transparency request. The host must:

1. Inspect referenced images as required by its image tool.
2. Call that actual image tool with the returned prompt, `referenced_image_paths`, and `transparent_background`. Do not pass internal ticket/stage fields as unsupported tool arguments.
3. Materialize the **specific output returned by that invocation**. Never pick the newest image in a shared directory.
4. Save a small receipt such as `{"provider":"caller-image-tool","invocation_id":"ACTUAL_INVOCATION_ID"}`.
5. Accept the image using its ticket:

```bash
python -m forge image-pair accept --root ./image-jobs --key KEY \
  --ticket TICKET --image-path /actual/returned/image.png --receipt ./receipt.json
```

The result contains the next pending sheet request after the mockup. Claim and execute it the same way. The MCP equivalent is the single `forge_image_pair` tool with `action="begin"`, `"dispatch"`, `"accept"`, `"status"`, `"revise"`, or `"normalize"` and the same fields.

Receipts are bounded caller-reported provenance, not cryptographic provider attestations. The ledger records exact raw bytes, source hashes, prompts, request fingerprints, validation and derivations.

## Corrections and generated-sheet normalization

A failed check produces `needs_revision`; it does not spend another call.

```bash
python -m forge image-pair revise --root ./image-jobs --key KEY --stage sheet \
  --feedback "Correct the west release frames; preserve all other design and style constraints."
```

A revision uses the prior result as its first edit image and keeps the original reference images. For exact locked-pixel edits, supply `--edit-mask mask.png --max-changed-pixels N`. The mask must be a same-sized static L/1 PNG: white is editable, black is locked. It is passed as a visual guidance image, then Forge enforces the pixel contract on the candidate. Generated masks are only guidance; a provider's edit output is never trusted to preserve locked pixels automatically.

When the generator returns a uniformly gridded sheet at a different cell size, exact/integer-only finishing rejects it. An explicit local action can make a nearest-neighbor derivative:

```bash
python -m forge image-pair normalize --root ./image-jobs --key KEY
```

This requires an exact square-cell grid divisible into the requested rows/columns. It preserves the entire grid, padding and raw output, but **resampling is lossy** and may change details/clusters. The report marks this and still enforces protected pixels. It neither crops nor guesses cell boundaries, repairs anatomy, changes palette, or invokes another provider.

## Optional API integration

See [IMAGE_PROVIDER.md](IMAGE_PROVIDER.md) for the adapter and official sources. A host can inject a configured client without adding credentials to this repository:

```python
from forge.image_provider import OpenAIImagesBackend
from forge import image_pair, mcp_server

# authorized_client is supplied by the operator's existing secure configuration.
backend = OpenAIImagesBackend(
    authorized_client, model="EXPLICIT_AVAILABLE_MODEL",
    revision="operator-model-config-1", enabled=True,
)
# One request, never an automatic loop or retry:
result = image_pair.run_provider(job_root, job_key, backend)

# Or configure the existing stdio MCP entrypoint before starting it:
mcp_server.IMAGE_PAIR_BACKEND = backend
# mcp_server.main()  # operator-controlled process startup
```

`run` performs one pending request. The provider, selected model and configuration revision are recorded before the attempt. SDK retries are disabled. A typed preflight failure explicitly known to be `not_started` restores the pending request for an explicit later attempt. Unknown completion remains `in_flight`; inspect/reconcile the original invocation before starting anything else. Local artifact-write interruptions may be resumed by accepting the same ticket and exact bytes; different bytes cannot overwrite prior partial artifacts.

No live API request was made during this implementation. Native tool execution and API fixtures have different evidence; do not describe the fixture as a live API success.

## Acceptance limits

`review_ready` means that the matched pair exists and mechanical checks passed. It remains `REVIEW_ONLY` with `art_review_required=true`. Those checks do not certify facing correctness, anatomy, accessory hand, source identity, motion quality, planted feet, or visual style. Inspect the pair and use the existing rig/animation gates before any approved game installation.

A syntactically valid PNG can still contain the wrong subject, proportions or facing. Inspect the mockup before dispatching its sheet, and inspect every facing and animation before accepting the artwork.

## Optional pixel-grid diagnosis

The combined source also includes the pinned, MIT-licensed Retro Diffusion [grid detector](GRID_RECOVERY.md). It is a separate opt-in analysis tool for generated/upscaled inputs, with native-source bypass as the default. The paired workflow never silently runs its reconstruction: that operation can change dimensions, colors and alpha, and is incompatible with exact protected-pixel requirements. Analyze a retained raw generation when useful, then keep any explicitly reviewed derivative and its recorded pixel hash.
