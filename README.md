# edit-html

**Review and edit agent-generated HTML in the browser, then send the whole batch back to your agent.**

Your agent writes a spec, a plan, a newsletter draft, a landing page. You open it,
fix the small stuff by typing, comment on everything else by selecting it, and send
it all back in one go. No modes, no save button, no account, no database.

```sh
npx -y edit-html path/to/file.html
```

## The loop

```
agent writes HTML  →  edit-html <file>  →  you edit + comment  →  Send N to agent
        ↑                                                              │
        └────────────  page hot-reloads  ←  agent applies fixes  ←─────┘
```

## What you can do

- **Edit anything.** The page is always editable. Type, delete, rewrite. Changes
  autosave to the real file — there is no Save button, and `⌘S` is just reassurance.
- **Comment on a selection.** Select text and a card opens in the right rail. The
  selection stays live, so you can also just type over it or delete it instead.
- **Comment on an element.** Click an image, a chart, or a container to attach
  feedback to the whole block.
- **Delete a block.** Hover anything and click the `✕`.
- **Undo everything.** `Revert all` restores the file to exactly how the agent left it.
- **Walk a multi-page site.** `⌘`-click a link to follow it. Each page keeps its own
  comments and edits; nothing is lost by navigating away and coming back.

## For agents

Point your agent at these two commands. Anything that can run a shell works.

```sh
edit-html <file.html>            # open it for the human
edit-html poll <file.html>       # block until they hit Send, then print JSON
edit-html poll <file.html> --ack # acknowledge the last batch and keep waiting
```

`edit-html setup` writes a Claude Code skill and an `AGENTS.md` section for Codex,
so you don't have to explain the loop yourself.

### The JSON contract

`poll` prints one object to stdout and nothing else. Progress goes to stderr.

```json
{
  "status": "feedback",
  "file": "/abs/path/to/file.html",
  "comments": [
    {
      "id": "c_335f9ecfbcfa",
      "kind": "selection",
      "quote": "Support tickets about lost context grew 40% last quarter",
      "anchor": { "prefix": "tools. ", "quote": "…", "suffix": ", and three" },
      "feedback": "Cite the source for the 40% figure."
    },
    {
      "id": "c_05ca654a2724",
      "kind": "element",
      "quote": "Metrics callout",
      "anchor": { "selector": "div > div", "label": "Metrics callout" },
      "feedback": "Move this below the Solution section."
    }
  ],
  "edits": [{ "label": "Lede", "kind": "edited" }],
  "overall_note": "Overall this reads well, just tighten the risks section.",
  "next_step": "…"
}
```

Two rules for the agent:

1. **`edits` are changes the human already made and saved.** Re-read the file before
   editing and never revert them.
2. **There is no reply channel.** The user sees your work when the page reloads,
   which happens automatically once you save the file.

### Nicer edit labels (optional)

edit-html names each edit from the DOM (`Problem · p`). Add `data-block` to the
sections you author and it uses your name instead:

```html
<p data-block="Problem body">…</p>
```

Add `data-container` to make a block clickable as a comment target:

```html
<div data-container="Metrics callout">…</div>
```

## Local only

There is no database and no server beyond a `127.0.0.1` process that exits when idle.
Comments live in a single JSON file at `~/.edit-html/state.json`; delete it any time.
The only thing that ever touches the network is npm fetching this package.

Your artifact is never modified beyond your own edits: the one injected `<script>`
tag and every highlight are stripped before anything is written to disk, so the saved
file renders exactly as it does standalone.

## Requirements

Node 20+. macOS, Linux, Windows.

## License

MIT
