import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(root, "../src/notepad/index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "../src/notepad/client.js"), "utf8");

test("note deletion requires explicit inline confirmation and supports cancellation", async () => {
  const original = [
    { id: "note-a", text: "Keep this note", author: "user", status: "pending", createdAt: "2026-11-08T10:00:00Z" },
    { id: "note-b", text: "Delete this note", author: "agent", status: "done", createdAt: "2026-11-08T10:01:00Z" },
  ];
  const notes = structuredClone(original);
  const requests = [];
  const dom = new JSDOM(page.replace("__TOKEN__", "test-token"), {
    url: "http://localhost/notepad/preview?scope=tests",
    runScripts: "outside-only",
  });
  const { window } = dom;
  const response = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
  const flush = async () => {
    for (let i = 0; i < 4; i += 1) await new Promise(resolve => setImmediate(resolve));
  };
  try {
    window.setInterval = () => 0;
    window.fetch = async (url, init = {}) => {
      const method = init.method || "GET";
      requests.push(method);
      if (method === "GET") return response(200, { notes: [...notes] });
      if (method === "DELETE") {
        const id = String(url).split("?")[0].split("/").at(-1);
        const index = notes.findIndex(note => note.id === id);
        if (index < 0) return response(404, { error: "Unknown note." });
        notes.splice(index, 1);
        return response(200, { deletedId: id });
      }
      throw new Error("Unexpected request " + method);
    };
    window.eval(script);
    await flush();
    const doc = window.document;
    assert.equal(doc.querySelectorAll(".note").length, 1, "Pending filter hides completed notes");
    doc.querySelector('[data-filter="all"]').click();
    assert.equal(doc.querySelectorAll(".note").length, 2);

    doc.querySelector(".note .delete").click();
    assert.ok(doc.querySelector(".note .delete.confirm"));
    assert.equal(requests.filter(method => method === "DELETE").length, 0);
    doc.querySelector(".note .status:not(.delete)").click();
    assert.equal(doc.querySelector(".note .delete.confirm"), null);
    assert.equal(notes.length, 2);

    doc.querySelector(".note .delete").click();
    doc.querySelector(".note .delete.confirm").click();
    await flush();
    assert.equal(requests.filter(method => method === "DELETE").length, 1);
    assert.deepEqual(notes.map(note => note.id), ["note-a"]);
    assert.equal(doc.querySelectorAll(".note").length, 1);
    assert.equal(doc.querySelector("#message").textContent, "Note deleted");
    doc.querySelector('[data-filter="done"]').click();
    assert.equal(doc.querySelectorAll(".note").length, 0);
  } finally {
    window.close();
  }
});

test("inline editing saves or cancels without losing drafts during refresh", async () => {
  const original = {
    id: "note-edit", text: "Unfinished work", author: "user",
    status: "pending", createdAt: "2026-11-08T10:00:00Z",
    updatedAt: "2026-11-08T10:00:00Z",
  };
  let note = { ...original };
  const requests = [];
  const dom = new JSDOM(page.replace("__TOKEN__", "test-token"), {
    url: "http://localhost/notepad/preview?scope=edit-ui",
    runScripts: "outside-only",
  });
  const { window } = dom;
  let refresh;
  const response = (status, data) => ({ ok: status < 400, status, json: async () => data });
  const flush = async () => {
    for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  };
  try {
    window.setInterval = callback => { refresh = callback; return 0; };
    window.fetch = async (url, init = {}) => {
      const method = init.method || "GET";
      if (method === "GET") return response(200, url === "/api/notepad/scopes"
        ? { scopes: ["edit-ui"] } : { notes: [note], handoffs: [] });
      if (method === "PATCH") {
        const body = JSON.parse(init.body);
        requests.push(body);
        note = { ...note, text: body.text.trim(), updatedAt: "2026-11-12T12:00:00Z" };
        return response(200, { note });
      }
      throw new Error("Unexpected request " + method);
    };
    window.eval(script);
    await flush();
    const doc = window.document;
    doc.querySelector(".edit-note").click();
    let editor = doc.querySelector(".note-edit-input");
    assert.equal(editor.value, "Unfinished work");
    editor.value = "Discard this draft";
    editor.dispatchEvent(new window.Event("input", { bubbles: true }));
    refresh();
    await flush();
    assert.equal(doc.querySelector(".note-edit-input"), editor, "refresh preserves active editor");
    assert.equal(editor.value, "Discard this draft");
    doc.querySelector(".edit-cancel").click();
    assert.equal(doc.querySelector(".note-text").textContent, "Unfinished work");
    assert.equal(requests.length, 0);

    doc.querySelector(".edit-note").click();
    editor = doc.querySelector(".note-edit-input");
    editor.value = "  Revised unfinished work  ";
    editor.dispatchEvent(new window.Event("input", { bubbles: true }));
    doc.querySelector(".edit-save").click();
    await flush();
    assert.deepEqual(requests, [{ text: "  Revised unfinished work  " }]);
    assert.equal(doc.querySelector(".note-text").textContent, "Revised unfinished work");
    assert.equal(doc.querySelector(".note-edit-input"), null);
    assert.equal(note.id, original.id);
    assert.equal(note.status, original.status);
  } finally {
    window.close();
  }
});
