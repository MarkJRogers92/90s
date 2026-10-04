# Private Codex native-image bridge (experimental)

## Status and scope

Implemented: an opt-in, same-host stdio adapter connecting a Claude-compatible
MCP client to Forge's durable image-pair jobs and a private Codex native worker.
The real MCP transport and the native JSONL protocol have been tested together
with an explicitly synthetic image fixture. **A signed-in native image turn has
not been verified through this adapter. It is not live-enabled.**

This is developer-side authoring. It changes no game assets or runtime code.
It creates no HTTP listener, hosted service, account, login, token, API key,
MCP registration, or scheduled process. It does not expose subscription access
as a general-purpose cloud API. A remote caller still needs a separately
supported and authorized way to reach its own private worker; this package does
not create one.

## What the official routes support

- Native Codex supports image generation and bills that work against general
  Codex usage limits. Current documentation names `gpt-image-2` and estimates
  image turns consume included limits roughly 3–5 times faster than comparable
  non-image turns. Existing additional-credit settings still apply. See
  [Image generation](https://learn.chatgpt.com/docs/image-generation) and
  [Pricing](https://learn.chatgpt.com/docs/pricing).
- Codex's non-interactive mode supports private scripts and reuses its own saved
  authentication. A private Claude-to-Codex worker is an application of this
  documented scripting model, not an officially certified Pixel Forge
  integration. See [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode).
- Native app-server auth is not permitted for commercial or hosted services.
  This implementation is restricted to a private, operator-controlled personal
  host. See [App-server authentication](https://learn.chatgpt.com/docs/app-server).
- The separate Sign in with ChatGPT plan-token preview explicitly excludes
  image generation, including through its app-server provider. It cannot replace
  the native image tool here. See [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

No private ChatGPT endpoints, extracted OAuth tokens, shared cookies, or API
keys are used by this code.

## Required private worker setup

Use a trusted local Codex installation on a clean, unmanaged personal host.
This version accepts only the exact personal-plan identifiers `plus`, `pro`, and
`prolite`. The latter is the personal Pro 100 variant in the official
[Codex 0.160 subscription labels](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/tui/src/subscription.rs#L12-L29).
Other identifiers, including `promax` and `self_serve_business_prolite`, remain
rejected; no prefix or fuzzy matching is used. Managed accounts, custom
providers, custom MCP servers/hooks, and configuration inheritance are not
supported. Known configuration paths are rejected by metadata without
reading or changing their contents. Codex's own `skills/.system` is allowed;
custom skills and plugin directories are rejected.

A dedicated Codex home is mandatory. Do not point it at the main Codex home,
copy authentication files, or import secrets from another session. The owner
must authorize and complete a new ordinary Codex sign-in for this worker. A
new persistent login is a separate security decision, even when the coding
work was broadly authorized. Illustrative owner-run setup after that approval:

```sh
mkdir -p "$HOME/.pixel-forge-codex"
CODEX_HOME="$HOME/.pixel-forge-codex" codex login
```

Do not disable managed policies or remove a configuration to get past the
preflight. Use a suitable private host instead. The metadata checks are
conservative compatibility guards, not proof that an arbitrary host is free
of cloud/MDM configuration. The operator must know it is unmanaged; the adapter
does not query potentially secret-bearing configuration RPCs to infer this.

Keep the worker workspace outside repositories containing custom Codex
configuration. All bridge instances using one login must share the same
`--work-root`, which serializes them until their subprocesses are closed.
No process uses a copied credential cache. The CLI manages its own login and
refresh; the bridge only checks the non-secret `account/read` auth mode and plan.

## Run from tools/pixel-forge

Use the existing Forge Python environment. `CODEX_MODEL` below means the exact
Codex orchestrator model chosen by the operator, not an Images API model.
The adapter does not silently choose or fall back to another model. Its receipt
`model` field records the orchestrator; it does not attest the underlying native
image model.

Offline configuration report; no worker process or inference:

```sh
python -m forge.codex_native capabilities \
  --codex-home "$HOME/.pixel-forge-codex" \
  --work-root "$HOME/.pixel-forge-native-jobs" \
  --model "$CODEX_MODEL" --revision native-worker-v1
```

Startup/auth check only; no inference turn:

```sh
python -m forge.codex_native probe --enable-native \
  --codex-home "$HOME/.pixel-forge-codex" \
  --work-root "$HOME/.pixel-forge-native-jobs" \
  --model "$CODEX_MODEL" --revision native-worker-v1
```

`available: null` means image access is unverified. A successful probe verifies
only startup and existing ChatGPT authentication. Only a successfully completed
native image turn verifies image access for that request.

After creating an image-pair job using [the paired workflow](GPT_IMAGE_PAIR.md),
run exactly its next request:

```sh
python -m forge.codex_native run --enable-native \
  --codex-home "$HOME/.pixel-forge-codex" \
  --work-root "$HOME/.pixel-forge-native-jobs" \
  --model "$CODEX_MODEL" --revision native-worker-v1 \
  --root /absolute/path/image-jobs --key JOB_KEY
```

Inspect the mockup before running the sheet. This command never loops through
stages or reissues an uncertain request. Follow-ups remain explicitly bounded
by the existing job's revision budget.

Opt-in [consistency jobs](IMAGE_CONSISTENCY.md) require `review-mockup` with a
current hash-bound `review_record` before the sheet can run. The native MCP facade
accepts this action and field; the ordinary `forge image-pair review-mockup` CLI
records the same review without starting the native worker or invoking a provider.

For a Claude-compatible MCP client, use the same command with `serve` instead
of `run`, omit `--root` and `--key`, and keep the process on stdio. For example,
configure the client to launch the absolute Forge Python executable with:

```text
-m forge.codex_native serve --enable-native
--codex-home /absolute/private/codex-home
--work-root /absolute/private/native-jobs
--model EXACT_CODEX_MODEL --revision native-worker-v1
```

Set that client's working directory to `tools/pixel-forge`. Configure or approve
persistent client access separately; the launcher does not edit the client's
settings. The narrow server exposes only `forge_image_pair`, including
`capabilities`, `begin`, `status`, `run`, `revise`, and the existing explicit
handoff/normalization actions. It does not expose Forge's other artist tools.

## Evidence and failure contract

The adapter starts native `codex app-server --listen stdio://`. It disables
hooks, apps, plugins, shell, browser/computer tools, both multi-agent variants,
and notifications at startup. It requires returned read-only/no-network sandbox
settings and user-directed approvals; it never grants an approval, initiates
login, or modifies authentication. An auth change or model-reroute notification
stops the request. These checks do not replace the clean-host requirement.

A successful result requires all of:

1. Existing ChatGPT personal-plan auth, explicit native provider/model, and
   required sandbox/reviewer settings before starting a turn
2. Exactly one native `imageGeneration` item for that exact thread and turn
3. Successful native image status and matching transparency flag
4. A completed turn, not final text saying an image was created
5. Bounded base64 PNG bytes in that native item, independently decoded and
   validated; URLs, arbitrary saved paths, and prose substitutes are rejected

The implementation was grounded in schemas generated by installed Codex CLI
`0.159.2`. Its native image item exposes `id`, `status`, `result`, `savedPath`,
`transparentBackground`, and optional failure/revised-prompt fields. File-path
fallback is intentionally unsupported. A future or differently configured
runtime that only returns a saved path must fail closed until explicitly tested.

Reference PNGs are snapshotted in their original order into a request-owned
workspace. No global image directory is searched. Stream bytes/event counts,
PNG bytes/pixels, input writes, and response waits are bounded. Process cleanup
happens while holding the shared worker lock. Auth values, raw stderr, account
email, and model reasoning transcripts are not returned or saved by the bridge.

The bridge issues at most one `turn/start` per call. It has no automatic retry,
second provider, or paid API fallback. **Codex's own internal connection/model
retry behavior is not verified or controlled by that statement.** Remote work
may continue after a timeout or disconnection, so those outcomes remain
`unknown`; the durable Forge job stays `in_flight` for reconciliation. Explicit
preflight failures known to precede a turn restore the pending job.

All resulting artwork remains `REVIEW_ONLY`. Grid and PNG checks do not certify
identity, animation, facing, anatomy, or visual quality.

See [Verification](CODEX_NATIVE_BRIDGE_VERIFICATION.md) for the tested scope and
the remaining live-acceptance requirements.
