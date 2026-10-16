# 🎯 aosf-design

A Claude Code plugin that answers one question: **does the page we built still follow the design we agreed?**

It reads your design tokens (CSS custom properties, a Tailwind theme, or a `tokens.json`), checks the HTML, CSS, Astro, JSX or TSX built against them, and reports two different things:

| Class | Source of truth | A violation means |
| --- | --- | --- |
| `contract` | your own tokens and design notes | **Drift.** The build departed from what was approved |
| `floor` | WCAG 2.2 AA and universal anti-patterns | An absolute failure. No contract waives it |

If your contract says a 4px spacing base, then 4px is correct and 6px is drift. But a contract can set a palette and still not decide that 2.9:1 contrast is legible.

Every finding cites one of 79 rules in [`rules/`](./rules/), and every rule names its source. A defect with no matching rule goes under *Observations* and scores nothing, which is what keeps an audit from turning into taste.

Built for [Art of Styleframe](https://artofstyleframe.com), an editorial on UI design, motion design and web layout.

## 📦 Install

Inside Claude Code:

```
/plugin marketplace add artofstyleframe/aosf-design
/plugin install aosf-design@aosf-design
```

Then run it on a folder, a glob or a URL:

```
/aosf-design:ui-audit-consistency src/
```

Ask in plain words works too: "audit this page against our design tokens", "check the spacing and colours for drift", "run a WCAG audit on this component".

## 🔍 What it does

- **Static mode (default):** reads source only. Needs nothing installed.
- **Live mode:** drives a rendered page with Playwright and axe for computed contrast, focus order and real overflow. Needs `playwright` and `@axe-core/playwright`; if they are missing the skill says so instead of crashing.
- **Screenshot mode:** judges hierarchy and balance from an image. No `file:line` findings in this mode.

Scoring is reproducible: four severity tiers deducted from 100, one root cause counted once however many nodes it touches, and the numbers come from the scripts, not from estimation.

## 🧰 Scripts

Plain Node (18 or newer, no packages to install), runnable on their own:

| Script | What it checks |
| --- | --- |
| `contrast_checker.mjs` | WCAG contrast for token pairs, with a `candidate` verdict for pairs only inferred from names |
| `token_validator.mjs` | How much of the code actually uses your tokens, with a minimum-compliance gate |
| `token_extractor.mjs` | Pulls tokens out of CSS, Tailwind and JSON into one list |
| `rules_lint.mjs` | Checks that the rule registry contradicts itself nowhere |
| `live_audit.mjs` | The Playwright and axe pass for live mode |

They exit 1 on a blocker, so they can gate CI. Details are in [`skills/ui-audit-consistency/SKILL.md`](./skills/ui-audit-consistency/SKILL.md).

## ⚠️ Limits

Static analysis cannot see computed contrast after the cascade, real focus order or anything rendered at runtime. A live run measures the default state only, so hover, focus and dark mode are *unmeasured*, not exempt. Performance numbers such as LCP and CLS are out of scope, and so are commercial and legal content rules.

Neither mode replaces user testing. Every rule is a proxy for a human outcome, so treat a pass as a floor, not a verdict.

## 📄 License

MIT. The skill is an original work that compiles patterns from several openly licensed guideline documents; where each rule came from is recorded in [`skills/ui-audit-consistency/NOTICE.md`](./skills/ui-audit-consistency/NOTICE.md).
