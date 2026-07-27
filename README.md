# edit-html

**Review and edit agent-generated HTML in the browser, then send the whole batch back to your agent.**

Your agent writes a spec, a plan, a newsletter draft, a landing page. You open it,
fix the small stuff by typing, comment on everything else by selecting it, and send
it all back in one go. No modes, no save button, no account, no database.

## Install

Nothing to install — `npx` fetches it on demand:

```sh
npx -y edit-html path/to/file.html
```

Prefer it always available? `npm install -g edit-html`, then just `edit-html <file>`.

Then teach your agent when to reach for it:

```sh
edit-html setup --global
```

That writes a skill to `~/.claude/skills/edit-html/` so Claude Code offers a review
in every project. Drop `--global` to set up only the current repo (that also adds an
`AGENTS.md` section for Codex).

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

Run `poll` in the foreground and keep the agent turn open. If a harness returns a
process or session handle, the agent must keep waiting on that handle until `poll`
exits. If the harness times out, run the same command again; feedback is saved.

### The JSON contract

`poll` prints one object to stdout and nothing else. Progress goes to stderr.

```json
{
  "status": "feedback",
  "pages": [
    {
      "file": "/abs/path/to/page.html",
      "comments": [
        {
          "id": "c_335f9ecfbcfa",
          "kind": "selection",
          "quote": "Support tickets about lost context grew 40% last quarter",
          "anchor": { "prefix": "tools. ", "quote": "…", "suffix": ", and three" },
          "feedback": "Cite the source for the 40% figure."
        }
      ],
      "edits": [
        { "label": "Lede", "kind": "edited",
          "before": "the original wording", "after": "your exact new wording" }
      ]
    }
  ],
  "overall_note": "Tighten the risks section."
}
```

One batch covers every page you visited, so you can walk a whole site with
`⌘`-click, leave feedback as you go, and send it all at once.

Two rules for the agent:

1. **`edits` are changes you already made.** `after` carries your exact wording, so
   an agent can apply it to the real source — useful when the HTML was generated
   from MDX or Markdown and would otherwise be overwritten on the next build.
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
