# Floor rules: `class: floor`

The source of truth here is **WCAG 2.2 AA and a small set of universal anti-patterns**. No
design contract waives any of them. A contract may set the palette; it may not decide that
2.9:1 is legible.

Every row cites a success criterion or a named guideline. No accessibility rule carries
`tip` severity: AA is the floor, not the target.

`stage: design` on every row.

## Contrast (`DSG-CON`)

**SC 1.4.3 carries exceptions, and they are part of the rule.** A tool that reports
the ratio without them reports a violation the standard does not have:

- **Logotypes.** Text that is part of a logo or brand name has no contrast
  requirement. A wordmark drawn in brand colours is exempt, at every size.
- **Incidental text.** Decoration, text nobody is meant to read, text inside a
  picture that carries other significant content.
- **Disabled controls.** Inactive UI components are exempt.

Nothing in the DOM announces "this is our logo", so axe cannot apply the first one
and will flag a brand wordmark exactly like body text. `live_audit.mjs` holds such
findings back as `exemptCandidates` rather than dropping them: the exemption is a
judgement about what the element *is*, and only a human makes it. A class merely
named `logo-text` around real body text is still a finding.

| id | severity | mode | rule | source |
| --- | --- | --- | --- | --- |
| DSG-CON-01 | blocker | static | Body text against its background reaches 4.5:1, logotypes / incidental / disabled text excepted | WCAG 2.2 SC 1.4.3 |
| DSG-CON-02 | blocker | static | Large text (>=24px, or >=18.66px bold) reaches 3:1, same exceptions | WCAG 2.2 SC 1.4.3 |
| DSG-CON-03 | blocker | static | UI component boundaries and meaningful graphics reach 3:1 | WCAG 2.2 SC 1.4.11 |
| DSG-CON-04 | critical | static | The focus indicator reaches 3:1 against both the focused element and its surround | WCAG 2.2 SC 1.4.11 |
| DSG-CON-05 | warning | judgement | Meaning is never carried by colour alone; a second cue exists | WCAG 2.2 SC 1.4.1 |
| DSG-CON-06 | warning | live | Contrast holds in dark mode, which axe does not measure unless the theme is driven | WCAG 2.2 SC 1.4.3 |

## Accessibility (`DSG-A11Y`)

| id | severity | mode | rule | source |
| --- | --- | --- | --- | --- |
| DSG-A11Y-01 | blocker | static | Every meaningful image has alt text; decorative images are hidden from assistive tech | WCAG 2.2 SC 1.1.1 |
| DSG-A11Y-02 | blocker | static | Every form input has a programmatically associated label | WCAG 2.2 SC 1.3.1, 3.3.2 |
| DSG-A11Y-03 | blocker | static | Every icon-only control has an accessible name | WCAG 2.2 SC 4.1.2 |
| DSG-A11Y-04 | blocker | static | Interactive elements are reachable and operable by keyboard | WCAG 2.2 SC 2.1.1 |
| DSG-A11Y-05 | blocker | static | Focus is never removed without a visible replacement (`outline: none` alone) | WCAG 2.2 SC 2.4.7 |
| DSG-A11Y-06 | blocker | static | Heading levels descend without skipping, and the page has exactly one h1 | WCAG 2.2 SC 1.3.1 |
| DSG-A11Y-07 | blocker | live | A focused element is never fully hidden behind sticky or fixed chrome | WCAG 2.2 SC 2.4.11 |
| DSG-A11Y-08 | blocker | static | Interactive targets are at least 24x24 CSS px, or spaced to the same effect | WCAG 2.2 SC 2.5.8 |
| DSG-A11Y-09 | blocker | static | Browser zoom is not disabled (`user-scalable=no`, `maximum-scale=1`) | WCAG 2.2 SC 1.4.4 |
| DSG-A11Y-10 | critical | static | Native semantics are used before ARIA; `<div onClick>` is not a button or a link | WCAG 2.2 SC 4.1.2 |
| DSG-A11Y-11 | critical | static | Page language is declared on `<html>` | WCAG 2.2 SC 3.1.1 |
| DSG-A11Y-12 | critical | static | A skip link reaches the main landmark | WCAG 2.2 SC 2.4.1 |
| DSG-A11Y-13 | critical | live | Focus order follows the visual reading order | WCAG 2.2 SC 2.4.3 |
| DSG-A11Y-14 | critical | static | `<title>` describes the page and differs from the h1 | WCAG 2.2 SC 2.4.2 |
| DSG-A11Y-15 | critical | live | Content reflows at 320px wide without loss of function or two-axis scrolling | WCAG 2.2 SC 1.4.10 |
| DSG-A11Y-16 | critical | static | Mobile inputs use a font-size of at least 16px, so iOS does not zoom on focus | WCAG 2.2 SC 1.4.4, applied |
| DSG-A11Y-17 | critical | judgement | An author identity referenced by a page is actually emitted somewhere | WCAG 2.2 SC 4.1.2, applied to structured data |

