---
name: human-review
description: Open an HTML file, Markdown file, localhost page, or generated planning-review HTML artifact in the browser so the user can edit blocks inline, mark planning sections for specific follow-up actions, and leave comments, then send all feedback back to you. Use after writing or updating something the user will read — specs, plans, reports, newsletter drafts, landing pages, slide decks, and locally running web pages.
---

# human-review

The user reviews your HTML, Markdown, or localhost page in a real browser: they fix small things
by typing, select anything to comment on it, and send you the whole batch at once.

Markdown files open rendered. Their quotes and edits reference the rendered text,
and the file itself is never touched — apply every change to the Markdown source,
keeping its formatting syntax.

## Inline block editing

Human Review exposes a compact block toolbar when the user hovers reviewable content.

- **Edit** focuses that block for direct inline editing. The user types in the document itself, then
  clicks **Done** or presses Escape when they are finished with that block.
- Direct edits still use the normal edit pipeline: exact new wording and formatting are captured and
  sent to the agent.
- Existing selection comments, block comments, drag handles, deletion, links, lists, image editing,
  and other review behavior keep working alongside the focused block editor.

Do not add a second editor framework to reviewed artifacts. The block editor is supplied by Human
Review and works against the artifact's existing DOM, which keeps arbitrary HTML intact instead of
round-tripping it through another rich-text document model.

## Planning review artifacts

For a large plan, spec, roadmap, implementation proposal, or other long planning document, the
source does not need to already be HTML. Create one self-contained HTML review artifact and use
that as the review surface.

Use this mode when the user wants to inspect the plan visually, make exact edits, mark sections
that need more work, or classify follow-up work before you revise the canonical document.

### Create the artifact

1. Create `<name>.review.html` next to the planning source when one exists. If the plan only exists
   in chat or working notes, create the review artifact in the current project directory.
2. Keep it single-file: semantic HTML and embedded CSS only. Do not add a framework, build step,
   package, or application shell for the review artifact.
3. Put every major plan section in a stable `data-review-section` + `data-container` block. Use a
   short stable id and a human-readable `data-container` label.
4. Do not render review checkboxes, action menus, or editor controls inside the artifact. Human
   Review supplies the block editor and planning-action toolbar at review time.
5. Open the generated file with Human Review and run the normal poll loop.

The planning toolbar exposes these actions on every `data-review-section` block:

- `revise` — substantive rewrite of the marked section.
- `expand` — add missing detail, examples, constraints, or implementation depth.
- `touch-up` — small clarity, grammar, organization, or wording improvements only.
- `remove` — delete the marked section from the resulting plan.
- `verify` — validate assumptions, claims, dependencies, or technical details and correct them.

`revise`, `expand`, `touch-up`, and `verify` may be combined. `remove` is exclusive because a
section marked for deletion does not also need revision work.

Use this minimal pattern for each reviewable section:

```html
<section
  id="architecture"
  data-review-section="architecture"
  data-container="Architecture"
>
  <h2>Architecture</h2>
  <p>...</p>
</section>
```

Do not make every paragraph a `data-review-section`. Use the smallest useful planning unit: normally
one section, milestone, phase, decision, workstream, or other independently revisable block. The
user can still hover a smaller text block and choose **Edit**, or select an exact sentence or line
and leave a normal anchored comment when they need more precision.

The planning toolbar stores selected actions on the section as a canonical comma-separated
`data-review-actions` value. That attribute is captured in edit `after_html` and persists in the
`.review.html` artifact until the agent applies and clears it.

### Apply planning feedback

Treat the reviewed HTML as a review surface, not as an automatic migration of the canonical plan.
When feedback arrives:

1. Apply direct text edits first. They are the user's exact wording and remain literal constraints
   on any later rewrite.
2. Apply anchored comments to the exact quoted text or section they reference. A comment is a
   specific instruction and refines the meaning of a generic review action.
