# Methodology

## The audit answers one question

*Did the build stay faithful to the design that was agreed, and does it clear the floor
anyway?*

Not "is this design good". A design judgement belongs to a person looking at the work. This
skill checks fidelity and legality, and it is useful precisely because it refuses to do more.

## Picking the surface

A content site has five templates and five hundred pages. Auditing every page produces a
number nobody can act on and a score that changes every time an article is published.

Audit **one page per template**:

| Template | Why it earns a slot |
| --- | --- |
| Home | The only page with the full component inventory |
| Article | Where measure, rhythm and long-form typography live |
| Category / index | Card grids, pagination, empty state |
| Product / round-up | Tables, comparison layouts, dense data |
| 404 | The state everyone designs last and ships broken |

Pick the page with the **most components**, not the newest one. Then write the list in the
report. The surface is part of the score, and a score whose surface is undocumented cannot be
compared with last month's.

## Static first, live second

Static analysis is the default because it always runs, costs nothing and points at a line of
source. It is also blind to everything that only exists once a browser has resolved the
cascade and laid out the page.

Run live when you can, and read the two as complementary rather than redundant:

| Question | Static | Live |
| --- | --- | --- |
| Is this colour a token? | yes | no |
| Does this text clear 4.5:1 as rendered? | only if the value resolves | yes |
| Does the page scroll sideways at 375px? | guesses from fixed widths | yes |
| Is the focus order sane? | no | yes |
| Which file do I edit? | yes | no, gives a selector |

**The live audit gives a selector, not a file.** On a site with a class prefix the selector
will not even grep: `.aosf-footer-logo-mark` is built from `${px}footer-logo-mark` in
source. Strip the prefix before searching, and say in the finding which file the selector
resolves to once you have found it. A finding nobody can locate is half a finding.

## Order of phases, and why it is that order

1. **Interactions** first, because a control nobody can reach makes every later question
   about it moot.
2. **Responsiveness** before visual polish, because a layout that breaks at 375px is not a
   spacing problem.
3. **Visual fidelity** next: this is where drift lives.
4. **Floor** in the middle, not last, so that a run cut short still produced the findings
   that block a release.
5. **States** after, because they need the rest understood.
6. **Drift measurement** late: the percentage is cheap once the tokens are extracted.
7. **Content and console** last, cheapest, most easily deferred.

## When there is no contract

Say so in the header, audit the floor, and offer to generate a contract from what the code
already does. Do not substitute defaults. An 8pt rule applied to a project that chose 4px
produces hundreds of findings, every one of them wrong, and it teaches the reader to ignore
the tool.

## Two runs must agree

Before trusting any number, run the scripts twice on the same commit and compare. If the
score moves, something is non-deterministic: usually an unfrozen surface or a finding
counted per instance instead of per root cause. Fix that before reporting anything.
