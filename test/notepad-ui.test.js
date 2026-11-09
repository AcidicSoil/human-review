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
