#!/usr/bin/env node
/**
 * Live half of the audit: what static analysis cannot see.
 *
 * Runs axe against a rendered page at three viewports, looks for horizontal overflow, and
 * collects console errors. Maps every axe violation onto a DSG rule id so a live finding
 * and a static one carry the same identity.
 *
 * Detect, never assume: `--check` reports whether this mode can run at all and exits 0 or 1
 * without launching anything. The skill calls that first, and falls back to static mode with
 * the missing phases marked "not evaluated" rather than "passed".
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 375, height: 812 },
];

/** axe rule id -> the DSG rule it reports as, so live and static findings share an identity. */
const AXE_TO_DSG = {
  "color-contrast": "DSG-CON-01",
  "color-contrast-enhanced": "DSG-CON-01",
  "link-in-text-block": "DSG-CON-05",
  "image-alt": "DSG-A11Y-01",
  "input-image-alt": "DSG-A11Y-01",
  "label": "DSG-A11Y-02",
  "form-field-multiple-labels": "DSG-A11Y-02",
  "button-name": "DSG-A11Y-03",
  "link-name": "DSG-A11Y-03",
  "aria-command-name": "DSG-A11Y-03",
  "heading-order": "DSG-A11Y-06",
  "page-has-heading-one": "DSG-A11Y-06",
  "empty-heading": "DSG-A11Y-06",
  "target-size": "DSG-A11Y-08",
  "meta-viewport": "DSG-A11Y-09",
  "html-has-lang": "DSG-A11Y-11",
  "html-lang-valid": "DSG-A11Y-11",
  "bypass": "DSG-A11Y-12",
  "region": "DSG-A11Y-12",
  "document-title": "DSG-A11Y-14",
  "aria-allowed-attr": "DSG-A11Y-10",
  "aria-required-attr": "DSG-A11Y-10",
  "aria-valid-attr-value": "DSG-A11Y-10",
  "nested-interactive": "DSG-A11Y-10",
  "scrollable-region-focusable": "DSG-A11Y-04",
  "focus-order-semantics": "DSG-A11Y-04",
  "tabindex": "DSG-A11Y-04",
  "frame-title": "DSG-A11Y-03",
  "aria-hidden-focus": "DSG-A11Y-04",
};

/**
 * Severity per DSG rule, copied from `rules/`. The registry is the source of
 * truth for how bad a thing is; axe's own `impact` is not.
 *
 * Both were in play until 2026-09-22 and they disagreed. axe calls
 * `link-in-text-block` serious, which mapped to `blocker`, while DSG-CON-05 is
 * a `warning` in the registry, so a report cited a rule and then contradicted
 * its severity, and the score moved by 8 points on the difference. Severity now
 * comes from here, and axe's impact is only a fallback for a rule this table
 * does not know.
 */
const DSG_SEVERITY = {
  "DSG-CON-01": "blocker",
  "DSG-CON-02": "blocker",
  "DSG-CON-03": "blocker",
  "DSG-CON-04": "critical",
  "DSG-CON-05": "warning",
  "DSG-A11Y-01": "blocker",
  "DSG-A11Y-02": "blocker",
  "DSG-A11Y-03": "blocker",
  "DSG-A11Y-04": "blocker",
  "DSG-A11Y-06": "blocker",
  "DSG-A11Y-08": "blocker",
  "DSG-A11Y-09": "blocker",
  "DSG-A11Y-10": "critical",
  "DSG-A11Y-11": "critical",
  "DSG-A11Y-12": "critical",
  "DSG-A11Y-14": "critical",
  "DSG-RSP-01": "critical",
};

const IMPACT_TO_SEVERITY = {
  critical: "blocker",
  serious: "blocker",
  moderate: "critical",
  minor: "warning",
};

