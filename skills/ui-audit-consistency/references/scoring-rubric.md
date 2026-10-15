# Scoring rubric

## The formula

```
score = max(0, 100 - 12*blockers - 8*criticals - 4*warnings - 1*tips)
```

## Bands

| Band | Score | What it means |
| --- | --- | --- |
| A | 90-100 | Ship it |
| B | 80-89 | Ship it, with a follow-up list |
| C | 70-79 | Real gaps; fix before it grows |
| D | 60-69 | Systemic drift or a floor failure |
| F | below 60 | Do not ship: something here is a blocker or the drift is total |

## Three scores, never one

| Score | Built from | Why separate |
| --- | --- | --- |
| Design | contract rules outside `DSG-TOK-*` | Layout and hierarchy quality |
| Accessibility | every `floor` rule | Averaging this away is how an inaccessible site scores a B |
| Consistency | `token_validator.py` compliance %, not deductions | A percentage answers a different question than a deduction |

Consistency is a ratio, not a penalty total, because "how much of this is tokenised" and
"how many defects are there" are different measurements and mixing them yields a number with
no interpretation.

If any Blocker exists, print a warning beside the Accessibility score regardless of the band.
A 91 with one blocker is not an A.

## Show the arithmetic

Always:

```
Design:        100 - (0x12) - (2x8) - (5x4) - (1x1) = 63/100  (D)
Accessibility: 100 - (1x12) - (1x8)                  = 80/100  (B, contains a blocker)
Consistency:   35.2% tokenised                                 (F)
```

A reader who cannot reconstruct the number will not trust it, and a reader who cannot
compare it to last month's has no use for it.

## Counting rules

**One root cause, one deduction.** The same defect in forty product cards is one finding with
a count of forty and one deduction. List up to five locations. The exception is when each
instance needs a different fix: then they are different findings.

Without this rule the arithmetic is worthless: one missing `aria-label` in a shared card
component drives every page in the site to zero, and the report is unreadable at exactly the
moment it matters most.

**Not evaluated is not passed.** A rule whose mode is `live` in a static run is `not
evaluated`. It contributes nothing to any score, and the header says how many there were. A
check that did not run must never read like a check that found nothing.

**Judgement rules need a human.** A rule with `mode: judgement` may only be scored when
somebody actually looked. If the run was unattended, list them as `not evaluated` too.

## Effort and impact, for the priority matrix

Effort: 1-2 a single value - 3-4 one component - 5-6 multi-component - 7-9 architectural.

Impact: 9-10 breaks accessibility or core usability - 6-8 degrades the experience -
3-5 polish - 1-2 cosmetic.

Quick wins are effort <= 3 and impact >= 6. Lead the follow-up list with them: a report whose
first item is a three-week refactor gets closed.
