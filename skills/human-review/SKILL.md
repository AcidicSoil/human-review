---
name: human-review
description: Review HTML, Markdown, localhost pages, and large planning documents. Ordinary pages use the Human Review DOM editor and live feedback loop. Planning documents are emitted as standalone HTML files with an editor runtime embedded directly in the artifact, plus block actions and comments/discussions.
---

# human-review

Use the review surface that matches the artifact.

- **Ordinary HTML, Markdown, and localhost pages:** use the normal Human Review polling loop.
- **Large plans, specs, roadmaps, PRDs, and implementation proposals:** generate one standalone editable `.review.html` artifact with `human-review-plan`.
- **Structured Lists of Actions with plugin/skill catalogs:** generate an offline, editable LOA composition artifact with `human-review-loa`. Use this third review mode instead of ordinary DOM or planning review when the input is machine-readable LOA JSON.

## Required planning-artifact behavior

For a planning review, **produce the artifact in the current turn**. Do not stop and tell the user to run a generator later.

The generated HTML must contain its editor runtime itself. It must remain editable when opened as a local file; the browser must not need npm, a dev server, a CDN, or outbound network access to load the editor.

The plugin bundles the planning runtime beside this skill. Set `SKILL_DIR` to the absolute directory containing this loaded `SKILL.md`, then run:

```sh
node "$SKILL_DIR/human-review-plan.mjs" path/to/plan.md path/to/plan.review.html
```

The output path is optional. Without one, `plan.md` becomes `plan.review.html` next to the source.

## LOA component review

For a structured List of Actions and component catalog, create the artifact in the current turn:

```sh
node "$SKILL_DIR/human-review-loa.mjs" path/to/loa.json path/to/loa.loa.review.html
```

The output path is optional. For Codex, newly-created input may contain only `{ "loa": { "actions": [] } }`; when `catalog` is absent, the bundled runtime discovers Codex's installed/enabled plugins and nested skills automatically before rendering the Component Rail. Canonical skill refs use `skills://plugins/<plugin>/<skill>`.

If the user explicitly supplies `catalog`, preserve it rather than replacing it. Each action has a stable non-empty `id`, string `content`, and an unbounded `snapIns` array. The catalog is organized as category → plugin → skills. Plugin cards are collapsible grouping headers and are not add targets; click or drag an individual nested skill onto an action. Preserve plugin-level refs already present in imported LOAs, but do not create new plugin-level attachments from the rail. The artifact never loads or executes a plugin, and it preserves missing refs as unavailable. Use the action move controls when drag-and-drop is unavailable.

Save reviewed HTML to retain the editable review state, or save clean LOA JSON to pass the
canonical `{ "loa", "catalog" }` result to the next agent. Do not persist an event log.

### Never turn dependency availability into a user blocker

Do **not** reply with statements such as:

- "I could not generate the artifact because npm/network access is disabled."
- "Plate/React/esbuild is unavailable in this runtime."
- "Run this command yourself later."

The installed planning generator is deliberately self-contained. A packaged Human Review installation carries a prebuilt Plate editor bundle beside the skill. A source checkout can build that bundle locally when its development dependencies are present. If neither is available, the generator embeds its built-in editor runtime and still writes an editable HTML artifact.

The user asked for a review artifact, so artifact creation is the task. Tooling details are implementation details unless artifact generation itself encounters a genuine filesystem error such as an unreadable source or unwritable output path.

## Planning editor contract

The preferred editor is **Plate**. The packaged build compiles the Plate/React editor ahead of time and embeds that browser bundle directly into each generated HTML artifact.

Planning review supports:

- inline rich-text/block editing;
- a persistent section sidebar for quick navigation through the planning document;
- per-section **Revise**, **Expand**, **Touch up**, **Remove**, and **Verify** actions;
- comments/discussions tied to the reviewed content;
- discussion replies and resolve/delete controls when the Plate runtime is active;
- **Save reviewed HTML** for the stateful Human Review artifact;
- **Save PRD** for a clean Markdown PRD export of the current reviewed document.

