"""Opt-in Images API boundary, exercised only with injected offline clients."""
import base64
import importlib.util
import io
from types import SimpleNamespace

import pytest
from PIL import Image


def png(size=(8, 8), color=(220, 40, 10, 117)):
    out = io.BytesIO()
    Image.new("RGBA", size, color).save(out, format="PNG")
    return out.getvalue()


def response(data=None, **metadata):
    return SimpleNamespace(data=data if data is not None else [
        SimpleNamespace(b64_json=base64.b64encode(png()).decode("ascii"))], **metadata)


class OfflineImages:
    def __init__(self, result=None, error=None):
        self.result = result if result is not None else response()
        self.error = error
        self.calls = []
        self.streams = []

    def _call(self, operation, payload):
        captured = dict(payload)
        if "image" in payload:
            self.streams = list(payload["image"])
            captured["image"] = [(stream.name, stream.read()) for stream in self.streams]
        self.calls.append((operation, captured))
        if self.error:
            raise self.error
        return self.result

    def generate(self, **payload):
        return self._call("generate", payload)

    def edit(self, **payload):
        return self._call("edit", payload)


class OfflineClient:
    max_retries = 0

    def __init__(self, **kwargs):
        self.images = OfflineImages(**kwargs)


def request(**kwargs):
    return {"prompt": "A pixel-art character", "referenced_image_paths": [],
            "transparent_background": False, **kwargs}


def backend(client=None, **kwargs):
    from forge.image_provider import OpenAIImagesBackend
    return OpenAIImagesBackend(client if client is not None else OfflineClient(),
                               model="explicit-image-model", revision="test-revision-v1",
                               enabled=True, **kwargs)


def test_generate_delivers_exact_png_and_explicit_payload():
    # A missing provider, model substitution, or PNG rewriting must fail here.
    assert importlib.util.find_spec("forge.image_provider") is not None, "Images adapter is missing"
    client = OfflineClient()
    result = backend(client).generate(request())
    assert result == {"image_bytes": png(), "provider": "openai-images-api",
                      "model": "explicit-image-model"}
    assert client.images.calls == [("generate", {
        "prompt": "A pixel-art character", "model": "explicit-image-model", "n": 1,
        "output_format": "png", "background": "opaque"})]


def test_edit_passes_all_reference_bytes_in_order_and_closes_streams(tmp_path):
    refs = [tmp_path / "one.png", tmp_path / "two.png"]
    for i, ref in enumerate(refs):
        ref.write_bytes(png(color=(20 + i, 30, 40, 50)))
    client = OfflineClient()
    result = backend(client).generate(request(referenced_image_paths=[str(p) for p in refs],
        transparent_background=True, size="1536x1024", quality="high"))
    op, payload = client.images.calls[0]
    assert op == "edit"
    assert [value for _, value in payload.pop("image")] == [p.read_bytes() for p in refs]
    assert payload == {"prompt": "A pixel-art character", "model": "explicit-image-model",
                       "n": 1, "output_format": "png", "background": "transparent",
                       "size": "1536x1024", "quality": "high"}
    assert result["image_bytes"] == png()
    assert all(stream.closed for stream in client.images.streams)


def test_object_and_mapping_response_metadata():
    usage = {"input_tokens": 14, "input_tokens_details": {"image_tokens": 10, "text_tokens": 4},
             "output_tokens": 8, "total_tokens": 22}
    for result in [response(_request_id="req_test", usage=SimpleNamespace(**usage),
                           data=[SimpleNamespace(b64_json=base64.b64encode(png()).decode(),
                                                 revised_prompt="Revised art")]),
                   {"data": [{"b64_json": base64.b64encode(png()).decode(),
                              "revised_prompt": "Revised art"}],
                    "request_id": "req_test", "usage": usage}]:
        got = backend(OfflineClient(result=result)).generate(request())
        assert got["request_id"] == "req_test"
        assert got["usage"] == usage
        assert got["revised_prompt"] == "Revised art"


@pytest.mark.parametrize("change", [
    {"prompt": ""}, {"prompt": "  "}, {"prompt": 1}, {"prompt": "x" * 32001},
    {"transparent_background": "true"}, {"transparent_background": 1},
    {"referenced_image_paths": "one.png"}, {"referenced_image_paths": [None]},
    {"referenced_image_paths": [""]}, {"referenced_image_paths": ["one.png"] * 17},
    {"size": "bad"}, {"size": "0x1024"}, {"size": "99999x99999"},
    {"size": "4096x4096"}, {"size": 1024}, {"size": None},
    {"quality": "ultra"}, {"quality": None}, {"quality": 1},
    {"model": "implicit-override"}, {"n": 2}, {"output_format": "jpeg"},
])
def test_request_rejected_before_read_or_call(change, monkeypatch):
    from forge import image_provider
    client = OfflineClient()
    monkeypatch.setattr(image_provider, "read_bounded", lambda *args: pytest.fail("reference opened"))
    invalid = request(referenced_image_paths=["not-opened.png"], **{
        k: v for k, v in change.items() if k != "referenced_image_paths"})
    if "referenced_image_paths" in change:
        invalid["referenced_image_paths"] = change["referenced_image_paths"]
    with pytest.raises(image_provider.ImageProviderError) as error:
        backend(client).generate(invalid)
    assert error.value.code == "INVALID_REQUEST"
    assert error.value.completion == "not_started"
    assert client.images.calls == []


