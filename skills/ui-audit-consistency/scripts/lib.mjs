// Small helpers shared by the audit scripts. Plain Node, no dependencies.
//
// Several of them exist to match what the Python scripts these replaced did, because a
// compliance percentage that moves by a rounding rule is not a result: round-half-to-even,
// splitlines(), and fnmatch with character classes.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".astro", "build", ".next", "coverage", ".yarn"]);

/** Python's str.splitlines(): no trailing empty element, and the same line boundaries. */
export function splitlines(text) {
  if (text === "") {
    return [];
  }
  const lines = text.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/);
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

/**
 * Python's round(x, digits): nearest, ties to even, judged on the exact value of the double.
 * Math.round and toFixed both send an exact tie upward, which moves 97.25 to 97.3.
 */
export function pyRound(x, digits = 0) {
  if (!Number.isFinite(x)) {
    return x;
  }
  const exact = Math.abs(x).toFixed(Math.min(100, digits + 40));
  const dot = exact.indexOf(".");
  const tail = exact.slice(dot + 1 + digits);
  const isTie = /^50*$/.test(tail);
  if (!isTie) {
    return Number(x.toFixed(digits));
  }
  const kept = exact.slice(0, dot + 1 + digits).replace(/\.$/, "");
  const lastDigit = Number(kept.replace(".", "").slice(-1));
  const down = Number(kept) * Math.sign(x);
  const step = 10 ** -digits * Math.sign(x);
  return Number((lastDigit % 2 === 0 ? down : down + step).toFixed(digits));
}

/** f"{x:.4f}" the way Python formats it (ties to even on the exact value). */
export function fixed(x, digits) {
  return pyRound(x, digits).toFixed(digits);
}

/** Python's fnmatch.fnmatch on a POSIX path: `*` crosses `/`, `[abc]` is a character class. */
export function fnmatch(name, pattern) {
  let out = "";
  for (let i = 0; i < pattern.length; ) {
    const c = pattern[i++];
    if (c === "*") {
      out += ".*";
    } else if (c === "?") {
      out += ".";
    } else if (c === "[") {
      let j = i;
      if (pattern[j] === "!") {
        j += 1;
      }
      if (pattern[j] === "]") {
        j += 1;
      }
      while (j < pattern.length && pattern[j] !== "]") {
        j += 1;
      }
      if (j >= pattern.length) {
        out += "\\[";
      } else {
        let body = pattern.slice(i, j).replace(/\\/g, "\\\\");
        i = j + 1;
        if (body[0] === "!") {
          body = "^" + body.slice(1);
        } else if (body[0] === "^") {
          body = "\\" + body;
        }
        out += `[${body}]`;
      }
    } else {
      out += c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    }
  }
  return new RegExp(`^(?:${out})$`, "s").test(name);
}

/** Every file under root whose directory chain avoids SKIP_DIRS, in a stable order. */
export function walk(root, accept) {
  const found = [];
  const visit = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          visit(full);
        }
        continue;
      }
      let isFile = entry.isFile();
      if (!isFile && entry.isSymbolicLink()) {
        try {
          isFile = fs.statSync(full).isFile();
        } catch {
          isFile = false;
        }
      }
      if (isFile && accept(full, entry.name)) {
        found.push(full);
      }
    }
  };
  visit(root);
  return found;
}

export function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/**
 * Tiny argv parser. spec: { name: { type: "string"|"number"|"boolean", choices?, default?, help } }.
 * Prints usage and exits 0 on --help; prints the problem and exits 2 on bad input.
 */
export function parseArgs(argv, spec, { description, usage }) {
  const args = {};
  for (const [name, def] of Object.entries(spec)) {
    args[name] = def.default ?? (def.type === "boolean" ? false : undefined);
  }
  const fail = (message) => {
    console.error(`${usage}\nerror: ${message}`);
    process.exit(2);
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      console.log(`${usage}\n\n${description}\n`);
      for (const [name, def] of Object.entries(spec)) {
        const choices = def.choices ? ` {${def.choices.join(",")}}` : "";
        console.log(`  --${name}${def.type === "boolean" ? "" : " <v>"}${choices}  ${def.help ?? ""}`);
      }
      process.exit(0);
    }
    if (!arg.startsWith("--")) {
      fail(`unexpected argument ${arg}`);
    }
    const [rawName, inline] = arg.slice(2).split(/=(.*)/s, 2);
    const def = spec[rawName];
    if (!def) {
      fail(`unknown option --${rawName}`);
    }
    if (def.type === "boolean") {
      args[rawName] = true;
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined) {
      fail(`--${rawName} needs a value`);
    }
    if (def.type === "number") {
      if (Number.isNaN(Number(value))) {
        fail(`--${rawName} needs a number`);
      }
      args[rawName] = Number(value);
    } else {
      if (def.choices && !def.choices.includes(value)) {
        fail(`--${rawName} must be one of ${def.choices.join(", ")}`);
      }
      args[rawName] = value;
    }
  }
  for (const [name, def] of Object.entries(spec)) {
    if (def.required && args[name] === undefined) {
      fail(`--${name} is required`);
    }
  }
  return args;
}

/** JSON with sorted keys, for output that should diff cleanly. */
export function stringifySorted(value) {
  const sort = (v) => {
    if (Array.isArray(v)) {
      return v.map(sort);
    }
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]));
    }
    return v;
  };
  return JSON.stringify(sort(value), null, 2);
}

/** True when this module is the script being run, not an import (e.g. from a test). */
export function isMain(metaUrl) {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return pathToFileURL(fs.realpathSync(process.argv[1])).href === metaUrl;
  } catch {
    return false;
  }
}
