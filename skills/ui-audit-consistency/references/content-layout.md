# Content as layout (Phase 7)

Only the properties of text that are properties of the **layout**. Editorial quality, SEO and
commercial disclosure are out of scope: a design plugin has no business policing whether an
affiliate link is labelled.

## Measure and rhythm

Body measure between roughly 45 and 80 characters (`DSG-TYP-03`, WCAG 1.4.8 caps at 80). On a
blog this is the single highest-impact typographic decision, and it is usually wrong in one
of two ways: a container that never narrows on a wide screen, or a `max-width` in pixels that
stops tracking the font size.

`ch` units track the font. A measure set in `px` drifts the moment the type scale changes.

Vertical rhythm matters less than measure and is worth a finding only when the spacing
between blocks is visibly inconsistent, a paragraph gap larger than the gap to the heading
above it inverts the grouping (`DSG-SPC-03`).

## Comparison tables

The place a content site breaks at 375px (`DSG-CNT-01`). Three answers, in order of
preference:

1. **Restack** into cards, one per row, with the column name as a label.
2. **Scroll horizontally on purpose**, with a visible affordance and the first column pinned.
3. **Drop columns** at narrow widths, if the dropped ones are secondary.

What is not an answer: letting it overflow the viewport. That is `DSG-RSP-01` and
`DSG-A11Y-15` at once.

## Product frames

A product block is a component, so it obeys `DSG-CMP-01`: same tokens everywhere it appears.
The common drift is a round-up page where three of eleven frames were hand-tuned and now
carry their own padding and border colour.

Check the image slot has a reserved aspect ratio (`DSG-STA-02`). Product images arrive from
elsewhere at unpredictable sizes, and an unreserved slot shifts the whole page on load.

## Injected slots

Ad units, embeds, newsletter widgets. Each one needs its space reserved before it loads
(`DSG-STA-03`). This is the largest single cause of layout shift on content sites, and it is
entirely preventable: the slot's dimensions are known before the network call.

Note what is **not** in scope here: how many ads there are, where they sit relative to the
content, and whether they are labelled. Those are commercial questions.

## Anchor offsets

A heading that a fixed header covers when someone follows an anchor link is `DSG-CNT-02`, and
it is the same defect as WCAG 2.4.11 in a different costume: the thing you navigated to is
hidden behind chrome. `scroll-margin-top` on every heading that carries an id.

This bites hardest on long articles with a table of contents: exactly the pages where the
anchor links get used.

## Console

In live mode, collect console errors and triage them. Two cautions:

- A sandboxed or proxied environment produces certificate and network errors that are
  artefacts of the environment, not defects in the page. `ERR_CERT_AUTHORITY_INVALID` behind
  a corporate proxy is the obvious case.
- A console error is evidence of a problem, not the problem. Report what breaks for a user,
  and quote the error as the evidence.
