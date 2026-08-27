import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = path.join(root, "skills", "human-review");

test("packaged Human Review skill is generated from the source skill for plugin execution", () => {
  const source = fs.readFileSync(path.join(root, "src", "SKILL.md"), "utf8");
  const packaged = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
  const expected = source
    .replace(
      "`human-review-plan` is installed beside this skill. Run it directly:",
      "The plugin bundles the planning runtime beside this skill. Set `SKILL_DIR` to the absolute directory containing this loaded `SKILL.md`, then run:",
    )
    .replaceAll(
      "human-review-plan path/to/plan.md",
      'node "$SKILL_DIR/human-review-plan.mjs" path/to/plan.md',
    )
    .replaceAll(
      "human-review-loa path/to/loa.json",
      'node "$SKILL_DIR/human-review-loa.mjs" path/to/loa.json',
    );

  assert.equal(packaged, expected);
});

test("packaged Human Review skill carries its offline planning and LOA runtimes", () => {
  for (const file of [
    "human-review-plan.mjs",
    "generator.mjs",
    "fallback-client.js",
    "artifact-tools.js",
    "human-review-loa.mjs",
    "loa-generator.mjs",
    "loa-client.js",
  ]) {
    assert.equal(fs.existsSync(path.join(skillDir, file)), true, `${file} is missing`);
  }
});

test("plugin manifest and marketplace declare the skills-only package surface", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
  const marketplace = JSON.parse(fs.readFileSync(path.join(root, ".agents", "plugins", "marketplace.json"), "utf8"));

  assert.equal(manifest.skills, "./skills/");
  assert.equal("mcpServers" in manifest, false);
  assert.equal("apps" in manifest, false);
  assert.equal(manifest.interface.logo, "./assets/logo-light.svg");
  assert.equal(manifest.interface.composerIcon, "./assets/composer-icon.svg");
  assert.deepEqual(manifest.author, {
    name: "AcidicSoil",
    url: "https://github.com/AcidicSoil",
  });
  assert.equal(manifest.interface.developerName, "AcidicSoil");

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(manifest.version, "0.6.2");
  assert.equal(packageJson.version, "0.6.2");
  assert.equal(packageJson.author, "AcidicSoil");
  assert.equal(packageJson.homepage, "https://github.com/AcidicSoil/human-review#readme");
  assert.deepEqual(packageJson.repository, {
    type: "git",
    url: "https://github.com/AcidicSoil/human-review.git",
  });
  assert.equal(packageJson.bugs.url, "https://github.com/AcidicSoil/human-review/issues");
  assert.deepEqual(marketplace.plugins[0].source, {
    source: "url",
    url: "https://github.com/AcidicSoil/human-review.git",
    ref: "main",
  });
  assert.equal(marketplace.plugins[0].policy.installation, "AVAILABLE");
  assert.equal(marketplace.plugins[0].policy.authentication, "ON_INSTALL");
  assert.equal(marketplace.plugins[0].category, "Productivity");
});