The fallback embedded editor preserves the same core review contract: direct editing, sidebar navigation, section actions, comments, reviewed-HTML export, and PRD export. Never discard the user's ability to edit merely because the richer Plate bundle cannot be rebuilt in the current runtime.

### Review sections and navigation

When authoring source HTML, use stable section metadata where practical:

```html
<section
  data-review-section="architecture"
  data-container="Architecture"
>
  <h2>Architecture</h2>
  <p>...</p>
</section>
```

For Markdown or HTML without explicit review sections, the planning editor groups the document from top-level H1/H2 headings.

The artifact sidebar is generated from those same stable section IDs and labels. Clicking a sidebar item scrolls directly to that review section. Do not create a separate table-of-contents data model or duplicate section IDs solely for navigation.

Planning actions mean:

- `revise` — substantive rewrite;
- `expand` — add missing depth, examples, constraints, or implementation detail;
- `touch-up` — local clarity, organization, grammar, or wording improvements;
- `remove` — delete the section;
- `verify` — validate assumptions, claims, dependencies, or technical details and correct them.

`revise`, `expand`, `touch-up`, and `verify` may be combined. `remove` is exclusive.

### Review outputs

The artifact exposes two distinct save operations after the human review:

- **Save reviewed HTML** downloads `<name>.reviewed.html`. This is the stateful Human Review artifact. It preserves editor state, review actions, comments/discussions, and the embedded editor runtime so the agent can apply feedback or the user can continue reviewing.
- **Save PRD** downloads `<name>.prd.md`. This is a clean Markdown serialization of the document as it currently appears in the editor. It excludes review controls, action markers, comments/discussions, and editor-only metadata.

Do not treat the PRD export as a replacement for the reviewed HTML when unresolved comments or review actions still need agent work. The PRD is the clean current document; the reviewed HTML is the review instruction/state carrier.

## Artifact appearance

Avoid plain white/light review canvases. Use darker or otherwise toned surfaces for the page, editor, cards, controls, and comment/discussion areas so the final artifact does not present as a white document on a white page.

This is **not** a requirement to describe the product as "dark-only" and it is not a reason to create a separate dark-mode workflow. It is simply a visual constraint on generated review artifacts: do not use plain white/light backgrounds as the primary surfaces.

## Applying a reviewed planning artifact

A reviewed artifact stores its state in:

```html
<script id="hr-bootstrap" type="application/json">...</script>
```

If `editor` is `plate`:

1. Treat `document` as authoritative for direct edits.
2. Apply unresolved `discussions` to the selected text/containing section.
3. Apply each `review_section.reviewActions` value.
4. `remove` wins over other actions on the same section.
5. Apply the result to the canonical source named by `sourcePath` when it exists.

If `editor` is `embedded-dom`:

1. Treat `sourceHtml` as the user's edited review document.
2. Read each `[data-review-section]` and its `data-review-actions` value.
3. Apply unresolved `discussions` using their `reviewSection`/`documentContent` context.
4. Apply the result to `sourcePath` when it exists.

In both modes, direct user edits come first and must not be silently reverted by later rewrite actions. Do not copy editor-only metadata, discussion IDs, or review controls into canonical Markdown/MDX/text.

Do not ask the user to restate edits, comments, or section actions in chat. The reviewed artifact is the instruction set.

## Ordinary review loop

Open the review page for an HTML/Markdown file or local route:

```sh
npx -y human-review path/to/file.html
npx -y human-review http://localhost:3000/wiki
```

Wait for the user to click Send or close the review:

```sh
npx -y human-review poll path/to/file.html
```

- **Claude Code:** run the poll in the background so it can wake the agent when feedback arrives.
- **Codex, Cursor, other agents:** run the poll in the foreground within the active turn. A finished turn cannot wake itself; the user must send a new message. If the tool limits command duration, use `--timeout` just under that limit and repeat while the review stays open.
- **Feedback:** apply every page in the returned batch. Re-read autosaved HTML before changing it, then acknowledge with `poll <target> --ack` and start the next wait.
- **Closed:** stop polling; if `unsent` is nonzero, tell the user their feedback is saved.
- **Superseded:** stop this poll. **Timeout:** check status and continue waiting if still open.

