# aosf-design evals

Behavioural tests for the `ui-audit-consistency` skill, run with `claude plugin eval`.
Six cases: three that must fire the skill and three that must not.

| Case | Expectation |
| --- | --- |
| `trigger-token-drift` | skill fires; reports real drift with `DSG-` ids, spares compliant values |
| `trigger-contrast-floor` | skill fires; #94a3b8 on white is 2.56:1 and fails AA |
| `trigger-no-contract` | skill fires; says there is no contract and audits the floor only |
| `skip-write-component` | skill does not fire on a code-writing request |
| `skip-seo-audit` | skill does not fire on an SEO question |
| `skip-explain-wcag` | skill does not fire on a plain explanation request |

## Run

```bash
claude plugin eval plugins/aosf-design --runs 1 --no-publish --max-cost-usd 3
```

Every run is a real model call on your account: cases x runs x 2 arms (with and without the
plugin), plus the judge model for `llm` graders. Keep `--max-cost-usd` set. By default the
skill-fired graders are an indicator, not part of the score; the `skip-*` graders carry
`arm: both` so a skill that fires when it should not is scored in both arms.

The cases are deliberately not in CI: they cost money and vary run to run. Run them before a
release and when the skill `description` changes, because the description decides triggering.
