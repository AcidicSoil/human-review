import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  REVIEW_CSS,
  createReviewHtml,
  generateReviewArtifact,
} from "../src/plate-review/artifact.js";
import {
  normalizeReviewActions,
  slugifyReviewId,
  toggleReviewAction,
} from "../src/plate-review/review-state.js";

test("review actions keep remove exclusive", () => {
  assert.deepEqual(normalizeReviewActions("verify,revise,verify"), ["revise", "verify"]);
  assert.deepEqual(normalizeReviewActions("revise,remove,verify"), ["remove"]);
  assert.deepEqual(toggleReviewAction(["revise"], "expand"), ["revise", "expand"]);
  assert.deepEqual(toggleReviewAction(["revise", "verify"], "remove"), ["remove"]);
  assert.deepEqual(toggleReviewAction(["remove"], "remove"), []);
});

test("review ids are stable slugs", () => {
  assert.equal(slugifyReviewId("Architecture & Data Flow"), "architecture-data-flow");
  assert.equal(slugifyReviewId(""), "section");
});

test("review surfaces avoid plain white backgrounds", () => {
  assert.match(REVIEW_CSS, /--hr-bg:\s*#11161d/);
  assert.match(REVIEW_CSS, /\.hr-sidebar/);
  assert.doesNotMatch(REVIEW_CSS, /background:\s*(?:#fff(?:fff)?|white)\b/i);

  const html = createReviewHtml({
    sourceHtml: "<section data-review-section=\"scope\"><h2>Scope</h2><p>Plan</p></section>",
    title: "Plan",
    sourcePath: "/tmp/plan.md",
    artifactName: "plan.review.html",
    bundle: "console.log('editor');",
    editor: "plate",
    tools: "console.log('artifact tools');",
  });
  assert.match(html, /meta name="human-review-editor" content="plate"/);
  assert.match(html, /id="hr-editor-bundle"/);
  assert.match(html, /id="hr-artifact-tools"/);
  assert.match(html, /id="hr-bootstrap" type="application\/json"/);
  assert.doesNotMatch(html, /background:\s*(?:#fff(?:fff)?|white)\b/i);
});

test("planning generation always emits navigation, PRD export, and an embedded editor", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-plan-"));
  const input = path.join(dir, "plan.md");
  const output = path.join(dir, "plan.review.html");
  fs.writeFileSync(input, "# Plan\n\n## Architecture\n\nEdit this block.\n");

  const result = await generateReviewArtifact(input, output);
  const html = fs.readFileSync(output, "utf8");

  assert.equal(result.output, output);
  assert.ok(["plate", "embedded-dom"].includes(result.editor));
  assert.match(html, /id="hr-editor-bundle"/);
  assert.match(html, /id="hr-artifact-tools"/);
  assert.match(html, /Save reviewed HTML/);
  assert.match(html, /Save PRD/);
  assert.match(html, /Planning document navigation/);
  assert.match(html, /data-review|review_section|review-section/);
});
