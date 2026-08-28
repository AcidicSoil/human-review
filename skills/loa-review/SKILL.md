---
name: loa-review
description: Use when the user wants to review or compose a structured List of Actions, including assigning plugin or skill references to individual actions.
---

# LOA Review

Create a reviewable List of Actions artifact in the current turn from the user's query, an existing LOA JSON file, or both.

Run the workflow yourself. Do not ask the user to run a Human Review CLI command.

If the user supplied only a natural-language task, derive a concise ordered `loa.actions` list. Use stable action IDs and typed `snapIns` objects. When plugin/skill inventory is visible in the current runtime, include only real refs from that inventory in `catalog`; never invent a plugin or skill ref. It is valid to leave `snapIns` empty.

If the user supplied LOA JSON, preserve its actions and refs unless the query explicitly asks for changes. Missing catalog refs must remain present and display as unavailable.

Write the canonical input as `{ "loa": { "actions": [] }, "catalog": [] }` when a source file does not already exist.

Set `SKILLS_ROOT` to the parent directory of this skill directory, then generate:

```sh
node "$SKILLS_ROOT/human-review/human-review-loa.mjs" path/to/loa.json path/to/loa.loa.review.html
```

The output path is optional. Open/return the self-contained artifact for review.

The review surface may add/edit/remove/reorder actions and attach multiple plugin/skill refs to each action. It never installs or executes those refs. Save reviewed HTML to preserve review state or Save clean LOA JSON for the canonical result.
