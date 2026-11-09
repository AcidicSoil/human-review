# Human Review design references

The editable FigCraft source is
[`human-review-ui-concepts.figcraft`](human-review-ui-concepts.figcraft).
These are design references, not runtime dependencies or executable reviews.

The editable document contains four original exploratory frames, six LOA inspector
states, and one Notepad HUD state matching the shipped non-blocking notebook:

| FigCraft frame | Design state |
| --- | --- |
| 05 — LOA / Sources | Library, repository or plugin memberships; mixed capabilities and subset/bulk attachment |
| 06 — LOA / Workflows | Explicit, dependency-ordered workflow steps; live session comment control |
| 07 — LOA / None | Optional inspector with existing action attachments intact |
| 08 — LOA / Plugins | Plugin and nested skill browsing |
| 09 — LOA / Skills | Explicit standalone skills from one source |
| 10 — LOA / Skill libraries | Named skill libraries, with explicit group membership |
| 11 — Notepad / Pending | Compact user/agent capture, pending list, Done and Delete controls, local save status |

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
