#!/usr/bin/env node
// @ts-check
/**
 * Extract a design contract from whatever the project already declares.
 *
 * Reads CSS custom properties, Tailwind v4 `@theme` blocks, and `tailwind.config.*` theme
 * keys, and groups them by what the value IS rather than by what it is called: a token named
 * `--brand` holding `#1f6feb` is a colour whatever the author meant.
 *
 * This produces the contract the audit checks against. It does not judge it.
 * Exit code is always 0: finding no tokens is a fact to report, not an error.
 */
import path from "node:path";
import { isMain, parseArgs, readText, stringifySorted, walk } from "./lib.mjs";

const CSS_VAR = /--([A-Za-z0-9_-]+)\s*:\s*([^;}]+)[;}]/g;
// Tailwind config theme keys, e.g.  colors: { brand: '#1f6feb' }; best effort, no JS parse.
const TW_ENTRY = /['"]?([A-Za-z0-9_-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
const TW_SECTION = /\b(colors|spacing|fontSize|borderRadius|boxShadow|zIndex|transitionDuration)\s*:\s*\{/g;

const COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\(|oklab\(|color\()/;
const LENGTH = /^-?[\d.]+\s*(px|rem|em|ch|vh|vw|dvh|dvw|%)$/;
const DURATION = /^[\d.]+\s*m?s$/;
const NUMBER = /^-?\d+$/;

/** Group by the shape of the value, because names lie and shapes do not. */
export function classify(value) {
  const v = value.trim();
  if (COLOR.test(v)) {
    return "colors";
  }
  if (DURATION.test(v)) {
    return "duration";
  }
  if (v.includes("shadow") || /^-?[\d.]+\w*\s+-?[\d.]+\w*\s+/.test(v)) {
    return "shadow";
  }
  if (LENGTH.test(v)) {
    return "length";
  }
  if (NUMBER.test(v)) {
    return "number";
  }
  return "other";
}

export function extract(root) {
  /** @type {Record<string, Record<string, string>>} */
  const tokens = {};
  /** @type {Record<string, string>} */
  const sources = {};

  const add = (name, value, origin) => {
    const group = classify(value);
    tokens[group] ??= {};
    // First declaration wins: later ones are usually theme overrides (dark mode), and
    // recording both under one name would make the contract ambiguous.
    if (!(name in tokens[group])) {
      tokens[group][name] = value.trim();
      sources[name] = origin;
    }
  };

  const rel = (file) => path.relative(root, file);

  const styled = new Set([".css", ".scss", ".astro", ".tsx", ".jsx"]);
  for (const file of walk(root, (_full, name) => styled.has(path.extname(name)))) {
    const text = readText(file);
    if (text === null) {
      continue;
    }
    for (const match of text.matchAll(CSS_VAR)) {
      if (match[2].trim().startsWith("var(")) {
        continue;
      }
      add(match[1], match[2], rel(file));
    }
  }

  const scripts = new Set([".js", ".ts", ".mjs", ".cjs"]);
  for (const file of walk(root, (_full, name) => scripts.has(path.extname(name)) && name.startsWith("tailwind.config"))) {
    const text = readText(file) ?? "";
    for (const section of text.matchAll(TW_SECTION)) {
      const start = section.index + section[0].length;
      let depth = 1;
      let index = start;
      while (index < text.length && depth > 0) {
        if (text[index] === "{") {
          depth += 1;
        } else if (text[index] === "}") {
          depth -= 1;
        }
        index += 1;
      }
      for (const entry of text.slice(start, index).matchAll(TW_ENTRY)) {
        add(`${section[1]}.${entry[1]}`, entry[2], rel(file));
      }
    }
  }

  const counts = Object.fromEntries(Object.keys(tokens).sort().map((group) => [group, Object.keys(tokens[group]).length]));
  return { root, tokens, sources, counts };
}

function main() {
  const args = parseArgs(process.argv.slice(2), {
    root: { type: "string", default: ".", help: "directory to scan" },
    format: { type: "string", choices: ["json", "text"], default: "json" },
  }, {
    usage: "usage: token_extractor.mjs [--root DIR] [--format json|text]",
    description: "Extract a design contract from CSS custom properties, @theme blocks and tailwind.config.* theme keys.",
  });

  const result = extract(path.resolve(args.root));
  if (args.format === "json") {
    console.log(stringifySorted(result));
    return 0;
  }
  const total = Object.values(result.counts).reduce((sum, n) => sum + n, 0);
  if (total === 0) {
    console.log("no design tokens found: there is no contract to audit against");
    return 0;
  }
  console.log(`${total} tokens under ${result.root}`);
  for (const [group, count] of Object.entries(result.counts)) {
    console.log(`  ${group.padEnd(10)} ${count}`);
  }
  return 0;
}

if (isMain(import.meta.url)) {
  process.exit(main());
}
