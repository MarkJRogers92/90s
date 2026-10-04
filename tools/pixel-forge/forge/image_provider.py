"""Explicit, opt-in Images API boundary with no SDK or credential discovery.

The caller supplies an authenticated, synchronous client, an exact model, and a
configuration revision. Importing this module never enables image generation.
"""
from __future__ import annotations

import base64
from contextlib import ExitStack
import io
from pathlib import Path
import re

from forge_accel.pixels import MAX_FILE_BYTES, MAX_PIXELS, MAX_SEQUENCE_PIXELS, decode_rgba, dimensions

from .bounded_io import read_bounded


PROVIDER = "openai-images-api"
MAX_PROMPT_CHARS = 32000
MAX_REFERENCES = 16
_REQUIRED = {"prompt", "referenced_image_paths", "transparent_background"}
_OPTIONAL = {"size", "quality"}
_QUALITIES = {"auto", "low", "medium", "high", "xhigh", "max"}
_USAGE_FIELDS = {"input_tokens", "output_tokens", "total_tokens"}
_DETAIL_FIELDS = {"image_tokens", "text_tokens"}


class ImageProviderError(ValueError):
    """Safe error contract; never contains raw request/SDK error text.

    ``unknown`` means a call was attempted and may have incurred a charge.
    Nothing in this adapter automatically retries, including malformed output.
    """

    def __init__(self, code: str, message: str, *, completion: str = "not_started"):
        super().__init__(message)
        self.code = code
        self.completion = completion

    def result(self) -> dict:
        return {"error": {"code": self.code, "message": str(self),
                          "completion": self.completion, "retryable": False}}


def _field(value, name, default=None):
    return value.get(name, default) if isinstance(value, dict) else getattr(value, name, default)


def _valid_identifier(value):
    return isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}", value) is not None


def _validate_request(request):
    if not isinstance(request, dict) or not _REQUIRED <= request.keys() or request.keys() - (_REQUIRED | _OPTIONAL):
        raise ImageProviderError("INVALID_REQUEST", "request fields are missing or unsupported")
    prompt = request["prompt"]
    refs = request["referenced_image_paths"]
    if (not isinstance(prompt, str) or not prompt.strip() or len(prompt) > MAX_PROMPT_CHARS
            or type(request["transparent_background"]) is not bool):
        raise ImageProviderError("INVALID_REQUEST", "request prompt or background is invalid")
    if (not isinstance(refs, list) or len(refs) > MAX_REFERENCES
            or any(not isinstance(ref, (str, Path)) or not str(ref).strip()
                   or "\x00" in str(ref) for ref in refs)):
        raise ImageProviderError("INVALID_REQUEST", "request references must be a bounded list of local paths")
    if "size" in request:
        size = request["size"]
        if not isinstance(size, str) or (size != "auto" and not re.fullmatch(r"[1-9][0-9]{0,3}x[1-9][0-9]{0,3}", size)):
            raise ImageProviderError("INVALID_REQUEST", "request size must be auto or WIDTHxHEIGHT")
        if size != "auto":
            try:
                dimensions(tuple(int(n) for n in size.split("x")))
            except ValueError:
                raise ImageProviderError("INVALID_REQUEST", "request size exceeds local image limits") from None
    if "quality" in request and (not isinstance(request["quality"], str) or request["quality"] not in _QUALITIES):
        raise ImageProviderError("INVALID_REQUEST", "request quality is unsupported")
    # Copy the list so callers cannot change which references are uploaded while
    # local validation is running. Reference bytes are snapshotted separately.
    return {**request, "referenced_image_paths": list(refs)}


def _usage_metadata(value):
    if value is None:
        return None
    if not isinstance(value, dict) and not any(hasattr(value, key) for key in _USAGE_FIELDS):
        raise ValueError("invalid usage")
    result = {}
    for key in sorted(_USAGE_FIELDS):
        count = _field(value, key)
        if count is not None:
            if type(count) is not int or count < 0:
                raise ValueError("invalid usage")
            result[key] = count
    for key in ("input_tokens_details", "output_tokens_details"):
        detail = _field(value, key)
        if detail is not None:
            if not isinstance(detail, dict) and not any(hasattr(detail, kind) for kind in _DETAIL_FIELDS):
                raise ValueError("invalid usage detail")
            result[key] = {}
            for kind in sorted(_DETAIL_FIELDS):
                count = _field(detail, kind)
                if count is not None:
                    if type(count) is not int or count < 0:
                        raise ValueError("invalid usage")
                    result[key][kind] = count
    return result


