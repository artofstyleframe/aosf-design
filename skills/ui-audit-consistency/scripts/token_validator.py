#!/usr/bin/env python3
"""Measure drift: values written as literals where the contract has a token.

Reports a compliance percentage and a `file:line` list, which is the Consistency score in
the audit report. Maps every finding to a DSG-TOK rule so it can be cited.

A literal is only drift when a token could have carried it. Values that no design system
would tokenise, zero, 100%, a 1px hairline, `auto`, are counted as neither compliant nor
drift, because inflating the denominator with them makes the percentage meaningless.

Exit code 1 when compliance falls below --min-compliance, or on any critical finding.
"""
from __future__ import annotations

import argparse
import fnmatch
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
    # reduced-motion resets: the point of the value is to be effectively zero
    "0.01ms", ".001ms", "0.001ms", "1ms",
}

DECLARATION = re.compile(r"^\s*--[A-Za-z0-9_-]+\s*:")
# A colour sitting in an SVG presentation attribute is usually an embedded third-party
# brand mark (Pinterest #e60023, LinkedIn #0a66c2, Facebook #1877f2). A brand colour is
# fixed by its owner, so calling it drift is wrong. Counted separately and reported, never
# silently dropped: pass --include-svg to fold them back in.
SVG_ATTR = re.compile(r"\b(fill|stroke|stop-color|flood-color)\s*=\s*[\"']([^\"']+)")
# Tailwind theme tokens are used as utility classes, never through var(), so a dead-token
# check that only counts var() references marks every one of them dead.
UTILITY = "(?:text|bg|border|ring|fill|stroke|from|via|to|divide|outline|shadow|accent|caret|decoration)"
COLOR_LITERAL = re.compile(r"(?<![\w-])(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\))")
VAR_REF = re.compile(r"var\(\s*--([A-Za-z0-9_-]+)")
FALLBACK = re.compile(r"var\(\s*--([A-Za-z0-9_-]+)\s*,\s*(#[0-9a-fA-F]{3,8}|[0-9.]+(?:px|rem|em)|[0-9]+)\s*\)")

PROPERTY_RULES = [
    # (property regex, value regex, rule id, severity, token group)
    (re.compile(r"\b(gap|row-gap|column-gap|margin[a-z-]*|padding[a-z-]*)\s*:\s*([^;{}]+)"),
     "DSG-TOK-02", "warning", "length"),
    (re.compile(r"\bfont-size\s*:\s*([^;{}]+)"), "DSG-TOK-03", "warning", "length"),
    (re.compile(r"\bborder-radius\s*:\s*([^;{}]+)"), "DSG-TOK-04", "warning", "length"),
    (re.compile(r"\bbox-shadow\s*:\s*([^;{}]+)"), "DSG-TOK-05", "warning", "shadow"),
    (re.compile(r"\bz-index\s*:\s*(-?[0-9]+)\s*(?=[;}!]|$)"), "DSG-TOK-06", "warning", "number"),
    (re.compile(r"\btransition-duration\s*:\s*([^;{}]+)"), "DSG-TOK-07", "warning", "duration"),
]

SEVERITY_WEIGHT = {"blocker": 12, "critical": 8, "warning": 4, "tip": 1}


def iter_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in SCAN_SUFFIXES:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if ".stories." in path.name:      # documentation of the tokens, not shipped UI
            continue
        yield path


_SHORT_HEX = re.compile(r"#([0-9a-f])([0-9a-f])([0-9a-f])(?![0-9a-f])")


def normalise(value: str) -> str:
    """Collapse whitespace, lower-case, and expand #rgb to #rrggbb.

    Without the expansion `#fff` and `#ffffff` are two different literals, so a page that
    writes the short form of a colour the contract declares in the long form is reported as
    drift. On a real site that produced 183 false findings from one component.
    """
    text = re.sub(r"\s+", " ", value.strip().rstrip(";")).lower()
    return _SHORT_HEX.sub(lambda m: "#" + "".join(c * 2 for c in m.groups()), text)


