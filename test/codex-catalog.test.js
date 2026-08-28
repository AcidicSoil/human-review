import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildCodexCatalog } from "../src/loa-review/catalog.js";

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

test("builds the prototype component rail from installed Codex plugins and skills", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-catalog-"));
  const home = path.join(root, "home");
  const humanReviewRoot = path.join(root, "marketplaces", "human-review");
  const superpowersRoot = path.join(home, ".codex", "plugins", "cache", "claude-plugins-official", "superpowers", "6.3.0");

  write(path.join(humanReviewRoot, ".codex-plugin", "plugin.json"), JSON.stringify({
    name: "human-review",
    interface: { displayName: "Human Review", category: "Productivity" },
  }));
  write(path.join(humanReviewRoot, "skills", "loa-review", "SKILL.md"), "---\nname: loa-review\ndescription: Use when reviewing an LOA.\n---\n");
  write(path.join(superpowersRoot, "skills", "test-driven-development", "SKILL.md"), "---\nname: test-driven-development\ndescription: Use when implementing.\n---\n");

  const pluginList = { installed: [
    { name: "human-review", marketplaceName: "human-review", version: "0.6.3", installed: true, enabled: true, source: { source: "git" } },
    { name: "superpowers", marketplaceName: "claude-plugins-official", version: "6.3.0", installed: true, enabled: true, source: { source: "git" } },
    { name: "disabled-plugin", marketplaceName: "x", version: "1.0.0", installed: true, enabled: false, source: { source: "git" } },
  ] };
  const marketplaceList = { marketplaces: [
    { name: "human-review", root: humanReviewRoot },
    { name: "claude-plugins-official", root: path.join(root, "marketplaces", "claude-plugins-official") },
  ] };

  const catalog = buildCodexCatalog({ pluginList, marketplaceList, home });
  const plugins = catalog.flatMap((group) => group.plugins);
  const humanReview = plugins.find((plugin) => plugin.ref === "human-review");
  const superpowers = plugins.find((plugin) => plugin.ref === "superpowers");

  assert.equal(humanReview.displayName, "Human Review");
  assert.equal(humanReview.kind, "plugin");
  assert.deepEqual(humanReview.skills[0], {
    kind: "skill",
    ref: "skills://plugins/human-review/loa-review",
    pluginRef: "human-review",
    displayName: "loa-review",
  });
  assert.deepEqual(superpowers.skills[0], {
    kind: "skill",
    ref: "skills://plugins/superpowers/test-driven-development",
    pluginRef: "superpowers",
    displayName: "test-driven-development",
  });
  assert.equal(plugins.some((plugin) => plugin.ref === "disabled-plugin"), false);
  assert.equal(catalog.some((group) => group.category === "Productivity"), true);
});

test("uses a local plugin source path and finds nested skill packages", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-local-catalog-"));
  const pluginRoot = path.join(root, "mattpocock");
  write(path.join(pluginRoot, "skills", "engineering", "prototype", "SKILL.md"), "---\nname: prototype\ndescription: Use when prototyping.\n---\n");

  const catalog = buildCodexCatalog({
    pluginList: { installed: [{
      name: "mattpocock-skills", marketplaceName: "mattpocock", version: "1.2.3",
      installed: true, enabled: true, source: { source: "local", path: pluginRoot },
    }] },
    marketplaceList: { marketplaces: [] },
    home: root,
  });

  assert.equal(catalog[0].plugins[0].skills[0].ref, "skills://plugins/mattpocock-skills/prototype");
});

test("an unresolved installed plugin keeps its own identity instead of borrowing cwd metadata", () => {
  const catalog = buildCodexCatalog({
    pluginList: { installed: [{
      name: "remote-only", marketplaceName: "missing-marketplace", version: "1.0.0",
      installed: true, enabled: true, source: { source: "git", url: "https://example.invalid/plugin.git" },
    }] },
    marketplaceList: { marketplaces: [] },
    home: fs.mkdtempSync(path.join(os.tmpdir(), "human-review-unresolved-")),
  });
  assert.equal(catalog[0].plugins[0].ref, "remote-only");
  assert.equal(catalog[0].plugins[0].displayName, "remote-only");
  assert.deepEqual(catalog[0].plugins[0].skills, []);
});
