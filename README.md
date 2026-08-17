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

The existing DOM editor remains the default for arbitrary HTML, Markdown, and localhost pages. Hover a block and use **Edit** to focus it for inline changes; the existing selection comments, block comments, drag handles, links, lists, image editing, and polling workflow continue to work there.

## Plate planning review

Large plans, specs, PRDs, roadmaps, and implementation proposals now use a dedicated **Plate** editor instead of the generic DOM editor.

Generate a standalone planning artifact from Markdown or HTML:

```sh
human-review-plan plan.md plan.review.html
```

Or without a global install:

```sh
npx -y --package human-review human-review-plan plan.md plan.review.html
```

The generated file is still one HTML artifact. The generator bundles Plate and React directly into that file, and the editor stores its complete edited document and discussion state inside the artifact when you click **Save reviewed HTML**.

### Planning editor features

- **Real Plate block editing** rather than a DOM-only approximation.
- **Section review actions:** Revise, Expand, Touch up, Remove, Verify.
- **Plate comment marks** on exact selected text.
- **Block discussions** attached to the planning section containing the selection.
- **Thread replies**, resolve, and delete controls.
- **Bold, italic, and underline** editing controls.
- **HTML import** for headings, paragraphs, blockquotes, links, and classic HTML lists.
- **Cmd/Ctrl + Shift + M** to start a comment from the current selection.
- **Save reviewed HTML** to download a self-contained `.reviewed.html` that can be passed directly back to an agent.

Revise, Expand, Touch up, and Verify can be combined. Remove is exclusive.

### Dark-only planning artifacts

Planning artifacts are intentionally **dark only**. The editor shell, document canvas, section cards, discussion threads, form controls, and comment surfaces all use dark tones and `color-scheme: dark`.

There is no light-mode fallback or white canvas. Source-document CSS is not used as the Plate editor chrome, so a light source document cannot turn the review artifact into a white page.

## Passing a reviewed plan back to an agent

After reviewing, click **Save reviewed HTML** and give the resulting `.reviewed.html` file to the agent.

The artifact embeds a machine-readable state object in:

```html
<script id="hr-bootstrap" type="application/json">...</script>
```

That state contains:

- the full edited Plate document;
- stable planning section IDs and labels;
- each section's selected review actions;
- inline comment marks;
- unresolved and resolved discussion threads;
- the original canonical source path when known.

The agent applies direct edits first, then unresolved discussion instructions, then section actions, and writes the result back to the canonical planning source. Plate-only metadata stays in the review artifact rather than leaking into Markdown/MDX/text.

## What this skill lets you do

- **Edit text directly and tweak basic formatting** in ordinary reviews.
- **Use a dedicated Plate editor for large planning documents.**
- **Mark plan sections** for revise, expand, touch-up, remove, or verify work.
- **Create exact-selection comments and threaded block discussions** in Plate planning artifacts.
- **Make bulleted and numbered lists** in ordinary HTML reviews.
- **Add links** with the existing HTML review editor.
- **Resize, move, and paste images** in ordinary file reviews.
- **Rearrange page blocks** with drag handles.
- **Review localhost routes** without writing rendered responses back into app source.
- **Send ordinary review feedback live** through the existing agent polling loop.
- **Return planning feedback as one reviewed HTML artifact** with the entire Plate state embedded.

## What’s inside

- [`cli.js`](src/cli.js) contains the ordinary `human-review`, `poll`, `status`, and `setup` commands.
- [`plate-review/artifact.js`](src/plate-review/artifact.js) generates dark single-file Plate planning artifacts.
- [`plate-review/client.jsx`](src/plate-review/client.jsx) contains the Plate editor, section block controls, comments, and block discussions.
- [`plate-review/review-state.js`](src/plate-review/review-state.js) contains planning review-state helpers.
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
