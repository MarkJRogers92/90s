"""Command line: python -m forge <command>   (or ./forge <command>)

  serve                              editor + AI panel on http://127.0.0.1:9002
  mcp                                MCP server (stdio) for Claude Code / Codex
  mcp-readonly                       restricted MCP for existing assets; no generation
  mcp-authoring [--enable-authoring]  bounded direct drawing; writes disabled by default
  make "prompt" [options]            fully automatic: style -> draw -> review -> QA -> save/export
  render program.json                render a sprite program (when an agent draws directly)
  cleanup image.png                  turn any image into true pixel art
  qa sprite.png                      automated checks
  lint sprite.png                    located pixel-art problems (same checks as Aseprite's validate)
  open LIBRARY_ID [--editor E]       open a result in aseprite (layered), piskel, or both
  from-aseprite DOC.aseprite         an edited single-frame document back, checked
  animation-export MANIFEST --out DIR  automatically checked animation review/final export
  rig-review RECIPE --out DIR [--baseline RENDER]  render + checked review export + previews + native check, one summary
  rig-render RECIPE --out DIR        render a rig + pose recipe into frames, layers and a derived manifest
  rig-variant PNG --of S.V --rotate DEG --pivot X,Y --out PNG   derive a verified rotated variant
  rig-preview RENDER_DIR --out DIR   stills plus in-place and ground-relative motion previews
  project add PATH [--name N]        register an existing art folder (read-only)
  project list | scan ID | learn ID  list / index / build a style profile from it
  profiles                           list style profiles
  guide                              print the drawing guide (for agents drawing directly)
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from . import artist, dsl, editors, library, lint, profiles, projects, qa
from . import routes as route_mod
from .cleanup import CleanupOptions, cleanup, load_image
from .sprite import Sprite, preview_image

ARTISTS = sorted(artist.BACKENDS) + ["gpt-image"]


def make(prompt: str, width: int | None = None, height: int | None = None, profile: str | None = None,
         project: str | None = None, rounds: int = 2, artist_name: str | None = None,
         model: str | None = None, start: str | None = None, out: str | None = None,
         log=print, base: Sprite | None = None, refiner: str | None = None,
         polish: bool = True, use_references: bool = True, keep_steps: bool = False,
         retouch_only: bool = False, candidates: int = 1, checks: list[str] | None = None,
         refs: list[str] | None = None, routes: list[str] | None = None,
         open_in: str | None = None, combine: bool = True,
         cache_dir: str | Path | None = None, generation_revision: str | None = None,
         state: str = "still", brief: dict | None = None,
         _profile_snapshot: dict | None = None) -> dict:
    """The automatic pipeline shared by the CLI and the MCP server."""
    if refiner is not None and (not isinstance(refiner, str) or refiner not in artist.BACKENDS):
        raise ValueError('unknown refiner')
    from .quality_speed import compile_requirements, make_cached
    prompt += compile_requirements(brief)
    if cache_dir is not None:
        return make_cached(prompt, cache_dir=cache_dir, generation_revision=generation_revision, state=state,
                           width=width, height=height, profile=profile, project=project, rounds=rounds,
                           artist_name=artist_name, model=model, start=start, out=out, log=log, base=base,
                           refiner=refiner, polish=polish, use_references=use_references, keep_steps=keep_steps,
                           retouch_only=retouch_only, candidates=candidates, checks=checks, refs=refs,
                           routes=routes, open_in=open_in, combine=combine)
    if project and not profile:
        profile = projects.get(project)["id"]
        if not (profiles.ROOT / f"{profile}.json").exists():
            log(f"learning style from project {project}…")
            projects.learn_style(project, profile)
    prof = _profile_snapshot if _profile_snapshot is not None else profiles.load(profile)
    size = (prof or {}).get("size") or [32, 32]
    starting_image = None
    if base is None and start:
        starting_image = load_image(Path(start).expanduser().read_bytes())
        if artist_name != "gpt-image":
            base = Sprite.from_image(starting_image)
    w = width or (base.width if base else starting_image.width if starting_image else size[0])
    h = height or (base.height if base else starting_image.height if starting_image else size[1])
    ref_list = [Path(x).expanduser() for x in (refs or [])]
    if use_references:
        ref_list += [Path(x) for x in (prof or {}).get("reference_paths", [])][:max(0, 3 - len(ref_list))]
    item_id, d = library.new_dir(prompt)
    edit_prompt, retouch = prompt, False
    backend_model = model
    if artist_name == "gpt-image":
        # Keep the raw PNG edit target; indexing it before painting can discard
        # alpha/detail or reject illustrations with more than 62 colours.
        painting_start = Path(start).expanduser() if start and base is None else None
        if base is not None:
            painting_start = base.save(d / "work" / "painting_input.png")
        painting = artist.paint_with_gpt_image(prompt, w, h, prof, d / "work", log,
                                                references=ref_list, start=painting_start, model=model)
        base, rep = cleanup(load_image(painting.read_bytes()), CleanupOptions(
            width=w, height=h, max_colors=32, remove_background="auto",
            dark_bias=0.5, accent_share=0.2))
        # keep the painting's own colours: snapping straight to the project palette mutes
        # neon/light sources; the refining artist pulls colours toward the style instead
        base.save(d / "work" / "pixelized.png")
        log("pixelized: " + "; ".join(rep.notes))
        if retouch_only:
            edit_prompt = (f"{prompt}\n\nThe STARTING SPRITE was converted automatically from a detailed "
                           f"painting (shown in start.png). RETOUCH it, do not redraw it: answer with "
                           f"{{\"base\": \"current\"}} and small corrective ops only.")
        else:
            # default: the conversion is a starting point, not a constraint. At sprite sizes the
            # painting's texture turns into noise, so the artist redraws cleanly, keeping its
            # composition, colours and distinctive details (measured: this beat retouching).
            edit_prompt = (f"{prompt}\n\nThe STARTING SPRITE (start.png) was converted automatically from a "
                           f"detailed painting. Use it for composition, proportions, colour scheme and "
                           f"distinctive details (side art, marquee glow, damage), but redraw it as clean "
                           f"pixel art: solid silhouette, dark outline, organised light and shadow, no "
                           f"speckle. A complete new program is expected.")
        artist_name, retouch = refiner or "cli", retouch_only
        # --model selected the painter; the separately selected refiner uses its
        # own default rather than receiving an incompatible painter model name.
        backend_model = None
    # external routes (PixelLab, Retro Diffusion) paint drafts that compete in the judging
    external = route_mod.run_routes(routes or [], prompt, w, h, prof, d / "work", log) if routes else []
    req = artist.Request(edit_prompt, w, h, prof, rounds, base, ref_list,
                         polish=polish, retouch=retouch, candidates=candidates, checks=checks or [],
                         external=external, combine=combine)
    backend = artist.make_backend(artist_name, backend_model)
    log(f"artist: {backend.name}; saving to library/{item_id}")
    steps = artist.generate(req, backend, d / "work", log)
    final = steps[-1]
    library.save_result(d, final.sprite, {
        "kind": "refine" if base else "generate", "prompt": prompt, "size": [req.width, req.height],
        "profile": profile, "backend": backend.name, "model": getattr(backend, "model", None),
        "steps": [{"kind": s.kind, "program": s.program, "errors": s.errors, "qa": s.qa, "notes": s.notes}
                  for s in steps]})
    result = {"library_id": item_id, "png": str(d / "sprite.png"), "preview": str(d / "sprite@8x.png"),
              "size": [final.sprite.width, final.sprite.height], "qa": final.qa,
              "review_notes": [s.notes for s in steps if s.notes]}
    if keep_steps:
        result["_steps"] = steps
    if open_in:
        try:
            result["opened"] = editors.open_item(item_id, open_in)
        except Exception as e:  # the art is saved either way; say why the editor did not open
            log(f"could not open in {open_in}: {e}")
            result["open_error"] = str(e)
    if out:
        dst = Path(out).expanduser()
        if dst.suffix.lower() != ".png":
            dst.mkdir(parents=True, exist_ok=True)
            dst = dst / f"{projects.slug(prompt)}.png"
        if dst.exists():
            raise FileExistsError(f"{dst} exists; not overwriting")
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(d / "sprite.png", dst)
        result["exported"] = str(dst)
    return result


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if args and args[0] == "image-pair":
        from .image_pair_cli import main as pair_main
        return pair_main(args[1:])
    if args and args[0] == "quality":
        from .quality_cli import main as quality_main
        return quality_main(args[1:])
    if args and args[0] == "animation-export":
        from .animation_export import cli
        return cli(args[1:])
    if args and args[0] == "rig-render":
        from .rig import cli as rig_cli
        return rig_cli(args[1:])
    if args and args[0] == "rig-review":
        from .rig import review_cli
        return review_cli(args[1:])
    if args and args[0] == "rig-variant":
        from .rig import variant_cli
        return variant_cli(args[1:])
    if args and args[0] == "rig-preview":
        from .rig import previews
        if len(args) != 4 or args[2] != "--out":
            print("usage: forge rig-preview RENDER_DIR --out DIR"); return 2
        print(json.dumps(previews(args[1], args[3]), indent=2)); return 0
    ap = argparse.ArgumentParser(prog="forge", description="Pixel Forge")
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("serve"); s.add_argument("--port", type=int, default=9002)
    sub.add_parser("mcp")
    sub.add_parser("mcp-readonly")
    direct = sub.add_parser("mcp-authoring")
    direct.add_argument("--enable-authoring", action="store_true")
    sub.add_parser("animation-export", help="manifest-gated animation export; see animation-export --help")
    sub.add_parser("rig-render", help="render a rig + pose recipe; see rig-render --help")
    sub.add_parser("quality", help="opt-in cache/local quality tools; see quality --help")
    sub.add_parser("guide")
    sub.add_parser("profiles")

    for name in ("make", "generate"):
        g = sub.add_parser(name)
        g.add_argument("prompt")
        g.add_argument("-W", "--width", type=int); g.add_argument("-H", "--height", type=int)
        g.add_argument("--profile"); g.add_argument("--project", help="project id or folder: learn its style")
        g.add_argument("--cache-dir", help="opt-in content-addressed reuse; requires config revision")
        g.add_argument("--generation-revision", help="explicit external model/config version for caching")
        g.add_argument("--state", default="still")
        g.add_argument("--brief", help="JSON identity/silhouette/palette/protected/asymmetry/physical requirements")
        g.add_argument("--rounds", type=int, default=2)
        g.add_argument("--artist", "--backend", dest="artist", choices=ARTISTS)
        g.add_argument("--model"); g.add_argument("--start", help="existing PNG to refine")
        g.add_argument("-o", "--out", help="copy the result here (folder or .png); never overwrites")
        g.add_argument("--refiner", choices=["cli", "claude", "codex", "gpt", "api"],
                       help="who refines a gpt-image painting (default claude)")
        g.add_argument("--no-polish", action="store_true", help="skip the automatic noise cleanup")
        g.add_argument("-n", "--candidates", type=int, default=3,
                       help="parallel drafts (1-4); a judge picks the best before refining")
        g.add_argument("--ref", action="append", default=[],
                       help="extra reference image the artist should look at (repeatable; shown first)")
        g.add_argument("--check", action="append", default=[],
                       help="acceptance requirement the reviews and judge must verify (repeatable)")
        g.add_argument("--route", action="append", default=[], choices=sorted(route_mod.ROUTES),
                       help="also get a draft from pixellab or rd (Retro Diffusion); spends credits (repeatable)")
        g.add_argument("--no-combine", action="store_true",
                       help="skip the combine step (bringing the best feature of each other draft into the winner)")
        g.add_argument("--open", dest="open_in", choices=editors.EDITORS,
                       help="open the result: aseprite (layered document), piskel, or both")

    r = sub.add_parser("render")
    r.add_argument("program"); r.add_argument("-o", "--out"); r.add_argument("--base")
    r.add_argument("--preview", help="also write an 8x checkerboard preview here")

    c = sub.add_parser("cleanup")
    c.add_argument("image"); c.add_argument("-o", "--out")
    c.add_argument("-W", "--width", type=int); c.add_argument("-H", "--height", type=int)
    c.add_argument("--colors", type=int, default=16); c.add_argument("--profile")
    c.add_argument("--no-grid", action="store_true"); c.add_argument("--orphans", action="store_true")
    c.add_argument("--background", default="auto", choices=["auto", "alpha", "none"])
    c.add_argument("--preset", default="standard", choices=["standard", "illustration"],
                   help="illustration keeps contrasting details when shrinking GPT images")

    q = sub.add_parser("qa"); q.add_argument("image")
    li = sub.add_parser("lint"); li.add_argument("image")
    op = sub.add_parser("open"); op.add_argument("item", help="library id")
    op.add_argument("--editor", default="aseprite", choices=editors.EDITORS)
    fa = sub.add_parser("from-aseprite"); fa.add_argument("document")
    fa.add_argument("-o", "--out"); fa.add_argument("--polish", action="store_true"); fa.add_argument("--name")

    p = sub.add_parser("project")
    psub = p.add_subparsers(dest="pcmd", required=True)
    pa = psub.add_parser("add"); pa.add_argument("path"); pa.add_argument("--name"); pa.add_argument("--id")
    psub.add_parser("list")
    ps = psub.add_parser("scan"); ps.add_argument("project")
    pl = psub.add_parser("learn"); pl.add_argument("project"); pl.add_argument("--id"); pl.add_argument("--name")
    pl.add_argument("--colors", type=int, default=32); pl.add_argument("--include", help="only paths containing this")

    a = ap.parse_args(argv)
    dump = lambda o: print(json.dumps(o, indent=1, default=str))

    if a.cmd == "serve":
        from .server import serve
        serve(a.port)
    elif a.cmd == "mcp":
        from .mcp_server import main as mcp_main
        mcp_main()
    elif a.cmd == "mcp-readonly":
        from .readonly_mcp import main as mcp_main
        mcp_main()
    elif a.cmd == "mcp-authoring":
        from .authoring_mcp import main as mcp_main
        mcp_main(["--enable-authoring"] if a.enable_authoring else [])
    elif a.cmd == "guide":
        print(artist.GUIDE)
    elif a.cmd == "profiles":
        dump(profiles.list_profiles())
    elif a.cmd in ("make", "generate"):
        dump(make(a.prompt, a.width, a.height, a.profile, a.project, a.rounds, a.artist, a.model,
                  a.start, a.out, log=lambda m: print(m, file=sys.stderr), refiner=a.refiner,
                  polish=not a.no_polish, candidates=a.candidates, checks=a.check, refs=a.ref,
                  routes=a.route, open_in=a.open_in, combine=not a.no_combine,
                  cache_dir=a.cache_dir, generation_revision=a.generation_revision, state=a.state,
                  brief=json.loads(Path(a.brief).read_text()) if a.brief else None))
    elif a.cmd == "render":
        base = Sprite.from_image(load_image(Path(a.base).read_bytes())) if a.base else None
        res = dsl.render(json.loads(Path(a.program).read_text()), base)
        out = Path(a.out or Path(a.program).with_suffix(".png"))
        res.sprite.save(out)
        if a.preview:
            preview_image(res.sprite, 8 if max(res.sprite.width, res.sprite.height) <= 64 else 4).save(a.preview)
        dump({"png": str(out), "errors": res.errors, "qa": qa.check(res.sprite)})
    elif a.cmd == "cleanup":
        prof = profiles.load(a.profile)
        sprite, rep = cleanup(load_image(Path(a.image).read_bytes()), CleanupOptions(
            width=a.width, height=a.height, max_colors=a.colors, palette=(prof or {}).get("palette"),
            remove_background=a.background, detect_grid=not a.no_grid, remove_orphans=a.orphans,
            preset=a.preset))
        out = Path(a.out or Path(a.image).with_name(Path(a.image).stem + "_pixel.png"))
        sprite.save(out)
        dump({"png": str(out), "report": rep.__dict__, "qa": qa.check(sprite)})
    elif a.cmd == "qa":
        dump(qa.check(Sprite.from_image(load_image(Path(a.image).read_bytes()))))
    elif a.cmd == "lint":
        from PIL import Image
        dump(lint.lint_image(Image.open(a.image)))
    elif a.cmd == "open":
        dump(editors.open_item(a.item, a.editor))
    elif a.cmd == "from-aseprite":
        dump(editors.import_from_aseprite(Path(a.document), a.out, polish=a.polish, name=a.name))
    elif a.cmd == "project":
        if a.pcmd == "add":
            dump(projects.register(a.path, a.name, a.id))
        elif a.pcmd == "list":
            dump(projects.list_projects())
        elif a.pcmd == "scan":
            files = projects.scan(a.project)
            dump({"count": len(files), "files": files[:50]})
        elif a.pcmd == "learn":
            dump(projects.learn_style(a.project, a.id, a.name, a.colors, include=a.include))


if __name__ == "__main__":
    sys.exit(main())