@pytest.mark.parametrize("invalid", [None, [], "prompt", {}, {"prompt": "x"}])
def test_request_requires_explicit_boundary_fields(invalid):
    from forge.image_provider import ImageProviderError
    client = OfflineClient()
    with pytest.raises(ImageProviderError, match="request"):
        backend(client).generate(invalid)
    assert client.images.calls == []


def test_disabled_and_unavailable_never_read_references(monkeypatch):
    from forge import image_provider
    monkeypatch.setattr(image_provider, "read_bounded", lambda *args: pytest.fail("reference opened"))
    for client, enabled, code in [(OfflineClient(), False, "PROVIDER_DISABLED"),
                                 (None, True, "PROVIDER_UNAVAILABLE"),
                                 (object(), True, "PROVIDER_UNAVAILABLE")]:
        provider = image_provider.OpenAIImagesBackend(client, model="explicit", revision="v1", enabled=enabled)
        with pytest.raises(image_provider.ImageProviderError) as error:
            provider.generate(request(referenced_image_paths=["not-opened.png"]))
        assert error.value.code == code
        assert error.value.completion == "not_started"


def test_capability_is_local_configuration_not_remote_availability():
    from forge.image_provider import OpenAIImagesBackend
    client = OfflineClient()
    cap = backend(client).capability()
    assert cap["provider"] == "openai-images-api"
    assert cap["configured"] is True and cap["enabled"] is True
    assert cap["available"] is None and cap["status"] == "unverified"
    assert cap["model"] == "explicit-image-model" and cap["revision"] == "test-revision-v1"
    assert cap["account_access"] == cap["model_access"] == cap["network_access"] == "unverified"
    assert client.images.calls == []
    disabled = OpenAIImagesBackend(client, model="explicit", revision="v1").capability()
    assert disabled["enabled"] is False and disabled["available"] is False
    assert disabled["status"] == "disabled"
    missing = OpenAIImagesBackend(None, model="explicit", revision="v1", enabled=True).capability()
    assert missing["configured"] is False and missing["available"] is False


@pytest.mark.parametrize("field,value", [("model", None), ("model", ""), ("model", "bad\nmodel"),
    ("revision", None), ("revision", ""), ("revision", "x" * 129), ("enabled", "true")])
def test_explicit_valid_configuration_required(field, value):
    from forge.image_provider import OpenAIImagesBackend, ImageProviderError
    options = {"model": "explicit", "revision": "v1", "enabled": True, field: value}
    with pytest.raises(ImageProviderError) as error:
        OpenAIImagesBackend(OfflineClient(), **options)
    assert error.value.code == "INVALID_CONFIGURATION"


@pytest.mark.parametrize("result", [None, {}, {"data": []}, {"data": None},
    {"data": [{"b64_json": "a"}, {"b64_json": "b"}]}, {"data": [{"url": "https://example.com/image.png"}]},
    {"data": [{"b64_json": "%%%"}]}, {"data": [{"b64_json": 42}]},
    {"data": [{"b64_json": base64.b64encode(b"not a png").decode()}]}])
def test_malformed_result_is_not_retried(result):
    from forge.image_provider import ImageProviderError
    client = OfflineClient()
    client.images.result = result
    with pytest.raises(ImageProviderError) as error:
        backend(client).generate(request())
    assert error.value.code == "INVALID_RESPONSE"
    assert error.value.completion == "response_received"
    assert len(client.images.calls) == 1


@pytest.mark.parametrize("error", [TimeoutError("secret-token raw prompt"),
    ConnectionError("secret-token raw prompt"), RuntimeError("secret-token raw prompt")])
def test_request_failure_is_unknown_sanitized_and_never_retried(error, tmp_path):
    from forge.image_provider import ImageProviderError
    ref = tmp_path / "image.png"
    ref.write_bytes(png())
    client = OfflineClient(error=error)
    with pytest.raises(ImageProviderError) as raised:
        backend(client).generate(request(referenced_image_paths=[str(ref)]))
    assert raised.value.code == "PROVIDER_CALL_FAILED"
    assert raised.value.completion == "unknown"
    assert "secret-token" not in str(raised.value)
    assert raised.value.__suppress_context__ is True
    assert len(client.images.calls) == 1
    assert all(stream.closed for stream in client.images.streams)


def test_sdk_options_disable_automatic_retries():
    class SDKLike(OfflineClient):
        max_retries = 2

        def with_options(self, **kwargs):
            self.options = kwargs
            copy = OfflineClient()
            copy.images = self.images
            return copy

    client = SDKLike()
    backend(client).generate(request())
    assert client.options == {"max_retries": 0}
    assert len(client.images.calls) == 1


