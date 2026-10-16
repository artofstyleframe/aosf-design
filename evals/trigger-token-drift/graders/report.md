---
type: llm
weight: 2
---

PASS if the reply reports the drifted values in card.css (at least the grey #6b7280, the
9px radius and the 15px padding) as differing from the contract in tokens.css, cites a rule
id with the DSG- prefix for them, and keeps the compliant uses (#f8fafc, #0f172a,
var(--c-text-muted)) out of the findings.
FAIL if the reply is a generic design opinion with no rule ids, invents a rule that does not
carry a DSG- id, or flags the values that already match a token as drift.
