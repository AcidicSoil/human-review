import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";

const root = path.resolve(import.meta.dirname, "..");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hr-move-notes-"));
process.env.HUMAN_REVIEW_STATE_DIR = path.join(directory, "state");
process.on("exit", () => fs.rmSync(directory, { recursive: true, force: true }));
const { NotepadStore } = await import("../src/notepad/store.js");
const { start } = await import("../src/server.js");

function request(server, method, url, body, token = server.token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port: server.port, method, path: url,
      headers: {
        ...(token ? { "x-human-review-token": token } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
    }, res => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", chunk => raw += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test("moving selected notes preserves identity, status and source handoffs", () => {
  const store = new NotepadStore();
  const pending = store.add("/move/source", "Pending", "user");
  const done = store.add("/move/source", "Completed", "agent");
  store.setStatus("/move/source", done.id, "done");
  store.add("/move/target", "Existing", "user");
  const handoff = store.send("/move/source", [done.id]);

  const moved = store.move("/move/source", "/move/target", [pending.id, done.id]);
  assert.deepEqual(moved.map(note => note.id), [pending.id, done.id]);
  assert.equal(moved[1].status, "done");
  assert.deepEqual(new NotepadStore().list("/move/source"), []);
  assert.deepEqual(new NotepadStore().list("/move/target").slice(1), moved);
  assert.deepEqual(new NotepadStore().outbox("/move/source"), [handoff]);
  assert.deepEqual(new NotepadStore().outbox("/move/target"), []);
  assert.equal(store.listScopes().includes("/move/source"), true, "historical handoff preserves source notebook");
});

test("invalid moves leave both notebooks unchanged", () => {
  const store = new NotepadStore();
  const first = store.add("/move/invalid-from", "Preserved", "user");
  store.add("/move/invalid-to", "Existing", "user");
  const beforeSource = store.list("/move/invalid-from");
  const beforeTarget = store.list("/move/invalid-to");

  for (const [target, ids] of [
    ["/move/invalid-from", [first.id]],
    ["/move/missing", [first.id]],
    ["/move/invalid-to", []],
    ["/move/invalid-to", [first.id, first.id]],
    ["/move/invalid-to", [first.id, "missing"]],
  ]) {
    assert.throws(() => store.move("/move/invalid-from", target, ids), TypeError);
  }
  assert.deepEqual(new NotepadStore().list("/move/invalid-from"), beforeSource);
  assert.deepEqual(new NotepadStore().list("/move/invalid-to"), beforeTarget);
});

test("full destinations reject moves without partial writes", () => {
  const store = new NotepadStore();
  const note = store.add("/move/capacity-source", "Keep in source", "user");
  const target = "/move/capacity-target";
  store.scopes[target] = Array.from({ length: 1000 }, (_, index) => ({
    id: "filler-" + index, text: "Existing note", author: "user", status: "pending",
    createdAt: "2026-11-11T00:00:00Z", updatedAt: "2026-11-11T00:00:00Z",
  }));
  store.save();
  assert.throws(() => store.move("/move/capacity-source", target, [note.id]), RangeError);
  assert.equal(new NotepadStore().list("/move/capacity-source")[0].id, note.id);
  assert.equal(new NotepadStore().list(target).length, 1000);
});

test("authenticated move API rejects invalid scopes and preserves other projects", async t => {
  const server = await start(0);
  t.after(() => server.dispose());
  const from = "/api/move-from";
  const to = "/api/move-to";
  const base = "/api/notepad";
  const first = (await request(server, "POST", base + "?scope=" + encodeURIComponent(from), { text: "Move me" })).body.note;
  await request(server, "POST", base + "?scope=" + encodeURIComponent(to), { text: "Keep me" });
  const url = base + "/move?scope=" + encodeURIComponent(from);
  const payload = { destination: to, noteIds: [first.id] };
  assert.equal((await request(server, "POST", url, payload, null)).status, 401);
  assert.equal((await request(server, "POST", url, { destination: "/missing", noteIds: [first.id] })).status, 400);
  const result = await request(server, "POST", url, payload);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.moved.map(note => note.id), [first.id]);
  assert.deepEqual((await request(server, "GET", base + "?scope=" + encodeURIComponent(from))).body.notes, []);
  assert.equal((await request(server, "GET", base + "?scope=" + encodeURIComponent(to))).body.notes.length, 2);
  assert.equal((await request(server, "POST", url, payload)).status, 400);
});

