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

/** The skill lives in its own markdown file so nothing needs escaping. */
export const readSkill = () => fs.readFileSync(path.join(here, "skill.md"), "utf8");

export const skillFor = (cmd) => readSkill().replaceAll("npx -y edit-html", cmd);

const CODEX_BLOCK = `
## Reviewing HTML with edit-html

After writing an HTML file the user will read, open it for them with
\`npx -y edit-html <file.html>\`, then block on \`npx -y edit-html poll <file.html>\`
until they send feedback. Apply the JSON that comes back and poll again with
\`--ack\`.

The batch groups feedback by page under \`pages\`, so fix every page listed. Items
under \`edits\` are changes the user already made: \`after\` is their exact wording,
so carry it across verbatim and never revert it — and if the HTML was generated
from MDX or Markdown, apply it to the source too. There is no reply channel; the
user sees your work when the page reloads.
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
