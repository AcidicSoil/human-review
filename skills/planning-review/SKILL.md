---
name: planning-review
description: Use when the user wants to review a plan, spec, PRD, roadmap, or implementation proposal as an editable Human Review artifact.
---

# Planning Review

Create the editable planning artifact in the current turn. Do not send the user to a CLI command they must run themselves.

Run the workflow yourself. Do not ask the user to run a Human Review CLI command.

Resolve the planning source from the user's query and current context. If the user supplied planning text instead of a file, write that text to a temporary Markdown source first.

Set `SKILLS_ROOT` to the parent directory of this skill directory. The shared Human Review runtime is bundled under `human-review`.

Generate the artifact:

```sh
node "$SKILLS_ROOT/human-review/human-review-plan.mjs" path/to/plan.md path/to/plan.review.html
```

The output path is optional. Keep the artifact self-contained and offline-capable.

When the local `human-review` command is available, generate with
`--no-open`, then run `human-review path/to/plan.review.html` and
`human-review poll path/to/plan.review.html`. The agent receives
`pages[].structured_review.document` with the complete Plate or fallback
planning state, alongside comments and the overall note. Apply direct
edits before unresolved discussions and section actions. Poll with
`--ack` only after applying the batch. If no live server exists,
return the self-contained file and retain offline exports.

Return/open the generated review artifact so the user can edit content, add discussions, mark sections for Revise/Expand/Touch up/Remove/Verify, save reviewed HTML, or export a clean PRD.

When a reviewed artifact comes back, treat its embedded review state as the instruction set. Apply direct edits first, then unresolved discussions, then section actions; write the result back to the canonical planning source when known.
