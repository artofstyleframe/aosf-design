# UI audit: art-of-styleframe

Real output from a run on 2026-09-21, kept as the worked example because a fabricated one
hides the awkward parts. Static plus live, homepage only.

## What works

- The palette is small and it holds up: every colour pair that actually occurs
  clears AA with room, `ink`/`paper` at 15.39:1 and `accent`/`canvas` at 4.66:1.
- Tailwind theme tokens are declared centrally in `tailwind.config.ts` rather than scattered,
  so there is a real contract to check against.
- No horizontal overflow at any of the three viewports.

## Run

| | |
| --- | --- |
| Mode | static + live (Playwright, axe-core) |
| Contract | `blogs/art-of-styleframe/tailwind.config.ts` + CSS custom properties (76 tokens) |
| Pages | `/` only, a partial surface, see the last section |
| Not evaluated | 15 judgement rules (unattended run) |

| Score | Value | Band |
| --- | --- | --- |
| Accessibility | 100 - (1x12) = 88/100 | B, contains a blocker |
| Consistency | 35.2% tokenised (1144 token uses, 2102 literals) | F |
| Design | not scored, only `/` was audited | - |

## Blockers

### DSG-CON-01: footer logotype fails AA, mobile only

**Where** `.aosf-footer-logo-mark > span` @ 375px, 4 nodes
-> `packages/shared/src/astro/react/Footer.tsx:137`

**Problem** The logotype renders each segment as live text coloured inline from data
(`style={{ color: seg.color }}`) rather than from a token. At 375px the type drops below the
large-text threshold, so the 4.5:1 bar applies instead of 3:1 and the wordmark becomes hard
to read for anyone with low vision. It passes at 1440 and 768, which is why nobody noticed.

**Evidence** axe `color-contrast`, 4 nodes, mobile viewport only.

**Direction** Either the segment colours become tokens with declared pairs, or the mark stops
being live text. Note that `Footer` is shared across sites, so the construction, not
necessarily the failure, exists everywhere it is reused.

## Warnings: drift

566 distinct findings, deduplicated by (rule, literal). The heaviest:

| Rule | Literal | Uses | Example |
| --- | --- | ---: | --- |
| DSG-TOK-01 | `#fff` | 178 | `src/components/SpacingScaleGenerator.astro:163` |
| DSG-TOK-01 | `#e5e7eb` | 19 | `src/components/react/StyleframeDetail.tsx:153` |
| DSG-TOK-01 | `rgba(0,0,0,0.3)` | 4 | `src/components/react/StyleframeDetail.tsx:165` |
| DSG-TOK-08 | 28 tokens declared, never used | - | `accent`, `color-primary`, `color-bg` |

White appearing 178 times as a literal is the single clearest drift signal on the site: it is
plainly a colour the contract should own.

## Observations

**Seven colours in SVG attributes were not counted.** Pinterest `#e60023`, LinkedIn
`#0a66c2`, Facebook `#1877f2`, Bluesky `#0085ff` and others sit in share-icon `fill`
attributes. A brand colour is fixed by its owner, so counting them as drift would be wrong.
They are reported here rather than dropped.

**Contrast pairs were inferred, so seven are candidates rather than findings.** The contract
declares no pairs, and AOSF has two backgrounds of opposite lightness (`canvas` `#0E0F12`,
`paper` `#F5F2EA`). Name-based pairing put dark text on the dark canvas and produced 1.07:1
"failures" for pairs that do not exist. Declaring pairs in the contract would turn these into
real checks.

**Three console errors were `ERR_CERT_AUTHORITY_INVALID`**, the sandbox proxy's CA, not a
defect in the page.

## Priority

| Finding | Effort | Impact |
| --- | ---: | ---: |
| DSG-CON-01 footer logotype | 3 | 9 |
| DSG-TOK-01 `#fff` -> token | 2 | 6 |
| Declare colour pairs in the contract | 2 | 7 |
| DSG-TOK-08 retire 28 dead tokens | 2 | 2 |

## Quick wins

- [ ] Promote `#fff` to a token; 178 call sites, mechanical
- [ ] Add a Pairs section to the contract so contrast stops being advisory
- [ ] Fix the footer logotype contrast, which also fixes it for seven other blogs

## What this audit could not see

- **Only `/` was audited.** Article, category, product and 404 templates are unmeasured, so
  the Design score is not reported at all rather than reported from a partial surface.
- **15 judgement rules were not evaluated**: hierarchy, grouping, microcopy and first
  impression all need somebody to look.
- **Hover, focus and dark-mode contrast are unmeasured, not passing.** axe reads the default
  rendered state.
- **Neither mode replaces user testing.** A page can pass all 79 rules and still confuse
  people.