Check pending feedback without blocking:

```sh
npx -y human-review status path/to/file.html
```

## What you get

One batch covers every page the user visited, grouped by file or localhost URL.

```json
{
  "status": "feedback",
  "pages": [
    {
      "file": "/abs/path/to/page.html",
      "edits_saved": true,
      "comments": [
        { "id": "c_1", "kind": "selection", "quote": "the exact text they selected",
          "anchor": { "prefix": "...", "quote": "...", "suffix": "..." },
          "feedback": "what they want changed" }
      ],
      "edits": [
        { "label": "Problem body", "kind": "edited",
          "before": "the original wording",
          "after": "their exact new wording",
          "after_html": "their exact new wording with <strong>formatting</strong>" }
      ]
    }
  ],
  "overall_note": "feedback not tied to any one page"
}
```

## Rules

- **`edits` are changes the user already made.** `after` is their exact wording —
  carry it across verbatim and never revert it. If the HTML was generated from
  something else (MDX, Markdown, a template), apply `after` to the **source** too,
  or their fix disappears on the next build.
- **`edits_saved: true` means those edits are already in the file on disk.**
  Plain HTML files autosave as the user types, so your copy of the file is
  stale. Re-read the file before touching it and make targeted changes only;
  never regenerate it from what you wrote earlier, or their work disappears.
  `edits_saved: false` (Markdown, localhost pages, self-rendering HTML) means the
  edits exist only in this batch — apply them to the source yourself.
- An edit with `kind: "deleted"` means the user removed that whole block:
  delete it from the source too, without asking why.
- An edit marked `truncated: true` had its text cut at 200k characters; read
  the block from the page itself rather than from `after_html`.
- When `before_html`/`after_html` are present, the user changed formatting, not
  just words — bold, italic, underline, links. Use the HTML version to carry the
  formatting into the source, translated to its syntax (e.g. `<strong>` → `**`
  in Markdown/MDX).
- A page with `kind: "url"` was edited directly in the review UI. Its `file`
  and `url` fields name the localhost route, not a writable file. Find the
  matching project source (such as MDX, TSX, or a template), apply every edit
  and deletion there, then acknowledge so the route reloads. Never write the
  rendered HTTP response back into the app.
- When an edit's `after_html` contains `<img src="assets/...">`, the user pasted
  an image: the file already exists in an `assets/` folder next to the reviewed
  file. Keep that relative path — in Markdown, reference it as
  `![](assets/...)`. Never regenerate or inline the image.
- On a localhost page, a pasted image arrives under `staged_assets`. Copy its
  local `path` into the app's appropriate asset folder, replace the temporary
  preview URL in `after_html`, and preserve the image at the user's insertion
  point. Never leave the temporary preview URL in source.
- An edit with `kind: "moved"` means the user relocated that whole block.
  Reposition it in the source without rewriting its content: it now sits right
  after the block whose text starts with `moved_after`, and right before the
  block whose text starts with `moved_before` (both are clipped to 90
  characters and may end in `…`). An empty `moved_after` means it is now the
  first block in its container.
- Find each comment by its `quote`. It is the **rendered** text the user
  selected, so in Markdown or templated HTML it may span formatting syntax or
  tags; `anchor.prefix` and `anchor.suffix` give the surrounding text to
  disambiguate.
- `kind: "element"` points at a whole block, so `quote` is its label, not body text.
- Copy any `staged_assets` files before you ack: `--ack` deletes them.
- A batch with only an `overall_note` has an empty `pages` array.
- Fix every page in `pages`, not just the first.
- **Do not write a reply.** There is no chat. The user sees your work when the page
  reloads, which happens on its own the moment you save the file.

## Better edit labels (optional)

Name the sections you author and the user's edit list uses your names instead of
guessing from the DOM:

```html
<p data-block="Problem body">…</p>
<div data-container="Metrics callout">…</div>
```

`data-block` names a region for the edit list. `data-container` also makes the block
clickable as a comment target.
