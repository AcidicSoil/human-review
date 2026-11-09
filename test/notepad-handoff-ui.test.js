import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const markup = fs.readFileSync(path.join(root, "src/notepad/index.html"), "utf8");
const code = fs.readFileSync(path.join(root, "src/notepad/client.js"), "utf8");
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
};

test("selected notes are sent as one handoff and acknowledged without completing them", async () => {
  const notes = ["First", "Second", "Third"].map((text, i) => ({
    id: "note-" + i, text, author: "user", status: "pending",
    createdAt: "2026-11-09T00:00:00Z",
  }));
  const handoffs = [];
  const requests = [];
  const dom = new JSDOM(markup.replace("__TOKEN__", "test-token"), {
    url: "http://localhost/notepad/preview?scope=workspace",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  let refresh;
  const response = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
  try {
    window.setInterval = callback => { refresh = callback; return 0; };
    window.fetch = async (url, init = {}) => {
      const method = init.method || "GET";
      requests.push({ method, url, body: init.body && JSON.parse(init.body) });
      if (method === "GET") return response(200, { notes, handoffs: [...handoffs] });
      if (method === "POST" && String(url).includes("/send?")) {
        const ids = JSON.parse(init.body).noteIds;
        const handoff = {
          id: "handoff-1", status: "pending", createdAt: "2026-11-09T01:00:00Z",
          notes: ids.map(id => notes.find(note => note.id === id)),
        };
        handoffs.push(handoff);
        return response(201, { handoff });
      }
      throw new Error("Unexpected request: " + method + " " + url);
    };
    window.eval(code);
    await flush();
    const doc = window.document;
    const send = doc.querySelector("#send-to-agent");
    assert.ok(send, "HUD must offer Send to agent");
    assert.equal(send.disabled, true);
    const checks = [...doc.querySelectorAll(".note input[type=checkbox]")];
    assert.equal(checks.length, 3);
    checks[0].click();
    checks[2].click();
    assert.equal(send.disabled, false);
    assert.match(send.textContent, /2/);
    send.click();
    await flush();
    assert.equal(handoffs.length, 1);
    assert.deepEqual(handoffs[0].notes.map(note => note.id), ["note-2", "note-0"]);
    assert.equal(requests.filter(request => request.method === "POST").length, 1);
    assert.equal(notes.every(note => note.status === "pending"), true);
    assert.equal(send.disabled, true);
    assert.match(doc.querySelector("#message").textContent, /sent/i);
    assert.ok(doc.body.textContent.includes("Awaiting agent"));

    handoffs[0].status = "acknowledged";
    refresh();
    await flush();
    assert.ok(doc.body.textContent.includes("Agent received"));
    assert.equal(doc.querySelectorAll(".note").length, 3);
  } finally {
    window.close();
  }
});
