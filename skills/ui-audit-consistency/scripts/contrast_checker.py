#!/usr/bin/env python3
"""Check WCAG contrast on a design contract, and suggest the nearest passing colour.

This is a FLOOR check (DSG-CON-01..04): no design contract waives it.

Pair selection matters. Checking every colour against every other would produce hundreds of
meaningless pairs, so by default only tokens that name a foreground role are tested against
tokens that name a background role. Pass --pairs for an explicit list when the names do not
say.

Exit code 1 when any pair fails at the requested level, so this can gate CI.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

FG_HINTS = ("fg", "foreground", "text", "ink", "copy", "heading", "body", "label", "link")
BG_HINTS = ("bg", "background", "surface", "canvas", "paper", "card", "panel", "base")

THRESHOLDS = {
    ("AA", "normal"): 4.5,
    ("AA", "large"): 3.0,
    ("AA", "ui"): 3.0,
    ("AAA", "normal"): 7.0,
    ("AAA", "large"): 4.5,
    ("AAA", "ui"): 3.0,
}

HEX = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
RGB = re.compile(r"^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)")


def to_rgb(value: str) -> tuple[int, int, int] | None:
    """Parse the colour notations a stylesheet actually uses. Returns None for anything
    this cannot resolve -- an unresolvable colour is reported as unmeasured, never as a pass."""
    v = value.strip()
    match = HEX.match(v)
    if match:
        digits = match.group(1)
        if len(digits) == 3:
            digits = "".join(c * 2 for c in digits)
        return int(digits[0:2], 16), int(digits[2:4], 16), int(digits[4:6], 16)
    match = RGB.match(v)
    if match:
        return tuple(min(255, max(0, round(float(g)))) for g in match.groups())  # type: ignore[return-value]
    return None


def luminance(rgb: tuple[int, int, int]) -> float:
    """WCAG 2.x relative luminance. Frozen by the specification; do not 'improve' it."""
    channels = []
    for raw in rgb:
        c = raw / 255.0
        channels.append(c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def ratio(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    la, lb = luminance(a), luminance(b)
    lighter, darker = max(la, lb), min(la, lb)
    return (lighter + 0.05) / (darker + 0.05)


def to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def nearest_passing(fg: tuple[int, int, int], bg: tuple[int, int, int], target: float) -> str | None:
    """Walk the foreground toward black or whichever pole raises contrast, keeping the hue
    roughly intact, and return the first shade that clears the bar."""
    best = None
    for pole in ((0, 0, 0), (255, 255, 255)):
        for step in range(1, 101):
            t = step / 100.0
            candidate = tuple(round(fg[i] + (pole[i] - fg[i]) * t) for i in range(3))
            if ratio(candidate, bg) >= target:
                shifted = sum(abs(candidate[i] - fg[i]) for i in range(3))
                if best is None or shifted < best[0]:
                    best = (shifted, to_hex(candidate))  # type: ignore[arg-type]
                break
    return best[1] if best else None


def role_of(name: str) -> str | None:
    lowered = name.lower()
    if any(hint in lowered for hint in FG_HINTS):
        return "fg"
    if any(hint in lowered for hint in BG_HINTS):
        return "bg"
    return None


# A token declared in one component's scope never paints on another component's
# background. Files whose names say "global" hold the shared palette, so anything may
# land on those; everything else pairs only inside its own file.
GLOBAL_SOURCE = re.compile(r"(tailwind\.config|global|tokens|theme|variables|base)", re.I)


def scope_of(name: str, sources: dict[str, str]) -> str:
    origin = sources.get(name, "")
    if not origin or GLOBAL_SOURCE.search(origin):
        return "*"
    return origin


def build_pairs(colors: dict[str, str], sources: dict[str, str]) -> list[tuple[str, str]]:
    """Pair a foreground with a background only where the two can actually meet.

    Crossing every foreground with every background is what makes a contrast report
    untrustworthy: it pairs one embed's near-black text with the site's near-black dark
    canvas, reports 1.07:1, and buries the real findings under nonsense."""
    pairs = []
    for fg in colors:
        if role_of(fg) != "fg":
            continue
        fg_scope = scope_of(fg, sources)
        for bg in colors:
            if role_of(bg) != "bg":
                continue
            bg_scope = scope_of(bg, sources)
            if fg_scope == bg_scope or fg_scope == "*" or bg_scope == "*":
                pairs.append((fg, bg))
    return pairs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tokens", help="JSON from token_extractor.py")
    parser.add_argument("--pairs", help="JSON list of {fg,bg,size} pairs, when names do not say")
    parser.add_argument("--level", choices=["AA", "AAA"], default="AA")
    parser.add_argument("--size", choices=["normal", "large", "ui"], default="normal")
    parser.add_argument("--suggest", action="store_true", help="propose the nearest passing colour")
    parser.add_argument("--format", choices=["text", "json"], default="text")
    args = parser.parse_args()

    colors: dict[str, str] = {}
    sources: dict[str, str] = {}
    if args.tokens:
        data = json.loads(Path(args.tokens).read_text(encoding="utf-8"))
        colors = data.get("tokens", {}).get("colors", {})
        sources = data.get("sources", {})

    # Only explicitly declared pairs are authoritative. Inferred ones are candidates:
    # token names carry a role, never which background a colour actually lands on.
    authoritative = bool(args.pairs)
    pairs: list[tuple[str, str, str]] = []
    if args.pairs:
        for entry in json.loads(Path(args.pairs).read_text(encoding="utf-8")):
            pairs.append((entry["fg"], entry["bg"], entry.get("size", args.size)))
            colors.setdefault(entry["fg"], entry["fg"])
            colors.setdefault(entry["bg"], entry["bg"])
    else:
        pairs = [(f, b, args.size) for f, b in build_pairs(colors, sources)]

    results = []
    failures = 0
    unmeasured = 0
    candidates = 0
    for fg_name, bg_name, size in pairs:
        fg = to_rgb(colors.get(fg_name, fg_name))
        bg = to_rgb(colors.get(bg_name, bg_name))
        if fg is None or bg is None:
            unmeasured += 1
            results.append({"fg": fg_name, "bg": bg_name, "status": "unmeasured",
                            "why": "colour notation could not be resolved to sRGB"})
            continue
        target = THRESHOLDS[(args.level, size)]
        value = round(ratio(fg, bg), 2)
        passed = value >= target
        if passed:
            status = "pass"
        elif authoritative:
            status = "fail"
        else:
            status = "candidate"
        entry = {"fg": fg_name, "bg": bg_name, "size": size, "ratio": value,
                 "target": target, "status": status,
                 "rule": "DSG-CON-01" if size == "normal" else "DSG-CON-02"}
        if status == "fail":
            failures += 1
        if status == "candidate":
            candidates += 1
        if not passed and args.suggest:
            entry["suggestion"] = nearest_passing(fg, bg, target)
        results.append(entry)

    payload = {"level": args.level, "authoritative": authoritative,
               "checked": len(results), "failures": failures,
               "candidates": candidates, "unmeasured": unmeasured, "results": results}

    if args.format == "json":
        print(json.dumps(payload, indent=2))
    else:
        if not results:
            print("no foreground/background pairs identified -- pass --pairs to name them")
        for entry in results:
            if entry["status"] == "unmeasured":
                print(f"  ?  {entry['fg']} on {entry['bg']}: {entry['why']}")
                continue
            if entry["status"] == "pass":
                continue
            tail = f"  ->  try {entry['suggestion']}" if entry.get("suggestion") else ""
            label = "FAIL" if entry["status"] == "fail" else "cand"
            print(f"{label} {entry['rule']} {entry['fg']} on {entry['bg']}: "
                  f"{entry['ratio']}:1, needs {entry['target']}:1{tail}")
        print(f"{len(results)} pairs at {args.level}: {failures} failing, "
              f"{candidates} candidates, {unmeasured} unmeasured")
        if not authoritative:
            print()
            print("Pairings were INFERRED from token names, so a candidate is not a finding.")
            print("Two backgrounds of opposite lightness make name-based guessing unreliable:")
            print("a dark text token gets paired with the dark canvas it never paints on.")
            print("To make this authoritative, either declare the real pairs and pass")
            print("--pairs, or run the live audit, where axe measures what actually renders.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
