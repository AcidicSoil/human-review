import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { installSkills, invocation, isNpxCachePath } from "../src/setup.js";

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

test("a binary from npm's _npx cache does not count as installed on PATH", () => {
  assert.equal(
    isNpxCachePath("/Users/x/.npm/_npx/f043fcd613c7efad/node_modules/.bin/human-review"),
    true,
  );
  assert.equal(
    isNpxCachePath("C:\\Users\\x\\AppData\\Local\\npm-cache\\_npx\\a1b2\\human-review.cmd"),
    true,
  );
  assert.equal(isNpxCachePath("/opt/homebrew/bin/human-review"), false);
  assert.equal(isNpxCachePath("/usr/local/bin/human-review"), false);
  assert.equal(isNpxCachePath("/Users/x/my_npx_tools/bin/human-review"), false);
});

test("the CLI lookup hides its child process window", () => {
  let options;
  invocation((_probe, _args, receivedOptions) => {
    options = receivedOptions;
    return { status: 1, stdout: "" };
  });

  assert.equal(options?.windowsHide, true);
});
