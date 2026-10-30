---
name: loa-review
description: Use when the user wants to review or compose a structured List of Actions, including assigning plugin or skill references to individual actions.
---

# LOA Review

Create a reviewable List of Actions artifact in the current turn from the user's query, an existing LOA JSON file, or both.

Run the workflow yourself. Do not ask the user to run a Human Review CLI command.

If the user supplied only a natural-language task, derive a concise ordered `loa.actions` list with stable action IDs and typed `snapIns` objects. It is valid to leave `snapIns` empty so the reviewer can compose them in the rail.

## Optional resource sources and action tree

Use the action-first LOA workbench: the left tree navigates phases and parent-child actions, the central panel edits and reorders actions, and the right inspector shows a user-selected resource type. Resources are **optional**. Supported types: Plugins (legacy `catalog`), standalone Skills, legacy Skill collections, Sources, Workflows, or None. Explicit `resourceSources` contains `{id,kind:"skills",displayName,skills:[{ref,displayName}]}` or `{id,kind:"skill-set",displayName,groups:[{id,displayName,skills:[{ref,displayName}]}]}`. These entries are supplied as data, never discovered from unspecified filesystem roots. The selected collection is one named source, not an implicit workflow. No implicit grouping is invented.

A root action may declare `phase`; a child may declare `parentId` referencing an existing action ID. Maintain those references when editing and reordering, reject cycles and missing parents, and preserve legacy flat actions. Never infer action hierarchy from prose.

For legacy plugin-only input, **omit `catalog` and `resourceSources`** to retain installed/enabled plugin discovery. If `resourceSources` or `resourceManifest` is supplied without `catalog`, use an empty plugin catalog. If the task requests no resources, explicitly supply empty `catalog: []` and `resourceSources: []` arrays.

For mixed packages use `resourceManifest` with format
`human-review.resources/v1`: `sources:[{id,kind,displayName,refs}]`,
`capabilities:[{ref,kind,displayName,invocation?,availability?}]`,
optional `relationships:[{type,from,to}]`, and
`workflows:[{id,displayName,steps:[{ref,after?}]}]`. Sources identify
distribution; capabilities identify actual skills, agents, commands, rules,
MCP integrations or hooks. Workflow steps are explicit, never inferred from
folder structure. Provide only user-specified or source-verified refs.
An individual skill can cover a full development lifecycle without becoming
a workflow. The inspector can attach an entire source, a selected subset,
or individual resources, and never executes them.

Canonical skill refs use `skills://plugins/<plugin>/<skill>`. Plugin refs use the plugin name. Never invent a ref or replace a canonical ref with shorthand such as `plugin:skill`.

If the user explicitly supplies `catalog` or `resourceSources`, preserve the supplied values. Never invent source entries or substitute plugin skills for standalone skills. Source selection filters visibility only; attached references remain valid if present in **any** embedded resource source. Show a ref as unavailable when missing from every embedded source or explicitly marked unavailable.

For a new request, write input shaped like `{ "loa": { "actions": [] } }`; do not add an empty `catalog` merely to satisfy the generator.

Set `SKILLS_ROOT` to the parent directory of this skill directory, then generate:

```sh
node "$SKILLS_ROOT/human-review/human-review-loa.mjs" path/to/loa.json path/to/loa.loa.review.html
```

The bundled runner resolves the Codex plugin catalog only when `catalog`, `resourceSources`, and `resourceManifest` are all absent. Open/return the self-contained artifact for review.

When a local `human-review` session is available, prefer the live agent feedback loop:
generate with `--no-open`, then run `human-review path/to/loa.loa.review.html` and
`human-review poll path/to/loa.loa.review.html`. The reviewer edits actions,
attaches skills, and comments on action cards, then clicks **Send**. Apply the
received `pages[].structured_review.document` as canonical LOA data, with
attached comments and the overall note. Poll again with `--ack` after
applying. Never assume the snapshot is already written to the source JSON.

If the host lacks the live server or execution access, return/open the
standalone HTML editor. Its reviewed HTML and clean LOA JSON exports remain
available without a network connection.

The review surface may add/edit/remove/reorder actions. Plugin cards are collapsible grouping headers, not add targets; reviewers attach individual nested skill refs to actions. Preserve any plugin-level refs already present in an imported LOA for compatibility, but do not create new plugin-level attachments from the rail. The artifact never installs or executes refs. Save reviewed HTML to preserve review state or Save clean LOA JSON for the canonical result.
