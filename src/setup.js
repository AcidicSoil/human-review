import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

/**
 * Teach agents the command that will actually work here. A global install or
 * `npm link` puts `edit-html` on PATH; otherwise fall back to npx, which only
 * resolves once the package is published.
 */
export function invocation() {
  const probe = process.platform === "win32" ? "where" : "which";
  const found = spawnSync(probe, ["edit-html"], { encoding: "utf8" });
  return found.status === 0 && found.stdout.trim() ? "edit-html" : "npx -y edit-html";
}

export const SKILL = `---
name: edit-html
description: Open an HTML file in the browser so the user can edit the text directly and leave comments on specific parts, then send all their edits and comments back to you. Use after writing or updating any HTML file the user will read — specs, plans, reports, newsletter drafts, landing pages, slide decks.
---

# edit-html

The user reviews your HTML in a real browser: they fix small things by typing,
select anything to comment on it, and send you the whole batch at once.

## The loop

1. Write or update the HTML file.
2. Open it for the user:

   \`\`\`sh
   npx -y edit-html path/to/file.html
   \`\`\`

3. Wait for feedback. This blocks until they hit Send:

   \`\`\`sh
   npx -y edit-html poll path/to/file.html
   \`\`\`

4. Apply what comes back, then wait again. \`--ack\` clears the batch you just handled:

   \`\`\`sh
   npx -y edit-html poll path/to/file.html --ack
   \`\`\`

Repeat 3–4 until the user says they are done.

## What you get

\`\`\`json
{
  "status": "feedback",
  "file": "/abs/path/to/file.html",
  "comments": [
    { "id": "c_1", "kind": "selection", "quote": "the exact text they selected",
      "anchor": { "prefix": "...", "quote": "...", "suffix": "..." },
      "feedback": "what they want changed" }
  ],
  "edits": [{ "label": "Problem body", "kind": "edited" }],
  "overall_note": "page-level feedback not tied to any one part"
}
\`\`\`

## Rules

- **\`edits\` are changes the user already made and saved to the file.** Re-read the
  file before editing, and never revert those parts.
- Find each comment by its \`quote\` — that exact string is in the file.
- \`kind: "element"\` points at a whole block; \`quote\` is its label, not body text.
- **Do not write a reply.** There is no chat. The user sees your work when the page
  reloads, which happens on its own the moment you save the file.

## Better edit labels (optional)

Name the sections you author and the user's edit list uses your names instead of
guessing from the DOM:

\`\`\`html
<p data-block="Problem body">…</p>
<div data-container="Metrics callout">…</div>
\`\`\`

\`data-block\` names a region for the edit list. \`data-container\` also makes the block
clickable as a comment target.
`;

const CODEX_BLOCK = `
## Reviewing HTML with edit-html

After writing an HTML file the user will read, open it for them with
\`npx -y edit-html <file.html>\`, then block on \`npx -y edit-html poll <file.html>\`
until they send feedback. Apply the JSON that comes back and poll again with
\`--ack\`. Items under \`edits\` are changes the user already made — re-read the file
and keep them. There is no reply channel; the user sees your work when the page
reloads.
`;

export const skillFor = (cmd) => SKILL.replaceAll("npx -y edit-html", cmd);

export function installSkills(cwd, { global: isGlobal = false } = {}) {
  const done = [];
  const cmd = invocation();

  const base = isGlobal ? path.join(os.homedir(), ".claude") : path.join(cwd, ".claude");
  const skillFile = path.join(base, "skills", "edit-html", "SKILL.md");
  fs.mkdirSync(path.dirname(skillFile), { recursive: true });
  fs.writeFileSync(skillFile, skillFor(cmd));
  done.push(`Claude Code skill  ${skillFile}${isGlobal ? "   (all projects)" : ""}`);

  if (!isGlobal) {
    const agents = path.join(cwd, "AGENTS.md");
    const existing = fs.existsSync(agents) ? fs.readFileSync(agents, "utf8") : "";
    if (existing.includes("edit-html")) {
      done.push("AGENTS.md already mentions edit-html — left it alone");
    } else {
      const block = CODEX_BLOCK.replaceAll("npx -y edit-html", cmd);
      fs.writeFileSync(agents, existing ? `${existing.trimEnd()}\n${block}` : block.trimStart());
      done.push(`${existing ? "Updated" : "Created"} AGENTS.md   (Codex)`);
    }
  }

  done.push("", `Agents will be told to run: ${cmd}`);
  if (cmd.startsWith("npx")) {
    done.push("Heads up: npx only works once edit-html is published. Run `npm link` in the");
    done.push("edit-html folder first if you want to use it locally, then re-run setup.");
  }
  done.push("Any other agent works too — see the JSON contract in the README.");
  return done;
}
