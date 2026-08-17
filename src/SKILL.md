---
name: human-review
description: Review HTML, Markdown, localhost pages, and large planning documents. Ordinary pages use the Human Review DOM editor and live feedback loop. Planning documents are emitted as standalone HTML files with an editor runtime embedded directly in the artifact, plus block actions and comments/discussions.
---

# human-review

Use the review surface that matches the artifact.

- **Ordinary HTML, Markdown, and localhost pages:** use the normal Human Review polling loop.
- **Large plans, specs, roadmaps, PRDs, and implementation proposals:** generate one standalone editable `.review.html` artifact with `human-review-plan`.

## Required planning-artifact behavior

For a planning review, **produce the artifact in the current turn**. Do not stop and tell the user to run a generator later.

The generated HTML must contain its editor runtime itself. It must remain editable when opened as a local file; the browser must not need npm, a dev server, a CDN, or outbound network access to load the editor.

`human-review-plan` is installed beside this skill. Run it directly:

```sh
human-review-plan path/to/plan.md path/to/plan.review.html
```

The output path is optional. Without one, `plan.md` becomes `plan.review.html` next to the source.

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

For normal HTML or Markdown:

```sh
npx -y human-review path/to/file.html
npx -y human-review poll path/to/file.html --timeout 600
```

For a local application route:

```sh
npx -y human-review http://localhost:3000/wiki
npx -y human-review poll http://localhost:3000/wiki --timeout 600
```

After applying feedback, acknowledge and wait again:

```sh
npx -y human-review poll path/to/file.html --ack --timeout 600
```

If a poll returns `{"status":"timeout"}`, run it again. If it returns `{"status":"closed"}`, stop polling. To inspect pending state without blocking:

```sh
npx -y human-review status path/to/file.html
```

### Ordinary review rules

- `edits[].after` is wording the user already changed. Carry it across exactly and do not revert it.
- Preserve formatting represented in `after_html`.
- Markdown is reviewed rendered; apply changes to Markdown source.
- A `kind: "url"` page is a localhost route. Update its actual component/template source, never the rendered HTTP response.
- Preserve pasted assets and moved blocks.
- Apply every page in the returned batch.
