#!/usr/bin/env node
// @ts-check
/**
 * Validate the rule registry's own invariants.
 *
 * A registry that contradicts itself is worse than no registry: it lets a finding cite an ID
 * that means something else, or score a severity the rule was never allowed to carry. This
 * runs over rules/*.md and fails the build when any invariant breaks.
 *
 * Exit code 1 on any error, so it can gate CI.
 */
import fs from "node:fs";
import path from "node:path";
import { isMain, parseArgs, splitlines } from "./lib.mjs";

const SEVERITIES = new Set(["blocker", "critical", "warning", "tip"]);
const MODES = new Set(["static", "live", "judgement"]);
const CLASSES = new Set(["contract", "floor"]);
// WCAG AA is a floor, not a target: these domains may never be dismissed as polish.
const NEVER_TIP = ["A11Y", "CON"];
const ROW = /^\|\s*(DSG-[A-Z0-9]+-\d+)\s*\|(.*)\|\s*$/;

const sortedList = (set) => `[${[...set].sort().map((v) => `'${v}'`).join(", ")}]`;

/** Read every rule row. Returns { rules, errors } rather than throwing, so one bad row does not hide the rest. */
export function parseRules(rulesDir) {
  const rules = [];
  const errors = [];
  const files = fs.existsSync(rulesDir) ? fs.readdirSync(rulesDir).filter((f) => f.endsWith(".md")).sort() : [];
  if (files.length === 0) {
    errors.push(`no rule files found in ${rulesDir}`);
    return { rules, errors };
  }
  for (const file of files) {
    const stem = path.basename(file, ".md");
    const ruleClass = stem === "floor" ? "floor" : "contract";
    const lines = splitlines(fs.readFileSync(path.join(rulesDir, file), "utf8"));
    lines.forEach((line, index) => {
      const match = ROW.exec(line);
      if (!match) {
        return;
      }
      const cells = match[2].split("|").map((cell) => cell.trim());
      if (cells.length < 4) {
        errors.push(`${file}:${index + 1} ${match[1]} has ${cells.length} columns, expected 4`);
        return;
      }
      const [severity, mode, text, source] = cells;
      rules.push({ id: match[1], class: ruleClass, severity, mode, rule: text, source, file, line: index + 1 });
    });
  }
  return { rules, errors };
}

export function check(rules) {
  const errors = [];
  const seen = new Map();
  for (const rule of rules) {
    const where = `${rule.file}:${rule.line} ${rule.id}`;
    if (seen.has(rule.id)) {
      errors.push(`${where} duplicate id, already at ${seen.get(rule.id)}`);
    } else {
      seen.set(rule.id, where);
    }
    if (!SEVERITIES.has(rule.severity)) {
      errors.push(`${where} severity '${rule.severity}' not one of ${sortedList(SEVERITIES)}`);
    }
    if (!MODES.has(rule.mode)) {
      errors.push(`${where} mode '${rule.mode}' not one of ${sortedList(MODES)}`);
    }
    if (!CLASSES.has(rule.class)) {
      errors.push(`${where} class '${rule.class}' not one of ${sortedList(CLASSES)}`);
    }
    if (rule.source.length < 3) {
      errors.push(`${where} has no source; every rule must cite one`);
    }
    if (rule.rule.length < 10) {
      errors.push(`${where} rule text is too short to be checkable`);
    }
    const domain = rule.id.split("-")[1];
    if (NEVER_TIP.includes(domain) && rule.severity === "tip") {
      errors.push(`${where} accessibility rules may never be severity tip; AA is a floor`);
    }
  }
  return errors;
}

function main() {
  const args = parseArgs(process.argv.slice(2), {
    rules: { type: "string", default: "rules", help: "directory holding the rule markdown files" },
    format: { type: "string", choices: ["text", "json"], default: "text" },
  }, {
    usage: "usage: rules_lint.mjs [--rules DIR] [--format text|json]",
    description: "Validate the rule registry's own invariants. Exit 1 on any error.",
  });

  const parsed = parseRules(args.rules);
  const errors = [...parsed.errors, ...check(parsed.rules)];
  const bySeverity = {};
  const byMode = {};
  for (const rule of parsed.rules) {
    bySeverity[rule.severity] = (bySeverity[rule.severity] ?? 0) + 1;
    byMode[rule.mode] = (byMode[rule.mode] ?? 0) + 1;
  }

  if (args.format === "json") {
    console.log(JSON.stringify({ total: parsed.rules.length, bySeverity, byMode, errors }, null, 2));
  } else {
    const line = (counts) => Object.keys(counts).sort().map((k) => `${k}=${counts[k]}`).join(", ");
    console.log(`${parsed.rules.length} rules in ${args.rules}`);
    console.log(`  severity: ${line(bySeverity)}`);
    console.log(`  mode:     ${line(byMode)}`);
    for (const error of errors) {
      console.error(`ERROR ${error}`);
    }
    if (errors.length === 0) {
      console.log("registry OK");
    }
  }
  return errors.length > 0 ? 1 : 0;
}

if (isMain(import.meta.url)) {
  process.exit(main());
}
