#!/usr/bin/env node
// @ts-check
/**
 * Measure drift: values written as literals where the contract has a token.
 *
 * Reports a compliance percentage and a `file:line` list, which is the Consistency score in
 * the audit report. Maps every finding to a DSG-TOK rule so it can be cited.
 *
 * A literal is only drift when a token could have carried it. Values that no design system
 * would tokenise, zero, 100%, a 1px hairline, `auto`, are counted as neither compliant nor
 * drift, because inflating the denominator with them makes the percentage meaningless.
 *
 * Exit code 1 when compliance falls below --min-compliance.
 */
import fs from "node:fs";
import path from "node:path";
import { fixed, fnmatch, isMain, parseArgs, pyRound, readText, splitlines, walk } from "./lib.mjs";

const SCAN_SUFFIXES = new Set([".css", ".scss", ".astro", ".tsx", ".jsx", ".vue", ".svelte"]);

// Literals every codebase writes and no contract tokenises. Counting these as drift would
// bury the real findings and make the percentage a number nobody trusts.
const BENIGN = new Set([
  "0", "0px", "0rem", "0%", "auto", "none", "inherit", "initial", "unset", "currentColor",
  "transparent", "100%", "100vh", "100vw", "100dvh", "100dvw", "1px", "-1px", "50%",
  "1", "0.5", "2px",
  // reduced-motion resets: the point of the value is to be effectively zero
  "0.01ms", ".001ms", "0.001ms", "1ms",
]);

