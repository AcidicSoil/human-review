import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createLoaReviewHtml } from "../src/loa-review/generator.js";

test("LOA standalone editor announces itself and accepts a live host snapshot", () => {
  const messages = [];
  const parent = { postMessage: (message) => messages.push(message) };
  const html = createLoaReviewHtml({
    loa: { actions: [{ id: "a1", content: "Original", snapIns: [] }] },
    catalog: [],
  });
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "file:///tmp/loa.review.html",
    beforeParse(window) {
      Object.defineProperty(window, "parent", { value: parent });
    },
  });
  try {
    assert.equal(messages.some((item) => item.type === "hr:ready" && item.mode === "loa"), true);
    const restored = { loa: { actions: [{ id: "a1", content: "Agent draft", snapIns: [] }] }, catalog: [] };
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
      source: parent,
      data: { type: "hr:restore", mode: "loa", nonce: "session-nonce", structured: { document: restored } },
    }));
    assert.match(dom.window.document.querySelector(".hr-loa-action-content").textContent, /Agent draft/);
    dom.window.document.querySelector("[data-action-edit]").click();
    const input = dom.window.document.querySelector("[data-edit-input]");
    input.value = "Reviewer edit";
    dom.window.document.querySelector("[data-edit-save]").click();
    assert.equal(messages.some((message) =>
      message.type === "hr:change" && message.nonce === "session-nonce" &&
      message.document.loa.actions[0].content === "Reviewer edit"), true);
    assert.equal(JSON.parse(dom.window.document.querySelector("#hr-loa-bootstrap").textContent).loa.actions[0].content, "Reviewer edit");
  } finally {
    dom.window.close();
  }
});
