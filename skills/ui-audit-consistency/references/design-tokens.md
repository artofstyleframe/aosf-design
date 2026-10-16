# Design tokens: the contract, and how drift is measured

## The contract file

The contract is what makes this skill a verifier rather than a critic. Its format follows
the lock-file pattern: direction, tokens, patterns, and the part that matters most:
**decisions with a rationale and a date**.

```markdown
# Design System

## Direction
Personality: Precision & Density
Foundation:  cool
Depth:       borders-only

## Tokens
### Spacing
Base:  4px
Scale: 4, 8, 12, 16, 24, 32, 64

### Colours
--fg:      #1A1B1E
--bg:      #F5F2EA
--accent:  #D94F2E

### Pairs
--fg on --bg
--accent on --bg

## Decisions
| Decision | Rationale | Date |
| --- | --- | --- |
| 4px spacing base | Dense data tables; 8px forced two-line rows | 2026-09-14 |
| Borders-only depth | Shadows add weight without information here | 2026-09-14 |
```

**The Decisions table is not documentation, it is the defence.** Without it, a 4px base and
a stray 6px value look identical to an auditor: both are "not the default". With it, one is
a decision and the other is drift.

**The Pairs section is what makes contrast authoritative.** A token name says a colour's
role, never which background it lands on. A palette with a light and a dark surface makes
name-based guessing worthless: pair a dark text token with the dark canvas and you get
1.1:1 and a finding that describes nothing. Declare the pairs that exist and
`contrast_checker.mjs` stops guessing.

## Extraction

```bash
node scripts/token_extractor.mjs --root . --format json > tokens.extracted.json
```

Reads CSS custom properties, Tailwind v4 `@theme` blocks and `tailwind.config.*` theme keys,
and groups by the **shape of the value**, not its name: a token called `--brand` holding
`#1f6feb` is a colour whatever the author meant.

First declaration wins. A later one is usually a theme override, and recording both under one
name would make the contract ambiguous.

## Drift

```bash
node scripts/token_validator.mjs --tokens tokens.extracted.json --root src
```

Compliance is `tokenised / (tokenised + literal)`. Two things are deliberately kept out of
that denominator, because putting them in produces a number nobody trusts:

**Benign literals.** `0`, `100%`, `auto`, a 1px hairline. No design system tokenises these.

**Colours in SVG presentation attributes.** These are usually third-party brand marks:
Pinterest `#e60023`, LinkedIn `#0a66c2`, Facebook `#1877f2`. A brand colour is fixed by its
owner, not by your contract, so calling it drift is simply wrong. They are counted and
reported as a note, never silently dropped; `--include-svg` folds them back in.

## Declared exceptions

Some literals are not drift: a brand colour owned by someone else, or the sample palette a
colour tool shows its reader. Declare them in the contract instead of arguing with the
validator. `system.md` takes an `## Exceptions` table:

```
| kind | scope | rationale | date |
| --- | --- | --- | --- |
| literal | #e60023 | Pinterest brand colour, fixed by its owner | 2026-10-16 |
| file | src/pages/tools/color-palette-generator.astro | sample palettes the tool displays | 2026-10-16 |
```

A `literal` row exempts that exact value anywhere. A `file` row exempts the colour and type
literals (DSG-TOK-01, DSG-TOK-03) in that file, because seed data is content, not styling.
Every exempted use is counted and listed under `declaredExceptions` in the JSON output, never
silently dropped, so a reader can see how much of the score rests on declarations.

## Dead tokens, and the trap in detecting them

`DSG-TOK-08` reports a token declared and never used. Detecting that naively, by counting
`var()` references, marks **every Tailwind theme token dead**, because those are used as
utility classes (`text-accent`) and never through `var()`. The validator scans for utility
usage before calling any of them dead.

This is worth knowing beyond this one check: a rule that looks for the wrong usage mechanism
reports a hundred false findings and looks authoritative doing it.

## What drift is not

A value that differs from the contract **where the contract is silent** is not drift. It is
an undocumented decision. Report it under Observations, and offer to add it to the contract.
Drift means departing from something that was actually agreed.
