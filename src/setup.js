import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

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

/**
 * Quote a path for copy-paste into any shell. JSON.stringify would double
 * Windows backslashes; plain double quotes work in bash, zsh, cmd and
 * PowerShell alike, and paths cannot legally contain a double quote on Windows.
 */
export function shellQuote(arg) {
  const text = String(arg);
  return /^[\w@%+=:,./-]+$/.test(text) ? text : `"${text.replaceAll('"', '\\"')}"`;
}

/** The skill lives in its own markdown file so nothing needs escaping. */
export const readSkill = () => fs.readFileSync(path.join(here, "skill.md"), "utf8");

export const skillFor = (cmd) => readSkill().replaceAll("npx -y edit-html", cmd);

const CODEX_BLOCK = `
## Reviewing HTML and Markdown with edit-html

After writing an HTML or Markdown file the user will read, open it for them with
\`npx -y edit-html <file.html>\`, then block on
\`npx -y edit-html poll <file.html> --timeout 600\` until they send feedback.
If it prints \`{"status":"timeout"}\`, no feedback arrived yet — run the same
poll command again to keep waiting. When a \`{"status":"feedback"}\` batch
arrives, apply it, then poll again with \`--ack\`.

Keep the poll command in the foreground and do not end the turn while it waits.
If the shell returns a process or session handle, keep waiting on that handle until
the command exits. \`npx -y edit-html status <file.html>\` reports instantly
whether feedback is already waiting, without blocking.

The batch groups feedback by page under \`pages\`, so fix every page listed. Items
under \`edits\` are changes the user already made: \`after\` is their exact wording,
so carry it across verbatim and never revert it — and if the HTML was generated
from MDX or Markdown, apply it to the source too. Markdown files open rendered
and are never written by edit-html: apply their comments and edits to the
Markdown source, keeping its syntax. There is no reply channel; the user sees
your work when the page reloads.
`;

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
