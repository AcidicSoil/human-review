---
name: loa-review
description: Use when the user wants to review or compose a structured List of Actions, including assigning plugin or skill references to individual actions.
---

# LOA Review

Create a reviewable List of Actions artifact in the current turn from the user's query, an existing LOA JSON file, or both.

Run the workflow yourself. Do not ask the user to run a Human Review CLI command.

If the user supplied only a natural-language task, derive a concise ordered `loa.actions` list with stable action IDs and typed `snapIns` objects. It is valid to leave `snapIns` empty so the reviewer can compose them in the rail.

## Component catalog

Match the approved Component Rail prototype: the rail is populated before review with real installed plugin and nested skill refs. In Codex, omit `catalog` from newly-created LOA input and let the bundled Human Review runtime populate it automatically from Codex's installed/enabled plugin inventory.

Canonical skill refs use `skills://plugins/<plugin>/<skill>`. Plugin refs use the plugin name. Never invent a ref or replace a canonical ref with shorthand such as `plugin:skill`.

If the user explicitly supplies a `catalog`, preserve and use that catalog instead of replacing it. Outside Codex, when the host exposes plugin/skill inventory in runtime context, normalize that visible inventory into the same catalog shape before generation. Never invent entries. If an existing action contains a ref absent from the resulting catalog, preserve it and show it as unavailable.

For a new request, write input shaped like `{ "loa": { "actions": [] } }`; do not add an empty `catalog` merely to satisfy the generator.

Set `SKILLS_ROOT` to the parent directory of this skill directory, then generate:

```sh
node "$SKILLS_ROOT/human-review/human-review-loa.mjs" path/to/loa.json path/to/loa.loa.review.html
```

The bundled runner resolves the Codex catalog itself when `catalog` is absent. Open/return the self-contained artifact for review.

The review surface may add/edit/remove/reorder actions. Plugin cards are collapsible grouping headers, not add targets; reviewers attach individual nested skill refs to actions. Preserve any plugin-level refs already present in an imported LOA for compatibility, but do not create new plugin-level attachments from the rail. The artifact never installs or executes refs. Save reviewed HTML to preserve review state or Save clean LOA JSON for the canonical result.
