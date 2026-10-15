# NOTICE

`ui-audit-consistency` is an original work that compiles patterns from several publicly
published skills and guideline documents. It is not a fork of any of them. This file records
what was taken from where, and under which licence, so the provenance of every rule can be
traced back to a source.

Licence of this skill: **MIT**.

## Adapted material (permissive licences, attribution given)

### Vercel Labs: Web Interface Guidelines
- Source: <https://github.com/vercel-labs/web-interface-guidelines> (`AGENTS.md`, `command.md`)
- Also: <https://github.com/vercel-labs/agent-skills> (`skills/web-design-guidelines`)
- Licence: MIT, `LICENSE` present in `web-interface-guidelines`, (c) 2025 Vercel Labs.
  `agent-skills` declares MIT in its README but ships no `LICENSE` file.
- Used for: the checkable MUST/SHOULD/NEVER rules that form the backbone of
  `rules/contract.md` and `rules/floor.md` (interactions, animation, layout, content, forms,
  performance, theming, design), the anti-pattern list, and the terse `file:line` finding
  format.
- Changed: rules were given stable IDs, split by audit phase, annotated with a source per
  rule, and assigned severity tiers. Rules that cannot be checked statically are marked.
  Rules specific to content and affiliate sites were added and are not from this source.

### Ashutos1997: Claude Design Auditor Skill
- Source: <https://github.com/Ashutos1997/claude-design-auditor-skill>
- Licence: MIT, declared in `README.md`. No `LICENSE` file is present in the repository.
- Used for: the four-tier deduction formula (-12 / -8 / -4 / -1 from 100, floor 0); the
  citability test that separates Blocker from Critical; the deduplication requirement that
  one root cause across N nodes is one finding and one deduction; the effort/impact
  heuristics behind the Issue Priority Matrix.
- Changed: reduced from 19 categories to a phase-based structure; the 2,770-line single-file
  layout was replaced with progressive disclosure; Figma, Korean-language, radar-chart and
  beginner-detection features were dropped.

### OneRedOak: Claude Code Workflows, `design-review`
- Source: <https://github.com/OneRedOak/claude-code-workflows>
- Licence: MIT, (c) 2025 Patrick Ellis.
- Used for: the phased review process (Phase 0 preparation through Phase 7 content and
  console); the 1440 / 768 / 375 viewport set; the "Problems Over Prescriptions" and
  "Evidence-Based Feedback" communication rules; opening a report with what works.
- Changed: the "Live Environment First" principle was inverted; this skill defaults to
  static analysis and treats a live browser as an enhancement, because Playwright is not
  always present. The Blocker/High/Medium/Nitpick triage was mapped onto the scored
  Blocker/Critical/Warning/Tip tiers so that triage and scoring cannot disagree.

### Anthropic: Knowledge Work Plugins, `design` plugin
- Source: <https://github.com/anthropics/knowledge-work-plugins>
  (`design/skills/design-critique`, `design/skills/accessibility-review`)
- Licence: Apache License 2.0.
- Used for: the critique framework (first impression, usability, visual hierarchy,
  consistency, accessibility); the practice of acknowledging what works; the POUR-organised
  WCAG quick reference as the skeleton of `references/wcag-checklist.md`.
- Changed: the WCAG reference was extended from 2.1 AA to 2.2 AA, adding SC 2.4.11 (Focus
  Not Obscured), SC 2.5.8 (Target Size Minimum) and SC 3.3.8 (Accessible Authentication).
  Findings were bound to the scoring model rather than left as free-form critique.

### Damola Akinleye: interface-design
- Source: <https://github.com/Dammyjay93/interface-design> (`reference/system-template.md`)
- Licence: MIT, (c) 2026 Damola Akinleye.
- Used for: the shape of a design-system lock file: direction, tokens, patterns, and a
  Decisions table carrying a rationale and a date for each choice, which
  `references/design-tokens.md` uses as the format for declaring intentional exceptions.
- Changed: adapted into a drift-detection contract consumed by `scripts/token_validator.py`,
  and extended to cover Tailwind theme keys alongside CSS custom properties.

### OneWave AI: Claude Skills, `accessibility-auditor`
- Source: <https://github.com/onewave-ai/claude-skills>
- Licence: MIT, (c) 2025 OneWave AI.
- Used for: the division of an audit skill into a short `SKILL.md` plus focused reference
  files, and the convention that each workflow step names the one reference to load at that
  point.
- Changed: structural pattern only. No checklist text was copied.

## Concepts only: no code or text taken

### borghei: Claude Skills, `engineering/design-auditor`
- Source: <https://github.com/borghei/Claude-Skills>
- Licence: **MIT + Commons Clause**. The Commons Clause restricts selling the software, so
  this skill deliberately takes **no code and no prose** from it.
- Ideas independently reimplemented here: reporting three separate grades (design,
  accessibility, and originality/consistency) instead of one average; weighting categories;
  gating CI on a script exit code; and the principle that accessibility findings are never
  assigned the lowest priority and that WCAG AA is a floor.
- Everything under `scripts/` in this skill was written from scratch. Its scripts were not
  read while implementing them.

## Original to this skill

- `references/content-layout.md`, the layout properties of long-form text (measure,
  comparison tables at narrow widths, anchor offsets under fixed chrome, space reserved for
  injected slots). No source surveyed covers this ground. Commercial and legal content rules
  are deliberately NOT here: they are not design conformance, and they are deliberately left to a dedicated review.
- `references/ai-slop-patterns.md`: written from scratch, for the reason given above.
- All five scripts under `scripts/`, including `rules_lint.py`, which enforces the
  registry's own invariants (unique IDs, a cited source on every rule, and the rule that no
  accessibility finding may carry `tip` severity).
- The rule ID scheme, the determinism rules, and the mode-detection contract.
- The split into `contract` and `floor` rule classes, which makes the project's own design
  definition the source of truth for drift while keeping WCAG unwaivable.
- The `candidate` verdict in `contrast_checker.py`: contrast pairs inferred from token names
  are advisory, never findings, because a name says a colour's role and not which background
  it actually lands on.

## Security note

The repositories listed above were cloned to a temporary directory and **read only**. No
script, installer or build step from any of them was executed at any point.
