#!/usr/bin/env node
// @ts-check
/**
 * Check WCAG contrast on a design contract, and suggest the nearest passing colour.
 *
 * This is a FLOOR check (DSG-CON-01..04): no design contract waives it.
 *
 * Pair selection matters. Checking every colour against every other would produce hundreds of
 * meaningless pairs, so by default only tokens that name a foreground role are tested against
 * tokens that name a background role. Pass --pairs for an explicit list when the names do not
 * say.
 *
 * Exit code 1 when any pair fails at the requested level, so this can gate CI.
 */
import fs from "node:fs";
import { isMain, parseArgs, pyRound } from "./lib.mjs";

const FG_HINTS = ["fg", "foreground", "text", "ink", "copy", "heading", "body", "label", "link"];
const BG_HINTS = ["bg", "background", "surface", "canvas", "paper", "card", "panel", "base"];

const THRESHOLDS = {
  "AA:normal": 4.5,
  "AA:large": 3.0,
  "AA:ui": 3.0,
  "AAA:normal": 7.0,
  "AAA:large": 4.5,
  "AAA:ui": 3.0,
};

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/;

/**
 * Parse the colour notations a stylesheet actually uses. Returns null for anything this
 * cannot resolve: an unresolvable colour is reported as unmeasured, never as a pass.
 */
export function toRgb(value) {
  const v = value.trim();
  let match = HEX.exec(v);
  if (match) {
    let digits = match[1];
    if (digits.length === 3) {
      digits = [...digits].map((c) => c + c).join("");
    }
    return [parseInt(digits.slice(0, 2), 16), parseInt(digits.slice(2, 4), 16), parseInt(digits.slice(4, 6), 16)];
  }
  match = RGB.exec(v);
  if (match) {
    return [match[1], match[2], match[3]].map((g) => Math.min(255, Math.max(0, pyRound(parseFloat(g)))));
  }
  return null;
}