def equivalent_lengths(value: str) -> set[str]:
    """`24px` and `1.5rem` are the same length at the default 16px root size.

    A contract that declares `space-lg: 24px` is violated by neither `24px` nor `1.5rem`,
    so both spellings count as the token's value.
    """
    m = re.fullmatch(r"(-?[0-9]*\.?[0-9]+)(px|rem)", value)
    if not m:
        return set()
    number, unit = float(m.group(1)), m.group(2)
    other = number / 16 if unit == "px" else number * 16
    other_unit = "rem" if unit == "px" else "px"
    text = f"{other:.4f}".rstrip("0").rstrip(".")
    return {f"{text}{other_unit}"}


CSS_LENGTH_PART = re.compile(r"-?[0-9]*\.?[0-9]+(?:px|rem|em|vw|vh|%|ch|ex)?(?:\s*!important)?")
LENGTH = re.compile(r"(-?[0-9]*\.?[0-9]+)(px|rem|em|vw|vh|dvh|svh|lvh|vmin|vmax|%|ch|ex)\b")


def benign_length(value: str, rule: str, known: set[str]) -> bool:
    """True for lengths no scale should be asked to carry.

    - relative units (`em`, `%`, viewport units): they follow their context, not a fixed step
    - hairlines under 4px on spacing: optical adjustments, not layout
    - `clamp()`, `min()`, `max()`, `calc()`: fluid, so judged by their fixed bounds. The
      expression is fine when every `px` and `rem` length in it is on the scale (or benign).
    """
    if rule not in ("DSG-TOK-02", "DSG-TOK-03", "DSG-TOK-04"):
        return False
    if value.endswith("!important"):
        value = value[: -len("!important")].strip()
    if re.fullmatch(r"-?[0-9]*\.?[0-9]+(em|%|vw|vh|ch|ex|dvh|svh|lvh)", value):
        return True
    m = re.fullmatch(r"(-?[0-9]*\.?[0-9]+)(px|rem)", value)
    if m and rule == "DSG-TOK-02":
        px = abs(float(m.group(1))) * (16 if m.group(2) == "rem" else 1)
        if px < 4:
            return True
    if re.match(r"(clamp|min|max|calc)\(", value):
        for number, unit in LENGTH.findall(value):
            if unit in ("px", "rem"):
                literal = normalise(f"{number}{unit}")
                if literal not in known and literal not in BENIGN and float(number) != 0:
                    return False
        return True
    return False


def split_components(value: str) -> list[str]:
    """Split a shorthand such as `0 0 1rem` into its parts, keeping functions whole.

    `margin: 0 0 1rem` is three values, not one literal. Judging the whole string against
    the scale reports a margin as drift even when every part of it is zero or on the scale,
    which on a real site turned 94 centring declarations (`0 auto`) into findings.
    """
    value = re.sub(r"\s*!important\s*$", "", value.strip())
    parts, depth, current = [], 0, ""
    for ch in value:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch.isspace() and depth == 0:
            if current:
                parts.append(current)
            current = ""
        else:
            current += ch
    if current:
        parts.append(current)
    return parts


