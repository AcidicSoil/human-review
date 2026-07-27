---
name: edit-html
description: Open an HTML file in the browser so the user can edit the text directly and leave comments on specific parts, then send all their edits and comments back to you. Use after writing or updating any HTML file the user will read — specs, plans, reports, newsletter drafts, landing pages, slide decks.
---

# edit-html

The user reviews your HTML in a real browser: they fix small things by typing,
select anything to comment on it, and send you the whole batch at once.

## The loop

1. Write or update the HTML file.
2. Open it for the user:

   ```sh
   npx -y edit-html path/to/file.html
   ```

3. Wait for feedback. This blocks until they hit Send:

   ```sh
   npx -y edit-html poll path/to/file.html
   ```

   Keep this command in the foreground. Do not end your turn while it is waiting.
   If your shell returns a process or session handle, keep waiting on that handle
   until the command exits. If the harness times out, run the same poll command
   again; the feedback is saved.

4. Apply what comes back, then wait again. `--ack` clears the batch you just handled:

   ```sh
   npx -y edit-html poll path/to/file.html --ack
   ```

Repeat 3–4 until the user says they are done.

## What you get

One batch covers every page the user visited, grouped by file.

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
          "after": "their exact new wording" }
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
