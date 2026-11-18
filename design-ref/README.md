# Human Review design references

The editable FigCraft source is
[`human-review-ui-concepts.figcraft`](human-review-ui-concepts.figcraft).
These are design references, not runtime dependencies or executable reviews.

The editable document contains four original exploratory frames, six LOA inspector
states, and one Notepad HUD state matching the shipped non-blocking notebook.

## Notepad metadata layout — design branch

[Editable FigCraft prototype](notepad-metadata-layout.figcraft) explores a
refined card layout while preserving the established dark, purple-accented
visual language. The **date and time live in a separate left-side timeline**,
outside each note card. Tag chips appear **directly beneath each title**;
short IDs and compact actions remain aligned to the right.

| FigCraft frame | Preview | Intent |
| --- | --- | --- |
| 01 — Collapsed metadata | [Desktop list](notepad-metadata-collapsed.png) | Default dense list; five cards without expanded bodies |
| 02 — Expanded detail | [Desktop detail](notepad-metadata-expanded.png) | Preview text, expanded markdown/details, assignee and status |
| 03 — Compact HUD | [Narrow layout](notepad-metadata-hud.png) | Same metadata hierarchy at 480px width |
| 04 — Tasks | [Task board](notepad-route-tasks.png) | Task status metrics, a three-column board and review-specific cards |
| 05 — Reports | [Report dashboard](notepad-route-reports.png) | Cross-project issue metrics, status distribution, activity and reports |
| 06 — Settings | [Settings layout](notepad-route-settings.png) | Appearance, note metadata, tag placement and disclosure defaults |

The desktop frames have FigCraft prototype navigation: **Tasks**, **Reports**
and **Settings** in the sidebar open their respective screens; **Notepads**
returns to the collapsed list. Click the third note's disclosure chevron to
switch between collapsed and expanded detail states.

All layers are editable native FigCraft nodes. The Tasks/Reports/Settings
screens are **proposed design routes, not implemented app features**; the
controls and counts illustrate possible interactions and data. The entire
document is a design reference and does not change the production Notepad UI.

```sh
figcraft design-ref/notepad-metadata-layout.figcraft
```

A separate [cross-project bug-report prototype](notepad-cross-project-reports.figcraft)
documents the implemented cross-project reporting workflow. It contains four
native, editable FigCraft screens with click-through transitions (use FigCraft's
prototype player). The prototype remains a static design reference; the live
HUD uses the same flow with its own controls:

| Screen | User journey |
| --- | --- |
| 12 — Source issue | Keep the unfinished note in its source project and choose Report to tool project |
| 13 — Report issue | Choose the tool owner, enter expected/actual behavior and steps, and submit |
| 14 — Tool owner triage | Receive the linked report and mark a fix available |
| 15 — Source verification | Display the tool's fix status without automatically completing the source note |

[Full flow preview](notepad-cross-project-overview.png). The owner notebook and the
source note remain independently actionable; the sample uses `crawl-targets` and
`portless` as illustrative projects, not hardcoded requirements. To inspect it:

```sh
figcraft design-ref/notepad-cross-project-reports.figcraft
```

The original editable document's existing screens are:

| FigCraft frame | Design state |
| --- | --- |
| 05 — LOA / Sources | Library, repository or plugin memberships; mixed capabilities and subset/bulk attachment |
| 06 — LOA / Workflows | Explicit, dependency-ordered workflow steps; live session comment control |
| 07 — LOA / None | Optional inspector with existing action attachments intact |
| 08 — LOA / Plugins | Plugin and nested skill browsing |
| 09 — LOA / Skills | Explicit standalone skills from one source |
| 10 — LOA / Skill libraries | Named skill libraries, with explicit group membership |
| 11 — Notepad / Pending | Select notes, Send to agent, receipt status, Done/Delete, and local save status |

The four original library-first, action-first, Planning and DOM frames remain
unchanged. The new frames use native editable FigCraft shapes and text. They are
**static design states**, not a simulated runtime or automatically generated
resources. The Notepad frame represents the implemented local HUD, not an
embedded chat overlay. Note deletion uses an inline **Cancel / Delete now** confirmation step.

[Overview of the six LOA states](human-review-loa-inspector-modes.png) |
[Sources at full resolution](human-review-loa-sources.figcraft.png) |
[Workflows at full resolution](human-review-loa-workflows.figcraft.png) |
[Notepad FigCraft rendering](notepad-hud.figcraft.png) |
[Notepad browser screenshot](notepad-hud.png)

To open the source in FigCraft:

```sh
figcraft design-ref/human-review-ui-concepts.figcraft
```

To render a frame with the installed FigCraft CLI:

```sh
figcraft-cli export design-ref/human-review-ui-concepts.figcraft \
  --node '11 - Notepad / Pending' -o /tmp/human-review-notepad.png
```

The design-ref folder also contains prior rendered LOA references and a
standalone Redline reference. None are imported by the published npm package.
