---
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
tags: [trigger, no-contract]
---

Run a UI consistency audit on this page. There is no design system, no tokens file and no
style guide, only this:

```html
<button style="font-size:11px;color:#999;background:#fff">Go</button>
<a href="/x" style="color:#bbb">read more</a>
```
