# WCAG 2.2 AA checklist (Phase 4)

Organised by POUR. Every entry names the `DSG-` rule that reports it, so a finding here and a
finding from the automated run carry the same identity.

**Automated tooling catches roughly a third of real accessibility defects.** The rest of this
list is the other two thirds. Running axe and stopping is how a site passes a scan and fails
a user.

## Perceivable

| SC | Requirement | Rule | How to check |
| --- | --- | --- | --- |
| 1.1.1 | Non-text content has a text alternative | `DSG-A11Y-01` | Every `<img>`: meaningful ones carry alt, decorative ones are hidden |
| 1.3.1 | Structure is conveyed programmatically | `DSG-A11Y-02`, `DSG-A11Y-06` | Headings descend without skipping; inputs have labels; tables have headers |
| 1.3.5 | Input purpose is identified | `DSG-INT-05` | `autocomplete` on name, email, address, payment fields |
| 1.4.1 | Colour is not the only cue | `DSG-CON-05` | Status, validity, required-ness each carry a second signal |
| 1.4.3 | Text contrast 4.5:1, large text 3:1 | `DSG-CON-01`, `DSG-CON-02` | Measured, not eyeballed; live mode is authoritative |
| 1.4.4 | Text resizes to 200% without loss | `DSG-A11Y-09`, `DSG-A11Y-16` | Zoom is not disabled; mobile inputs are >= 16px |
| 1.4.10 | Reflow at 320px, no two-axis scrolling | `DSG-A11Y-15`, `DSG-CNT-01` | Tables and wide media restack or scroll deliberately |
| 1.4.11 | Non-text contrast 3:1 | `DSG-CON-03`, `DSG-CON-04` | Control borders, focus rings, meaningful icons |
| 1.4.8 | Measure no wider than 80 characters | `DSG-TYP-03` | Body text only |

## Operable

| SC | Requirement | Rule | How to check |
| --- | --- | --- | --- |
| 2.1.1 | Everything works from the keyboard | `DSG-A11Y-04` | Tab the whole flow. No mouse. No exceptions |
| 2.1.2 | No keyboard trap | `DSG-A11Y-04` | Escape leaves every modal and menu |
| 2.2.2 | Long motion can be paused | `DSG-MOT-02` | Anything over 5s beside other content |
| 2.3.3 | Motion honours user preference | `DSG-MOT-01` | `prefers-reduced-motion` on every animation |
| 2.4.1 | A bypass mechanism exists | `DSG-A11Y-12` | Skip link reaches `<main>` and is focusable |
| 2.4.2 | The page is titled | `DSG-A11Y-14` | `<title>` describes the page and differs from the h1 |
| 2.4.3 | Focus order is meaningful | `DSG-A11Y-13` | Tab order matches reading order. Live only |
| 2.4.7 | Focus is visible | `DSG-A11Y-05` | Never `outline: none` without a replacement |
| 2.4.11 | Focus is not obscured | `DSG-A11Y-07`, `DSG-CNT-02` | Sticky headers do not cover the focused element |
| 2.5.8 | Targets are at least 24x24 | `DSG-A11Y-08` | Or spaced far enough apart to be equivalent |

## Understandable

| SC | Requirement | Rule | How to check |
| --- | --- | --- | --- |
| 3.1.1 | Page language is declared | `DSG-A11Y-11` | `lang` on `<html>`, and it is correct |
| 3.2.1 | Focus causes no surprise | `DSG-INT-06` | Nothing navigates or submits on focus |
| 3.3.1 | Errors are identified | `DSG-STA-06` | In text, next to the field, not only in colour |
| 3.3.2 | Labels and instructions exist | `DSG-A11Y-02` | Placeholder is not a label |
| 3.3.8 | Authentication needs no memory test | - | No transcription puzzle; paste is allowed (`DSG-INT-02`) |

## Robust

| SC | Requirement | Rule | How to check |
| --- | --- | --- | --- |
| 4.1.2 | Name, role, value for every control | `DSG-A11Y-03`, `DSG-A11Y-10` | Native elements first; ARIA only where native cannot |
| 4.1.3 | Status messages are announced | `DSG-STA-01` | `aria-live` polite on toasts and inline validation |

## The keyboard pass, in order

Automated tools cannot do this. Fifteen minutes, once per template:

1. Tab from the address bar. Does focus enter the page where you expect?
2. Is the skip link the first stop, and does it work?
3. Can you see focus at every single stop?
4. Does focus order follow the visual order, including inside cards and menus?
5. Open every modal, menu and drawer. Does Escape close it and return focus?
6. Activate every control with Enter, and buttons with Space.
7. Complete a form with an invalid value. Does focus move to the first error?
8. Tab to the very end. Did you get stuck anywhere?

## Three things axe cannot judge

- **Hover and focus colours.** axe measures the default rendered state. A hover colour at
  2.8:1 is unmeasured, not compliant.
- **Dark mode.** Same reason, unless the theme is driven explicitly.
- **Whether the alt text is any good.** `alt="image"` passes 1.1.1 automatically and fails
  the user completely.
