import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(root, "skills");

const cases = [
  {
    name: "ordinary-review",
    command: "npx -y human-review",
    forbidden: ["human-review-plan.mjs", "human-review-loa.mjs"],
  },
  {
    name: "planning-review",
    command: "human-review-plan.mjs",
    forbidden: ["human-review-loa.mjs"],
  },
  {
    name: "loa-review",
    command: "human-review-loa.mjs",
    forbidden: ["human-review-plan.mjs"],
  },
];
for (const entry of cases) {
  test(`${entry.name} is a discoverable Human Review plugin skill`, () => {
    const dir = path.join(skillsRoot, entry.name);
    const skillFile = path.join(dir, "SKILL.md");
    const agentFile = path.join(dir, "agents", "openai.yaml");

    assert.equal(fs.existsSync(skillFile), true, `${entry.name}/SKILL.md is missing`);
    assert.equal(fs.existsSync(agentFile), true, `${entry.name}/agents/openai.yaml is missing`);

    const skill = fs.readFileSync(skillFile, "utf8");
    const agent = fs.readFileSync(agentFile, "utf8");
    assert.match(skill, new RegExp(`^---\\nname: ${entry.name}\\n`, "m"));
    assert.match(skill, /description: Use when /);
    assert.match(skill, new RegExp(entry.command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(skill, /Do not ask the user to run/);
    for (const forbidden of entry.forbidden) assert.doesNotMatch(skill, new RegExp(forbidden));
    assert.match(agent, /products: \[CHAT, CODEX\]/);
    assert.match(agent, /allow_implicit_invocation: true/);
  });
}

test("README documents plugin plus skill invocation examples", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  for (const entry of cases) assert.match(readme, new RegExp(`Human Review.*${entry.name}`, "i"));
});

test("plugin starter prompts surface every focused review skill", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
  const prompts = manifest.interface.defaultPrompt.join("\n");
  for (const entry of cases) assert.match(prompts, new RegExp(entry.name));
});

test("loa-review defaults to the approved prototype catalog contract", () => {
  const skill = fs.readFileSync(path.join(skillsRoot, "loa-review", "SKILL.md"), "utf8");
  assert.match(skill, /Codex.*catalog/i);
  assert.match(skill, /skills:\/\/plugins\/<plugin>\/<skill>/);
  assert.match(skill, /omit.*catalog/i);
  assert.doesNotMatch(skill, /"catalog"\s*:\s*\[\]/);
});