test("HUD moves checked notes through the project picker without sending a handoff", async () => {
  const from = "/projects/a";
  const to = "/projects/b";
  const notebooks = new Map([
    [from, ["First", "Second"].map((text, index) => ({
      id: "note-" + index, text, author: "user", status: "pending", createdAt: "2026-11-11T00:00:00Z",
    }))],
    [to, [{ id: "note-target", text: "Already here", author: "user", status: "pending", createdAt: "2026-11-11T00:00:00Z" }]],
  ]);
  const seen = [];
  const html = fs.readFileSync(path.join(root, "src/notepad/index.html"), "utf8");
  const code = fs.readFileSync(path.join(root, "src/notepad/client.js"), "utf8");
  const dom = new JSDOM(html.replace("__TOKEN__", "test-token"), {
    url: "http://localhost/notepad/preview?scope=" + encodeURIComponent(from),
    runScripts: "outside-only",
  });
  const { window } = dom;
  const flush = async () => {
    for (let count = 0; count < 8; count++) await new Promise(resolve => setImmediate(resolve));
  };
  try {
    window.setInterval = () => 0;
    window.fetch = async (url, init = {}) => {
      const parsed = new URL(url, window.location.href);
      const method = init.method || "GET";
      seen.push({ path: parsed.pathname, method });
      const response = (data, status = 200) => ({ ok: status < 400, json: async () => data, status });
      if (parsed.pathname === "/api/notepad/scopes") return response({ scopes: [...notebooks.keys()] });
      if (parsed.pathname === "/api/notepad" && method === "GET") return response({
        notes: [...(notebooks.get(parsed.searchParams.get("scope")) || [])], handoffs: [],
      });
      if (parsed.pathname === "/api/notepad/move" && method === "POST") {
        const { destination, noteIds } = JSON.parse(init.body);
        const source = parsed.searchParams.get("scope");
        const moved = notebooks.get(source).filter(note => noteIds.includes(note.id));
        notebooks.set(source, notebooks.get(source).filter(note => !noteIds.includes(note.id)));
        notebooks.get(destination).push(...moved);
        return response({ moved, destination });
      }
      throw new Error("Unexpected request " + method + " " + parsed.pathname);
    };
    window.eval(code);
    await flush();
    const doc = window.document;
    const move = doc.getElementById("move-notes");
    const panel = doc.getElementById("move-panel");
    assert.ok(move, "Selection should offer a move action");
    assert.equal(move.disabled, true);
    for (const checkbox of doc.querySelectorAll(".note input[type=checkbox]")) checkbox.click();
    assert.equal(move.disabled, false);
    move.click();
    assert.equal(panel.hidden, false);
    const destination = doc.getElementById("move-destination");
    assert.deepEqual([...destination.options].map(option => option.value), ["", to]);
    assert.equal(doc.getElementById("confirm-move").disabled, true);
    assert.equal(seen.some(call => call.path === "/api/notepad/move"), false);
    doc.getElementById("cancel-move").click();
    assert.equal(panel.hidden, true);
    move.click();
    destination.value = to;
    destination.dispatchEvent(new window.Event("change", { bubbles: true }));
    doc.getElementById("confirm-move").click();
    await flush();
    assert.equal(seen.filter(call => call.path === "/api/notepad/move" && call.method === "POST").length, 1);
    assert.equal(notebooks.get(from).length, 0);
    assert.equal(notebooks.get(to).length, 3);
    assert.equal(doc.querySelectorAll(".note").length, 0);
    assert.equal(doc.getElementById("send-to-agent").disabled, true);
    assert.equal(panel.hidden, true);
    assert.equal(seen.some(call => call.path === "/api/notepad/send"), false);
  } finally {
    window.close();
  }
});
