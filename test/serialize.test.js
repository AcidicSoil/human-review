import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { serializeDocument, UI_ATTR, MARK_ATTR } from "../src/serialize.js";

const PAGE = `<!DOCTYPE html>
<html><head><title>Spec</title></head>
<body><h1>Plan</h1><p>Ship the <strong>review loop</strong> this week.</p></body></html>`;

test("serialization strips everything edit-html added to the live page", () => {
  const dom = new JSDOM(PAGE);
  const doc = dom.window.document;

  // Simulate a live review session: overlay, injected style, marks, editing.
  const overlay = doc.createElement("div");
  overlay.setAttribute(UI_ATTR, "");
  doc.documentElement.appendChild(overlay);

  const style = doc.createElement("style");
  style.setAttribute("data-eh-sdk", "");
  doc.head.appendChild(style);

  const mark = doc.createElement("mark");
  mark.setAttribute(MARK_ATTR, "c_1");
  const strong = doc.querySelector("strong");
  mark.append(...strong.childNodes);
  strong.append(mark);

  doc.body.setAttribute("contenteditable", "true");
  doc.body.setAttribute("spellcheck", "false");

  const html = serializeDocument(doc);
  assert.ok(html.startsWith("<!DOCTYPE html>"), "doctype survives");
  assert.match(html, /<strong>review loop<\/strong>/, "marked text is unwrapped in place");
  assert.doesNotMatch(html, /data-eh-/, "no edit-html attributes remain");
  assert.doesNotMatch(html, /contenteditable/, "editing mode is not persisted");
});

test("a static page serializes identically to its parsed disk copy", () => {
  // This equality is what the SDK uses to decide a page is safe to autosave.
  const live = serializeDocument(new JSDOM(PAGE).window.document);
  const parsed = serializeDocument(new JSDOM(PAGE).window.document);
  assert.equal(live, parsed);
});

test("a script mutation shows up as divergence from the disk copy", () => {
  const dom = new JSDOM(PAGE);
  const doc = dom.window.document;
  // What a self-rendering page does on load: rewrite part of its own DOM.
  const chart = doc.createElement("svg");
  chart.setAttribute("class", "rendered-chart");
  doc.body.appendChild(chart);

  const live = serializeDocument(doc);
  const disk = serializeDocument(new JSDOM(PAGE).window.document);
  assert.notEqual(live, disk);
});
