#!/usr/bin/env python3
"""Extract a design contract from whatever the project already declares.

Reads CSS custom properties, Tailwind v4 `@theme` blocks, and `tailwind.config.*` theme
keys, and groups them by what the value IS rather than by what it is called: a token named
`--brand` holding `#1f6feb` is a colour whatever the author meant.

This produces the contract the audit checks against. It does not judge it.
Exit code is always 0: finding no tokens is a fact to report, not an error.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SKIP_DIRS = {"node_modules", "dist", ".git", ".astro", "build", ".next", "coverage", ".yarn"}

CSS_VAR = re.compile(r"--([A-Za-z0-9_-]+)\s*:\s*([^;}]+)[;}]")
# Tailwind config theme keys, e.g.  colors: { brand: '#1f6feb' }  — best effort, no JS parse.
TW_ENTRY = re.compile(r"""['"]?([A-Za-z0-9_-]+)['"]?\s*:\s*['"]([^'"]+)['"]""")
TW_SECTION = re.compile(r"\b(colors|spacing|fontSize|borderRadius|boxShadow|zIndex|transitionDuration)\s*:\s*\{")

COLOR = re.compile(r"^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\(|oklab\(|color\()")
LENGTH = re.compile(r"^-?[\d.]+\s*(px|rem|em|ch|vh|vw|dvh|dvw|%)$")
DURATION = re.compile(r"^[\d.]+\s*m?s$")
NUMBER = re.compile(r"^-?\d+$")


def classify(value: str) -> str:
    """Group by the shape of the value, because names lie and shapes do not."""
    v = value.strip()
    if COLOR.match(v):
        return "colors"
    if DURATION.match(v):
        return "duration"
    if "shadow" in v or re.match(r"^-?[\d.]+\w*\s+-?[\d.]+\w*\s+", v):
        return "shadow"
    if LENGTH.match(v):
        return "length"
    if NUMBER.match(v):
        return "number"
    return "other"


def iter_files(root: Path, suffixes: tuple[str, ...]):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix in suffixes:
            yield path


def extract(root: Path) -> dict:
    tokens: dict[str, dict[str, str]] = {}
    sources: dict[str, str] = {}

    def add(name: str, value: str, origin: str) -> None:
        group = classify(value)
        tokens.setdefault(group, {})
        # First declaration wins: later ones are usually theme overrides (dark mode), and
        # recording both under one name would make the contract ambiguous.
        if name not in tokens[group]:
            tokens[group][name] = value.strip()
            sources[name] = origin

    for path in iter_files(root, (".css", ".scss", ".astro", ".tsx", ".jsx")):
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for name, value in CSS_VAR.findall(text):
            if value.strip().startswith("var("):
                continue
            add(name, value, str(path.relative_to(root)))

    for path in iter_files(root, (".js", ".ts", ".mjs", ".cjs")):
        if not path.name.startswith("tailwind.config"):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for section in TW_SECTION.finditer(text):
            start = section.end()
            depth = 1
            index = start
            while index < len(text) and depth > 0:
                if text[index] == "{":
                    depth += 1
                elif text[index] == "}":
                    depth -= 1
                index += 1
            for name, value in TW_ENTRY.findall(text[start:index]):
                add(f"{section.group(1)}.{name}", value, str(path.relative_to(root)))

    return {
        "root": str(root),
        "tokens": tokens,
        "sources": sources,
        "counts": {group: len(values) for group, values in sorted(tokens.items())},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", default=".", help="directory to scan")
    parser.add_argument("--format", choices=["json", "text"], default="json")
    args = parser.parse_args()

    result = extract(Path(args.root).resolve())
    if args.format == "json":
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0

    total = sum(result["counts"].values())
    if total == 0:
        print("no design tokens found -- there is no contract to audit against")
        return 0
    print(f"{total} tokens under {result['root']}")
    for group, count in result["counts"].items():
        print(f"  {group:<10} {count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
