# Private Codex native-image bridge (experimental)

## Status and scope

Implemented: an opt-in, same-host stdio adapter connecting a Claude-compatible
MCP client to Forge's durable image-pair jobs and a private Codex native worker.
The real MCP transport and the native JSONL protocol have been tested together
with an explicitly synthetic image fixture. **One signed-in native image job (a mockup and a
sheet) has now run through this adapter, from a cloud container, on 2026-10-04; see
[Field notes](#field-notes-2026-10-04). It is still not live-enabled by default.**

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

## Field notes (2026-10-04)

One real run, from a Claude Code cloud container rather than the clean personal host this
document asks for. The owner chose that route and completed the sign-in; nothing here widens
what the bridge supports. Result: the Bargain Hunter hurt strip,
`art/enemy-reactions/shopper-hurt/README.md`.

- **Network.** The cloud environment's allowed domains needed `auth.openai.com` (sign-in) and
  `chatgpt.com` (generation). `api.openai.com` is for the separate Images API route, which bills
  an API balance and is not covered by a ChatGPT plan (`credit_balance_exhausted`).
- **Sign-in.** `CODEX_HOME=$HOME/.pixel-forge-codex codex login --device-auth` prints a link and a
  one-time code the owner enters in their browser. It connected through the container's HTTPS
  proxy with the CA variables already set there, with no extra configuration. `codex logout`
  removes the login; it also dies with the container.
- **Model.** `codex debug models` lists what the account offers. `--model` is the orchestrator
  (`gpt-6.1-sol` here), not an image model.
- **An interrupted `run` strands the job.** The turn starts within seconds, so interrupting the
  command leaves the job `in_flight` with no image, and `run` then refuses to reissue it. Start a
  new job under a new `revision` instead. A rejected tool prompt counts as an interrupt.
- **`max_followups` is capped at 3 per job** (`_validate` in `forge/image_pair.py`). A longer run
  chains jobs, seeding the next one from the last accepted image.
- **Codex rewrites the prompt** ("revised_prompt" in the receipt). A short prompt lost the
  character's identity (an undead shopper came back as a healthy man); spelling the traits out in
  the job `prompt` and `constraints` fixed it, even though the references were right.
- **The sheet comes back off-grid.** A 4 × 8 request returned 887 × 1774 px (2.31 × the game's
  scale, soft edges). Validation rejected it (`dimensions_not_exact_or_uniform_integer_
  enlargement`) and `normalize` needs a whole-number grid. Convert it locally and look at every
  facing; `art/enemy-reactions/shopper-hurt/convert_gpt_hurt.py` is a worked example.
- **Cost.** Mockup 1, a corrected mockup 2 and the sheet: three finished image turns, plus two
  turns cut off after about 10 seconds by interrupts. Codex image turns count against plan
  limits faster than ordinary turns.

### Next-session quick start (cloud)

What persists between cloud sessions, and what does not:

- **Persists:** the environment's allowed domains (keep `auth.openai.com` and `chatgpt.com`), the
  repo (this script, the docs, the converted art), and anything in the environment's *Setup script*.
- **Does not persist:** the ChatGPT sign-in, the Codex CLI, the Forge venv, any job under
  `/tmp` or `$HOME`. The sign-in is deliberately not saved: a stored copy of Codex's auth file goes
  stale when the token refreshes, and the bridge requires a fresh owner sign-in for its worker.

`tools/pixel-forge/scripts/cloud-gpt-setup.sh` rebuilds everything else in one command:

```sh
bash tools/pixel-forge/scripts/cloud-gpt-setup.sh setup   # isolated venv + Codex CLI + host check
bash tools/pixel-forge/scripts/cloud-gpt-setup.sh login   # prints the link and one-time code
# the owner opens the link, enters the code, approves; then:
bash tools/pixel-forge/scripts/cloud-gpt-setup.sh status
bash tools/pixel-forge/scripts/cloud-gpt-setup.sh models  # pick the orchestrator (gpt-6.1-sol was used)
```

To have step 1 ready at session start, set the cloud environment's **Setup script** (the cloud
environment menu in the session's title bar, then Edit) to run
`bash tools/pixel-forge/scripts/cloud-gpt-setup.sh setup` from the repo root. Leave `login` manual:
only the owner can approve it.

`setup` prints the exact `begin` and `run` commands. Then follow the field notes above: spell the
character out in the job prompt, never interrupt a `run`, plan for the sheet to need conversion
(`art/enemy-reactions/shopper-hurt/convert_gpt_hurt.py` is a worked example).

