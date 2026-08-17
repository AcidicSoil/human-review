import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const plateHere = path.join(here, "plate-review");

export function invocation(run = spawnSync) {
  const probe = process.platform === "win32" ? "where" : "which";
  const found = run(probe, ["human-review"], { encoding: "utf8", windowsHide: true });
  const resolved = found.status === 0 ? found.stdout.trim().split(/\r?\n/)[0].trim() : "";
  return resolved && !isNpxCachePath(resolved) ? "human-review" : "npx -y human-review";
}

export function isNpxCachePath(binPath) {
  return binPath.split(/[\\/]/).includes("_npx");
}

export function shellQuote(arg) {
  const text = String(arg);
  return /^[\w@%+=:,./-]+$/.test(text) ? text : `"${text.replaceAll('"', '\\"')}"`;
}

export const readSkill = () => fs.readFileSync(path.join(here, "SKILL.md"), "utf8");

export function installPlanRuntime(skillDir) {
  fs.mkdirSync(skillDir, { recursive: true });

  fs.copyFileSync(path.join(plateHere, "generator.js"), path.join(skillDir, "generator.mjs"));
  fs.copyFileSync(path.join(plateHere, "fallback-client.js"), path.join(skillDir, "fallback-client.js"));
  fs.copyFileSync(path.join(plateHere, "artifact-tools.js"), path.join(skillDir, "artifact-tools.js"));

  const prebuilt = path.join(plateHere, "client.bundle.js");
  const installedBundle = path.join(skillDir, "client.bundle.js");
  if (fs.existsSync(prebuilt)) fs.copyFileSync(prebuilt, installedBundle);
  else if (fs.existsSync(installedBundle)) fs.unlinkSync(installedBundle);

  const runner = `#!/usr/bin/env node\nimport { runCli } from "./generator.mjs";\nrunCli().then((code) => { process.exitCode = code; }).catch((error) => { console.error(error.message || error); process.exitCode = 1; });\n`;
  const runnerFile = path.join(skillDir, "human-review-plan.mjs");
  fs.writeFileSync(runnerFile, runner);
  return runnerFile;
}

export const skillFor = (cmd, planCmd) => readSkill()
  .replaceAll("npx -y human-review", cmd)
  .replaceAll("human-review-plan path/to/plan.md", `${planCmd} path/to/plan.md`);

const CODEX_BLOCK = `
## Reviewing files and localhost pages with human-review

After writing an HTML or Markdown file the user will read, open it for them with
\`npx -y human-review <file.html>\`. For a locally running web page, open the real
route with \`npx -y human-review http://localhost:3000/path\` instead of recreating
it as a static file. Then block on
\`npx -y human-review poll <target> --timeout 600\` until they send feedback.
If it prints \`{"status":"timeout"}\`, run the same poll command again. When a
feedback batch arrives, apply it, then poll again with \`--ack\`.

For a large plan/spec/PRD, generate the review artifact with \`__PLAN__ <source> <output.review.html>\`.
That generator is installed with this skill and embeds an editor runtime directly into the HTML.
Do not stop because npm, Plate, React, esbuild, or network access is unavailable at review time;
the installed generator must still emit an editable review artifact.

Items under \`edits\` are changes the user already made: carry \`after\` across
verbatim and never revert it. For Markdown, apply feedback to the source. For
localhost pages, update the matching component/template source and never write a
rendered HTTP response over project source.
`;

export function installSkills(cwd, { global: isGlobal = false, home = os.homedir() } = {}) {
  const done = [];
  const cmd = invocation();

  const skillRoots = isGlobal
    ? [
        ["Claude Code", path.join(home, ".claude")],
        ["Codex", path.join(home, ".codex")],
        ["Shared agents", path.join(home, ".agents")],
      ]
    : [["Claude Code", path.join(cwd, ".claude")]];

  let projectPlanCmd = "";
  for (const [agent, base] of skillRoots) {
    const skillDir = path.join(base, "skills", "human-review");
    const skillFile = path.join(skillDir, "SKILL.md");
    const runnerFile = installPlanRuntime(skillDir);
    const planCmd = `node ${shellQuote(runnerFile)}`;
    if (!projectPlanCmd) projectPlanCmd = planCmd;
    fs.writeFileSync(skillFile, skillFor(cmd, planCmd));
    done.push(`${agent} skill  ${skillFile}${isGlobal ? "   (all projects)" : ""}`);
    done.push(`${agent} plan runtime  ${runnerFile}`);
  }

  if (!isGlobal) {
    const agents = path.join(cwd, "AGENTS.md");
    const existing = fs.existsSync(agents) ? fs.readFileSync(agents, "utf8") : "";
    if (existing.includes("human-review")) {
      done.push("AGENTS.md already mentions human-review — left it alone");
    } else {
      const block = CODEX_BLOCK
        .replaceAll("npx -y human-review", cmd)
        .replaceAll("__PLAN__", projectPlanCmd);
      fs.writeFileSync(agents, existing ? `${existing.trimEnd()}\n${block}` : block.trimStart());
      done.push(`${existing ? "Updated" : "Created"} AGENTS.md   (Codex)`);
    }
  }

  done.push("", `Agents will be told to run: ${cmd}`);
  done.push(`Planning artifacts use: ${projectPlanCmd}`);
  if (cmd.startsWith("npx")) {
    done.push("Ordinary human-review commands still use npx until the package is installed or linked.");
    done.push("Planning artifact generation does not depend on that npx call after setup.");
  }
  done.push("Any other agent works too — see the JSON contract in the README.");
  return done;
}
