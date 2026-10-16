---
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
tags: [trigger, drift]
---

Our design tokens live in tokens.css and our cards keep drifting from them. Can you audit
this for design token drift?

tokens.css:
```css
:root {
  --c-text: #0f172a;
  --c-text-muted: #64748b;
  --c-surface: #f8fafc;
  --radius-md: 10px;
  --sp-16: 16px;
}
```

card.css:
```css
.card { background: #f8fafc; color: #6b7280; border-radius: 9px; padding: 15px; }
.card h3 { color: #0f172a; margin: 0 0 7px; }
.card p { color: var(--c-text-muted); }
```
