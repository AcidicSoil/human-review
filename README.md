# Human Review

Edit HTML and Markdown files directly, leave comments like a Google Doc, and send all your feedback to your AI agent at once.

[Read the full launch post](https://creatoreconomy.so/p/use-my-human-review-skill-to-edit-html-markdown-visually)

https://github.com/user-attachments/assets/7cab09c9-eaa0-4e8b-984d-2925e810b5c2

## Problem

Giving AI feedback on files in chat is painful.

Sometimes you want to change one sentence yourself. Instead, you end up typing:

> In the third paragraph, change X to Y. Cut the third card because it repeats the first one. Also rewrite the CTA.

Then the agent changes the file and you have to check whether it understood every instruction. This gets even harder when you’re reviewing a long plan, Markdown document, landing page, or multi-page website.

## How to install /human-review

The easiest way to install the skill is to paste this into ChatGPT, Claude Code, Codex, or your favorite coding agent:

```text
Install the /human-review skill globally from https://github.com/petergyang/human-review
```

You can also install it with `npx`:

```sh
npx -y human-review setup --global
```

Setup now installs the planning-artifact runtime **inside each Human Review skill directory**, not just `SKILL.md`. That local runtime includes the generator, a built-in editor fallback, and the prebuilt Plate browser bundle when the package was built normally. Agents therefore do not need to download Plate/React/esbuild later just to create a planning artifact.

## Ordinary HTML, Markdown, and localhost review

Open an HTML or Markdown file:

```text
/human-review (your file)
```

Review a page running on localhost:

```text
/human-review (localhost URL)
```

Human Review opens the file in your browser. Make direct edits, leave comments, and click Send. Your agent receives all your feedback in one batch, updates the source, and refreshes the page for another review.

The existing DOM editor remains the default for arbitrary HTML, Markdown, and localhost pages. Hover a block and use **Edit** to focus it for inline changes; selection comments, block comments, drag handles, links, lists, image editing, and the polling workflow continue to work there.

## Planning review artifacts

Large plans, specs, PRDs, roadmaps, and implementation proposals generate one standalone editable HTML artifact.

From an installed package:

```sh
human-review-plan plan.md plan.review.html
```

After `human-review setup`, the installed skill points agents at its local planning runner directly, so later artifact generation does not depend on `npx` or npm network access.

### The editor is inside the HTML

The planning artifact is not a static preview that expects a separate web app. Its editor JavaScript is embedded directly in the generated HTML.

The normal package build compiles the **Plate + React** planning editor ahead of time and ships that prebuilt browser bundle with Human Review. `human-review-plan` copies that bundle into each artifact.

A source checkout can also rebuild the bundle with:

```sh
npm run build:plate-review
```

If a source checkout has neither the prebuilt Plate bundle nor the development dependencies required to rebuild it, generation still does not fail. The generator embeds its built-in editor runtime so the resulting HTML remains directly editable, commentable, classifiable, and exportable. Dependency availability is not turned into a user-facing artifact-generation blocker.

### Planning editor features

When the Plate bundle is available:

- **Real Plate block editing**.
- **Section review actions:** Revise, Expand, Touch up, Remove, Verify.
- **Plate comment marks** on exact selected text.
- **Block discussions** attached to the planning section containing the selection.
- **Thread replies**, resolve, and delete controls.
- **Bold, italic, and underline** editing controls.
- **HTML import** for headings, paragraphs, blockquotes, links, and classic HTML lists.
- **Cmd/Ctrl + Shift + M** to start a comment from the current selection.
- **Save reviewed HTML** to download a self-contained `.reviewed.html` that can be passed directly back to an agent.

The built-in editor fallback preserves the core workflow: direct content editing, section actions, comments, and standalone reviewed-HTML export.

Revise, Expand, Touch up, and Verify can be combined. Remove is exclusive.

### Artifact appearance

Planning artifacts avoid plain white/light primary surfaces. The page, editor canvas, section cards, controls, and discussion surfaces use toned darker backgrounds so the review surface does not look like a white document on a white page.

This is a visual constraint, not a separate “dark-only planning” product mode.

## Passing a reviewed plan back to an agent

After reviewing, click **Save reviewed HTML** and give the resulting `.reviewed.html` file to the agent.

The artifact embeds machine-readable state in:

```html
<script id="hr-bootstrap" type="application/json">...</script>
```

For Plate artifacts that state contains the full edited Plate document, stable planning section IDs and labels, selected review actions, comment/discussion state, and the original source path when known.

For the built-in editor fallback, `sourceHtml` contains the edited document while `data-review-actions` and discussion records preserve the same planning-review instructions.

The agent applies direct edits first, then unresolved discussion instructions, then section actions, and writes the result back to the canonical planning source. Editor-only metadata stays in the review artifact rather than leaking into Markdown/MDX/text.

## What this skill lets you do

- **Edit text directly and tweak basic formatting** in ordinary reviews.
- **Use Plate for rich planning review artifacts when the packaged bundle is present.**
- **Still generate an editable planning artifact when rebuild dependencies are unavailable.**
- **Mark plan sections** for revise, expand, touch-up, remove, or verify work.
- **Create comments/discussions** in planning artifacts.
- **Make bulleted and numbered lists** in ordinary HTML reviews.
- **Add links** with the existing HTML review editor.
- **Resize, move, and paste images** in ordinary file reviews.
- **Rearrange page blocks** with drag handles.
- **Review localhost routes** without writing rendered responses back into app source.
- **Send ordinary review feedback live** through the existing agent polling loop.
- **Return planning feedback as one reviewed HTML artifact** with the editor state embedded.

## What’s inside

- [`cli.js`](src/cli.js) contains the ordinary `human-review`, `poll`, `status`, and `setup` commands.
- [`plate-review/artifact.js`](src/plate-review/artifact.js) is the planning-artifact CLI entry point.
- [`plate-review/generator.js`](src/plate-review/generator.js) creates self-contained editable planning artifacts without requiring runtime network access.
- [`plate-review/client.jsx`](src/plate-review/client.jsx) contains the Plate editor, section controls, comments, and block discussions.
- [`plate-review/fallback-client.js`](src/plate-review/fallback-client.js) keeps planning artifacts editable when the Plate bundle cannot be rebuilt locally.
- [`plate-review/review-state.js`](src/plate-review/review-state.js) contains planning review-state helpers.
- [`scripts/build-plate-review.mjs`](scripts/build-plate-review.mjs) compiles the Plate browser client before packaging.
- [`setup.js`](src/setup.js) installs both the skill instructions and planning runtime into agent skill directories.
- [`server.js`](src/server.js) runs the ordinary live review session.
- [`sdk.js`](src/sdk.js) handles ordinary DOM editing, comments, highlights, and feedback.
- [`editing.js`](src/editing.js) contains ordinary DOM editing helpers and the inline block toolbar.
- [`chrome-client.js`](src/chrome-client.js) contains the ordinary visual review interface.
- [`markdown.js`](src/markdown.js) renders Markdown files for ordinary review.
- [`SKILL.md`](src/SKILL.md) teaches agents which review path to use.

Everything runs on your computer. Human Review doesn’t require an account, cloud service, database, or API key.

## Want more great AI skills?

Check out [Behind the Craft](https://behindthecraft.com), my personal AI system with over a dozen other quality skills and courses.

Subscribe to my [YouTube channel](https://www.youtube.com/@PeterYangYT?sub_confirmation=1) and [newsletter](https://creatoreconomy.so) for practical AI tutorials and interviews.

## License

MIT