3. Read review actions from `data-review-actions` in edit `after_html`. If the batch does not carry
   the latest section HTML, read the current `.review.html` file and inspect each
   `[data-review-section][data-review-actions]` block.
4. Execute every marked action:
   - `revise`: rewrite the section while preserving user edits, stated constraints, and intent.
   - `expand`: keep the existing substance and add the missing depth requested or implied.
   - `touch-up`: make only local polish changes; do not broaden scope.
   - `remove`: delete the section. If the same section was directly edited and then marked remove,
     the removal is the user's final instruction for that section.
   - `verify`: check the marked assumptions or technical claims using the available project context
     and appropriate authoritative sources, then correct the plan where needed.
5. Apply the result to the canonical planning source when one exists. If the review artifact is the
   only plan, revise that file in place.
6. Clear every applied `data-review-actions` value before the next review round so stale directives
   cannot be applied twice.
7. Keep `data-review-section` and `data-container` on the review artifact for the next pass. Never
   copy review-only attributes into canonical Markdown, MDX, text, or another source format.

Do not ask the user to restate marked work in chat. The direct edits, anchored comments, and review
actions are the instruction set.

## The loop

1. Write or update the HTML or Markdown file, generate a planning review artifact, or start the
   local page being reviewed.
2. Open it for the user:

   ```sh
   npx -y human-review path/to/file.html
   ```

   For a page served by a local development server, open the real route instead
   of recreating it as a separate HTML file:

   ```sh
   npx -y human-review http://localhost:3000/wiki
   ```

3. Wait for feedback. This blocks until they hit Send, or the timeout passes:

   ```sh
   npx -y human-review poll path/to/file.html --timeout 600
   ```

   Keep this command in the foreground. Do not end your turn while it is waiting.
   If your shell returns a process or session handle, keep waiting on that handle
   until the command exits. If it prints `{"status":"timeout"}`, no feedback has
   arrived yet — run the same poll command again to keep waiting. Feedback is
   saved even if a poll dies, so nothing is ever lost.

   If it prints `{"status":"closed"}`, the user ended the review from the
   browser — stop polling and do not run the poll command again. Unsent
   feedback is kept and ships the next time this target is reviewed.

4. Apply what comes back, then wait again. `--ack` clears the batch you just handled:

   ```sh
   npx -y human-review poll path/to/file.html --ack --timeout 600
   ```

Repeat 3–4 until the user says they are done.

Not sure whether feedback is already waiting — say, at the start of a new turn?
This answers instantly without blocking:

```sh
npx -y human-review status path/to/file.html
```

It prints `{"status": "feedback-waiting"}` when a batch is ready for a poll,
plus counts of unsent comments and edits still in the browser.

## What you get

One batch covers every page the user visited, grouped by file or localhost URL.

```json
{
  "status": "feedback",
  "pages": [
    {
      "file": "/abs/path/to/page.html",
      "comments": [
        { "id": "c_1", "kind": "selection", "quote": "the exact text they selected",
          "anchor": { "prefix": "...", "quote": "...", "suffix": "..." },
          "feedback": "what they want changed" }
      ],
      "edits": [
        { "label": "Problem body", "kind": "edited",
          "before": "the original wording",
          "after": "their exact new wording",
          "after_html": "their exact new wording with <strong>formatting</strong>" },
        { "label": "Architecture", "kind": "edited",
          "before": "Existing architecture text",
          "after": "Existing architecture text",
          "after_html": "<section data-review-section=\"architecture\" data-container=\"Architecture\" data-review-actions=\"revise,verify\">...</section>" }
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
- When `before_html`/`after_html` are present, the user changed formatting, not
  just words — bold, italic, underline, links, or review metadata. Use the HTML version to carry
  formatting into the source, translated to its syntax, and interpret `data-review-actions` only
  as planning directives rather than canonical content.
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
  block whose text starts with `moved_before`. An empty `moved_after` means it
  is now the first block in its container.
- Find each comment by its `quote`; that exact string is in the file.
- `kind: "element"` points at a whole block, so `quote` is its label, not body text.
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
