---
name: human-review
description: Review HTML, Markdown, localhost pages, and large planning documents. Ordinary pages use the Human Review DOM editor and live agent feedback loop. Planning documents use the Plate planning editor with block actions, inline comments, threaded block discussions, and dark-only standalone HTML artifacts.
---

# human-review

Use the review surface that matches the artifact.

- **Ordinary HTML, Markdown, and localhost pages:** use the existing Human Review DOM editor and polling loop.
- **Large plans, specs, roadmaps, PRDs, and implementation proposals:** generate a Plate planning-review artifact with `human-review-plan`.

Do not wrap a Plate planning artifact in the ordinary `human-review <file>` review shell. Plate planning artifacts are standalone editor documents and open directly in the browser.

## Ordinary review loop

Open an HTML or Markdown file:

```sh
npx -y human-review path/to/file.html
```

For a local application route:

```sh
npx -y human-review http://localhost:3000/wiki
```

Wait for the user to send feedback:

```sh
npx -y human-review poll path/to/file.html --timeout 600
```

Apply the returned batch, then acknowledge it and wait again:

```sh
npx -y human-review poll path/to/file.html --ack --timeout 600
```

If a poll returns `{"status":"timeout"}`, run it again. If it returns `{"status":"closed"}`, stop polling. To check without blocking:

```sh
npx -y human-review status path/to/file.html
```

### Ordinary review rules

- `edits` are changes the user already made. Carry `after` across exactly and never revert it.
- When `before_html` or `after_html` is present, preserve the formatting change in the canonical source.
- Markdown is reviewed rendered. Apply feedback to the Markdown source, not the rendered HTML.
- A page with `kind: "url"` names a localhost route. Find and edit the matching project source; never write the rendered HTTP response into the application.
- Preserve pasted assets and move them into the appropriate application asset directory when reviewing localhost pages.
- `kind: "moved"` means the whole block moved. Preserve its content and reproduce its new position.
- Apply every page in a returned batch.

## Plate planning review

Planning review is intentionally a separate editor path. It uses **Plate** for the document model and editor surface, with Plate comment marks and block discussions layered on top.

The final deliverable remains one HTML file. Plate, React, the comment components, block discussion components, the edited document state, and discussion state are bundled or embedded into that artifact.

### Generate the artifact

From an installed package:

```sh
human-review-plan path/to/plan.md path/to/plan.review.html
```

With `npx`:

```sh
npx -y --package human-review human-review-plan path/to/plan.md path/to/plan.review.html
```

The output path is optional. Without one, `plan.md` becomes `plan.review.html` next to the source. The command opens the artifact in the browser unless `--no-open` is supplied.

The generator accepts Markdown or HTML. If the source already contains explicit review sections, preserve them:

```html
<section
  data-review-section="architecture"
  data-container="Architecture"
>
  <h2>Architecture</h2>
  <p>...</p>
</section>
```

If the source does not contain `data-review-section` blocks, the Plate client groups the document into review sections from its top-level H1/H2 headings.

### Dark-only artifact rule

**Planning review artifacts must never use a white or light review surface.**

Do not add a light-mode option, white canvas, white cards, or a theme toggle to planning artifacts. The `human-review-plan` generator owns the review chrome and enforces a dark palette, dark form controls, and `color-scheme: dark`. Source-document CSS is not used as the editor chrome, so light source styling cannot turn the review artifact white.

When modifying the Plate planning template later, keep all primary surfaces in dark tones. Treat this as a product constraint, not a user preference that can silently fall back to light mode.

## Plate editor capabilities

The planning artifact provides:

- rich inline block editing through Plate;
- bold, italic, and underline controls;
- HTML import into Plate for headings, paragraphs, blockquotes, links, and classic HTML lists;
- per-section planning action controls;
- exact-selection comment marks;
- a block discussion component that shows comments and replies beside the affected planning section;
- resolve and delete actions for discussions;
- `Cmd/Ctrl + Shift + M` for creating a comment from the current selection;
- **Save reviewed HTML**, which downloads a new standalone `.reviewed.html` carrying the entire review state.

### Planning actions

Every Plate `review_section` exposes:

- `revise` — substantive rewrite;
- `expand` — add missing detail, examples, constraints, or implementation depth;
- `touch-up` — local clarity, organization, or wording improvements only;
- `remove` — delete the section;
- `verify` — validate assumptions, claims, dependencies, or technical details and correct them.

`revise`, `expand`, `touch-up`, and `verify` may be combined. `remove` is exclusive.

## What comes back from a Plate artifact

When the user finishes, they click **Save reviewed HTML** and pass the resulting `.reviewed.html` file back to the agent.

Read the JSON inside:

```html
<script id="hr-bootstrap" type="application/json">...</script>
```

A reviewed artifact has this conceptual shape:

```json
{
  "version": 1,
  "editor": "plate",
  "sourcePath": "/absolute/path/to/plan.md",
  "document": [
    {
      "type": "review_section",
      "reviewId": "architecture",
      "label": "Architecture",
      "reviewActions": ["revise", "verify"],
      "children": []
    }
  ],
  "discussions": [
    {
      "id": "discussion-id",
      "documentContent": "selected text",
      "isResolved": false,
      "comments": [
        {
          "contentRich": [
            { "type": "p", "children": [{ "text": "Explain why this is needed." }] }
          ]
        }
      ]
    }
  ]
}
```

`document` is the edited Plate document and is authoritative for direct user edits. Text lives in descendant `{ "text": "..." }` leaves. Marks such as `bold`, `italic`, and `underline` live on those text leaves. Links, lists, headings, and blockquotes remain structured Plate nodes.

`discussions` contains Plate comment threads. `documentContent` records the selected text that started a discussion. Each comment's `contentRich` is a Plate value; read its descendant text leaves to recover the comment text. Ignore resolved discussions unless the user's current request requires retaining historical context.

## Apply a reviewed planning artifact

Apply planning feedback in this order:

1. Read `hr-bootstrap.document` and reconstruct the user's direct edits first. Their edited wording is a literal constraint on later rewriting.
2. Read every unresolved discussion and apply the specific comment instructions to the selected text or containing section.
3. Read `reviewActions` from each `review_section` and execute every marked action.
4. `remove` wins over every other action on the same section.
5. Apply the result to the canonical planning source named by `sourcePath` when that source exists.
6. Do not copy Plate-only state, discussion IDs, comment marks, or review metadata into canonical Markdown/MDX/text.
7. For another review round, generate a fresh Plate artifact from the updated canonical source. Do not carry completed review actions forward.

Do not ask the user to restate edits, comments, or section actions in chat. The reviewed HTML artifact is the instruction set.

## Better labels for ordinary HTML reviews

For non-Plate HTML reviews, authored labels still improve the existing DOM editor:

```html
<p data-block="Problem body">...</p>
<div data-container="Metrics callout">...</div>
```

`data-block` names a region for the edit list. `data-container` also makes the region clickable as a comment target.
