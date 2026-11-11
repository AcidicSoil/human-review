import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { resolveNotesScope } from "../src/notepad/scope.js";

test("notes default to the Git root, including from nested directories", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-scope-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repository = path.join(root, "project");
  const nested = path.join(repository, "src", "features");
  const outside = path.join(root, "outside");
  fs.mkdirSync(nested, { recursive: true });
  fs.mkdirSync(outside);
  execFileSync("git", ["init", "--quiet", repository]);

  assert.equal(resolveNotesScope({ cwd: repository, env: {} }), repository);
  assert.equal(resolveNotesScope({ cwd: nested, env: {} }), repository);
  assert.equal(resolveNotesScope({ cwd: outside, env: {} }), outside);
});

test("explicit scope overrides the environment, which overrides Git", t => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-scope-"));
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet", repository]);

  const env = { HUMAN_REVIEW_DEFAULT_SCOPE: "/shared/notepad" };
  assert.equal(resolveNotesScope({ cwd: repository, env }), "/shared/notepad");
  assert.equal(resolveNotesScope({ cwd: repository, env, explicitScope: "/manual/notepad" }), "/manual/notepad");
  assert.equal(resolveNotesScope({ cwd: repository, env: { HUMAN_REVIEW_DEFAULT_SCOPE: "" } }), repository);
});
