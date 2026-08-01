# edit-html

Review agent-generated HTML and Markdown in your browser, then send every edit and comment back to your agent in one batch. Your agent writes a spec, a plan, a newsletter draft, a landing page — you open it, fix the small stuff by typing, comment on everything else by selecting it, and hit Send. No modes, no save button, no account, no database.

```
agent writes a file  →  edit-html <file>  →  you edit + comment  →  Send N to agent
        ↑                                                               │
        └────────────  page hot-reloads  ←  agent applies fixes  ←──────┘
```

## What it does

| You do | edit-html does |
|--------|----------------|
| Type over any text | Autosaves straight to the real file — `⌘S` is just reassurance |
| Select a phrase | Opens a comment card anchored to that exact quote |
| Click an image, chart, or block | Attaches feedback to the whole element |
| Hover and click `✕` | Deletes the block, records it as feedback |
| `⌘`-click a link | Walks a multi-page site; every page keeps its own feedback |
| Open a `.md` file | Renders it for review; edits go back as feedback, the source is never touched |
| Hit `Revert all` | Restores the file to exactly how the agent left it |
| Hit Send | Delivers one JSON batch covering every page you visited |

Two special cases it handles for you: pages whose own scripts rewrite the DOM (a self-rendering chart, say) are detected automatically and switched to feedback-only mode so the file is never corrupted, and feedback you send survives timeouts, dead polls, and server restarts.

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

That writes a skill to `~/.claude/skills/edit-html/` so Claude Code offers a review in every project. Drop `--global` to set up only the current repo (that also adds an `AGENTS.md` section for Codex).

## Use

**1. Review a file.** Open it, edit and comment in the browser, hit Send:

```sh
edit-html spec.html
```

**2. Wire up an agent.** Anything that can run a shell works. The agent opens the file, then blocks on `poll` until you hit Send:

```sh
edit-html <file>                          # open it for the human
edit-html poll <file> --timeout 600       # wait for feedback, print it as JSON
edit-html poll <file> --ack --timeout 600 # acknowledge the batch, keep waiting
edit-html status <file>                   # is feedback waiting? answers instantly
```

A timed-out poll exits 0 with `{"status":"timeout"}` so agents can loop deliberately instead of hanging. `poll` prints one object to stdout and nothing else:

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

Two rules for the agent:

1. **`edits` are changes the human already made.** `after` carries their exact wording — apply it verbatim, and if the file was generated from MDX or Markdown, apply it to the source too.
2. **There is no reply channel.** The human sees your work when the page reloads, which happens automatically once you save the file.

**3. Name your sections (optional).** Add `data-block` to the regions you author and the edit list uses your names instead of guessing from the DOM; `data-container` also makes a block clickable as a comment target:

```html
<p data-block="Problem body">…</p>
<div data-container="Metrics callout">…</div>
```

## Local only

There is no database and no server beyond a `127.0.0.1` process that exits when idle. Comments live in a single JSON file at `~/.edit-html/state.json`; delete it any time. The only thing that ever touches the network is npm fetching this package.

The local server requires a per-run secret token on every API call and rejects requests whose `Host` header is not localhost, so neither another local process nor a malicious web page doing DNS rebinding can read or write your files through edit-html. Saved files are stripped of everything edit-html injects, so they render exactly as they do standalone.

## Files

1. `src/cli.js`: The `edit-html`, `poll`, `status`, and `setup` commands.
2. `src/server.js`: The localhost server — sessions, batches, file watching, auth.
3. `src/sdk.js`: Runs inside the reviewed page — editing, highlights, serialization.
4. `src/chrome-client.js`: The review UI around the page — comments, edits, Send.
5. `src/markdown.js`: Renders `.md` files for review.
6. `src/skill.md`: The skill `setup` installs for Claude Code and Codex.

## Requirements

Node 20+. macOS, Linux, Windows.

## Who made this

This is one tool from my personal AI operating system. The full library, including my courses and workflows, lives at [Behind the Craft](https://behindthecraft.com).

## License

MIT
