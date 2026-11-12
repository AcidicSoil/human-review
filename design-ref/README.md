# Human Review design references

The editable FigCraft source is
[`human-review-ui-concepts.figcraft`](human-review-ui-concepts.figcraft).
These are design references, not runtime dependencies or executable reviews.

The editable document contains four original exploratory frames, six LOA inspector
states, and one Notepad HUD state matching the shipped non-blocking notebook.

A separate [cross-project bug-report prototype](notepad-cross-project-reports.figcraft)
shows the proposed reporting flow before implementation. It contains four native,
editable FigCraft screens with click-through transitions (use FigCraft's prototype
player). This is a design proposal, **not implemented Notepad behavior**:

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