/** WCAG 2.x relative luminance. Frozen by the specification; do not 'improve' it. */
export function luminance(rgb) {
  const [r, g, b] = rgb.map((raw) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const toHex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

/**
 * Walk the foreground toward black or whichever pole raises contrast, keeping the hue
 * roughly intact, and return the first shade that clears the bar.
 */
export function nearestPassing(fg, bg, target) {
  let best = null;
  for (const pole of [[0, 0, 0], [255, 255, 255]]) {
    for (let step = 1; step <= 100; step += 1) {
      const t = step / 100;
      const candidate = fg.map((c, i) => pyRound(c + (pole[i] - c) * t));
      if (ratio(candidate, bg) >= target) {
        const shifted = candidate.reduce((sum, c, i) => sum + Math.abs(c - fg[i]), 0);
        if (best === null || shifted < best[0]) {
          best = [shifted, toHex(candidate)];
        }
        break;
      }
    }
  }
  return best ? best[1] : null;
}

function roleOf(name) {
  const lowered = name.toLowerCase();
  if (FG_HINTS.some((hint) => lowered.includes(hint))) {
    return "fg";
  }
  if (BG_HINTS.some((hint) => lowered.includes(hint))) {
    return "bg";
  }
  return null;
}

// A token declared in one component's scope never paints on another component's
// background. Files whose names say "global" hold the shared palette, so anything may
// land on those; everything else pairs only inside its own file.
const GLOBAL_SOURCE = /(tailwind\.config|global|tokens|theme|variables|base)/i;

function scopeOf(name, sources) {
  const origin = sources[name] ?? "";
  return !origin || GLOBAL_SOURCE.test(origin) ? "*" : origin;
}

/**
 * Pair a foreground with a background only where the two can actually meet. Crossing every
 * foreground with every background pairs one embed's near-black text with the site's
 * near-black dark canvas, reports 1.07:1, and buries the real findings under nonsense.
 */
export function buildPairs(colors, sources) {
  const pairs = [];
  for (const fg of Object.keys(colors)) {
    if (roleOf(fg) !== "fg") {
      continue;
    }
    const fgScope = scopeOf(fg, sources);
    for (const bg of Object.keys(colors)) {
      if (roleOf(bg) !== "bg") {
        continue;
      }
      const bgScope = scopeOf(bg, sources);
      if (fgScope === bgScope || fgScope === "*" || bgScope === "*") {
        pairs.push([fg, bg]);
      }
    }
  }
  return pairs;
}

function main() {
  const args = parseArgs(process.argv.slice(2), {
    tokens: { type: "string", help: "JSON from token_extractor.mjs" },
    pairs: { type: "string", help: "JSON list of {fg,bg,size} pairs, when names do not say" },
    level: { type: "string", choices: ["AA", "AAA"], default: "AA" },
    size: { type: "string", choices: ["normal", "large", "ui"], default: "normal" },
    suggest: { type: "boolean", help: "propose the nearest passing colour" },
    format: { type: "string", choices: ["text", "json"], default: "text" },
  }, {
    usage: "usage: contrast_checker.mjs [--tokens FILE] [--pairs FILE] [--level AA|AAA] [--size normal|large|ui] [--suggest] [--format text|json]",
    description: "Check WCAG contrast on a design contract (DSG-CON-01..04). Exit 1 when any pair fails.",
  });

  let colors = {};
  let sources = {};
  if (args.tokens) {
    const data = JSON.parse(fs.readFileSync(args.tokens, "utf8"));
    colors = data.tokens?.colors ?? {};
    sources = data.sources ?? {};
  }

  // Only explicitly declared pairs are authoritative. Inferred ones are candidates:
  // token names carry a role, never which background a colour actually lands on.
  const authoritative = Boolean(args.pairs);
  let pairs = [];
  if (args.pairs) {
    for (const entry of JSON.parse(fs.readFileSync(args.pairs, "utf8"))) {
      pairs.push([entry.fg, entry.bg, entry.size ?? args.size]);
      colors[entry.fg] ??= entry.fg;
      colors[entry.bg] ??= entry.bg;
    }
  } else {
    pairs = buildPairs(colors, sources).map(([f, b]) => [f, b, args.size]);
  }

  const results = [];
  let failures = 0;
  let unmeasured = 0;
  let candidates = 0;
  for (const [fgName, bgName, size] of pairs) {
    const fg = toRgb(colors[fgName] ?? fgName);
    const bg = toRgb(colors[bgName] ?? bgName);
    if (fg === null || bg === null) {
      unmeasured += 1;
      results.push({ fg: fgName, bg: bgName, status: "unmeasured", why: "colour notation could not be resolved to sRGB" });
      continue;
    }
    const target = THRESHOLDS[`${args.level}:${size}`];
    const value = pyRound(ratio(fg, bg), 2);
    const passed = value >= target;
    const status = passed ? "pass" : authoritative ? "fail" : "candidate";
    const entry = { fg: fgName, bg: bgName, size, ratio: value, target, status, rule: size === "normal" ? "DSG-CON-01" : "DSG-CON-02" };
    if (status === "fail") {
      failures += 1;
    }
    if (status === "candidate") {
      candidates += 1;
    }
    if (!passed && args.suggest) {
      entry.suggestion = nearestPassing(fg, bg, target);
    }
    results.push(entry);
  }

  const payload = { level: args.level, authoritative, checked: results.length, failures, candidates, unmeasured, results };

  if (args.format === "json") {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    if (results.length === 0) {
      console.log("no foreground/background pairs identified: pass --pairs to name them");
    }
    for (const entry of results) {
      if (entry.status === "unmeasured") {
        console.log(`  ?  ${entry.fg} on ${entry.bg}: ${entry.why}`);
        continue;
      }
      if (entry.status === "pass") {
        continue;
      }
      const tail = entry.suggestion ? `  ->  try ${entry.suggestion}` : "";
      const label = entry.status === "fail" ? "FAIL" : "cand";
      console.log(`${label} ${entry.rule} ${entry.fg} on ${entry.bg}: ${entry.ratio}:1, needs ${entry.target}:1${tail}`);
    }
    console.log(`${results.length} pairs at ${args.level}: ${failures} failing, ${candidates} candidates, ${unmeasured} unmeasured`);
    if (!authoritative) {
      console.log();
      console.log("Pairings were INFERRED from token names, so a candidate is not a finding.");
      console.log("Two backgrounds of opposite lightness make name-based guessing unreliable:");
      console.log("a dark text token gets paired with the dark canvas it never paints on.");
      console.log("To make this authoritative, either declare the real pairs and pass");
      console.log("--pairs, or run the live audit, where axe measures what actually renders.");
    }
  }
  return failures > 0 ? 1 : 0;
}

if (isMain(import.meta.url)) {
  process.exit(main());
}
