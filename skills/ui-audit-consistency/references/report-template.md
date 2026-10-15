# Report template

Fill the sections in this order. The order is the point: a reader who opens on thirty
problems stops reading before the important one.

```markdown
# UI audit: <what was audited>

## What works
- <two to four genuine observations, specific enough to be wrong>

## Run
| | |
| --- | --- |
| Mode | static / live / both |
| Contract | <file that won, or "none found -- floor rules only"> |
| Pages | <the frozen surface, listed> |
| Not evaluated | <n> rules (<n> live-only, <n> judgement) |

| Score | Value | Band |
| --- | --- | --- |
| Design | 100 - (0x12) - (2x8) - (5x4) - (1x1) = 63/100 | D |
| Accessibility | 100 - (1x12) - (1x8) = 80/100 | B, contains a blocker |
| Consistency | 35.2% tokenised | F |

## Blockers
### DSG-CON-01 -- footer logotype fails AA at 375px
**Where** `.aosf-footer-logo-mark > span` @ mobile, 4 nodes
  -> `packages/shared/src/astro/react/Footer.tsx:137`
**Problem** The logotype segments take their colour inline from data rather than from a
token, so at mobile the smaller type falls under the 4.5:1 threshold and the wordmark
becomes hard to read for anyone with low vision. It passes at 1440 and 768, which is why
nobody has noticed.
**Evidence** axe `color-contrast`, 4 nodes, mobile only.
**Direction** The segment colours need to be tokens with declared pairs, or the mark needs
to stop being live text.

## Critical
<same shape>

## Warnings
<grouped; one root cause is one entry with a count>

## Tips
<one line each>

## Observations
<defects with no rule, and contract silences. These score nothing, by design.>

## Priority
| Finding | Effort | Impact |
| --- | ---: | ---: |
| DSG-CON-01 footer logotype | 3 | 9 |

## Quick wins
- [ ] <effort <= 3 and impact >= 6>

## What this audit could not see
<the live-only rules in a static run, judgement rules in an unattended one, and the standing
limits from SKILL.md>
```

## Rules for filling it

**Every finding needs a location.** `file:line` in static mode, `selector @ viewport` in
live. A live selector on a prefixed site will not grep — strip the class prefix and resolve
it to a file before writing the finding. A finding nobody can locate is half a finding.

**Problem before direction, always.** Describe what goes wrong for a person. One line of
direction afterwards, and only if the fix is not obvious.

**No evidence, no finding.** Move it to Observations.

**One root cause, one entry**, with a count and up to five locations.

**Say what you did not check.** The last section is not an apology, it is the thing that
makes the rest of the numbers honest.
