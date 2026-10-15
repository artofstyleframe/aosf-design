# Heuristics: the rules a script cannot run

Every rule with `mode: judgement` lives here. These need somebody to look. They are in the
registry anyway, because "a human has to decide this" is a better answer than silence — and
because an unattended run must be able to mark them `not evaluated` rather than passed.

## First impression, two seconds

Before any checklist. Open the page, look away, look back:

- What does the eye land on first? Is that the thing that should be first?
- Is the purpose of the page obvious without reading?
- What is the second thing? Is the path from first to second the path you intended?

No script has this question, and it catches hierarchy failures that pass every measurable
rule. A page can have a perfect type scale and still lead with its cookie banner.

## Nielsen's heuristics, kept to the ones that bite on content sites

| # | Heuristic | Where it shows up here | Rule |
| --- | --- | --- | --- |
| 1 | Visibility of system status | Loading, empty and error states exist and say something | `DSG-STA-01` |
| 2 | Match with the real world | Button labels name the action, not the mechanism | `DSG-CNT-04` |
| 3 | User control and freedom | Destructive actions confirm or offer undo | `DSG-INT-03` |
| 4 | Consistency and standards | The same word means the same thing everywhere | `DSG-CMP-04` |
| 6 | Recognition over recall | Anything that looks clickable is clickable | `DSG-INT-06` |
| 9 | Recover from errors | The message names the fix, not only the failure | `DSG-STA-06` |

Heuristics 5, 7, 8 and 10 (error prevention, flexibility, minimalism, help) matter, but on a
content site they rarely produce a finding a reader can act on. Judge them; report them under
Observations unless something is genuinely wrong.

## Gestalt, which is really about spacing

- **Proximity** does more work than any border. If related things sit further apart than
  unrelated ones, no amount of styling fixes the confusion (`DSG-SPC-03`).
- **Similarity**: things that look alike are assumed to behave alike. A non-clickable card
  styled like a clickable one is a bug, not a style.
- **Common region**: a shared background groups more strongly than alignment.
- **Continuity**: the eye follows a line. A broken column edge reads as a mistake even when
  the spacing is correct.

The practical test for proximity: measure the gap inside a group and the gap between groups.
If the second is not clearly larger, the grouping is being carried by something weaker than
it should be.

## Two laws worth the space

**Hick's law** — decision time grows with the number of options. A round-up page with
fourteen equally weighted products is slower to use than one with three recommended and
eleven listed. This is a design decision, not a defect, but it is worth naming.

**Fitts's law** — a target's cost is its distance over its size. This is the reasoning behind
`DSG-A11Y-08`, and it is also why the primary action should not be the smallest thing on the
page.

## Problems, not prescriptions

The house style for every judgement finding. Describe what goes wrong for a person, and let
the reader pick the fix.

> The gap between the price and the buy button is tighter than the gap to the next card, so
> the button reads as belonging to the wrong product.

not

> Set `margin-bottom: 16px`.

The second is faster to write and worse in every other way: it assumes a cause, hides the
symptom, and stops the reader thinking at the moment they know more than you do about their
own codebase.

## Evidence

Every judgement finding needs a screenshot or a quoted line. Without one it is an opinion,
and an opinion in a numbered report borrows authority it has not earned. No evidence,
Observations section.
