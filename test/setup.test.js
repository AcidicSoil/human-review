import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { installSkills, invocation, isTransientBin, mergeAgentsBlock } from "../src/setup.js";

test("global setup installs the skill and local planning runtime for every agent root", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-setup-"));

  try {
    const result = installSkills(home, { global: true, home });
    for (const root of [".claude", ".codex", ".agents"]) {
      const skillDir = path.join(home, root, "skills", "human-review");
      const skill = path.join(skillDir, "SKILL.md");
      const runner = path.join(skillDir, "human-review-plan.mjs");
      const generator = path.join(skillDir, "generator.mjs");
      const fallback = path.join(skillDir, "fallback-client.js");
      const tools = path.join(skillDir, "artifact-tools.js");
      const loaGenerator = path.join(skillDir, "loa-generator.mjs");
      const loaClient = path.join(skillDir, "loa-client.js");
      const loaRunner = path.join(skillDir, "human-review-loa.mjs");

      assert.equal(fs.existsSync(skill), true);
      assert.equal(fs.existsSync(runner), true);
      assert.equal(fs.existsSync(generator), true);
      assert.equal(fs.existsSync(fallback), true);
      assert.equal(fs.existsSync(tools), true);
      assert.equal(fs.existsSync(loaGenerator), true);
      assert.equal(fs.existsSync(loaClient), true);
      assert.equal(fs.existsSync(loaRunner), true);

      const installedSkill = fs.readFileSync(skill, "utf8");
      assert.match(installedSkill, /human-review poll/);
      assert.match(installedSkill, /human-review-plan\.mjs/);
      assert.match(installedSkill, /human-review-loa\.mjs/);
      assert.match(installedSkill, /third review mode|LOA review/i);
      assert.match(installedSkill, /Do not stop and tell the user to run a generator later/);
    }
    assert.match(result.join("\n"), /Claude Code plan runtime/);
    assert.match(result.join("\n"), /Codex plan runtime/);
    assert.match(result.join("\n"), /Shared agents plan runtime/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("installed planning runtime still emits full artifact tools without package dependencies", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-offline-"));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-plan-src-"));

  try {
    installSkills(work, { global: true, home });
    const runner = path.join(home, ".agents", "skills", "human-review", "human-review-plan.mjs");
    const input = path.join(work, "plan.md");
    const output = path.join(work, "plan.review.html");
    fs.writeFileSync(input, "# Plan\n\n## Architecture\n\nEditable text.\n");

    const run = spawnSync(process.execPath, [runner, input, output, "--no-open"], {
      cwd: home,
      encoding: "utf8",
      env: { ...process.env, NODE_PATH: "" },
    });

    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.equal(fs.existsSync(output), true);
    const html = fs.readFileSync(output, "utf8");
    assert.match(html, /id="hr-editor-bundle"/);
    assert.match(html, /id="hr-artifact-tools"/);
    assert.match(html, /Save reviewed HTML/);
    assert.match(html, /Save PRD/);
    assert.match(html, /Planning document navigation/);
    assert.match(html, /contenteditable|contentEditable/);
    assert.doesNotMatch(html, /background:\s*(?:#fff(?:fff)?|white)\b/i);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  }
});

test("a bin that exists only for one command or one project is not an install", () => {
  // npx: the package is on PATH for the length of the setup command only.
  assert.equal(isTransientBin("/Users/x/.npm/_npx/f043fcd613c7efad/node_modules/.bin/human-review"), true);
  assert.equal(isTransientBin("C:\\Users\\x\\AppData\\Local\\npm-cache\\_npx\\a1b2\\node_modules\\.bin\\human-review.cmd"), true);

  // pnpm dlx, yarn dlx, bunx, and a plain project-local dependency: durable on
  // disk, but only resolvable from inside one project.
  assert.equal(isTransientBin("/Users/x/project/node_modules/.bin/human-review"), true);
  assert.equal(isTransientBin("/Users/x/.cache/bun/node_modules/.bin/human-review"), true);

  // Durable installs must still win.
  assert.equal(isTransientBin("/opt/homebrew/bin/human-review"), false);
  assert.equal(isTransientBin("/usr/local/bin/human-review"), false);
  assert.equal(isTransientBin("/Users/x/.volta/bin/human-review"), false);

  // Both markers count only as whole path segments.
  assert.equal(isTransientBin("/Users/x/my_npx_tools/bin/human-review"), false);
  assert.equal(isTransientBin("/Users/x/node_modules_backup/bin/human-review"), false);
});

test("invocation prefers npx when the only bin on PATH is transient", () => {
  const probe = (bin) => (_probe, _args) => ({ status: bin ? 0 : 1, stdout: bin ? `${bin}\n` : "" });
  assert.equal(invocation(probe("/Users/x/.npm/_npx/deadbeef/node_modules/.bin/human-review")), "npx -y human-review");
  assert.equal(invocation(probe("/Users/x/project/node_modules/.bin/human-review")), "npx -y human-review");
  assert.equal(invocation(probe("/Users/x/.local/bin/human-review")), "human-review");
  assert.equal(invocation(probe("")), "npx -y human-review");
});

test("the CLI lookup hides its child process window", () => {
  let options;
  invocation((_probe, _args, receivedOptions) => {
    options = receivedOptions;
    return { status: 1, stdout: "" };
  });

  assert.equal(options?.windowsHide, true);
});

test("setup rewrites the AGENTS.md block it owns, replaces the legacy one, and leaves custom text alone", () => {
  const block = "\n## Reviewing files and localhost pages with human-review\n\nNew instructions.\n";
  const created = mergeAgentsBlock("", block);
  assert.equal(created.action, "created");
  assert.match(created.text, /^<!-- human-review:start -->\n## Reviewing/);
  assert.match(created.text, /<!-- human-review:end -->\n$/);

  // A second run with the same block changes nothing.
  assert.equal(mergeAgentsBlock(created.text, block).action, "current");

  // A newer block replaces the marked one and keeps everything around it.
  const project = `# My project\n\nHouse rules.\n\n${created.text}\n## Testing\n\nRun npm test.\n`;
  const updated = mergeAgentsBlock(project, "\n## Reviewing files and localhost pages with human-review\n\nNewer still.\n");
  assert.equal(updated.action, "updated");
  assert.match(updated.text, /House rules\./);
  assert.match(updated.text, /Newer still\./);
  assert.doesNotMatch(updated.text, /New instructions\./);
  assert.match(updated.text, /## Testing\n\nRun npm test\./);
  assert.equal((updated.text.match(/human-review:start/g) || []).length, 1);

  // The block an older setup wrote had no markers: it ran from its heading to
  // the next heading. It is replaced, not duplicated.
  const legacy = "# My project\n\n## Reviewing files and localhost pages with human-review\n\nOld: poll with --timeout 600.\n\n## Testing\n\nRun npm test.\n";
  const migrated = mergeAgentsBlock(legacy, block);
  assert.equal(migrated.action, "updated");
  assert.doesNotMatch(migrated.text, /--timeout 600/);
  assert.match(migrated.text, /New instructions\./);
  assert.match(migrated.text, /## Testing\n\nRun npm test\./);
  assert.equal(mergeAgentsBlock(migrated.text, block).action, "current");

  // A project that wrote its own human-review guidance keeps it.
  const custom = "# Project\n\nWe use human-review our own way.\n";
  assert.equal(mergeAgentsBlock(custom, block).action, "custom");
  assert.equal(mergeAgentsBlock(custom, block).text, custom);
});

test("a project setup migrates a legacy AGENTS.md block on disk", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-agents-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-home-"));
  try {
    fs.writeFileSync(path.join(cwd, "AGENTS.md"), "# P\n\n## Reviewing files and localhost pages with human-review\n\nThen block on poll --timeout 600.\n");
    const first = installSkills(cwd, { home });
    assert.ok(first.some((line) => line.startsWith("Updated AGENTS.md")), first.join("\n"));
    const text = fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8");
    assert.doesNotMatch(text, /--timeout 600/);
    assert.match(text, /human-review:start/);
    const second = installSkills(cwd, { home });
    assert.ok(second.some((line) => line.startsWith("AGENTS.md already current")), second.join("\n"));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});
