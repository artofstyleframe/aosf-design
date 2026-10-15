#!/usr/bin/env python3
"""Measure drift: values written as literals where the contract has a token.

Reports a compliance percentage and a `file:line` list, which is the Consistency score in
the audit report. Maps every finding to a DSG-TOK rule so it can be cited.

A literal is only drift when a token could have carried it. Values that no design system
would tokenise -- zero, 100%, a 1px hairline, `auto` -- are counted as neither compliant nor
drift, because inflating the denominator with them makes the percentage meaningless.

Exit code 1 when compliance falls below --min-compliance, or on any critical finding.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SKIP_DIRS = {"node_modules", "dist", ".git", ".astro", "build", ".next", "coverage", ".yarn"}
SCAN_SUFFIXES = (".css", ".scss", ".astro", ".tsx", ".jsx", ".vue", ".svelte")

# Literals every codebase writes and no contract tokenises. Counting these as drift would
# bury the real findings and make the percentage a number nobody trusts.
BENIGN = {
    "0", "0px", "0rem", "0%", "auto", "none", "inherit", "initial", "unset", "currentColor",
    "transparent", "100%", "100vh", "100vw", "100dvh", "100dvw", "1px", "-1px", "50%",
    "1", "0.5", "2px",
}

DECLARATION = re.compile(r"^\s*--[A-Za-z0-9_-]+\s*:")
# A colour sitting in an SVG presentation attribute is usually an embedded third-party
# brand mark (Pinterest #e60023, LinkedIn #0a66c2, Facebook #1877f2). A brand colour is
# fixed by its owner, so calling it drift is wrong. Counted separately and reported, never
# silently dropped -- pass --include-svg to fold them back in.
SVG_ATTR = re.compile(r"\b(fill|stroke|stop-color|flood-color)\s*=\s*[\"']([^\"']+)")
# Tailwind theme tokens are used as utility classes, never through var(), so a dead-token
# check that only counts var() references marks every one of them dead.
UTILITY = "(?:text|bg|border|ring|fill|stroke|from|via|to|divide|outline|shadow|accent|caret|decoration)"
COLOR_LITERAL = re.compile(r"(?<![\w-])(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\))")
VAR_REF = re.compile(r"var\(\s*--([A-Za-z0-9_-]+)")

PROPERTY_RULES = [
    # (property regex, value regex, rule id, severity, token group)
    (re.compile(r"\b(gap|row-gap|column-gap|margin[a-z-]*|padding[a-z-]*)\s*:\s*([^;{}]+)"),
     "DSG-TOK-02", "warning", "length"),
    (re.compile(r"\bfont-size\s*:\s*([^;{}]+)"), "DSG-TOK-03", "warning", "length"),
    (re.compile(r"\bborder-radius\s*:\s*([^;{}]+)"), "DSG-TOK-04", "warning", "length"),
    (re.compile(r"\bbox-shadow\s*:\s*([^;{}]+)"), "DSG-TOK-05", "warning", "shadow"),
    (re.compile(r"\bz-index\s*:\s*([^;{}]+)"), "DSG-TOK-06", "warning", "number"),
    (re.compile(r"\btransition-duration\s*:\s*([^;{}]+)"), "DSG-TOK-07", "warning", "duration"),
]

SEVERITY_WEIGHT = {"blocker": 12, "critical": 8, "warning": 4, "tip": 1}


def iter_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in SCAN_SUFFIXES:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        yield path


def normalise(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().rstrip(";")).lower()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tokens", required=True, help="JSON from token_extractor.py")
    parser.add_argument("--root", default="src", help="directory to scan for drift")
    parser.add_argument("--min-compliance", type=float, default=0.0,
                        help="fail below this percentage")
    parser.add_argument("--format", choices=["text", "json"], default="text")
    parser.add_argument("--max-examples", type=int, default=5,
                        help="locations listed per finding; one root cause is one finding")
    parser.add_argument("--include-svg", action="store_true",
                        help="also count colours in SVG presentation attributes, which are "
                             "usually third-party brand marks and excluded by default")
    args = parser.parse_args()

    data = json.loads(Path(args.tokens).read_text(encoding="utf-8"))
    groups = data.get("tokens", {})
    known_values: set[str] = set()
    known_names: set[str] = set()
    for group, entries in groups.items():
        for name, value in entries.items():
            known_names.add(name)
            known_values.add(normalise(value))

    root = Path(args.root).resolve()
    # One root cause is one finding: group by (rule, literal) and keep a few locations.
    findings: dict[tuple[str, str], dict] = {}
    used_names: set[str] = set()
    undeclared: dict[str, dict] = {}
    compliant = 0
    drifted = 0
    svg_skipped = 0
    text_by_file: dict[str, str] = {}

    for path in iter_files(root):
        try:
            lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError:
            continue
        rel = str(path.relative_to(root.parent) if root.parent in path.parents else path)
        text_by_file[rel] = "\n".join(lines)
        for lineno, line in enumerate(lines, 1):
            for name in VAR_REF.findall(line):
                used_names.add(name)
                if name not in known_names:
                    entry = undeclared.setdefault(name, {"rule": "DSG-TOK-09", "severity": "critical",
                                                         "literal": f"var(--{name})", "count": 0, "where": []})
                    entry["count"] += 1
                    if len(entry["where"]) < args.max_examples:
                        entry["where"].append(f"{rel}:{lineno}")
            # A token's own declaration is the contract, not a use of it.
            if DECLARATION.match(line):
                continue

            def record(literal: str, rule: str, severity: str) -> None:
                nonlocal compliant, drifted
                value = normalise(literal)
                if value in BENIGN or not value:
                    return
                if "var(" in value:
                    compliant += 1
                    return
                if value in known_values:
                    compliant += 1
                    return
                drifted += 1
                key = (rule, value)
                entry = findings.setdefault(key, {"rule": rule, "severity": severity,
                                                  "literal": value, "count": 0, "where": []})
                entry["count"] += 1
                if len(entry["where"]) < args.max_examples:
                    entry["where"].append(f"{rel}:{lineno}")

            svg_colors = set()
            if not args.include_svg:
                svg_colors = {normalise(m.group(2)) for m in SVG_ATTR.finditer(line)}
            for match in COLOR_LITERAL.finditer(line):
                if normalise(match.group(1)) in svg_colors:
                    svg_skipped += 1
                    continue
                record(match.group(1), "DSG-TOK-01", "critical")
            for pattern, rule, severity, _group in PROPERTY_RULES:
                for match in pattern.finditer(line):
                    record(match.groups()[-1], rule, severity)

    # A Tailwind theme token (name carries a dot) is used through a utility class. Re-scan
    # for those before calling any of them dead.
    tailwind_names = {n for n in known_names if "." in n}
    if tailwind_names:
        haystack = "\n".join(text_by_file.values())
        for name in tailwind_names:
            leaf = name.split(".", 1)[1]
            if re.search(rf"\b{UTILITY}-{re.escape(leaf)}\b", haystack):
                used_names.add(name)
    dead = sorted(known_names - used_names)
    total = compliant + drifted
    compliance = round(100.0 * compliant / total, 1) if total else 100.0

    rows = sorted(findings.values(), key=lambda f: (-SEVERITY_WEIGHT[f["severity"]], -f["count"]))
    rows += sorted(undeclared.values(), key=lambda f: -f["count"])

    critical = sum(1 for row in rows if row["severity"] == "critical")
    payload = {
        "root": str(root), "compliance": compliance, "compliant": compliant, "drifted": drifted,
        "svgColoursNotCounted": svg_skipped,
        "findings": rows,
        "deadTokens": {"rule": "DSG-TOK-08", "severity": "tip", "count": len(dead), "names": dead[:20]},
    }

    if args.format == "json":
        print(json.dumps(payload, indent=2))
    else:
        print(f"token compliance {compliance}%  ({compliant} tokenised, {drifted} literal)")
        for row in rows[:40]:
            where = ", ".join(row["where"])
            more = f" (+{row['count'] - len(row['where'])} more)" if row["count"] > len(row["where"]) else ""
            print(f"  {row['severity']:<8} {row['rule']} {row['literal'][:42]:<42} x{row['count']}  {where}{more}")
        if dead:
            print(f"  tip      DSG-TOK-08 {len(dead)} tokens declared and never used: {', '.join(dead[:8])}")
        if svg_skipped:
            print(f"  note     {svg_skipped} colours in SVG attributes were not counted; a "
                  f"third-party brand mark is fixed by its owner, not by your contract "
                  f"(--include-svg to count them)")
        print(f"{len(rows)} distinct findings, {critical} critical")

    if args.min_compliance and compliance < args.min_compliance:
        print(f"compliance {compliance}% is below the {args.min_compliance}% gate", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