class OpenAIImagesBackend:
    """Caller-owned Images client. Model selection and spending stay explicit.

    SDK-shaped clients are copied with ``with_options(max_retries=0)``. Other
    injected clients must explicitly expose ``max_retries = 0`` and obey it.
    Configure timeouts on the injected client; no account/network probe occurs.
    """

    name = PROVIDER

    def __init__(self, client, *, model: str, revision: str, enabled: bool = False):
        if not _valid_identifier(model) or not _valid_identifier(revision) or type(enabled) is not bool:
            raise ImageProviderError("INVALID_CONFIGURATION", "explicit model, revision and boolean enablement are required")
        self.client = client
        self.model = model
        self.revision = revision
        self.enabled = enabled

    @staticmethod
    def _client_ready(client):
        try:
            images = getattr(client, "images", None)
            return (callable(getattr(images, "generate", None))
                    and callable(getattr(images, "edit", None))
                    and (callable(getattr(client, "with_options", None))
                         or type(getattr(client, "max_retries", None)) is int
                         and client.max_retries == 0))
        except Exception:
            return False

    def capability(self) -> dict:
        """Report configuration only, never imply verified provider access."""
        configured = self._client_ready(self.client)
        return {"provider": PROVIDER, "model": self.model, "revision": self.revision,
                "enabled": self.enabled, "configured": configured,
                "available": None if configured and self.enabled else False,
                "status": "disabled" if not self.enabled else "unverified" if configured else "unavailable",
                "account_access": "unverified", "model_access": "unverified", "network_access": "unverified",
                "max_output_bytes": MAX_FILE_BYTES, "max_output_pixels": MAX_PIXELS,
                "automatic_retries": False}

    def _client_for_call(self):
        if not self.enabled:
            raise ImageProviderError("PROVIDER_DISABLED", "Images API generation requires explicit enablement")
        if not self._client_ready(self.client):
            raise ImageProviderError("PROVIDER_UNAVAILABLE", "Images client is missing or cannot disable retries")
        try:
            client = self.client.with_options(max_retries=0) if callable(getattr(self.client, "with_options", None)) else self.client
            # Verify the copy rather than trust a wrapper that ignored options.
            if (not self._client_ready(client) or type(getattr(client, "max_retries", None)) is not int
                    or client.max_retries != 0):
                raise ValueError("retry configuration")
            return client
        except Exception:
            raise ImageProviderError("PROVIDER_UNAVAILABLE", "Images client retry configuration is unavailable") from None

    def generate(self, request: dict) -> dict:
        request = _validate_request(request)
        client = self._client_for_call()
        payload = {"model": self.model, "prompt": request["prompt"], "n": 1,
                   "output_format": "png",
                   "background": "transparent" if request["transparent_background"] else "opaque"}
        for field in _OPTIONAL:
            if field in request:
                payload[field] = request[field]
        with ExitStack() as stack:
            refs = []
            total_bytes = total_pixels = 0
            for index, path in enumerate(request["referenced_image_paths"]):
                try:
                    raw = read_bounded(path, MAX_FILE_BYTES)
                    total_bytes += len(raw)
                    if total_bytes > MAX_FILE_BYTES:
                        raise ValueError("aggregate byte limit")
                    with decode_rgba(raw) as image:
                        total_pixels += image.width * image.height
                    if total_pixels > MAX_SEQUENCE_PIXELS:
                        raise ValueError("aggregate pixel limit")
                    stream = stack.enter_context(io.BytesIO(raw))
                    # A generated basename avoids transmitting local directory
                    # information while retaining correct upload MIME inference.
                    stream.name = f"reference-{index + 1}.png"
                    refs.append(stream)
                except Exception:
                    raise ImageProviderError("INVALID_REFERENCE", "reference must be a bounded regular static PNG") from None
            if refs:
                payload["image"] = refs
            try:
                response = client.images.edit(**payload) if refs else client.images.generate(**payload)
            except Exception:
                raise ImageProviderError("PROVIDER_CALL_FAILED", "Images API call failed; completion is unknown; do not automatically retry",
                                         completion="unknown") from None
        return self._decode_response(response)

    def _decode_response(self, response) -> dict:
        try:
            data = _field(response, "data")
            if not isinstance(data, (list, tuple)) or len(data) != 1:
                raise ValueError("expected one image")
            encoded = _field(data[0], "b64_json")
            if not isinstance(encoded, str) or not encoded or len(encoded) > 4 * ((MAX_FILE_BYTES + 2) // 3):
                raise ValueError("invalid encoded image")
            raw = base64.b64decode(encoded, validate=True)
            with decode_rgba(raw):
                pass
            result = {"image_bytes": raw, "provider": PROVIDER, "model": self.model}
            request_id = _field(response, "_request_id") or _field(response, "request_id")
            if request_id is not None:
                if not isinstance(request_id, str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,256}", request_id):
                    raise ValueError("invalid request id")
                result["request_id"] = request_id
            usage = _usage_metadata(_field(response, "usage"))
            if usage is not None:
                result["usage"] = usage
            revised_prompt = _field(data[0], "revised_prompt")
            if revised_prompt is not None:
                if not isinstance(revised_prompt, str) or len(revised_prompt) > MAX_PROMPT_CHARS:
                    raise ValueError("invalid revised prompt")
                result["revised_prompt"] = revised_prompt
            return result
        except Exception:
            raise ImageProviderError("INVALID_RESPONSE", "Images API response must contain one bounded base64 PNG and valid metadata",
                                     completion="response_received") from None