def test_client_with_implicit_retries_is_rejected_before_references(monkeypatch):
    from forge import image_provider
    client = OfflineClient()
    client.max_retries = 2
    monkeypatch.setattr(image_provider, "read_bounded", lambda *args: pytest.fail("reference opened"))
    with pytest.raises(image_provider.ImageProviderError) as error:
        backend(client).generate(request(referenced_image_paths=["not-opened.png"]))
    assert error.value.code == "PROVIDER_UNAVAILABLE"
    assert client.images.calls == []


@pytest.mark.parametrize("kind", ["missing", "directory", "symlink", "bad_png", "oversized"])
def test_bad_reference_prevents_upload(kind, tmp_path):
    from forge.image_provider import ImageProviderError
    from forge_accel.pixels import MAX_FILE_BYTES
    ref = tmp_path / "input.png"
    if kind == "directory":
        ref.mkdir()
    elif kind == "symlink":
        target = tmp_path / "target.png"
        target.write_bytes(png())
        ref.symlink_to(target)
    elif kind == "bad_png":
        ref.write_bytes(b"bad PNG")
    elif kind == "oversized":
        with ref.open("wb") as stream:
            stream.truncate(MAX_FILE_BYTES + 1)
    client = OfflineClient()
    with pytest.raises(ImageProviderError) as error:
        backend(client).generate(request(referenced_image_paths=[str(ref)]))
    assert error.value.code == "INVALID_REFERENCE"
    assert error.value.completion == "not_started"
    assert client.images.calls == []


def test_output_dimension_limit_uses_existing_decoder():
    from forge.image_provider import ImageProviderError
    oversized_png = png(size=(8193, 1))
    client = OfflineClient(result=response(data=[{"b64_json": base64.b64encode(oversized_png).decode()}]))
    with pytest.raises(ImageProviderError) as error:
        backend(client).generate(request())
    assert error.value.code == "INVALID_RESPONSE"
    assert len(client.images.calls) == 1


def test_explicit_auto_and_custom_size_preserved():
    client = OfflineClient()
    backend(client).generate(request(size="1536x864", quality="auto"))
    assert client.images.calls[0][1]["size"] == "1536x864"
    assert client.images.calls[0][1]["quality"] == "auto"


@pytest.mark.parametrize("usage", ["secret", 42, {"input_tokens": -1},
    {"input_tokens": True}, {"input_tokens_details": "secret"},
    {"input_tokens_details": {"image_tokens": "one"}}])
def test_malformed_usage_metadata_is_rejected_without_echoing_it(usage):
    from forge.image_provider import ImageProviderError
    client = OfflineClient(result=response(usage=usage))
    with pytest.raises(ImageProviderError) as error:
        backend(client).generate(request())
    assert error.value.code == "INVALID_RESPONSE"
    assert "secret" not in str(error.value)
    assert len(client.images.calls) == 1


def test_only_documented_usage_fields_are_exposed():
    got = backend(OfflineClient(result=response(usage={
        "input_tokens": 1, "debug_credentials": "not-returned",
        "input_tokens_details": {"text_tokens": 1, "private": "not-returned"}}))).generate(request())
    assert got["usage"] == {"input_tokens": 1, "input_tokens_details": {"text_tokens": 1}}


def test_output_byte_limit_applies_before_decode(monkeypatch):
    from forge import image_provider
    monkeypatch.setattr(image_provider, "MAX_FILE_BYTES", 8)
    monkeypatch.setattr(image_provider, "decode_rgba", lambda *args: pytest.fail("oversized image decoded"))
    with pytest.raises(image_provider.ImageProviderError) as error:
        backend().generate(request())
    assert error.value.code == "INVALID_RESPONSE"


def test_rejects_animation_and_non_png_output():
    from forge.image_provider import ImageProviderError
    first = Image.new("RGBA", (2, 2), (255, 0, 0, 255))
    second = Image.new("RGBA", (2, 2), (0, 255, 0, 255))
    animated = io.BytesIO()
    first.save(animated, format="PNG", save_all=True, append_images=[second], duration=100)
    jpeg = io.BytesIO()
    first.convert("RGB").save(jpeg, format="JPEG")
    for raw in (animated.getvalue(), jpeg.getvalue()):
        client = OfflineClient(result=response(data=[{"b64_json": base64.b64encode(raw).decode()}]))
        with pytest.raises(ImageProviderError) as error:
            backend(client).generate(request())
        assert error.value.code == "INVALID_RESPONSE"
        assert len(client.images.calls) == 1


def test_safe_error_result_explicitly_forbids_retry():
    from forge.image_provider import ImageProviderError
    with pytest.raises(ImageProviderError) as error:
        backend(OfflineClient(error=TimeoutError("not-returned"))).generate(request())
    result = error.value.result()
    assert result["error"]["completion"] == "unknown"
    assert result["error"]["retryable"] is False
    assert "not-returned" not in repr(result)