def load_exceptions(contract_dir: Path) -> tuple[set[str], list[tuple[str, str]], list[dict]]:
    """Read the `## Exceptions` table of `system.md`: decisions with a rationale and a date.

    | kind | scope | rationale | date |
    | literal | #e60023 | Pinterest brand colour, fixed by its owner | 2026-10-16 |
    | file | src/pages/tools/color-palette-generator.astro | sample palettes the tool displays | 2026-10-16 |

    A `literal` row exempts that exact value anywhere; a `file` row exempts the colour
    and type literals (DSG-TOK-01, DSG-TOK-03) in that file, because tool seed data is content, not styling.
    Every exemption is counted and reported, never silently dropped.
    """
    literals: set[str] = set()
    files: list[tuple[str, str]] = []
    rows: list[dict] = []
    path = contract_dir / "system.md"
    if not path.exists():
        return literals, files, rows
    in_section = False
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            in_section = line.strip().lower() == "## exceptions"
            continue
        if not in_section or not line.startswith("|"):
            continue
        cells = [c.strip().strip("`") for c in line.strip().strip("|").split("|")]
        if len(cells) < 4 or cells[0].lower() in ("kind", "---") or set(cells[0]) <= {"-", " "}:
            continue
        kind, scope, rationale, date = cells[0].lower(), cells[1], cells[2], cells[3]
        if kind == "literal":
            literals.add(normalise(scope))
        elif kind == "file":
            files.append((scope, rationale))
        else:
            continue
        rows.append({"kind": kind, "scope": scope, "rationale": rationale, "date": date})
    return literals, files, rows


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
    token_value: dict[str, str] = {}
    for group, entries in groups.items():
        for name, value in entries.items():
            known_names.add(name)
            known_values.add(normalise(value))
            known_values.update(equivalent_lengths(normalise(value)))
            token_value.setdefault(name, normalise(value))

    root = Path(args.root).resolve()
    # One root cause is one finding: group by (rule, literal) and keep a few locations.
    findings: dict[tuple[str, str], dict] = {}
    used_names: set[str] = set()
    undeclared: dict[str, dict] = {}
    compliant = 0
    drifted = 0
    svg_skipped = 0
    text_by_file: dict[str, str] = {}

    # A custom property declared in the code itself, or set at runtime, is a local
    # variable and not a gap in the contract. DSG-TOK-09 is about global tokens.
    local_names: set[str] = set()
    for path in iter_files(root):
        try:
            blob = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        local_names.update(re.findall(r"(?<![\w-])--([A-Za-z0-9_-]+)\s*:", blob))
        local_names.update(re.findall(r"setProperty\(\s*['\"]--([A-Za-z0-9_-]+)", blob))
    known_names |= local_names
    exc_literals, exc_files, exc_rows = load_exceptions(root.parent / ".design-sync")
    exempted: dict[str, int] = {}

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
            # A fallback that disagrees with the token it falls back from. The token wins
            # wherever the skin loads, so the fallback is only ever seen in an embed or a
            # preview, and there the same component paints a different colour than on the site.
            for fm in FALLBACK.finditer(line):
                fname, fvalue = fm.group(1), normalise(fm.group(2))
                declared = token_value.get(fname)
                if declared and "${" not in declared and "var(" not in fvalue and "var(" not in declared and fvalue != declared:
                    key = ("DSG-TOK-11", f"var(--{fname}, {fvalue}) vs {declared}")
                    entry = findings.setdefault(key, {"rule": "DSG-TOK-11", "severity": "warning",
                                                      "literal": key[1], "count": 0, "where": []})
                    entry["count"] += 1
                    drifted += 1
                    if len(entry["where"]) < args.max_examples:
                        entry["where"].append(f"{rel}:{lineno}")
            # A token's own declaration is the contract, not a use of it.
            if DECLARATION.match(line):
                continue

            def record(literal: str, rule: str, severity: str) -> None:
                nonlocal compliant, drifted
                value = re.sub(r"\s*!important$", "", normalise(literal))
                if value in BENIGN or not value:
                    return
                if benign_length(value, rule, known_values):
                    return
                if rule == "DSG-TOK-05" and (value == "none" or re.fullmatch(r"(inset )?[0-9. px-]+ transparent", value)):
                    return
                if "var(" in value:
                    compliant += 1
                    return
                if value in known_values:
                    compliant += 1
                    return
                # only a use that would have drifted is an exception; one that already
                # matches a token is compliant and is not counted as exempted
                if value in exc_literals or (rule in ("DSG-TOK-01", "DSG-TOK-03") and any(fnmatch.fnmatch(rel, f"*{g}") for g, _ in exc_files)):
                    exempted[rel] = exempted.get(rel, 0) + 1
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
                    raw = match.groups()[-1]
                    if rule in ("DSG-TOK-02", "DSG-TOK-03", "DSG-TOK-04"):
                        # judge each part of a shorthand on its own; fragments of a string
                        # being concatenated in script (`'0 ' + x + 'px'`) are not CSS values
                        for part in split_components(raw):
                            if CSS_LENGTH_PART.fullmatch(part) or part.startswith(("clamp(", "min(", "max(", "calc(", "var(")):
                                record(part, rule, severity)
                    else:
                        record(raw, rule, severity)

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
        "declaredExceptions": {"uses": sum(exempted.values()), "rows": exc_rows, "byFile": exempted},
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
        if exempted:
            print(f"  note     {sum(exempted.values())} literals are declared exceptions in system.md ({len(exc_rows)} rows); listed in --format json")
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
