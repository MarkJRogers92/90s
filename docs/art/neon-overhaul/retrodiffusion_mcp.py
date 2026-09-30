#!/usr/bin/env python3
"""Minimal stdio MCP server for the Retro Diffusion API (stdlib only, dev-time art tooling).

Reads RETRODIFFUSION_API_KEY from the environment. Generated PNGs are written to disk and the
tool returns file paths, so nothing here ships in or is called by the game at runtime.
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

API = "https://api.retrodiffusion.ai/v2"
DEFAULT_OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "retrodiffusion")

GENERATE_SCHEMA = {
    "type": "object",
    "properties": {
        "prompt": {"type": "string", "description": "Subject to draw."},
        "prompt_style": {
            "type": "string",
            "default": "rd_fast__game_asset",
            "description": (
                "Style id, e.g. rd_fast__game_asset, rd_fast__detailed, rd_plus__default, "
                "rd_plus__retro, rd_plus__topdown_map, rd_pro__default, rd_pro__fps_weapon, "
                "rd_pro__pixelate (needs input_image_path), rd_tile__single_tile, "
                "rd_tile__tileset, or user__<name>_<id>."
            ),
        },
        "width": {"type": "integer", "default": 64, "description": "12-512, style dependent."},
        "height": {"type": "integer", "default": 64, "description": "12-512, style dependent."},
        "num_images": {"type": "integer", "default": 1, "description": "Batch size, up to 16."},
        "seed": {"type": "integer"},
        "remove_bg": {"type": "boolean", "default": False, "description": "Transparent background."},
        "input_image_path": {"type": "string", "description": "Local PNG for img2img / pixelate."},
        "strength": {"type": "number", "description": "0-1 img2img blend (default 0.75)."},
        "check_cost": {
            "type": "boolean",
            "default": False,
            "description": "Free dry run: return the price without generating. Use before big batches.",
        },
        "out_dir": {"type": "string", "description": "Folder for PNGs (default docs/art/neon-overhaul/retrodiffusion)."},
        "name": {"type": "string", "description": "Filename stem, default derived from the prompt."},
    },
    "required": ["prompt"],
}

TOOLS = [
    {
        "name": "rd_generate",
        "description": "Generate pixel art with Retro Diffusion and save PNG(s) to disk. Costs real money; run with check_cost first for RD Pro or large batches.",
        "inputSchema": GENERATE_SCHEMA,
    }
]


def api_key():
    """Env var first; GUI-launched apps skip ~/.zshrc, so fall back to asking an interactive shell."""
    key = os.environ.get("RETRODIFFUSION_API_KEY", "")
    if key.startswith("rdpk-"):
        return key
    try:
        out = subprocess.run(
            ["zsh", "-ic", 'printf %s "$RETRODIFFUSION_API_KEY"'],
            capture_output=True, text=True, timeout=10,
        ).stdout.strip()
        return out if out.startswith("rdpk-") else ""
    except Exception:
        return ""


def http(method, path, body=None):
    key = api_key()
    if not key:
        raise RuntimeError("RETRODIFFUSION_API_KEY is not set in the MCP server environment")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        API + path,
        data=data,
        method=method,
        headers={"X-RD-Token": key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError("Retro Diffusion HTTP %s: %s" % (e.code, e.read().decode(errors="replace")[:500]))


def generate(a):
    body = {
        "prompt": a["prompt"],
        "prompt_style": a.get("prompt_style", "rd_fast__game_asset"),
        "width": a.get("width", 64),
        "height": a.get("height", 64),
        "num_images": a.get("num_images", 1),
    }
    for k in ("seed", "strength"):
        if k in a:
            body[k] = a[k]
    if a.get("remove_bg"):
        body["remove_bg"] = True
    if a.get("check_cost"):
        body["check_cost"] = True
    if a.get("input_image_path"):
        with open(a["input_image_path"], "rb") as f:
            body["input_image"] = base64.b64encode(f.read()).decode()

    res = http("POST", "/inferences", body)
    task = res.get("task_id")
    deadline = time.time() + 300
    while task and res.get("status") not in ("succeeded", "completed") and not res.get("base64_images") and time.time() < deadline:
        if res.get("status") in ("failed", "error"):
            raise RuntimeError("Retro Diffusion task failed: %s" % json.dumps(res)[:500])
        time.sleep(3)
        res = http("GET", "/inferences/tasks/" + task)
    if isinstance(res.get("result"), dict):  # async tasks nest the payload under "result"
        res = res["result"]

    images = res.get("base64_images") or []
    if a.get("check_cost") or not images:
        return json.dumps({k: v for k, v in res.items() if k != "base64_images"})

    out_dir = a.get("out_dir") or DEFAULT_OUT
    os.makedirs(out_dir, exist_ok=True)
    stem = a.get("name") or "".join(c if c.isalnum() else "-" for c in a["prompt"].lower())[:40].strip("-")
    stem = "%s-%d" % (stem or "rd", int(time.time()))
    paths = []
    for i, b64 in enumerate(images):
        path = os.path.join(out_dir, "%s-%d.png" % (stem, i + 1))
        with open(path, "wb") as f:
            f.write(base64.b64decode(b64))
        paths.append(path)
    return json.dumps(
        {
            "files": paths,
            "model": res.get("model"),
            "balance_cost": res.get("balance_cost"),
            "remaining_balance": res.get("remaining_balance"),
        }
    )


def reply(id_, result=None, error=None):
    msg = {"jsonrpc": "2.0", "id": id_}
    if error:
        msg["error"] = error
    else:
        msg["result"] = result
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def handle(msg):
    method, id_ = msg.get("method"), msg.get("id")
    if id_ is None:
        return  # notification
    if method == "initialize":
        reply(id_, {
            "protocolVersion": msg.get("params", {}).get("protocolVersion", "2024-11-05"),
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "retrodiffusion", "version": "0.1.0"},
        })
    elif method == "tools/list":
        reply(id_, {"tools": TOOLS})
    elif method == "tools/call":
        params = msg.get("params", {})
        try:
            if params.get("name") != "rd_generate":
                raise RuntimeError("unknown tool %s" % params.get("name"))
            text = generate(params.get("arguments", {}))
            reply(id_, {"content": [{"type": "text", "text": text}]})
        except Exception as e:  # tool errors are results, not protocol errors
            reply(id_, {"content": [{"type": "text", "text": str(e)}], "isError": True})
    elif method == "ping":
        reply(id_, {})
    else:
        reply(id_, error={"code": -32601, "message": "method not found: %s" % method})


if __name__ == "__main__":
    for line in sys.stdin:
        line = line.strip()
        if line:
            handle(json.loads(line))
