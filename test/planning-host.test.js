import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { createReviewHtml } from "../src/plate-review/generator.js";

test("Planning fallback restores a document and submits native edits through the shared host", async () => {
  const messages = [];
  const parent = { postMessage: (message) => messages.push(message) };
  const html = createReviewHtml({
    sourceHtml: "<h1>Original plan</h1><p>Before</p>",
    editor: "embedded-dom",
    title: "Plan",
    bundle: fs.readFileSync(new URL("../src/plate-review/fallback-client.js", import.meta.url), "utf8"),
    tools: fs.readFileSync(new URL("../src/plate-review/artifact-tools.js", import.meta.url), "utf8"),
  });
  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "file:///tmp/plan.review.html",
    beforeParse(window) { Object.defineProperty(window, "parent", { value: parent }); },
  });
  try {
    assert.equal(messages.some((entry) => entry.type === "hr:ready" && entry.mode === "planning"), true);
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
      source: parent, data: {
        type: "hr:restore", nonce: "planning-session", mode: "planning",
        structured: { document: { editor: "embedded-dom", sourceHtml: "<h2>Restored plan</h2><p>From agent</p>", document: null, discussions: [] } },
      },
    }));
    assert.match(dom.window.document.querySelector(".hr-fallback-content").textContent, /Restored plan/);
    const editable = dom.window.document.querySelector(".hr-fallback-content");
    editable.innerHTML = "<p>Reviewed plan</p>";
    editable.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(messages.some((entry) =>
      entry.type === "hr:change" && entry.nonce === "planning-session" &&
      entry.document.sourceHtml.includes("Reviewed plan")), true);
  } finally { dom.window.close(); }
});
