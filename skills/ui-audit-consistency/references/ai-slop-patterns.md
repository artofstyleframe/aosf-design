# Generated-mock tells

Used when judging a mock or a page that a model produced, which on this path is most of them.
This is not a moral question about using AI. It is a fidelity question: generated interfaces
converge on a small set of defaults, and a site built from those defaults looks like every
other site built from them.

Nothing here is a `blocker`. These are `warning` and `tip` findings under `DSG-CMP-02` and
`DSG-COL-01`, plus Observations for anything without a rule.

## Palette

- **Purple-to-blue gradient on the hero.** The single most reliable tell.
- **Seven or eight accent colours** where the contract declares one. A generated page tends
  to introduce a new colour per section rather than reuse.
- **Pure `#000` text on pure `#fff`.** Rarely chosen deliberately; almost always a default
  that survived.
- **Every state colour taken straight from a framework palette** — the same green, amber and
  red on every generated site in existence.

## Layout

- **Three feature cards**, always three, always equal weight, always an icon above a bold
  line above two lines of grey text.
- **Alternating left-right image sections** with no reason for the alternation.
- **A statistics band** of four numbers that nobody measured.
- **Everything centred.** Generated layouts centre by default; designed ones centre when
  centring says something.
- **Uniform spacing everywhere**, so grouping is carried entirely by borders. The opposite of
  `DSG-SPC-03`.

## Type

- **One weight doing all the work**, with size alone carrying hierarchy.
- **A scale with no ratio** — 14, 16, 18, 24, 32 picked individually rather than generated.
- **Headings that restate the section label** they sit above.

## Copy

- **Superlatives with no object**: "seamlessly", "powerful", "robust", "effortless".
- **Feature names that describe the mechanism** rather than the outcome, which is also
  `DSG-CNT-04`.
- **Placeholder copy that shipped**: lorem, "Your Company", "Feature One".

## Motion

- **Everything fades in on scroll**, at the same duration, with the same easing.
- **`transition: all`**, which is `DSG-MOT-04` and also a tell.

## How to report this

Not as a verdict. Name the pattern, say what it costs, and leave the decision:

> Three equal-weight feature cards with icon, bold line and two grey lines is the default
> shape of a generated section. Nothing here is broken, but the page currently reads as
> interchangeable with any other site built the same way — worth deciding whether that is
> acceptable for a brand whose subject is design.

A generated page is not wrong for being generated. It is worth flagging when the site's whole
proposition is that it looks like nobody else's.
