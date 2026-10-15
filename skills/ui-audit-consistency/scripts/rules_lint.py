#!/usr/bin/env python3
"""Validate the rule registry's own invariants.

A registry that contradicts itself is worse than no registry: it lets a finding cite an ID
that means something else, or score a severity the rule was never allowed to carry. This
runs over rules/*.md and fails the build when any invariant breaks.

Exit code 1 on any error, so it can gate CI.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SEVERITIES = {"blocker", "critical", "warning", "tip"}
MODES = {"static", "live", "judgement"}
CLASSES = {"contract", "floor"}
# WCAG AA is a floor, not a target: these domains may never be dismissed as polish.
NEVER_TIP = ("A11Y", "CON")
ROW = re.compile(r"^\|\s*(DSG-[A-Z0-9]+-\d+)\s*\|(.*)\|\s*$")


def parse_rules(rules_dir: Path) -> tuple[list[dict], list[str]]:
    """Read every rule row. Returns (rules, errors) rather than raising, so one bad row
    does not hide the rest."""
    rules: list[dict] = []
    errors: list[str] = []
    files = sorted(rules_dir.glob("*.md"))
    if not files:
        errors.append(f"no rule files found in {rules_dir}")
        return rules, errors
    for path in files:
        rule_class = "floor" if path.stem == "floor" else "contract"
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            match = ROW.match(line)
            if not match:
                continue
            cells = [cell.strip() for cell in match.group(2).split("|")]
            if len(cells) < 4:
                errors.append(f"{path.name}:{lineno} {match.group(1)} has {len(cells)} columns, expected 4")
                continue
            severity, mode, text, source = cells[0], cells[1], cells[2], cells[3]
            rules.append({
                "id": match.group(1),
                "class": rule_class,
                "severity": severity,
                "mode": mode,
                "rule": text,
                "source": source,
                "file": path.name,
                "line": lineno,
            })
    return rules, errors


def check(rules: list[dict]) -> list[str]:
    errors: list[str] = []
    seen: dict[str, str] = {}
    for rule in rules:
        where = f"{rule['file']}:{rule['line']} {rule['id']}"
        if rule["id"] in seen:
            errors.append(f"{where} duplicate id, already at {seen[rule['id']]}")
        else:
            seen[rule["id"]] = where
        if rule["severity"] not in SEVERITIES:
            errors.append(f"{where} severity {rule['severity']!r} not one of {sorted(SEVERITIES)}")
        if rule["mode"] not in MODES:
            errors.append(f"{where} mode {rule['mode']!r} not one of {sorted(MODES)}")
        if rule["class"] not in CLASSES:
            errors.append(f"{where} class {rule['class']!r} not one of {sorted(CLASSES)}")
        if len(rule["source"]) < 3:
            errors.append(f"{where} has no source; every rule must cite one")
        if len(rule["rule"]) < 10:
            errors.append(f"{where} rule text is too short to be checkable")
        domain = rule["id"].split("-")[1]
        if domain in NEVER_TIP and rule["severity"] == "tip":
            errors.append(f"{where} accessibility rules may never be severity tip; AA is a floor")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rules", default="rules", help="directory holding the rule markdown files")
    parser.add_argument("--format", choices=["text", "json"], default="text")
    args = parser.parse_args()

    rules_dir = Path(args.rules)
    rules, errors = parse_rules(rules_dir)
    errors += check(rules)

    by_severity: dict[str, int] = {}
    by_mode: dict[str, int] = {}
    for rule in rules:
        by_severity[rule["severity"]] = by_severity.get(rule["severity"], 0) + 1
        by_mode[rule["mode"]] = by_mode.get(rule["mode"], 0) + 1

    if args.format == "json":
        print(json.dumps({"total": len(rules), "bySeverity": by_severity, "byMode": by_mode, "errors": errors}, indent=2))
    else:
        print(f"{len(rules)} rules in {rules_dir}")
        print("  severity: " + ", ".join(f"{k}={v}" for k, v in sorted(by_severity.items())))
        print("  mode:     " + ", ".join(f"{k}={v}" for k, v in sorted(by_mode.items())))
        for error in errors:
            print(f"ERROR {error}", file=sys.stderr)
        if not errors:
            print("registry OK")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
