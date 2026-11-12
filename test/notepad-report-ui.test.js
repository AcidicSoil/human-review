import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";

const root = path.resolve(import.meta.dirname, "..");
const html = fs.readFileSync(path.join(root, "src/notepad/index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "src/notepad/client.js"), "utf8");

test("HUD reports tool failures, triages fixes, and preserves source verification", async () => {
  const source = "/projects/consumer";
  const owner = "/projects/tool-owner";
  const sameName = "/workspace/other/tool-owner";
  const original = {
    id: "source-1", text: "Valid usage fails", status: "pending", author: "agent",
    createdAt: "2026-11-12T01:00:00Z",
  };
  const items = new Map([[source, [original]]]);
  const sent = [];
  const dom = new JSDOM(html.replace("__TOKEN__", "token"), {
    url: "http://localhost/notepad/preview?scope=" + encodeURIComponent(source),
    runScripts: "outside-only",
  });
  const { window } = dom;
  const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
  const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const click = selector => {
    const el = window.document.querySelector(selector);
    assert.ok(el, "Expected " + selector);
    el.click();
  };
  try {
    window.setInterval = () => 0;
    window.fetch = async (url, init = {}) => {
      const path = new URL(url, window.location.href);
      const project = path.searchParams.get("scope");
      const method = init.method || "GET";
      if (path.pathname === "/api/notepad/scopes") {
        return response({ scopes: [...items.keys(), owner, sameName] });
      }
      if (path.pathname === "/api/notepad" && method === "GET") {
        const notes = items.get(project) || [];
        return response({ notes: notes.map(note => note.reportedTo ? {
          ...note, reportedTo: note.reportedTo.map(link => ({
            ...link, status: items.get(link.scope)?.find(target => target.id === link.noteId)?.status || "deleted",
          })),
        } : note), handoffs: [] });
      }
      if (path.pathname === "/api/notepad/report" && method === "POST") {
        const data = JSON.parse(init.body);
        sent.push(data);
        const report = {
          id: "report-1", text: original.text, status: "pending", author: "agent",
          createdAt: original.createdAt,
          bugReport: { sourceScope: source, sourceNoteId: original.id,
            expected: data.expected, actual: data.actual, steps: data.steps },
        };
        items.set(owner, [report]);
        original.reportedTo = [{ scope: owner, noteId: report.id }];
        return response({ report }, 201);
      }
      if (path.pathname === "/api/notepad/report" && method === "PATCH") {
        throw new Error("Reports are normal notes, not a separate status API");
      }
      if (path.pathname.startsWith("/api/notepad/") && method === "PATCH") {
        const id = path.pathname.split("/").at(-1);
        const note = items.get(project).find(note => note.id === id);
        note.status = JSON.parse(init.body).status;
        return response({ note });
      }
      throw new Error("Unexpected request " + method + " " + path.pathname);
    };
    window.eval(script);
    await flush();
    const doc = window.document;
    click(".report-note");
    assert.equal(doc.getElementById("report-panel").hidden, false);
    const picker = doc.getElementById("report-destination");
    const choices = doc.getElementById("report-projects");
    assert.equal(picker.getAttribute("role"), "combobox");
    assert.equal(choices.getAttribute("role"), "listbox");
    picker.focus();
    assert.equal(picker.getAttribute("aria-expanded"), "true");
    picker.value = "/new/tool-without-notebook";
    picker.dispatchEvent(new window.Event("input", { bubbles: true }));
    assert.equal(picker.value, "/new/tool-without-notebook", "manual paths remain usable");
    picker.value = "tool-owner";
    picker.dispatchEvent(new window.Event("input", { bubbles: true }));
    const options = [...choices.querySelectorAll(".project-option")];
    assert.equal(options.length, 2, "duplicate names remain distinguishable");
    assert.ok(options.some(option => option.textContent.includes(sameName)));
    assert.ok(options.some(option => option.textContent.includes(owner)));
    picker.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    picker.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    assert.equal(picker.value, owner);
    assert.equal(picker.getAttribute("aria-expanded"), "false");
    picker.value = "tool-owner";
    picker.dispatchEvent(new window.Event("input", { bubbles: true }));
    const mouseChoice = [...choices.querySelectorAll(".project-option")]
      .find(option => option.textContent.includes(sameName));
    mouseChoice.focus();
    mouseChoice.click();
    assert.equal(picker.value, sameName, "mouse selection uses the full project path");
    assert.equal(picker.getAttribute("aria-expanded"), "false", "selection closes the chooser");
    picker.value = owner;
    doc.getElementById("report-expected").value = "Accept valid inputs";
    doc.getElementById("report-actual").value = "Rejected valid inputs";
    doc.getElementById("report-steps").value = "Run the tool";
    click("#send-report");
    await flush();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].noteId, original.id);
    assert.equal(items.get(source).length, 1);
    assert.equal(items.get(owner).length, 1);
    assert.equal(doc.getElementById("report-panel").hidden, true);
    assert.match(doc.querySelector(".report-status").textContent, /Pending/i);

    click(".view-report");
    await flush();
    assert.equal(new URL(window.location.href).searchParams.get("scope"), owner);
    assert.match(doc.querySelector(".bug-details").textContent, /Rejected valid inputs/);
    click(".fix-available");
    await flush();
    assert.equal(items.get(owner)[0].status, "done");
    click(".view-source");
    await flush();
    assert.equal(new URL(window.location.href).searchParams.get("scope"), source);
    assert.match(doc.querySelector(".report-status").textContent, /Fix available/);
    assert.equal(original.status, "pending", "source project verifies fix independently");
  } finally {
    window.close();
  }
});
