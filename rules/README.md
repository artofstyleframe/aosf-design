# Rule registry: `aosf-design`

This directory is the single source of truth for what this plugin can report. A finding the
skill cannot trace to a rule here is not a finding; it goes in the report's Observations
section and scores nothing.

## Why the rules live inside the plugin

The plugin is standalone: it declares no dependency on any other plugin and works installed
alone. The rule registry travels with it, so a finding always traces to a file that is
present on the machine running the audit.

The same standard produces a *different test* at each stage of a build, because each stage
has a different artefact in front of it. This plugin covers the first stage:

| Stage | Artefact | WCAG 1.4.3 becomes |
| --- | --- | --- |
| design contract (this plugin) | the token contract, before any code | does the `--fg` / `--bg` pair resolve to 4.5:1? |
| built markup | rendered markup against that contract | does the class actually used on the page fall below the floor? |
| review of a change | the diff in a pull request | does this PR add a violation that was not there before? |

What is shared across stages is the source of the norm, not the test.

## Composition, without a dependency

Rules are laid out so that reports from related tools can compose. Discovery is optional
and never a precondition: when no sibling rules are found, the plugin behaves exactly as if
it were alone.

- Same path relative to the plugin root: `rules/`.
- Same entry format (below).
- A distinct ID prefix per tool, so nothing collides: `DSG-` here.

## Entry format

Every rule is a row carrying these fields:

| Field | Meaning |
| --- | --- |
| `id` | `DSG-<DOMAIN>-<NN>`. Stable forever. Retired rules stay listed as retired, never renumbered or reused. |
| `class` | `contract` or `floor`: see below. |
| `severity` | `blocker` / `critical` / `warning` / `tip`. |
| `source` | A WCAG success criterion, a named heuristic, or a cited guideline. **No rule may have an empty source.** |
| `mode` | `static`, `live`, or `judgement`, where the rule can actually be evaluated. |
| `stage` | `design` for every rule in this plugin. |
| `supersedes` | Optional. The later-stage rule that subsumes this one when plugins compose. |

## The two rule classes

This is the distinction the whole plugin turns on.

**`contract`**: the source of truth is the project's own design definition (`tokens.json`,
`system.md`). The skill has no opinion of its own about a spacing base or a palette; it asks
the contract. If the contract says a 4px base, then 4px is correct and 6px is drift. A
project that documents its choice cannot be in violation of someone else's default.

**`floor`**: the source of truth is WCAG 2.2 AA and a small set of universal anti-patterns.
No contract can waive these. A design contract may set the palette; it may not decide that
2.9:1 is legible.

Accessibility rules are never `tip`. WCAG AA is a floor, not a target.

## Severity: what separates blocker from critical

Citability, not how bad it feels. If you can write a specific WCAG success criterion or a
legal clause next to the finding, it is a `blocker`. If it is a usability or quality
judgement, it is `critical`. When you cannot write the clause, it is not a blocker.

## Scope this plugin deliberately does not cover

- **Commercial and legal content rules**: affiliate disclosure, ad-to-content balance,
  `rel="sponsored"`. These are not design conformance, and a design plugin has no business
  policing them. Use a dedicated review for those.
- **Performance as a measured metric**: LCP, CLS as numbers. These need a measurement run,
  not a reading of source. Layout properties that *cause* shift (an image without
  dimensions, an ad slot without reserved space) are in scope; the resulting score is not.
