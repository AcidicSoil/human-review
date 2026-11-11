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

test("moving the last note retains an empty notebook across restarts", () => {
  const store = new NotepadStore();
  const source = "/move/empty-source";
  const destination = "/move/empty-destination";
  const note = store.add(source, "Last note", "user");
  store.add(destination, "Existing", "user");
  store.move(source, destination, [note.id]);
  assert.deepEqual(store.list(source), []);
  assert.ok(store.listScopes().includes(source), "empty source remains selectable");
  const reloaded = new NotepadStore();
  assert.ok(reloaded.listScopes().includes(source), "empty source survives restart");
  assert.deepEqual(reloaded.move(destination, source, [note.id]).map(item => item.id), [note.id]);
  assert.equal(reloaded.list(source)[0].id, note.id);
  assert.deepEqual(reloaded.deleteScope(destination), {
    scope: destination, notesDeleted: 1, handoffsDeleted: 0,
  });
  assert.ok(!new NotepadStore().listScopes().includes(destination));
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
  store.add(target, "Existing", "user");
  store.scopes[target] = Array.from({ length: 1000 }, (_, index) => ({
    id: "filler-" + index, text: "Existing note", author: "user", status: "pending",
    createdAt: "2026-11-11T00:00:00Z", updatedAt: "2026-11-11T00:00:00Z",
  }));
  store.save();
  assert.throws(() => store.move("/move/capacity-source", target, [note.id]), RangeError);
  assert.equal(new NotepadStore().list("/move/capacity-source")[0].id, note.id);
  assert.equal(new NotepadStore().list(target).length, 1000);
});

test("move all moves more than 100 notes atomically and keeps empty notebook", async t => {
  const server = await start(0);
  t.after(() => server.dispose());
  const source = "/api/move-all-source";
  const destination = "/api/move-all-destination";
  const base = "/api/notepad";
  const sourceUrl = base + "?scope=" + encodeURIComponent(source);
  const toUrl = base + "?scope=" + encodeURIComponent(destination);
  await request(server, "POST", toUrl, { text: "Existing" });
  for (let i = 0; i < 105; i++) {
    const created = await request(server, "POST", sourceUrl, { text: "Bulk " + i });
    if (i === 1) {
      await request(server, "PATCH", base + "/" + created.body.note.id + "?scope=" + encodeURIComponent(source), { status: "done" });
    }
  }
  const moved = await request(server, "POST", base + "/move?scope=" + encodeURIComponent(source), {
    destination, all: true,
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.moved.length, 105);
  assert.equal(moved.body.moved[1].status, "done");
  assert.equal((await request(server, "GET", sourceUrl)).body.notes.length, 0);
  assert.equal((await request(server, "GET", toUrl)).body.notes.length, 106);
  assert.ok((await request(server, "GET", base + "/scopes")).body.scopes.includes(source));
  assert.equal((await request(server, "POST", base + "/move?scope=" + encodeURIComponent(source), {
    destination, all: true,
  })).status, 400);
  assert.equal((await request(server, "POST", base + "/move?scope=" + encodeURIComponent(destination), {
    destination: "/not-a-notebook", all: true,
  })).status, 400);
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

test("HUD moves selected and all notes, including hidden completed notes", async () => {
  const from = "/projects/a";
  const to = "/projects/b";
  const notebooks = new Map([
    [from, ["First", "Second", "Third"].map((text, index) => ({
      id: "note-" + index, text, author: "user", status: index === 1 ? "done" : "pending",
      createdAt: "2026-11-11T00:00:00Z",
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
      seen.push({ path: parsed.pathname, method, body: init.body ? JSON.parse(init.body) : null });
      const response = (data, status = 200) => ({ ok: status < 400, json: async () => data, status });
      if (parsed.pathname === "/api/notepad/scopes") return response({ scopes: [...notebooks.keys()] });
      if (parsed.pathname === "/api/notepad" && method === "GET") return response({
        notes: [...(notebooks.get(parsed.searchParams.get("scope")) || [])], handoffs: [],
      });
      if (parsed.pathname === "/api/notepad/move" && method === "POST") {
        const { destination, noteIds, all } = JSON.parse(init.body);
        const source = parsed.searchParams.get("scope");
        const ids = all ? notebooks.get(source).map(note => note.id) : noteIds;
        const moved = notebooks.get(source).filter(note => ids.includes(note.id));
        notebooks.set(source, notebooks.get(source).filter(note => !ids.includes(note.id)));
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
    assert.equal(doc.querySelectorAll(".note").length, 2, "completed notes hidden by pending filter");
    const moveAll = doc.getElementById("move-all-notes");
    assert.equal(moveAll.disabled, false, "move all works without selections");
    doc.querySelector(".note input[type=checkbox]").click();
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
    assert.equal(notebooks.get(from).length, 2);
    assert.equal(notebooks.get(to).length, 2);
    assert.equal(doc.querySelectorAll(".note").length, 1);
    assert.equal(doc.getElementById("send-to-agent").disabled, true);
    assert.equal(panel.hidden, true);
    assert.equal(moveAll.disabled, false);
    moveAll.click();
    assert.equal(panel.hidden, false);
    destination.value = to;
    destination.dispatchEvent(new window.Event("change", { bubbles: true }));
    doc.getElementById("confirm-move").click();
    await flush();
    assert.deepEqual(seen.filter(call => call.path === "/api/notepad/move").map(call => call.body), [
      { destination: to, noteIds: ["note-2"] },
      { destination: to, all: true },
    ]);
    assert.equal(notebooks.get(from).length, 0);
    assert.equal(notebooks.get(to).length, 4);
    assert.equal(notebooks.get(to).some(note => note.status === "done"), true);
    assert.equal(doc.querySelectorAll(".note").length, 0);
    assert.equal(panel.hidden, true);
    assert.ok([...doc.getElementById("project-notebooks").options].some(option => option.value === from));
    assert.equal(seen.some(call => call.path === "/api/notepad/send"), false);
  } finally {
    window.close();
  }
});