function parseArgs(argv) {
  const args = { viewports: VIEWPORTS, format: "text", urls: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      args.check = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--format") {
      index += 1;
      args.format = argv[index];
    } else if (arg === "--screenshots") {
      index += 1;
      args.screenshots = argv[index];
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown option ${arg}`);
    } else {
      args.urls.push(arg);
    }
  }
  return args;
}

/**
 * Find a Chromium the installed Playwright can actually drive.
 *
 * Playwright pins an exact browser build, and an image that ships a different one makes
 * launch fail even though the module imports fine. Rather than telling the user to run
 * `playwright install`, which a managed image forbids, look for what is on disk.
 */
function discoverExecutable() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !existsSync(base)) {
    return null;
  }
  const candidates = [];
  for (const entry of readdirSync(base)) {
    candidates.push(join(base, entry, "chrome-linux", "chrome"));
    candidates.push(join(base, entry, "chrome-linux", "headless_shell"));
    candidates.push(join(base, entry, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"));
  }
  // A full chrome drives more than a headless shell, so prefer it when both exist.
  candidates.sort((a, b) => (a.endsWith("chrome") ? -1 : 1) - (b.endsWith("chrome") ? -1 : 1));
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

async function launch(playwright) {
  const options = {};
  try {
    return await playwright.chromium.launch(options);
  } catch (error) {
    const executablePath = discoverExecutable();
    if (!executablePath) {
      throw error;
    }
    return playwright.chromium.launch({ ...options, executablePath });
  }
}

async function probe() {
  const missing = [];
  let playwright = null;
  let axe = null;
  try {
    playwright = await import("playwright");
  } catch {
    missing.push("playwright");
  }
  try {
    axe = await import("@axe-core/playwright");
  } catch {
    missing.push("@axe-core/playwright");
  }
  return { playwright, axe, missing };
}

async function auditViewport(page, AxeBuilder, url, viewport) {
  const consoleErrors = [];
  const onConsole = (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text().slice(0, 200));
    }
  };
  page.on("console", onConsole);

  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(url, { waitUntil: "networkidle" });

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();

  // A horizontal scrollbar at a target width is DSG-RSP-01, and static analysis cannot
  // see it: it only appears once the cascade has resolved and content has been laid out.
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });

  // WCAG 1.4.3 exempts logotypes by name: "Text that is part of a logo or
  // brand name has no contrast requirement." axe cannot apply that exception,
  // because nothing in the DOM says "this is our logo", so it reports a brand
  // wordmark drawn in brand colours exactly like body text, and an audit that
  // passes the verdict through inherits a defect the standard does not have.
  //
  // These are NOT dropped. A silent filter would be the same failure in the
  // other direction: a real violation on an element that merely has "logo" in a
  // class name would vanish, and a check that found nothing would be
  // indistinguishable from one that was never run. They go to
  // `exemptCandidates` instead, reported, attributed, and not scored.
  const contrastNodes = results.violations
    .filter((violation) => violation.id.startsWith("color-contrast"))
    .flatMap((violation) => violation.nodes.map((node) => node.target.join(" ")));

  const logotypeSelectors = new Set(
    contrastNodes.length === 0
      ? []
      : await page.evaluate((selectors) => {
          const LOGO = /(^|[^a-z])(logo|wordmark|brand-?name|logotype)([^a-z]|$)/i;
          return selectors.filter((selector) => {
            let element;
            try {
              element = document.querySelector(selector);
            } catch {
              return false;
            }
            if (!element) {
              return false;
            }
            for (let node = element; node && node !== document.body; node = node.parentElement) {
              if (node.dataset && node.dataset.logotype !== undefined) {
                return true;
              }
              const id = String(node.id || "");
              const cls = String(node.className && node.className.baseVal !== undefined
                ? node.className.baseVal
                : node.className || "");
              if (LOGO.test(id) || LOGO.test(cls)) {
                return true;
              }
            }
            return false;
          });
        }, contrastNodes),
  );

  const findings = [];
  const exemptCandidates = [];

  for (const violation of results.violations) {
    const rule = AXE_TO_DSG[violation.id];
    const isContrast = violation.id.startsWith("color-contrast");
    const exemptNodes = isContrast
      ? violation.nodes.filter((node) => logotypeSelectors.has(node.target.join(" ")))
      : [];
    const realNodes = violation.nodes.filter((node) => !exemptNodes.includes(node));

    if (exemptNodes.length > 0) {
      exemptCandidates.push({
        rule: rule || null,
        axeRule: violation.id,
        exemption: "WCAG 1.4.3 logotype exception: text that is part of a logo or brand name",
        note: "Confirm this really is the brand mark. If it is body text in a class merely named for a logo, it is a finding.",
        viewport: viewport.name,
        count: exemptNodes.length,
        where: exemptNodes.slice(0, 5).map((node) => `${node.target.join(" ")} @ ${viewport.name}`),
      });
    }

    if (realNodes.length === 0) {
      continue;
    }

    findings.push({
      // An axe rule this table does not know is reported AS unmapped. It used to
      // fall back to DSG-A11Y-10, which silently relabelled every unknown rule
      // as "native semantics before ARIA", a keyboard-access failure was
      // reported under a rule about ARIA, and the citation looked sound.
      rule: rule || `UNMAPPED:${violation.id}`,
      axeRule: violation.id,
      severity: rule
        ? DSG_SEVERITY[rule] || IMPACT_TO_SEVERITY[violation.impact] || "warning"
        : IMPACT_TO_SEVERITY[violation.impact] || "warning",
      unmapped: rule ? undefined : true,
      problem: violation.help,
      viewport: viewport.name,
      count: realNodes.length,
      where: realNodes.slice(0, 5).map((node) => `${node.target.join(" ")} @ ${viewport.name}`),
    });
  }

  if (overflow.scrollWidth > overflow.clientWidth + 1) {
    findings.push({
      rule: "DSG-RSP-01",
      severity: "critical",
      problem: `Page scrolls horizontally: content is ${overflow.scrollWidth}px in a ${overflow.clientWidth}px viewport`,
      viewport: viewport.name,
      count: 1,
      where: [`document @ ${viewport.name}`],
    });
  }

  return { viewport: viewport.name, findings, exemptCandidates, consoleErrors };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    return 2;
  }

  if (args.help) {
    console.log("usage: live_audit.mjs [--check] [--format json|text] [--screenshots DIR] URL...");
    console.log("  --check   report whether live mode can run, then exit. Launches nothing.");
    return 0;
  }

  const { playwright, axe, missing } = await probe();

  const unavailable = (reason) => {
    console.error(`live mode unavailable: ${reason}`);
    console.error("Audit in static mode and mark the live-only rules 'not evaluated'.");
    console.error("A check that did not run must never read like a check that found nothing.");
    return 1;
  };

  if (args.check) {
    if (missing.length > 0) {
      return unavailable(`missing ${missing.join(", ")}`);
    }
    // Resolving the modules proves nothing: Playwright pins an exact browser build, and a
    // mismatched image fails only at launch. So actually launch one, then close it.
    let browser = null;
    try {
      browser = await launch(playwright);
    } catch (error) {
      return unavailable(`a browser could not be launched: ${error.message.split("\n")[0]}`);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
    const discovered = discoverExecutable();
    const where = discovered ? ` (using ${discovered})` : "";
    console.log(`live mode available: modules resolve and a browser launches${where}`);
    return 0;
  }

  if (missing.length > 0) {
    console.error(`cannot run: missing ${missing.join(", ")}. Run with --check first.`);
    return 1;
  }
  if (args.urls.length === 0) {
    console.error("no URL given. usage: live_audit.mjs [options] URL...");
    return 2;
  }

  const AxeBuilder = axe.default || axe.AxeBuilder;
  let browser = null;
  try {
    browser = await launch(playwright);
  } catch (error) {
    return unavailable(`a browser could not be launched: ${error.message.split("\n")[0]}`);
  }
  const pages = [];
  let blockers = 0;
  let exempt = 0;

  try {
    for (const url of args.urls) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const perViewport = [];
      for (const viewport of args.viewports) {
        const result = await auditViewport(page, AxeBuilder, url, viewport);
        if (args.screenshots) {
          await page.screenshot({ path: `${args.screenshots}/${viewport.name}.png`, fullPage: false });
        }
        perViewport.push(result);
        blockers += result.findings.filter((finding) => finding.severity === "blocker").length;
        exempt += result.exemptCandidates.length;
      }
      pages.push({ url, viewports: perViewport });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  if (args.format === "json") {
    console.log(JSON.stringify({ pages, blockers, exemptCandidates: exempt }, null, 2));
    return blockers > 0 ? 1 : 0;
  }

  for (const entry of pages) {
    console.log(entry.url);
    for (const result of entry.viewports) {
      for (const finding of result.findings) {
        const unmapped = finding.unmapped ? " [no DSG rule: report under Observations, do not score]" : "";
        console.log(`  ${finding.severity.padEnd(8)} ${finding.rule} ${finding.problem} x${finding.count}  ${finding.where[0]}${unmapped}`);
      }
      // Printed, never hidden: the reader decides whether the exemption holds.
      for (const candidate of result.exemptCandidates) {
        console.log(`  exempt?  ${candidate.axeRule} x${candidate.count}  ${candidate.where[0]}`);
        console.log(`           ${candidate.exemption}`);
        console.log(`           ${candidate.note}`);
      }
      for (const error of result.consoleErrors.slice(0, 3)) {
        console.log(`  warning  DSG-CNT-00 console error @ ${result.viewport}: ${error}`);
      }
    }
  }
  console.log(`${blockers} blockers across ${pages.length} page(s) x ${args.viewports.length} viewports`);
  if (exempt > 0) {
    console.log(`${exempt} contrast finding(s) held back as logotype candidates: confirm each before dismissing it`);
  }
  return blockers > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    // A crash must read as a failure, never as a silent pass.
    console.error(`live audit failed: ${error.message.split("\n")[0]}`);
    process.exit(1);
  });
