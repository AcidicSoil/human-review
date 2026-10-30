# LOA resource sources and action tree

Status: Implemented on branch `loa-resource-tree`; pending integration
Date: 2026-10-29
Scope: LOA artifacts only. Ordinary DOM and Planning review editors stay unchanged.

## Intent

Plugins are an optional resource type rather than the fixed identity of the inspector. A reviewer can choose plugin skills, explicitly declared standalone skills, one named skill set, or no inspector. LOA actions may be organized in a real tree using declared phase and parent references. No resource roots are discovered implicitly for new resource types.

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

- `catalog` is the legacy plugin catalog. If both `catalog` and `resourceSources` are omitted, the existing plugin-discovery behavior remains available. If `resourceSources` is supplied and `catalog` omitted, `catalog` defaults to an empty array; no plugin discovery occurs.
- `resourceSources[].kind` is `skills` (direct `skills[]`) or `skill-set` (named `groups[]`, each containing `skills[]`). Every source and group has a unique nonempty ID within its scope. Skills have nonempty refs and display names and are treated as `kind: "skill"` attachments.
- Resource sources are explicit embedded data. The LOA browser runtime never reads arbitrary directories or invokes a skill or plugin. Skill-set stages are provided by the input; the UI never invents lifecycle groups.
- A source selector switches among available `Plugins`, `Skills`, `Skill sets`, and `None` options. A second selector chooses **one** named source/set. Its selection is saved to reviewed HTML as UI state but does not alter canonical action attachments.
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

Focused tests cover legacy plugin behavior, explicit resource-only generation, source selection, a single named skill set, inspector disabling without data loss, renamed/unknown refs, persisted inspector state, nested phase tree search, keyboard navigation, cycle detection, parent deletion, 145-action large catalog compatibility, packaging and live agent feedback. Chrome verifies the self-contained artifact at desktop and mobile widths.

The code, generated HTML, and documentation must not rely on any external application, directory discovery, runtime network access, or implicit source inference.

## Scope limits

No cross-mode editor changes. No skill execution or installation. No automatic source discovery beyond the original legacy plugin-discovery fallback. No automatic reparenting on action reorder. No full-suite requirement for this scoped implementation.
