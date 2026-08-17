import assert from "node:assert/strict";
import test from "node:test";

import {
  DARK_REVIEW_CSS,
  bundlePlateReviewClient,
  createPlateReviewHtml,
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

test("planning artifacts enforce a dark shell", () => {
  assert.match(DARK_REVIEW_CSS, /color-scheme:\s*dark/);
  assert.match(DARK_REVIEW_CSS, /--hr-bg:\s*#090d12/);
  assert.doesNotMatch(DARK_REVIEW_CSS, /background:\s*(?:#fff(?:fff)?|white)\b/i);

  const html = createPlateReviewHtml({
    sourceHtml: "<section data-review-section=\"scope\"><h2>Scope</h2><p>Plan</p></section>",
    title: "Plan",
    sourcePath: "/tmp/plan.md",
    artifactName: "plan.review.html",
    bundle: "console.log('plate');",
  });
  assert.match(html, /data-theme="dark"/);
  assert.match(html, /meta name="human-review-editor" content="plate"/);
  assert.match(html, /id="hr-bootstrap" type="application\/json"/);
});

test("Plate review client bundles for the browser", async () => {
  const bundle = await bundlePlateReviewClient();
  assert.ok(bundle.length > 1000);
  assert.match(bundle, /Plate planning review|Save reviewed HTML/);
});
