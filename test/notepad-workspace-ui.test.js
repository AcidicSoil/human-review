import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";

const root = path.resolve("src/notepad");
const page = fs.readFileSync(path.join(root, "index.html"), "utf8");
const client = fs.readFileSync(path.join(root, "client.js"), "utf8");
const project = "/workspace/demo";
const notes = [
  { id: "note-a", text: "# Onboarding copy\nFollow up #ux #copy", status: "pending",
    author: "user", createdAt: "2026-11-17T15:24:00.000Z" },
  { id: "note-b", text: "Resolved export", status: "done",
    author: "agent", createdAt: "2026-11-16T13:18:00.000Z" },
];
const reports = [{
  id: "report-a", text: "Export takes too long", status: "pending", author: "agent",
  createdAt: "2026-11-17T16:15:00.000Z",
  bugReport: { sourceScope: "/workspace/browser", sourceNoteId: "original",
    expected: "Fast export", actual: "Sluggish", steps: "Use export" },
}];
const flush = async () => {
  for (let i = 0; i < 7; i += 1) await new Promise(resolve => setImmediate(resolve));
};
async function open(options = {}) {
  const dom = new JSDOM(page.replace("__TOKEN__", "test-token"), {
    url: "http://localhost/notepad/preview?scope=" + encodeURIComponent(project),
    runScripts: "outside-only",
  });
  const { window } = dom;
  window.setInterval = () => 1;
  window.fetch = async url => ({
    ok: true, status: 200,
    json: async () => url === "/api/notepad/scopes" ? { scopes: [project] }
      : { notes, reports, handoffs: [] },
  });
  if (options.storage) {
    window.localStorage.setItem("human-review-notepad.ui", JSON.stringify(options.storage));
  }
  window.eval(client);
  await flush();
  return dom;
}

test("approved note layout shows timestamps beside cards and tags beneath headings", async () => {
  const dom = await open();
  try {
    const { document } = dom.window;
    document.querySelector('[data-filter="all"]').click();
    const card = [...document.querySelectorAll(".note")].find(item =>
      item.querySelector(".note-summary-title")?.textContent === "Onboarding copy");
    assert.ok(card);
    assert.equal(card.querySelector("time.note-time")?.getAttribute("datetime"), notes[0].createdAt);
    assert.ok(card.querySelector(".note-date-rail"), "timestamp lives outside the disclosure card");
    assert.equal(card.querySelector("details").contains(card.querySelector("time.note-time")), false);
    assert.deepEqual([...card.querySelectorAll(".note-tag")].map(item => item.textContent), ["ux", "copy"]);
    const summary = card.querySelector("summary");
    assert.ok(summary.querySelector(".note-tags"), "tags grouped under heading");
    assert.ok(summary.querySelector(".note-summary-title"));
    assert.equal(card.querySelector("details").open, false);
    assert.ok(card.querySelector(".note-copy-reference"), "existing actions preserved");
  } finally {
    dom.window.close();
  }
});

test("workspace navigation displays derived tasks and live report counts without extra requests", async () => {
  const dom = await open();
  try {
    const { document } = dom.window;
    const tasks = document.querySelector('[data-route="tasks"]');
    assert.ok(tasks);
    tasks.click();
    assert.equal(tasks.getAttribute("aria-current"), "page");
    assert.equal(document.getElementById("task-pending-count").textContent, "1");
    assert.equal(document.getElementById("task-done-count").textContent, "1");
    assert.equal(document.getElementById("tasks-page").hidden, false);
    assert.equal(document.getElementById("notes-page").hidden, true);
    document.querySelector('[data-route="reports"]').click();
    assert.equal(document.getElementById("report-received-count").textContent, "1");
    assert.equal(document.querySelectorAll(".report-item").length, 1);
    document.querySelector(".report-item button").click();
    assert.equal(document.getElementById("notes-page").hidden, false);
    assert.equal(document.querySelector('[data-view="inbox"]').getAttribute("aria-pressed"), "true");
  } finally {
    dom.window.close();
  }
});

test("settings navigation and display preferences persist without changing notes", async () => {
  const dom = await open();
  try {
    const { document, Event, localStorage } = dom.window;
    document.querySelector('[data-route="settings"]').click();
    const settings = document.getElementById("settings-page");
    assert.equal(settings.hidden, false);
    const preference = document.querySelector('[data-pref="showDate"]');
    assert.ok(preference.checked);
    preference.checked = false;
    preference.dispatchEvent(new Event("change", { bubbles: true }));
    assert.equal(JSON.parse(localStorage.getItem("human-review-notepad.ui")).showDate, false);
    document.querySelector('[data-settings-view="workflow"]').click();
    assert.equal(document.getElementById("settings-workflow").hidden, false);
    assert.equal(document.getElementById("settings-notepad").hidden, true);
    document.querySelector('[data-route="notes"]').click();
    assert.equal(document.querySelectorAll(".note").length, 1);
    assert.equal(document.querySelector(".hud").classList.contains("hide-date-rail"), true);
  } finally {
    dom.window.close();
  }
});

test("settings previews reflect project records and display preferences", async () => {
  const dom = await open();
  try {
    const { document, Event } = dom.window;
    document.querySelector('[data-route="settings"]').click();
    document.querySelector('[data-settings-view="notepad"]').click();
    const notePreview = document.getElementById("settings-note-preview");
    assert.match(notePreview.textContent, /Onboarding copy/);
    assert.match(notePreview.textContent, /ux/i);
    assert.ok(notePreview.querySelector("time"));
    document.querySelector('[data-pref="showDate"]').click();
    assert.equal(notePreview.querySelector("time"), null);

    document.querySelector('[data-settings-view="inbox"]').click();
    const reportPreview = document.getElementById("settings-report-preview");
    assert.match(reportPreview.textContent, /Export takes too long/);
    assert.match(reportPreview.textContent, /From browser/);
    document.querySelector('[data-pref="showSource"]').click();
    assert.doesNotMatch(reportPreview.textContent, /From browser/);
  } finally {
    dom.window.close();
  }
});
