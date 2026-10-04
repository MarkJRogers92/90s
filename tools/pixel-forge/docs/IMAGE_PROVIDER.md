# Opt-in OpenAI Images adapter

`forge.image_provider.OpenAIImagesBackend` is a developer-tool adapter. It does
not import an OpenAI SDK, find credentials, enable generation on import, choose
a model, set up an account, or modify runtime assets. A GPT, Claude, or cloud
caller can use the same injected-client interface. A caller's native image tool
must be declared separately; running under Claude does not imply `image_gen`
access.

## Explicit integration

Supply an already-configured synchronous client and an exact image model ID.
The revision identifies the caller's model/configuration version for provenance.
It is not sent to OpenAI. The caller owns credentials, timeouts, permissions,
spending approval, and ensuring the chosen model supports the requested options.
No account or network probe occurs.

```python
from forge.image_provider import OpenAIImagesBackend

backend = OpenAIImagesBackend(
    configured_client,
    model=explicit_image_model,
    revision="image-config-v1",
    enabled=True,
)
result = backend.generate({
    "prompt": "Create a character turnaround using the reference identity.",
    "referenced_image_paths": ["reference.png"],
    "transparent_background": True,
    "size": "1536x1024",
    "quality": "high",
})
png_bytes = result["image_bytes"]
```

Generation remains disabled unless `enabled=True`. Model and revision are
required; neither has a default. Every request must explicitly supply `prompt`,
`referenced_image_paths` (an empty list for new generation), and a boolean
`transparent_background`. Optional `size` and `quality` are omitted from the API
payload when omitted from the request. Unsupported request keys are rejected.

The adapter calls `client.images.generate` without references, or
`client.images.edit` with opened in-memory snapshots of all supplied references.
It always requests one PNG. It sends `background="transparent"` or `"opaque"`
according to the explicit boolean. Local paths are replaced with generic upload
basenames. Original PNG bytes and alpha are preserved; there is no cleanup,
quantization, resize, or aesthetic approval here.

For SDK-shaped clients, `with_options(max_retries=0)` disables automatic retries
on a client copy. The copy must report `max_retries == 0`. Other injected clients
must expose and honor integer `max_retries = 0`; implicit retry behavior is
rejected before reference access. No adapter retry, fallback model, or fallback
provider exists. A client wrapper must not secretly retry or reroute requests.

## Limits and results

- Prompt: nonblank, at most 32,000 characters
- References: up to 16 regular static PNG files, rejecting leaf symlinks
- PNG limits: existing Forge bounded reader/decoder, 32 MiB per file,
  4,194,304 pixels, and 8,192 pixels per edge
- References together: at most 32 MiB and 16,777,216 decoded pixels
- Output: exactly one base64 PNG; URL-only, malformed, oversized, animated, or
  non-PNG responses fail validation without another API call
- Result: `image_bytes`, `provider="openai-images-api"`, and `model`; optional
  `request_id`, numeric token `usage`, and `revised_prompt` when present

The local output limits can be stricter than an image model's maximum size.
`size` accepts `auto` or a locally bounded `WIDTHxHEIGHT` string. Supported
`quality` labels are `auto`, `low`, `medium`, `high`, `xhigh`, and `max`.
Model-specific parameter compatibility is unverified and must be checked by the
caller. The adapter does not infer prices or turn usage into a cost estimate.

`capability()` reports local configuration without network access. A configured,
enabled adapter returns `available=None`, `status="unverified"`, and separate
unverified account/model/network fields. A disabled or unconfigured adapter
returns `available=False`. This is not a claim that credentials work or that the
requested model is available on the account.

`ImageProviderError` supplies `code`, `completion`, and a serializable `result()`.
Errors contain fixed safe messages, not raw provider exceptions or prompts.
All errors report `retryable=False`. Completion is:

- `not_started`: validation, enablement, configuration, or reference failure
- `unknown`: the provider call raised; it may still have completed or charged
- `response_received`: a response arrived but failed local validation

An unknown completion must be reconciled by the caller; it is never permission
to issue the same paid request again automatically. A valid image response also
does not establish identity consistency or animation quality; visual review and
the downstream Forge checks still apply.

## Verification and sources

The adapter tests use only injected offline clients and generated test PNGs.
They exercise actual request payloads, reference bytes, response decoding,
resource closing, error sanitization, and retry suppression. No paid Images API
call or live account/model validation is part of this test suite.

API shape was checked against the official
[OpenAI image-generation guide](https://developers.openai.com/api/docs/guides/image-generation)
on 2026-10-04. That guide documents generation/edit endpoints, base64 output,
size/quality options, and transparent PNG output. Use current official guidance
when configuring a live client and exact model.
