# Contract rules: `class: contract`

The source of truth for every rule here is **the project's own design contract**
(`tokens.json` plus `system.md`), not this plugin's taste. A violation means the built HTML
drifted from what was approved, not that a choice was wrong.

If the contract is silent on something, these rules **do not fire**. Report the silence once
under Observations and move on; inventing a default is how an audit starts arguing with a
design instead of verifying it.

`stage: design` on every row. `mode` says where the rule can actually be evaluated.

## Token adherence (`DSG-TOK`)

| id | severity | mode | rule | source |
| --- | --- | --- | --- | --- |
| DSG-TOK-01 | critical | static | Every colour literal in a stylesheet resolves to a colour token in the contract | contract; drift is unverifiable once a value is hardcoded |
| DSG-TOK-02 | warning | static | Every spacing value sits on the contract's spacing scale | contract |
| DSG-TOK-03 | warning | static | Every `font-size` sits on the contract's type scale | contract |
| DSG-TOK-04 | warning | static | Every `border-radius` comes from the contract's radius scale | contract |
| DSG-TOK-05 | warning | static | Every `box-shadow` comes from the contract's elevation set | contract |
| DSG-TOK-06 | warning | static | Every `z-index` comes from the contract's layer set | contract; ad-hoc z-index is how stacking becomes unpredictable |
| DSG-TOK-07 | warning | static | Transition duration and easing come from the contract's motion set | contract |
| DSG-TOK-08 | tip | static | A token declared in the contract and used nowhere is dead and should be retired or explained | contract hygiene |
| DSG-TOK-09 | critical | static | A token referenced in code but absent from the contract means the contract is out of date | contract |
| DSG-TOK-10 | warning | static | Every scale that departs from its documented default carries a Decisions row with a rationale and a date | Dammyjay93/interface-design, `system-template.md` |

## Typography (`DSG-TYP`)

| id | severity | mode | rule | source |
| --- | --- | --- | --- | --- |
| DSG-TYP-01 | warning | static | Font families are limited to those named in the contract | contract; `claude-rules/design-principles.md` caps at 2 |
| DSG-TYP-02 | warning | static | `line-height` values come from the contract, not per-component invention | contract |
| DSG-TYP-03 | warning | static | Body measure stays inside the contract's range | contract; WCAG 1.4.8 caps at 80 characters |
| DSG-TYP-04 | warning | static | Heading levels map onto type-scale steps in order; no level skips a step visually | contract; `type-scale-systems-modular-scale` (AOSF) |
| DSG-TYP-05 | tip | static | `font-variant-numeric: tabular-nums` where numbers are meant to be compared column-wise | Vercel Web Interface Guidelines, Content |
| DSG-TYP-06 | warning | judgement | Weight carries hierarchy the way the contract says; a heavier weight never substitutes for a scale step | contract |

## Spacing and layout (`DSG-SPC`)

| id | severity | mode | rule | source |
| --- | --- | --- | --- | --- |
| DSG-SPC-01 | warning | static | Grid and flex gaps come from the spacing scale | contract |
| DSG-SPC-02 | warning | static | Container widths come from the contract's layout set | contract |
| DSG-SPC-03 | warning | judgement | Space between related elements is smaller than space to unrelated ones | Gestalt proximity |
| DSG-SPC-04 | tip | judgement | Alignment is deliberate against a grid, baseline or edge, not incidental | Vercel Web Interface Guidelines, Layout |
| DSG-SPC-05 | warning | live | No unintended horizontal scrollbar at any audited viewport | Vercel Web Interface Guidelines, Layout |

## Colour as contract (`DSG-COL`)

Contrast itself is a floor rule; these are about *which* colour, not whether it is legible.

| id | severity | mode | rule | source |
| --- | --- | --- | --- | --- |
| DSG-COL-01 | warning | static | The rendered palette holds no more named colours than the contract declares | contract; `claude-rules/design-principles.md` names 5-8 |
| DSG-COL-02 | critical | static | A semantic token is used for its semantic role; the accent colour is not used as body text | contract |
| DSG-COL-03 | warning | static | Dark mode redefines every token the light theme declares, so none falls back silently | contract; `typography-for-dark-mode-ui` (AOSF) |
| DSG-COL-04 | warning | static | `color-scheme` is declared on `<html>` when a dark theme exists | Vercel Web Interface Guidelines, Theming |

## Component consistency (`DSG-CMP`)

| id | severity | mode | rule | source |
| --- | --- | --- | --- | --- |
| DSG-CMP-01 | critical | static | The same component renders with the same tokens on every page that uses it | contract |
| DSG-CMP-02 | warning | judgement | A one-off class that duplicates an existing component's visual role is drift, not a variant | contract |
| DSG-CMP-03 | warning | static | Nested radii are concentric: a child's radius never exceeds its parent's | Vercel Web Interface Guidelines, Design |
| DSG-CMP-04 | warning | judgement | The same word means the same thing in every component that shows it | Nielsen heuristic 4, consistency and standards |
