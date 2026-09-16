# docs/solutions

The repo's institutional memory: one Markdown file per bug postmortem or reusable
learning. Nothing loads these automatically. `AGENTS.md` tells agents (and people) to
`grep` here before touching an area and to write here after fixing something non-obvious.

## Frontmatter

```yaml
---
category: bug | learning | decision
tags: [lowercase, keywords, for, grep]
component: src/path/that/it/concerns, another/path
symptoms: "what you saw, in one quoted line"
root_cause: what was actually wrong, in one line
---
```

Then: **Problem → Root cause → Fix → Prevention**. Keep it to what a future reader needs
to avoid re-discovering the same thing. Copy `_template.md` to start.

## When to write one

- A bug whose cause was not what the symptom suggested.
- A review that found something real.
- A decision that constrains future work and isn't derivable from the code.

Not for: specs and plans (`docs/superpowers/`), how-tos (`docs/*.md`), or things git
history already explains.
