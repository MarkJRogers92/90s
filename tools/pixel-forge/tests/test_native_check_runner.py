"""Exercise the shell/JSON gate with synthetic commands and a small real pytest fixture."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
RECIPES = ("recipe", "recipe-v2", "recipe-v3-base", "recipe-v3")
EXPECTED_FAILURE = (
    "GROUND_CONTACT:ground:floor:legs/4: lowest contact pixel at world y 110; "
    "floor y 111; tolerance 0px"
)
DURATIONS = [0.142, 0.142, 0.142, 0.141, 0.133, 0.133]


def native():
    return {"status": "verified", "visible_frames_pixel_exact": True,
            "durations_seconds": DURATIONS, "layers_preserved": True}


def summary(name):
    expected_failure = name == "recipe-v3-base"
    return {"workflow": "forge rig-review", "approved": False,
            "export": {"status": "review_only_failed_checks" if expected_failure else "review_only",
                       "technical": "fail" if expected_failure else "pass",
                       "failed": [EXPECTED_FAILURE] if expected_failure else [],
                       "rig_bytes_verified": True},
            "native": native()}


@pytest.fixture
def runner(tmp_path):
    root = tmp_path / "payload with spaces"
    root.mkdir()
    for name in ("run_native_check.sh", "validate_native_check.py"):
        if (ROOT / name).exists():
            shutil.copy2(ROOT / name, root / name)
    (root / "examples/west-rig").mkdir(parents=True)
    (root / "examples/west-refined-review").mkdir()
    for name in (*RECIPES, "recipe-not-in-benchmark"):
        (root / f"examples/west-rig/{name}.json").write_text("{}")
    for name in ("manifest.json", "frozen.aseprite"):
        (root / "examples/west-refined-review" / name).write_text("fixture")
    # The historical layout lets the regression expose swallowed failures as well
    # as covering the flattened paths required by the new wrapper.
    (root / "workflow").mkdir()
    (root / "workflow/forge-source").symlink_to(root, target_is_directory=True)
    (root / "workflow/examples").symlink_to(root / "examples", target_is_directory=True)
    (tmp_path / "examples").symlink_to(root / "examples", target_is_directory=True)
    (root / "fake_driver.py").write_text('''import json, os, pathlib, sys
root = pathlib.Path(__file__).parent
responses = json.loads((root / "responses.json").read_text())
args = sys.argv[1:]
with (root / "calls.jsonl").open("a") as log:
    log.write(json.dumps(args) + "\\n")
if args[0] == "pytest":
    if responses.get("real_pytest"):
        import subprocess
        sys.exit(subprocess.run([sys.executable, "-m", "pytest", *args[1:]]).returncode)
    print("test suite output")
    for arg in args:
        if arg.startswith("--junitxml="):
            pathlib.Path(arg.split("=", 1)[1]).write_text(responses["junit"])
    sys.exit(responses["pytest_code"])
command, target = args[:2]
name = pathlib.Path(target).stem if command == "rig-review" else "frozen"
reply = responses.get(name, {"code": 0, "data": responses["recipe"]["data"]})
out = pathlib.Path(args[args.index("--out") + 1])
out.mkdir(parents=True)
filename = "SUMMARY.json" if command == "rig-review" else "export-report.json"
if reply.get("present", True):
    body = reply.get("raw", json.dumps(reply["data"]))
    (out / filename).write_text(body)
    print(body)
(out / "SUMMARY.md").write_text("review evidence\\n")
print("command stderr evidence", file=sys.stderr)
sys.exit(reply["code"])
''')
    fake_python = root / "fake-python"
    fake_python.write_text(f'''#!/bin/bash
if [ "$1" = "-c" ]; then exit 0; fi
if [ "$1" = "-m" ] && [ "$2" = "pytest" ]; then
  shift 2
  exec "{sys.executable}" "{root / 'fake_driver.py'}" pytest "$@"
fi
exec "{sys.executable}" "$@"
''')
    fake_python.chmod(0o755)
    (root / "forge.sh").write_text(f'#!/bin/bash\nexec "{sys.executable}" "{root / "fake_driver.py"}" "$@"\n')
    aseprite = root / "aseprite"
    aseprite.write_text("#!/bin/sh\nexit 0\n")
    aseprite.chmod(0o755)
    responses = {name: {"code": 2 if name == "recipe-v3-base" else 0, "data": summary(name)}
                 for name in RECIPES}
    frozen = {"workflow": "forge animation-export", "approved": False, "status": "review_only",
              "checks": {"technical_status": "pass", "checks": [
                  {"code": "PIXELS", "scope": "frame", "status": "pass", "detail": "exact"}]},
              "native_document": {k: v for k, v in native().items() if k != "status"}}
    responses.update(frozen={"code": 0, "data": frozen}, pytest_code=0,
                     junit='<testsuites><testsuite tests="1" failures="0" errors="0" skipped="0">'
                           '<testcase name="native"/></testsuite></testsuites>')

    def run(extra=(), env_changes=None):
        (root / "responses.json").write_text(json.dumps(responses))
        env = {**os.environ, "FORGE_PYTHON": str(fake_python), "ASEPRITE_PATH": str(aseprite)}
        for key, value in (env_changes or {}).items():
            if value is None:
                env.pop(key, None)
            else:
                env[key] = value
        return subprocess.run(["bash", str(root / "run_native_check.sh"), "--out", str(root / "evidence"), *extra],
                              cwd=tmp_path, env=env, capture_output=True, text=True)

    return root, responses, run


def test_wrapper_accepts_only_the_exact_expected_benchmark_results(runner):
    root, _, run = runner
    result = run()
    assert result.returncode == 0, result.stdout + result.stderr
    calls = [json.loads(line) for line in (root / "calls.jsonl").read_text().splitlines()]
    assert [Path(c[1]).stem for c in calls if c[0] == "rig-review"] == list(RECIPES)
    frozen_call = next(c for c in calls if c[0] == "animation-export")
    assert Path(frozen_call[1]) == root / "examples/west-refined-review/manifest.json"
    assert Path(frozen_call[frozen_call.index("--document") + 1]) == root / "examples/west-refined-review/frozen.aseprite"
    assert (root / "evidence/pytest.txt").read_text().strip() == "test suite output"
    assert "command stderr evidence" in (root / "evidence/recipe.stderr").read_text()
    assert "expected" in result.stdout.lower() and "recipe-v3-base" in result.stdout


@pytest.mark.parametrize("name", RECIPES)
@pytest.mark.parametrize("state", ["failed", "skipped", "unverified", None])
def test_native_failure_is_nonzero_even_when_rig_command_returns_zero(runner, name, state):
    _, responses, run = runner
    responses[name]["data"]["native"]["status"] = state
    result = run()
    assert result.returncode != 0, result.stdout + result.stderr


@pytest.mark.parametrize("name", RECIPES)
@pytest.mark.parametrize("code", [1, 3, 127])
def test_unexpected_recipe_exit_is_fatal(runner, name, code):
    _, responses, run = runner
    responses[name]["code"] = code
    result = run()
    assert result.returncode != 0, result.stdout + result.stderr


@pytest.mark.parametrize("name,code", [("recipe", 2), ("recipe-v2", 2), ("recipe-v3", 2), ("recipe-v3-base", 0)])
def test_exit_code_must_match_the_specific_fixture(runner, name, code):
    _, responses, run = runner
    responses[name]["code"] = code
    assert run().returncode != 0


@pytest.mark.parametrize("failed", [[], [EXPECTED_FAILURE, "EXTRA: failure"],
                                      [EXPECTED_FAILURE.replace("y 110", "y 109")],
                                      [EXPECTED_FAILURE, EXPECTED_FAILURE]])
def test_v3_base_requires_sole_exact_ground_contact_failure(runner, failed):
    _, responses, run = runner
    responses["recipe-v3-base"]["data"]["export"]["failed"] = failed
    assert run().returncode != 0


@pytest.mark.parametrize("field,value", [("technical", "fail"), ("technical", "unknown"),
                                         ("status", "exported_with_manual_review"),
                                         ("failed", ["UNEXPECTED: failure"]),
                                         ("rig_bytes_verified", False), ("rig_bytes_verified", "true"),
                                         ("rig_bytes_verified", 1)])
def test_summary_export_must_be_valid_and_rig_bytes_verified(runner, field, value):
    _, responses, run = runner
    responses["recipe"]["data"]["export"][field] = value
    assert run().returncode != 0


@pytest.mark.parametrize("target", ["frozen", "recipe", "recipe-v3-base"])
@pytest.mark.parametrize("patch", [{"visible_frames_pixel_exact": False},
                                    {"visible_frames_pixel_exact": "true"},
                                    {"visible_frames_pixel_exact": 1},
                                    {"layers_preserved": False},
                                    {"durations_seconds": [0.142] * 6},
                                    {"durations_seconds": DURATIONS[:-1]},
                                    {"durations_seconds": ["0.142", *DURATIONS[1:]]},
                                    {"durations_seconds": [0.1420001, *DURATIONS[1:]]}])
def test_native_pixels_layers_and_all_six_durations_are_required(runner, target, patch):
    _, responses, run = runner
    key = "native_document" if target == "frozen" else "native"
    responses[target]["data"][key].update(patch)
    assert run().returncode != 0


@pytest.mark.parametrize("target", ["frozen", "recipe", "recipe-v3-base"])
@pytest.mark.parametrize("fault", ["missing", "truncated", "list", "missing_native", "null_export"])
def test_missing_or_malformed_reports_are_fatal(runner, target, fault):
    _, responses, run = runner
    reply = responses[target]
    if fault == "missing":
        reply["present"] = False
    elif fault == "truncated":
        reply["raw"] = '{"native":'
    elif fault == "list":
        reply["data"] = []
    elif fault == "missing_native":
        del reply["data"]["native_document" if target == "frozen" else "native"]
    else:
        reply["data"]["checks" if target == "frozen" else "export"] = None
    assert run().returncode != 0


@pytest.mark.parametrize("change", ["command_failed", "failed_checks", "hidden_failure", "missing_checks"])
def test_frozen_export_cannot_report_false_success(runner, change):
    _, responses, run = runner
    reply = responses["frozen"]
    if change == "command_failed":
        reply["code"] = 1
    elif change == "failed_checks":
        reply["data"]["checks"]["technical_status"] = "fail"
    elif change == "hidden_failure":
        reply["data"]["checks"]["checks"][0]["status"] = "fail"
    else:
        del reply["data"]["checks"]["checks"]
    assert run().returncode != 0


@pytest.mark.parametrize("fault", ["failed", "skipped", "empty", "malformed", "missing_counts"])
def test_test_suite_must_pass_without_skips(runner, fault):
    _, responses, run = runner
    if fault == "failed":
        responses["pytest_code"] = 1
    elif fault == "skipped":
        responses["junit"] = responses["junit"].replace('skipped="0"', 'skipped="1"')
    elif fault == "empty":
        responses["junit"] = responses["junit"].replace('tests="1"', 'tests="0"')
    elif fault == "malformed":
        responses["junit"] = "not XML"
    else:
        responses["junit"] = '<testsuites><testsuite/></testsuites>'
    assert run().returncode != 0


def test_existing_output_is_not_modified(runner):
    root, _, run = runner
    out = root / "evidence"
    out.mkdir()
    (out / "sentinel").write_text("keep this")
    result = run()
    assert result.returncode != 0
    assert sorted(p.name for p in out.iterdir()) == ["sentinel"]
    assert (out / "sentinel").read_text() == "keep this"
    assert not (root / "calls.jsonl").exists()


@pytest.mark.parametrize("value", [None, "", "/missing/aseprite"])
def test_an_explicit_existing_aseprite_executable_is_required(runner, value):
    root, _, run = runner
    assert run(env_changes={"ASEPRITE_PATH": value}).returncode != 0
    assert not (root / "calls.jsonl").exists()


def test_unknown_arguments_fail_before_any_commands(runner):
    root, _, run = runner
    assert run(extra=("--unknown",)).returncode != 0
    assert not (root / "calls.jsonl").exists()


def test_existing_local_venv_is_used_without_python_override(runner):
    root, _, run = runner
    (root / ".venv/bin").mkdir(parents=True)
    (root / ".venv/bin/python").symlink_to(root / "fake-python")
    result = run(env_changes={"FORGE_PYTHON": None})
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize("source", ["environment", "configuration", "both"])
@pytest.mark.parametrize("selection", ["-k always_selected",
                                       "--deselect=tests/test_collection.py::test_must_also_run"])
def test_full_suite_cannot_be_narrowed_by_inherited_pytest_options(runner, monkeypatch, source, selection):
    root, responses, run = runner
    responses["real_pytest"] = True
    (root / "tests").mkdir()
    (root / "tests/test_collection.py").write_text(
        'from pathlib import Path\n'
        'def test_always_selected():\n'
        '    pass\n'
        'def test_must_also_run():\n'
        '    Path("all-tests-ran").write_text("yes")\n'
    )
    configured = selection if source in ("configuration", "both") else ""
    (root / "pytest.ini").write_text(f"[pytest]\naddopts = {configured}\n")
    inherited = selection if source in ("environment", "both") else ""
    monkeypatch.setenv("PYTEST_ADDOPTS", inherited)
    result = run()
    assert result.returncode == 0, result.stdout + result.stderr
    assert (root / "all-tests-ran").is_file(), result.stdout + result.stderr
    assert "2 passed" in (root / "evidence/pytest.txt").read_text()
    assert os.environ["PYTEST_ADDOPTS"] == inherited