## Motion (`DSG-MOT`)

| id | severity | mode | rule | source |
| --- | --- | --- | --- | --- |
| DSG-MOT-01 | blocker | static | Every animation honours `prefers-reduced-motion` | WCAG 2.2 SC 2.3.3 |
| DSG-MOT-02 | blocker | static | Motion running over 5 seconds beside other content can be paused, stopped or hidden | WCAG 2.2 SC 2.2.2 |
| DSG-MOT-03 | warning | static | Only compositor-friendly properties are animated (`transform`, `opacity`) | Vercel Web Interface Guidelines, Animation |
| DSG-MOT-04 | warning | static | `transition: all` is never used; properties are listed | Vercel Web Interface Guidelines, Animation |
| DSG-MOT-05 | warning | static | Layout properties (`top`, `left`, `width`, `height`) are not animated | Vercel Web Interface Guidelines, Animation |

## Interaction (`DSG-INT`)

| id | severity | mode | rule | source |
| --- | --- | --- | --- | --- |
| DSG-INT-01 | critical | static | Navigation uses `<a>`, so modifier-click and middle-click work | Vercel Web Interface Guidelines, Navigation |
| DSG-INT-02 | critical | static | Paste is never blocked in an input or textarea | Vercel Web Interface Guidelines, Forms |
| DSG-INT-03 | critical | judgement | Destructive actions are confirmed, or offer an undo window | Nielsen heuristic 3, user control and freedom |
| DSG-INT-04 | warning | static | Label and control share one hit target; checkboxes and radios have no dead zone | Vercel Web Interface Guidelines, Forms |
| DSG-INT-05 | warning | static | Inputs declare `autocomplete`, and the right `type` and `inputmode` | WCAG 2.2 SC 1.3.5 |
| DSG-INT-06 | warning | judgement | Anything that looks clickable is clickable | Nielsen heuristic 6, recognition over recall |
| DSG-INT-07 | warning | static | Modals and drawers set `overscroll-behavior: contain` | Vercel Web Interface Guidelines, Touch |

## Responsiveness (`DSG-RSP`)

| id | severity | mode | rule | source |
| --- | --- | --- | --- | --- |
| DSG-RSP-01 | critical | live | Layout holds at 1440, 768 and 375 with no overlap and no clipping | OneRedOak design-review, Phase 2 |
| DSG-RSP-02 | warning | static | Safe areas are respected (`env(safe-area-inset-*)`) where fixed chrome touches an edge | Vercel Web Interface Guidelines, Layout |
| DSG-RSP-03 | warning | static | Flex children that must truncate carry `min-width: 0` | Vercel Web Interface Guidelines, Content Handling |
| DSG-RSP-04 | warning | static | Text containers handle long strings (truncate, clamp, or break) | Vercel Web Interface Guidelines, Content Handling |

## States (`DSG-STA`)

| id | severity | mode | rule | source |
| --- | --- | --- | --- | --- |
| DSG-STA-01 | critical | judgement | Empty, loading and error states are designed, not left to render as nothing | Nielsen heuristic 1, visibility of system status |
| DSG-STA-02 | critical | static | Images and media carry explicit dimensions or an aspect ratio, so nothing shifts on load | WCAG 2.2 SC 1.4.10, applied; CLS |
| DSG-STA-03 | critical | static | Injected slots (ads, embeds) reserve their space before they load | same |
| DSG-STA-04 | warning | judgement | Skeletons mirror the shape of the content they stand in for | Vercel Web Interface Guidelines, Content |
| DSG-STA-05 | warning | judgement | The layout survives content that is far shorter and far longer than the sample | Vercel Web Interface Guidelines, Content |
| DSG-STA-06 | warning | judgement | Every error message names the fix, not only the failure | Nielsen heuristic 9, help users recover from errors |

## Content as layout (`DSG-CNT`)

Only the properties of text that are properties of the *layout*. Editorial quality, SEO and
commercial disclosure are out of scope for this plugin.

| id | severity | mode | rule | source |
| --- | --- | --- | --- | --- |
| DSG-CNT-01 | warning | static | Comparison tables stay readable at 375px, by scrolling deliberately or restacking | WCAG 2.2 SC 1.4.10 |
| DSG-CNT-02 | warning | static | Headings carry `scroll-margin-top` when fixed chrome would otherwise cover them on anchor jump | WCAG 2.2 SC 2.4.11, applied |
| DSG-CNT-03 | tip | judgement | Long-form text avoids widows and orphans in headings (`text-wrap: balance`) | Vercel Web Interface Guidelines, Content |
| DSG-CNT-04 | warning | judgement | Every button label names its action rather than its mechanism | Nielsen heuristic 2, match with the real world |
