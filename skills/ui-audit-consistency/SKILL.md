---
name: ui-audit-consistency
description: >
  Verify that a built interface stays faithful to its design contract, and that it clears the
  WCAG 2.2 AA floor regardless of what the contract says. Reads design tokens (CSS custom
  properties, Tailwind theme, tokens.json) and checks the HTML, CSS, Astro, JSX/TSX that were
  built against them. Works statically on source, and optionally live against a rendered page
  via Playwright. Use when asked to audit UI, run a design review, check UI consistency or
  design token drift, check spacing/typography/colours, run a WCAG or accessibility audit,
  verify a mock or a page against a design system, or answer "does this page follow the
  design we agreed".
license: MIT
metadata:
  version: "0.1.0"
  argument-hint: "<path, glob, or URL>"
---

# UI Audit & Consistency

This skill does not have opinions about design. It verifies **fidelity of execution against a
contract**, and enforces a floor that no contract may waive.

**Never invent a rule.** Every finding cites an ID from `${CLAUDE_PLUGIN_ROOT}/rules/`, and
every rule there carries a source. A defect with no matching rule goes under **Observations**
as prose and scores nothing. That constraint is what stops an audit from drifting into taste.

## The two rule classes

Read `rules/README.md` before the first audit in a session. The whole skill turns on this
split:

| Class | Source of truth | A violation means |
| --- | --- | --- |
| `contract` | `tokens.json` + `system.md`, the project's own design definition | **Drift.** The build departed from what was approved |
| `floor` | WCAG 2.2 AA and universal anti-patterns | An absolute failure. No contract waives it |

If the contract says a 4px spacing base, then 4px is correct and 6px is drift. A project that
documents its choice is not in violation of somebody else's default. But a contract may set
the palette and still not decide that 2.9:1 is legible.

**Where there is no contract, contract rules do not fire.** Say so once in the report header
and audit the floor alone. Do not substitute defaults, an audit that argues with a design
instead of verifying it is worse than no audit.

## Clarify first

At most three questions, and only those that change the output. No answer, or "just run it",
means proceed on the defaults and list the assumptions at the top of the report.

| Question | Default |
| --- | --- |
| Scope: full, quick, floor only, or contract only? | Full |
| Input: a source path/glob, a URL, or a screenshot? | The current repository |
| WCAG target: AA or AAA? | AA |

Framework, design system and viewports are detected in Phase 0. Do not ask about them.

## Choose a mode

| Mode | Available when | What it can see |
| --- | --- | --- |
| **Static** (default) | Always | Markup, CSS, tokens, class usage, anti-patterns |
| **Live** | Playwright resolves and a server or URL answers | Computed contrast, focus order, real overflow, console |
| **Screenshot** | An image is supplied | Hierarchy and balance only; no `file:line` |

