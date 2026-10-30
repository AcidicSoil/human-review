# LOA resource sources and action tree

Status: Implemented and verified
Date: 2026-10-29
Scope: LOA artifacts only. Ordinary DOM and Planning review editors stay unchanged.

## Intent

Plugins are an optional resource type rather than the fixed identity of the inspector. A reviewer can choose plugin skills, explicitly declared standalone skills, one explicit skill collection, a package source, an explicit workflow, or no inspector. LOA actions may be organized in a real tree using declared phase and parent references. No resource roots are discovered implicitly for new resource types.

## Input contract

Legacy `{ "loa": { "actions": [...] }, "catalog": [...] }` remains valid. The optional `resourceSources` array adds non-plugin skills without modifying canonical plugin refs or the `snapIns` shape.

```json
{
  "loa": {
    "actions": [
      { "id": "plan", "phase": "Planning", "content": "Plan", "snapIns": [] },
      { "id": "design", "parentId": "plan", "content": "Design", "snapIns": [] }
    ]
  },
  "catalog": [],
  "resourceSources": [
    {
      "id": "project",
      "kind": "skills",
      "displayName": "Project skills",
      "skills": [{ "ref": "example://skill/check", "displayName": "Check" }]
    },
    {
      "id": "delivery",
      "kind": "skill-set",
      "displayName": "Delivery lifecycle",
      "groups": [
        {
          "id": "planning",
          "displayName": "Planning",
          "skills": [{ "ref": "example://set/plan", "displayName": "Plan" }]
        }
      ]
    }
  ]
}
```

The `example://` references above are placeholders for explicitly supplied references, not discovered resources or installed capabilities.

- `catalog` is the legacy plugin catalog. If both `catalog` and `resourceSources` are omitted, the existing plugin-discovery behavior remains available, unless `resourceManifest` is provided. If `resourceSources` or `resourceManifest` is supplied and `catalog` omitted, `catalog` defaults to an empty array; no plugin discovery occurs.
- `resourceSources[].kind` is `skills` (direct `skills[]`) or `skill-set` (named `groups[]`, each containing `skills[]`). Every source and group has a unique nonempty ID within its scope. Skills have nonempty refs and display names and are treated as `kind: "skill"` attachments.
- Resource sources are explicit embedded data. The LOA browser runtime never reads arbitrary directories or invokes a skill or plugin. Legacy collection groups are provided by the input; the UI never invents lifecycle stages.
- A source selector switches among available `Sources`, `Plugins`, `Skills`, `Skill collections`, `Workflows`, and `None` options. A second selector chooses **one** named source or workflow. Its selection is saved to reviewed HTML as UI state but does not alter canonical action attachments.
- The clean JSON export includes `resourceSources` when present; legacy JSON remains `{ loa, catalog }`. Live agent feedback includes the same canonical fields. Catalog entries remain embedded when other sources are selected; availability is determined across all embedded sources, not just the active view.

## Tree contract

`loa.actions[]` remains the flat ordered canonical array. `phase?: string` and `parentId?: string` are optional metadata on each action.

- A root action's explicit `phase` names its phase; otherwise it appears under **Actions**.
- A child uses `parentId` to reference an existing action ID and inherits its parent's effective phase. A conflicting explicit child phase is invalid.
- The generator rejects duplicate IDs, unknown parent IDs, cycles, empty phase names and conflicting phase assignments.
- Phase headers and parent nodes are collapsible. Search reveals matching nodes and their ancestors without mutating canonical data. Tree navigation supports arrow keys, Home/End and selection.
- Deleting a parent promotes its children to the removed node's parent, or to the removed root's phase. Existing IDs, snap-ins and comments are not rewritten.
- Existing action move/drag controls continue to change the canonical array order, not the declared parent references. Tree rendering uses parent references rather than guessing hierarchy from text.
- Flat legacy actions appear beneath an **Actions** group, preserving order.

## Acceptance and verification

Focused tests cover legacy plugin behavior, explicit resource-only generation, source selection, a single named skill collection, inspector disabling without data loss, renamed/unknown refs, persisted inspector state, nested phase tree search, keyboard navigation, cycle detection, parent deletion, 145-action large catalog compatibility, packaging and live agent feedback. Chrome verifies the self-contained artifact at desktop and mobile widths.

The code, generated HTML, and documentation must not rely on any external application, directory discovery, runtime network access, or implicit source inference.

## Scope limits

No cross-mode editor changes. No skill execution or installation. No automatic source discovery beyond the original legacy plugin-discovery fallback. No automatic reparenting on action reorder. No full-suite requirement for this scoped implementation.

## Versioned resource manifest

`resourceManifest.format` is `human-review.resources/v1`. It is optional and
coexists with the legacy `catalog` and `resourceSources` formats.

- **Sources** describe distribution or membership: `{id,kind,displayName,refs}`.
  Supported kinds are `library`, `repository`, `plugin`, and `package`.
  A source can be empty, have no skills, or contain several capability types.
- **Capabilities** describe what can attach to actions:
  `{ref,kind,displayName,invocation?,availability?}`.
  Supported kinds are `skill`, `agent`, `command`, `rule`, `mcp`, `hook`.
  Invocation is `user`, `model`, or `both`; availability is
  `available`, `unavailable`, or `unknown`. Optional metadata is descriptive,
  not an execution permission.
- **Relationships** express declared edges between capabilities:
  `{type,from,to}` with `requires`, `invokes`, or `precedes`.
  These are shown as metadata, not translated into automatic execution.
- **Workflows** express explicit sequences: `{id,displayName,steps}` where
  each step is `{ref,after?:[ref]}`. All references must exist; workflow
  dependencies cannot be cyclic. The inspector never derives steps from
  directory layout or plugin packaging.
- Capabilities are uniquely keyed by `ref`. Several sources may reference
  the same capability without duplicating the attachment. Attach an entire
  source, a user-selected subset, or individual capabilities. The selected
  source/workflow persists in reviewed HTML; clean JSON exports the manifest,
  not transient selection UI.
- Reference examples: the Cursor plugins repository represents independently
  versioned packages (some skills/agents/rules, others MCP-only), while the
  Matt Pocock repository represents standalone composable engineering skills
  that may also be distributed through a plugin. The package does not change
  the underlying skill's identity. Do not claim external examples are installed.
- Missing and explicitly unavailable capabilities are displayed distinctly from
  active capabilities. No implicit filesystem scanning or resource execution
  is performed. Original DOM and Planning editors are unchanged.

Verified seams: manifest validator, self-contained artifact browser, bundled
generator, LOA state availability, and original structured Send/Poll protocol.