const DECLARATION = /^\s*--[A-Za-z0-9_-]+\s*:/;
// A colour sitting in an SVG presentation attribute is usually an embedded third-party
// brand mark (Pinterest #e60023, LinkedIn #0a66c2, Facebook #1877f2). A brand colour is
// fixed by its owner, so calling it drift is wrong. Counted separately and reported, never
// silently dropped: pass --include-svg to fold them back in.
const SVG_ATTR = /\b(fill|stroke|stop-color|flood-color)\s*=\s*["']([^"']+)/g;
// Tailwind theme tokens are used as utility classes, never through var(), so a dead-token
// check that only counts var() references marks every one of them dead.
const UTILITY = "(?:text|bg|border|ring|fill|stroke|from|via|to|divide|outline|shadow|accent|caret|decoration)";
const COLOR_LITERAL = /(?<![\w-])(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\))/g;
const VAR_REF = /var\(\s*--([A-Za-z0-9_-]+)/g;
const FALLBACK = /var\(\s*--([A-Za-z0-9_-]+)\s*,\s*(#[0-9a-fA-F]{3,8}|[0-9.]+(?:px|rem|em)|[0-9]+)\s*\)/g;

const PROPERTY_RULES = [
  [/\b(gap|row-gap|column-gap|margin[a-z-]*|padding[a-z-]*)\s*:\s*([^;{}]+)/g, "DSG-TOK-02", "warning"],
  [/\bfont-size\s*:\s*([^;{}]+)/g, "DSG-TOK-03", "warning"],
  [/\bborder-radius\s*:\s*([^;{}]+)/g, "DSG-TOK-04", "warning"],
  [/\bbox-shadow\s*:\s*([^;{}]+)/g, "DSG-TOK-05", "warning"],
  [/\bz-index\s*:\s*(-?[0-9]+)\s*(?=[;}!]|$)/g, "DSG-TOK-06", "warning"],
  [/\btransition-duration\s*:\s*([^;{}]+)/g, "DSG-TOK-07", "warning"],
];

const SEVERITY_WEIGHT = { blocker: 12, critical: 8, warning: 4, tip: 1 };

const SHORT_HEX = /#([0-9a-f])([0-9a-f])([0-9a-f])(?![0-9a-f])/g;

/**
 * Collapse whitespace, lower-case, and expand #rgb to #rrggbb.
 *
 * Without the expansion `#fff` and `#ffffff` are two different literals, so a page that
 * writes the short form of a colour the contract declares in the long form is reported as
 * drift. On a real site that produced 183 false findings from one component.
 */
export function normalise(value) {
  const text = value.trim().replace(/;+$/, "").replace(/\s+/g, " ").toLowerCase();
  return text.replace(SHORT_HEX, (_m, a, b, c) => `#${a}${a}${b}${b}${c}${c}`);
}

/**
 * `24px` and `1.5rem` are the same length at the default 16px root size.
 *
 * A contract that declares `space-lg: 24px` is violated by neither `24px` nor `1.5rem`,
 * so both spellings count as the token's value.
 */
export function equivalentLengths(value) {
  const m = /^(-?[0-9]*\.?[0-9]+)(px|rem)$/.exec(value);
  if (!m) {
    return new Set();
  }
  const number = parseFloat(m[1]);
  const other = m[2] === "px" ? number / 16 : number * 16;
  const otherUnit = m[2] === "px" ? "rem" : "px";
  const text = fixed(other, 4).replace(/0+$/, "").replace(/\.$/, "");
  return new Set([`${text}${otherUnit}`]);
}

const CSS_LENGTH_PART = /^-?[0-9]*\.?[0-9]+(?:px|rem|em|vw|vh|%|ch|ex)?(?:\s*!important)?$/;
const LENGTH = /(-?[0-9]*\.?[0-9]+)(px|rem|em|vw|vh|dvh|svh|lvh|vmin|vmax|%|ch|ex)\b/g;

/**
 * True for lengths no scale should be asked to carry.
 *
 * - relative units (`em`, `%`, viewport units): they follow their context, not a fixed step
 * - hairlines under 4px on spacing: optical adjustments, not layout
 * - `clamp()`, `min()`, `max()`, `calc()`: fluid, so judged by their fixed bounds. The
 *   expression is fine when every `px` and `rem` length in it is on the scale (or benign).
 */
function benignLength(value, rule, known) {
  if (!["DSG-TOK-02", "DSG-TOK-03", "DSG-TOK-04"].includes(rule)) {
    return false;
  }
  if (value.endsWith("!important")) {
    value = value.slice(0, -"!important".length).trim();
  }
  if (/^-?[0-9]*\.?[0-9]+(em|%|vw|vh|ch|ex|dvh|svh|lvh)$/.test(value)) {
    return true;
  }
  const m = /^(-?[0-9]*\.?[0-9]+)(px|rem)$/.exec(value);
  if (m && rule === "DSG-TOK-02") {
    const px = Math.abs(parseFloat(m[1])) * (m[2] === "rem" ? 16 : 1);
    if (px < 4) {
      return true;
    }
  }
  if (/^(clamp|min|max|calc)\(/.test(value)) {
    for (const [, number, unit] of value.matchAll(LENGTH)) {
      if (unit === "px" || unit === "rem") {
        const literal = normalise(`${number}${unit}`);
        if (!known.has(literal) && !BENIGN.has(literal) && parseFloat(number) !== 0) {
          return false;
        }
      }
    }
    return true;
  }
  return false;
}

/**
 * Split a shorthand such as `0 0 1rem` into its parts, keeping functions whole.
 *
 * `margin: 0 0 1rem` is three values, not one literal. Judging the whole string against
 * the scale reports a margin as drift even when every part of it is zero or on the scale,
 * which on a real site turned 94 centring declarations (`0 auto`) into findings.
 */
function splitComponents(value) {
  value = value.trim().replace(/\s*!important\s*$/, "");
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
    }
    if (/\s/.test(ch) && depth === 0) {
      if (current) {
        parts.push(current);
      }
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

/**
 * Read the `## Exceptions` table of `system.md`: decisions with a rationale and a date.
 *
 *   | kind | scope | rationale | date |
 *   | literal | #e60023 | Pinterest brand colour, fixed by its owner | 2026-10-16 |
 *   | file | src/pages/tools/color-palette-generator.astro | sample palettes the tool displays | 2026-10-16 |
 *
 * A `literal` row exempts that exact value anywhere; a `file` row exempts the colour and
 * type literals (DSG-TOK-01, DSG-TOK-03) in that file, because tool seed data is content,
 * not styling. Every exemption is counted and reported, never silently dropped.
 */
export function loadExceptions(contractDir) {
  const literals = new Set();
  const files = [];
  const rows = [];
  const text = readText(path.join(contractDir, "system.md"));
  if (text === null) {
    return { literals, files, rows };
  }
  let inSection = false;
  for (const line of splitlines(text)) {
    if (line.startsWith("## ")) {
      inSection = line.trim().toLowerCase() === "## exceptions";
      continue;
    }
    if (!inSection || !line.startsWith("|")) {
      continue;
    }
    const cells = line.trim().replace(/^\|+|\|+$/g, "").split("|").map((c) => c.trim().replace(/^`+|`+$/g, ""));
    if (cells.length < 4 || ["kind", "---"].includes(cells[0].toLowerCase()) || /^[- ]*$/.test(cells[0])) {
      continue;
    }
    const [kindRaw, scope, rationale, date] = cells;
    const kind = kindRaw.toLowerCase();
    if (kind === "literal") {
      literals.add(normalise(scope));
    } else if (kind === "file") {
      files.push([scope, rationale]);
    } else {
      continue;
    }
    rows.push({ kind, scope, rationale, date });
  }
  return { literals, files, rows };
}

function main() {
  const args = parseArgs(process.argv.slice(2), {
    tokens: { type: "string", required: true, help: "JSON from token_extractor.mjs" },
    root: { type: "string", default: "src", help: "directory to scan for drift" },
    "min-compliance": { type: "number", default: 0, help: "fail below this percentage" },
    format: { type: "string", choices: ["text", "json"], default: "text" },
    "max-examples": { type: "number", default: 5, help: "locations listed per finding; one root cause is one finding" },
    "include-svg": { type: "boolean", help: "also count colours in SVG presentation attributes (third-party brand marks, excluded by default)" },
  }, {
    usage: "usage: token_validator.mjs --tokens FILE [--root DIR] [--min-compliance N] [--format text|json] [--max-examples N] [--include-svg]",
    description: "Measure drift: values written as literals where the contract has a token. Exit 1 below --min-compliance.",
  });
  const maxExamples = args["max-examples"];

  const data = JSON.parse(fs.readFileSync(args.tokens, "utf8"));
  const groups = data.tokens ?? {};
  const knownValues = new Set();
  const knownNames = new Set();
  const tokenValue = new Map();
  for (const entries of Object.values(groups)) {
    for (const [name, value] of Object.entries(entries)) {
      knownNames.add(name);
      knownValues.add(normalise(value));
      for (const eq of equivalentLengths(normalise(value))) {
        knownValues.add(eq);
      }
      if (!tokenValue.has(name)) {
        tokenValue.set(name, normalise(value));
      }
    }
  }

  const root = path.resolve(args.root);
  const contractRoot = path.dirname(root);
  const scanned = walk(root, (_full, name) => SCAN_SUFFIXES.has(path.extname(name)) && !name.includes(".stories."));

  // One root cause is one finding: group by (rule, literal) and keep a few locations.
  const findings = new Map();
  const usedNames = new Set();
  const undeclared = new Map();
  let compliant = 0;
  let drifted = 0;
  let svgSkipped = 0;
  const textByFile = new Map();

  // A custom property declared in the code itself, or set at runtime, is a local variable
  // and not a gap in the contract. DSG-TOK-09 is about global tokens.
  for (const file of scanned) {
    const blob = readText(file);
    if (blob === null) {
      continue;
    }
    for (const m of blob.matchAll(/(?<![\w-])--([A-Za-z0-9_-]+)\s*:/g)) {
      knownNames.add(m[1]);
    }
    for (const m of blob.matchAll(/setProperty\(\s*['"]--([A-Za-z0-9_-]+)/g)) {
      knownNames.add(m[1]);
    }
  }
  const exceptions = loadExceptions(path.join(contractRoot, ".design-sync"));
  const exempted = {};

  const bump = (map, key, init, rel, lineno) => {
    let entry = map.get(key);
    if (!entry) {
      entry = { ...init, count: 0, where: [] };
      map.set(key, entry);
    }
    entry.count += 1;
    if (entry.where.length < maxExamples) {
      entry.where.push(`${rel}:${lineno}`);
    }
  };

  for (const file of scanned) {
    const content = readText(file);
    if (content === null) {
      continue;
    }
    const lines = splitlines(content);
    const rel = path.relative(contractRoot, file).startsWith("..") ? file : path.relative(contractRoot, file);
    textByFile.set(rel, lines.join("\n"));

    lines.forEach((line, index) => {
      const lineno = index + 1;
      for (const m of line.matchAll(VAR_REF)) {
        usedNames.add(m[1]);
        if (!knownNames.has(m[1])) {
          bump(undeclared, m[1], { rule: "DSG-TOK-09", severity: "critical", literal: `var(--${m[1]})` }, rel, lineno);
        }
      }
      // A fallback that disagrees with the token it falls back from. The token wins
      // wherever the skin loads, so the fallback is only ever seen in an embed or a
      // preview, and there the same component paints a different colour than on the site.
      for (const fm of line.matchAll(FALLBACK)) {
        const fname = fm[1];
        const fvalue = normalise(fm[2]);
        const declared = tokenValue.get(fname);
        if (declared && !declared.includes("${") && !fvalue.includes("var(") && !declared.includes("var(") && fvalue !== declared) {
          const literal = `var(--${fname}, ${fvalue}) vs ${declared}`;
          bump(findings, `DSG-TOK-11\u0000${literal}`, { rule: "DSG-TOK-11", severity: "warning", literal }, rel, lineno);
          drifted += 1;
        }
      }
      // A token's own declaration is the contract, not a use of it.
      if (DECLARATION.test(line)) {
        return;
      }

      const record = (literal, rule, severity) => {
        const value = normalise(literal).replace(/\s*!important$/, "");
        if (BENIGN.has(value) || !value) {
          return;
        }
        if (benignLength(value, rule, knownValues)) {
          return;
        }
        if (rule === "DSG-TOK-05" && (value === "none" || /^(inset )?[0-9. px-]+ transparent$/.test(value))) {
          return;
        }
        if (value.includes("var(")) {
          compliant += 1;
          return;
        }
        if (knownValues.has(value)) {
          compliant += 1;
          return;
        }
        // only a use that would have drifted is an exception; one that already matches a
        // token is compliant and is not counted as exempted
        if (
          exceptions.literals.has(value) ||
          (["DSG-TOK-01", "DSG-TOK-03"].includes(rule) && exceptions.files.some(([g]) => fnmatch(rel, `*${g}`)))
        ) {
          exempted[rel] = (exempted[rel] ?? 0) + 1;
          return;
        }
        drifted += 1;
        bump(findings, `${rule}\u0000${value}`, { rule, severity, literal: value }, rel, lineno);
      };

      let svgColors = new Set();
      if (!args["include-svg"]) {
        svgColors = new Set([...line.matchAll(SVG_ATTR)].map((m) => normalise(m[2])));
      }
      for (const match of line.matchAll(COLOR_LITERAL)) {
        if (svgColors.has(normalise(match[1]))) {
          svgSkipped += 1;
          continue;
        }
        record(match[1], "DSG-TOK-01", "critical");
      }
      for (const [pattern, rule, severity] of PROPERTY_RULES) {
        for (const match of line.matchAll(pattern)) {
          const raw = match[match.length - 1];
          if (["DSG-TOK-02", "DSG-TOK-03", "DSG-TOK-04"].includes(rule)) {
            // judge each part of a shorthand on its own; fragments of a string being
            // concatenated in script (`'0 ' + x + 'px'`) are not CSS values
            for (const part of splitComponents(raw)) {
              if (CSS_LENGTH_PART.test(part) || /^(clamp|min|max|calc|var)\(/.test(part)) {
                record(part, rule, severity);
              }
            }
          } else {
            record(raw, rule, severity);
          }
        }
      }
    });
  }

  // A Tailwind theme token (name carries a dot) is used through a utility class. Re-scan
  // for those before calling any of them dead.
  const tailwindNames = [...knownNames].filter((n) => n.includes("."));
  if (tailwindNames.length > 0) {
    const haystack = [...textByFile.values()].join("\n");
    for (const name of tailwindNames) {
      const leaf = name.slice(name.indexOf(".") + 1);
      if (new RegExp(`\\b${UTILITY}-${leaf.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack)) {
        usedNames.add(name);
      }
    }
  }
  const dead = [...knownNames].filter((n) => !usedNames.has(n)).sort();
  const total = compliant + drifted;
  const compliance = total ? pyRound((100 * compliant) / total, 1) : 100.0;

  const rows = [...findings.values()].sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || b.count - a.count);
  rows.push(...[...undeclared.values()].sort((a, b) => b.count - a.count));

  const critical = rows.filter((row) => row.severity === "critical").length;
  const exemptedUses = Object.values(exempted).reduce((sum, n) => sum + n, 0);
  const payload = {
    root,
    compliance,
    compliant,
    drifted,
    svgColoursNotCounted: svgSkipped,
    declaredExceptions: { uses: exemptedUses, rows: exceptions.rows, byFile: exempted },
    findings: rows,
    deadTokens: { rule: "DSG-TOK-08", severity: "tip", count: dead.length, names: dead.slice(0, 20) },
  };

  if (args.format === "json") {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`token compliance ${compliance.toFixed(1)}%  (${compliant} tokenised, ${drifted} literal)`);
    for (const row of rows.slice(0, 40)) {
      const where = row.where.join(", ");
      const more = row.count > row.where.length ? ` (+${row.count - row.where.length} more)` : "";
      console.log(`  ${row.severity.padEnd(8)} ${row.rule} ${row.literal.slice(0, 42).padEnd(42)} x${row.count}  ${where}${more}`);
    }
    if (dead.length > 0) {
      console.log(`  tip      DSG-TOK-08 ${dead.length} tokens declared and never used: ${dead.slice(0, 8).join(", ")}`);
    }
    if (exemptedUses > 0) {
      console.log(`  note     ${exemptedUses} literals are declared exceptions in system.md (${exceptions.rows.length} rows); listed in --format json`);
    }
    if (svgSkipped > 0) {
      console.log(`  note     ${svgSkipped} colours in SVG attributes were not counted; a third-party brand mark is fixed by its owner, not by your contract (--include-svg to count them)`);
    }
    console.log(`${rows.length} distinct findings, ${critical} critical`);
  }

  const gate = args["min-compliance"];
  if (gate && compliance < gate) {
    console.error(`compliance ${compliance}% is below the ${gate}% gate`);
    return 1;
  }
  return 0;
}

if (isMain(import.meta.url)) {
  process.exit(main());
}