Detect live mode, never assume it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/ui-audit-consistency/scripts/live_audit.mjs" --check
```

Exit 0 means live is available. Anything else means static only: say so once in the header,
and do not quietly drop the phases that needed a browser. Mark their rules `not evaluated`
rather than `passed`; a check that did not run must never read like a check that found
nothing.

## Phases

Run in order. Each names the one reference to load at that point; do not preload them all.

### Phase 0: Establish the contract

1. Detect the stack: `astro.config.*`, `tailwind.config.*`, `package.json`.
2. Find the contract, in this order, and record which one won:
   `tokens.json` -> `system.md` -> `.design-sync/` -> `DESIGN.md` ->
   `claude-rules/design-principles.md`.
3. Extract tokens:

   ```bash
   node scripts/token_extractor.mjs --root . --format json > tokens.extracted.json
   ```

   Reads CSS custom properties, `@theme` blocks and `tailwind.config.*` theme keys.
4. **If no contract exists, stop and say so.** Offer to generate one from what the code
   already does: that is `design-token-lock`, and it is the right first step. Then audit
   the floor alone for now.
5. Pick the surface: one page per template (home, article, category, product, 404), not every
   article. **List the pages in the report.** The surface is part of the score.

Read: `references/methodology.md`.

### Phase 1: Interactions
`DSG-INT-*`, `DSG-A11Y-04`, `DSG-A11Y-05`, `DSG-A11Y-08`.

### Phase 2: Responsiveness
1440 / 768 / 375. Static reads breakpoints and fixed widths; live resizes and looks for
overflow. `DSG-RSP-*`, `DSG-A11Y-15`.

### Phase 3: Visual fidelity
Spacing scale, type scale, alignment, measure, hierarchy. `DSG-SPC-*`, `DSG-TYP-*`.

### Phase 4: Floor (accessibility and contrast)

```bash
node scripts/contrast_checker.mjs --tokens tokens.extracted.json --level AA --suggest --format json
```

Then the checklist. `DSG-CON-*`, `DSG-A11Y-*`, `DSG-MOT-01`, `DSG-MOT-02`.

Read: `references/wcag-checklist.md`.

### Phase 5: States and robustness
Loading, empty, error; very long and very short content; reserved space for anything
injected. `DSG-STA-*`.

### Phase 6: Drift

```bash
node scripts/token_validator.mjs --tokens tokens.extracted.json --root src --format json
```

The only phase that yields a percentage. `DSG-TOK-*`, `DSG-COL-*`, `DSG-CMP-*`.

Read: `references/design-tokens.md`.

### Phase 7: Content as layout, and console
Measure, comparison tables, anchor offsets, button labels, console errors in live mode.
`DSG-CNT-*`.

Read: `references/content-layout.md`.

## Severity

| Tier | Deduction | The test |
| --- | --- | --- |
| **Blocker** | -12 | You can write a specific WCAG success criterion or legal clause next to it |
| **Critical** | -8 | Breaks usability for a real population, but no clause applies |
| **Warning** | -4 | Degrades the experience |
| **Tip** | -1 | Polish |

Blocker is decided by **citability, not by how bad it feels**. No clause, no blocker.

Accessibility findings are never **Tip**. AA is the floor, not the target.

## Scoring

```
score = max(0, 100 - 12*blockers - 8*criticals - 4*warnings - 1*tips)
```

Three scores, never one average; a page can be faithful and unusable, or beautiful and
inaccessible:

| Score | Built from | Bands |
| --- | --- | --- |
| **Design** | contract rules outside `DSG-TOK-*` | A 90+ / B 80 / C 70 / D 60 / F below |
| **Accessibility** | every `floor` rule | same bands; flag if any Blocker exists |
| **Consistency** | `token_validator.mjs` compliance %, not deductions | same bands |

**Always print the arithmetic:** `100 - (1x12) - (2x8) - (3x4) = 60/100`.

### What makes the score reproducible

The formula alone does not. These four do:

1. **One root cause is one finding.** The same defect in N places is one entry with a count
   and up to five locations, deducting **once**. Exception: when each instance needs a
   different fix. Without this, one missing `aria-label` in forty product cards
   drives every page to zero and the report becomes unreadable.
2. **Frozen surface.** Score only the pages chosen in Phase 0, and list them. Adding a page
   changes the score legitimately; wandering into extra files does not.
3. **Stable IDs.** Never renumber. Retired rules stay listed as retired.
4. **Scripts own the numbers.** Contrast ratios and compliance percentages come from the
   scripts, never from estimation.

Read: `references/scoring-rubric.md`.

## Composing with sibling rule sets

This plugin depends on no other. If another tool's `rules/` directory happens to be present
in the same layout, add its findings as separate sections and honour `supersedes`: when a
later-stage rule subsumes a `DSG-` rule, report the defect once, at the earliest stage that
could have caught it. Fixing it early is cheaper anyway.

If no sibling is found, behave exactly as if alone. Never report a missing sibling as a
problem.

## Reporting

Order matters. A reviewer who opens on thirty problems stops reading.

1. **What works**: two to four real observations.
2. **Header**: mode, contract file that won, pages audited, three scores with arithmetic,
   and anything marked `not evaluated`.
3. **Findings** by severity, each carrying: rule ID; location (`file:line` static,
   `selector @ viewport` live); **the problem and its effect on a user**, not the fix;
   evidence; then one line of direction.
4. **Issue Priority Matrix**: effort 1-10 against impact 1-10.
   Effort: 1-2 one value / 3-4 one component / 5-6 multi-component / 7-9 architectural.
   Impact: 9-10 breaks a11y or core usability / 6-8 degrades / 3-5 polish / 1-2 cosmetic.
5. **Quick wins**: effort <= 3 and impact >= 6, as a checklist.

**Problems, not prescriptions.** "The gap between the price and the buy button is tighter
than the gap to the next card, so the button reads as belonging to the wrong product" beats
"set margin-bottom to 16px". The reader knows their codebase.

**No evidence, no finding.** Move it to Observations.

**Exempt candidates are reported, not deleted.** `live_audit.mjs` returns
`exemptCandidates` for contrast findings on what looks like a logo or brand name,
because WCAG 1.4.3 exempts logotypes and axe cannot know which element is one. List
them in the header with their selectors and say plainly that they scored nothing, so
a reader can overturn the call. Two failure modes, and the report must avoid both:
scoring a brand wordmark as a violation, and quietly dropping a real violation
because a class name happened to contain "logo".

**A contrast threshold moves with the viewport.** 4.5:1 and 3:1 are divided by
rendered size, so the same colours can satisfy DSG-CON-02 at 1440 and fail
DSG-CON-01 at 375 with nothing but the type scale changing. Name the viewport in
every contrast finding; "fails contrast" without one is not reproducible.

Read: `references/report-template.md`. Example: `assets/report-example.md`.

## Language

Report in the language the user wrote in, labels and headings included. Never mix two
languages in one report. The skill's own files stay in English.

## Fix mode

Only after the report is accepted, and in waves, stopping between each:

1. Blockers, then re-run Phases 4 and 6.
2. Criticals.
3. Warnings and Tips the user picked.

Never in one pass. A contrast fix that changes a token repaints the whole site, and that has
to be looked at before the next wave lands on top of it.

## CI gating

Scripts exit **1 on a Blocker**, 0 otherwise. `live_audit.mjs` also exits **3** when nothing blocks but a page could not be measured, so an unreachable page never reads as a pass:

```bash
node scripts/contrast_checker.mjs --tokens tokens.json --level AA || exit 1
node scripts/token_validator.mjs  --tokens tokens.json --root src --min-compliance 85 || exit 1
node scripts/rules_lint.mjs       --rules "${CLAUDE_PLUGIN_ROOT}/rules" || exit 1
```

All take `--format json|text` and `--help`. The scripts need Node 18 or newer and no packages; only `live_audit.mjs` also wants Playwright.
`live_audit.mjs` needs `playwright` and `@axe-core/playwright`, and reports their absence
rather than crashing.

Installing a CI gate properly, with a baseline of tolerated debt, is a separate job. These
lines are for a quick local check.

## Scope and limitations

Put these in the report rather than letting a reader assume otherwise.

**Static cannot see** computed contrast after cascade and opacity, real focus order, actual
overflow, anything rendered at runtime, font fallback, or practical stacking. It misses
contrast behind a class it cannot resolve to a value.

**Live cannot see** hover, focus and dark-mode states unless told to drive them: axe
measures the default rendered state, so those are *unmeasured*, not exempt. It cannot judge
whether a hierarchy is correct, only whether it is consistent.

**Out of scope on purpose:**

- *Performance as a metric.* LCP and CLS need a measurement run, not a reading of source.
  Layout properties that cause shift are in scope (`DSG-STA-02`, `DSG-STA-03`); the resulting
  number is not.
- *Commercial and legal content.* Affiliate disclosure, ad-to-content balance,
  `rel="sponsored"`. Not design conformance, and not this plugin's business.
- *Editorial quality and SEO.*

**Neither mode replaces user testing.** Every rule here is a proxy for a human outcome. A page
can pass all 79 and still confuse people. This is a floor, not a verdict.

## References

| File | Read when |
| --- | --- |
| `${CLAUDE_PLUGIN_ROOT}/rules/README.md` | First audit of a session, the registry contract |
| `${CLAUDE_PLUGIN_ROOT}/rules/contract.md` | Any drift finding |
| `${CLAUDE_PLUGIN_ROOT}/rules/floor.md` | Any accessibility finding |
| `references/methodology.md` | Phase 0; picking the surface; static vs live |
| `references/heuristics.md` | Judging hierarchy, grouping and flow |
| `references/wcag-checklist.md` | Phase 4 |
| `references/design-tokens.md` | Phases 0 and 6; the contract file format |
| `references/content-layout.md` | Phase 7 |
| `references/ai-slop-patterns.md` | Judging originality of a generated mock |
| `references/scoring-rubric.md` | Producing the scores |
| `references/report-template.md` | Writing the report |

Attribution for the compiled source material: `NOTICE.md`.
