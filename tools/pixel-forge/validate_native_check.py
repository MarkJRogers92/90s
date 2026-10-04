#!/usr/bin/env python3
"""Fail-closed evidence gate for run_native_check.sh (standard library only)."""
import argparse
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

RECIPES = ("recipe", "recipe-v2", "recipe-v3-base", "recipe-v3")
DURATIONS = [0.142, 0.142, 0.142, 0.141, 0.133, 0.133]
EXPECTED_FAILURE = (
    "GROUND_CONTACT:ground:floor:legs/4: lowest contact pixel at world y 110; "
    "floor y 111; tolerance 0px"
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check_native(native):
    require(isinstance(native, dict), "missing or malformed native verification")
    require(native.get("visible_frames_pixel_exact") is True, "native pixels are not verified exact")
    require(native.get("layers_preserved") is True, "native layers are not verified preserved")
    durations = native.get("durations_seconds")
    require(isinstance(durations, list) and all(type(v) in (int, float) for v in durations)
            and durations == DURATIONS, "native durations must be 142/142/142/141/133/133 ms")


def check_suite(path):
    root = ET.parse(path).getroot()
    suites = [root] if root.tag == "testsuite" else list(root.iter("testsuite"))
    require(bool(suites), "missing pytest test suite results")
    total = 0
    for suite in suites:
        counts = {key: int(suite.attrib[key]) for key in ("tests", "failures", "errors", "skipped")}
        require(counts["tests"] >= 0 and all(counts[key] == 0 for key in ("failures", "errors", "skipped")),
                "pytest must have no failures, errors, or skipped tests")
        total += counts["tests"]
    require(total > 0, "pytest did not run any tests")
    require(not any(next(root.iter(tag), None) is not None for tag in ("failure", "error", "skipped")),
            "pytest contains failed or skipped test cases")
    print(f"pytest: {total} passed, no skips")


def check_report(kind, path, returncode):
    report = json.loads(path.read_text())
    require(isinstance(report, dict), "report must be a JSON object")
    if kind == "frozen":
        require(returncode == 0, f"frozen export exited {returncode}, expected 0")
        require(report.get("status") == "review_only", "frozen export must be review_only")
        checks = report.get("checks")
        require(isinstance(checks, dict) and checks.get("technical_status") == "pass",
                "frozen technical checks did not pass")
        rows = checks.get("checks")
        require(isinstance(rows, list) and bool(rows), "missing frozen checks")
        require(all(isinstance(row, dict) and row.get("status") in ("pass", "unverified") for row in rows),
                "frozen report contains failed or malformed checks")
        check_native(report.get("native_document"))
        print("frozen: native pixel-exact; all six durations verified")
        return
    require(kind in RECIPES, "unknown benchmark recipe")
    expected = kind == "recipe-v3-base"
    require(returncode == (2 if expected else 0), f"{kind}: unexpected exit status {returncode}")
    export = report.get("export")
    require(isinstance(export, dict), "missing or malformed export summary")
    require(export.get("status") == ("review_only_failed_checks" if expected else "review_only"),
            "unexpected export status")
    require(export.get("technical") == ("fail" if expected else "pass"), "unexpected technical status")
    require(export.get("failed") == ([EXPECTED_FAILURE] if expected else []),
            "failed checks differ from the exact benchmark expectation")
    require(export.get("rig_bytes_verified") is True, "rig/recipe bytes were not verified")
    native = report.get("native")
    require(isinstance(native, dict) and native.get("status") == "verified", "native status must be verified")
    check_native(native)
    label = "expected sole GROUND_CONTACT failure" if expected else "technical pass"
    print(f"{kind}: {label}; rig bytes verified; native pixel-exact; all six durations verified")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=("pytest", "frozen", *RECIPES))
    parser.add_argument("report", type=Path)
    parser.add_argument("returncode", type=int, nargs="?", default=0)
    args = parser.parse_args(argv)
    try:
        if args.kind == "pytest":
            require(args.returncode == 0, f"pytest exited {args.returncode}")
            check_suite(args.report)
        else:
            check_report(args.kind, args.report, args.returncode)
    except (OSError, ValueError, KeyError, TypeError, ET.ParseError) as error:
        print(f"Native check FAILED ({args.kind}): {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
