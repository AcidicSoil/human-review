import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-notepad-"));
process.env.HUMAN_REVIEW_STATE_DIR = path.join(tmp, "state");
process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
const { NotepadStore } = await import("../src/notepad/store.js");
const { start } = await import("../src/server.js");

function call(port, token, method, route, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port, method, path: route,
      headers: {
        ...(token ? { "x-human-review-token": token } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
    }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode, body: raw && res.headers["content-type"]?.includes("application/json") ? JSON.parse(raw) : raw });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test("notes persist independently per workspace and can be completed manually", () => {
  const store = new NotepadStore();
  const first = store.add("/workspace/one", "  Review the architecture  ", "agent");
  assert.equal(first.text, "Review the architecture");
  assert.equal(first.author, "agent");
  assert.equal(first.status, "pending");
  assert.ok(first.id);
  assert.equal(store.list("/workspace/two").length, 0);
  assert.deepEqual(new NotepadStore().list("/workspace/one").map(n => n.text), [first.text]);
  assert.equal(store.setStatus("/workspace/one", first.id, "done").status, "done");
  assert.equal(new NotepadStore().list("/workspace/one")[0].status, "done");
  assert.equal(store.setStatus("/workspace/one", first.id, "pending").status, "pending");
  assert.equal(store.setStatus("/workspace/two", first.id, "done"), null);
});

test("editing a note preserves identity, status and sent handoff snapshots", () => {
  const store = new NotepadStore();
  const source = store.add("edit-source", "Original work", "agent");
  store.setStatus("edit-source", source.id, "done");
  const before = store.list("edit-source")[0];
  const handoff = store.send("edit-source", [source.id]);
  const changed = store.edit("edit-source", source.id, "  Revised work  ");
  assert.equal(changed.text, "Revised work");
  assert.equal(changed.id, before.id);
  assert.equal(changed.author, before.author);
  assert.equal(changed.status, "done");
  assert.equal(changed.createdAt, before.createdAt);
  assert.ok(Date.parse(changed.updatedAt) >= Date.parse(before.updatedAt));
  assert.equal(new NotepadStore().list("edit-source")[0].text, "Revised work");
  assert.equal(store.outbox("edit-source")[0].notes[0].text, handoff.notes[0].text);
  assert.equal(store.edit("another-project", source.id, "Nope"), null);
  assert.equal(store.edit("edit-source", "missing-note", "Nope"), null);
  for (const invalid of ["", "  ", "x".repeat(4001), 123]) {
    assert.throws(() => store.edit("edit-source", source.id, invalid), TypeError);
  }
  assert.equal(store.list("edit-source")[0].text, "Revised work");
});

test("deleting a note removes only its own scope and persists across reload", () => {
  const store = new NotepadStore();
  const first = store.add("delete-one", "Delete this", "user");
  const second = store.add("delete-one", "Keep this", "agent");
  const other = store.add("delete-two", "Different scope", "user");
  assert.equal(store.remove("delete-two", first.id), null, "wrong scope must not delete");
  assert.equal(store.remove("delete-one", "not-found"), null);
  assert.equal(store.remove("delete-one", first.id)?.id, first.id);
  assert.equal(store.remove("delete-one", first.id), null, "repeat deletes must be harmless");
  assert.deepEqual(new NotepadStore().list("delete-one").map(note => note.id), [second.id]);
  assert.deepEqual(new NotepadStore().list("delete-two").map(note => note.id), [other.id]);
  store.setStatus("delete-one", second.id, "done");
  assert.equal(store.remove("delete-one", second.id)?.status, "done");
  assert.deepEqual(new NotepadStore().list("delete-one"), [], "completed notes are deletable too");
});

test("DELETE requires authentication and preserves feedback state", async t => {
  const server = await start(0);
  t.after(() => server.dispose());
  const route = "/api/notepad?scope=delete-api";
  const made = await call(server.port, server.token, "POST", route, { text: "Temporary note" });
  assert.equal(made.status, 201);
  const id = made.body.note.id;
  const path = "/api/notepad/" + id;
  assert.equal((await call(server.port, null, "DELETE", path + "?scope=delete-api")).status, 401);
  assert.equal((await call(server.port, server.token, "DELETE", path + "?scope=wrong")).status, 404);
  assert.equal((await call(server.port, server.token, "DELETE", path + "?scope=delete-api")).status, 200);
  assert.deepEqual((await call(server.port, server.token, "GET", route)).body.notes, []);
  assert.equal((await call(server.port, server.token, "DELETE", path + "?scope=delete-api")).status, 404);
  assert.equal((await call(server.port, server.token, "GET", "/api/status?target=delete-api")).body.feedback_waiting, false);
});

test("authenticated note editing changes only the requested notebook", async t => {
  const server = await start(0);
  t.after(() => server.dispose());
  const first = (await call(server.port, server.token, "POST",
    "/api/notepad?scope=edit-api", { text: "Before" })).body.note;
  const route = "/api/notepad/" + first.id + "?scope=edit-api";
  assert.equal((await call(server.port, "", "PATCH", route, { text: "Unauthorized" })).status, 401);
  assert.equal((await call(server.port, server.token, "PATCH",
    "/api/notepad/" + first.id + "?scope=wrong-project", { text: "Wrong" })).status, 404);
  assert.equal((await call(server.port, server.token, "PATCH", route, { text: " " })).status, 400);
  const result = await call(server.port, server.token, "PATCH", route, { text: "Updated" });
  assert.equal(result.status, 200);
  assert.equal(result.body.note.text, "Updated");
  assert.equal(result.body.note.status, "pending");
  assert.equal(result.body.note.id, first.id);
  assert.equal((await call(server.port, server.token, "GET",
    "/api/notepad?scope=edit-api")).body.notes[0].text, "Updated");
});

test("note boundaries reject empty, large, invalid or unauthorized changes", () => {
  const store = new NotepadStore();
  assert.throws(() => store.add("scope", "   ", "user"), /empty|text/i);
  assert.throws(() => store.add("scope", "x".repeat(4001), "user"), /length|4000|too long/i);
  assert.throws(() => store.add("scope", "valid", "unknown"), /author/i);
  assert.throws(() => store.list(""), /scope/i);
  assert.throws(() => store.setStatus("scope", "nope", "running"), /status/i);
});

test("workspace names cannot collide with object prototype keys", () => {
  const store = new NotepadStore();
  for (const scope of ["__proto__", "constructor", "toString"]) {
    const note = store.add(scope, "Independent note", "agent");
    assert.deepEqual(new NotepadStore().list(scope).map(item => item.id), [note.id]);
  }
});

test("adding a note does not release an active review long-poll", async t => {
  const file = path.join(tmp, "active-review.html");
  fs.writeFileSync(file, "<p>Review is underway</p>");
  const server = await start(0);
  t.after(() => server.dispose());
  const opened = await call(server.port, server.token, "POST", "/api/session", { file });
  assert.equal(opened.status, 200);

  let ended = false;
  const poll = http.get({
    host: "127.0.0.1", port: server.port,
    path: "/api/poll?target=" + encodeURIComponent(file),
    headers: { "x-human-review-token": server.token },
  }, response => {
    response.on("data", () => {});
    response.on("end", () => { ended = true; });
  });
  poll.on("error", () => {});
  t.after(() => poll.destroy());
  await new Promise(resolve => setTimeout(resolve, 40));
  const created = await call(server.port, server.token, "POST", "/api/notepad?scope=active-review", {
    text: "Do this after the review", author: "user",
  });
  assert.equal(created.status, 201);
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(ended, false, "notepad capture must not wake or close the waiting agent");
  const status = await call(server.port, server.token, "GET", "/api/status?target=" + encodeURIComponent(file));
  assert.equal(status.body.feedback_waiting, false);
});

test("HTTP HUD stores user notes without triggering agent review feedback", async t => {
  const server = await start(0);
  t.after(() => server.dispose());
  const scope = encodeURIComponent("/workspace/active");
  const url = `/api/notepad?scope=${scope}`;
  const unauthorized = await call(server.port, "", "GET", url);
  assert.equal(unauthorized.status, 401);
  const empty = await call(server.port, server.token, "GET", url);
  assert.deepEqual(empty.body.notes, []);
  const added = await call(server.port, server.token, "POST", url, { text: "Remember to add tests", author: "user" });
  assert.equal(added.status, 201);
  assert.equal(added.body.note.status, "pending");
  const list = await call(server.port, server.token, "GET", url);
  assert.equal(list.body.notes.length, 1);
  const status = await call(server.port, server.token, "GET", `/api/status?target=${scope}`);
  assert.equal(status.body.feedback_waiting, false);
  const finished = await call(server.port, server.token, "PATCH", `/api/notepad/${added.body.note.id}?scope=${scope}`, { status: "done" });
  assert.equal(finished.status, 200);
  assert.equal(finished.body.note.status, "done");
  const missing = await call(server.port, server.token, "PATCH", `/api/notepad/missing?scope=${scope}`, { status: "done" });
  assert.equal(missing.status, 404);
  const invalid = await call(server.port, server.token, "POST", url, { text: "" });
  assert.equal(invalid.status, 400);
  assert.equal(new NotepadStore().list("/workspace/active")[0].status, "done");
});

test("CLI adds, lists, completes and reopens notes through the authenticated server", async t => {
  const server = await start(0);
  t.after(() => server.dispose());
  const run = (...args) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["src/cli.js", "notes", ...args], {
      cwd: process.cwd(),
      env: { ...process.env, HUMAN_REVIEW_STATE_DIR: process.env.HUMAN_REVIEW_STATE_DIR },
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", code => resolve({ code, stdout, stderr }));
  });
  const scope = "notepad-cli-tests";
  const added = await run("add", "Investigate caching", "--scope", scope);
  assert.equal(added.code, 0, added.stderr);
  const note = JSON.parse(added.stdout);
  assert.equal(note.text, "Investigate caching");
  assert.equal(note.author, "agent");
  const listed = await run("list", "--scope", scope);
  assert.equal(listed.code, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout).map(item => item.id), [note.id]);
  const edited = await run("edit", note.id, "  Investigate reuse  ", "--scope", scope);
  assert.equal(edited.code, 0, edited.stderr);
  assert.equal(JSON.parse(edited.stdout).text, "Investigate reuse");
  const completed = await run("done", note.id, "--scope", scope);
  assert.equal(completed.code, 0, completed.stderr);
  assert.equal(JSON.parse(completed.stdout).status, "done");
  const reopened = await run("reopen", note.id, "--scope", scope);
  assert.equal(reopened.code, 0, reopened.stderr);
  assert.equal(JSON.parse(reopened.stdout).status, "pending");
  const removed = await run("delete", note.id, "--scope", scope);
  assert.equal(removed.code, 0, removed.stderr);
  assert.equal(JSON.parse(removed.stdout).deletedId, note.id);
  assert.deepEqual(JSON.parse((await run("list", "--scope", scope)).stdout), []);
  assert.notEqual((await run("delete", note.id, "--scope", scope)).code, 0);
  const invalid = await run("add", " ", "--scope", scope);
  assert.notEqual(invalid.code, 0);
  assert.match(invalid.stderr, /empty/i);
});

test("HUD route serves an authenticated client without exposing notes to unauthenticated requests", async t => {
  const server = await start(0);
  t.after(() => server.dispose());
  const path = "/api/notepad/open?scope=" + encodeURIComponent("/workspace/desk");
  const response = await call(server.port, server.token, "GET", path);
  assert.equal(response.status, 200);
  assert.match(response.body.path, /^\/notepad\/[a-f0-9]+\?scope=/);
  const hud = await call(server.port, "", "GET", response.body.path);
  assert.equal(hud.status, 200);
  assert.match(hud.body, /<title>Notepad/);
  assert.match(hud.body, new RegExp(server.token));
  const javascript = await call(server.port, "", "GET", "/notepad.js");
  assert.equal(javascript.status, 200);
  assert.match(javascript.body, /api\/notepad/);
  const hidden = await call(server.port, "", "GET", "/notepad/wrong?scope=x");
  assert.equal(hidden.status, 404);
  const unauthenticated = await call(server.port, "", "POST", "/api/notepad?scope=x", { text: "X" });
  assert.equal(unauthenticated.status, 401);
});


test("CLI help documents the manual notepad lifecycle", async () => {
  const { spawnSync } = await import("node:child_process");
  const output = spawnSync(process.execPath, ["src/cli.js", "--help"], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(output.status, 0, output.stderr);
  assert.match(output.stdout, /notes open/);
  assert.match(output.stdout, /notes add <text>/);
  assert.match(output.stdout, /notes edit <id> <text>/);
  assert.match(output.stdout, /notes list/);
  assert.match(output.stdout, /notes done <id>/);
  assert.match(output.stdout, /notes delete <id>/);
  assert.match(output.stdout, /notes inbox/);
  assert.match(output.stdout, /notes poll/);
  assert.match(output.stdout, /notes ack <id>/);
});

test("an unreadable notebook never prevents the ordinary review server from starting", async t => {
  const file = path.join(process.env.HUMAN_REVIEW_STATE_DIR, "notepad.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const backup = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  fs.writeFileSync(file, "{this is invalid json");
  t.after(() => backup === null ? fs.rmSync(file, { force: true }) : fs.writeFileSync(file, backup));
  const server = await start(0);
  t.after(() => server.dispose());
  const health = await call(server.port, server.token, "GET", "/health");
  assert.equal(health.status, 200);
  const reviewStatus = await call(server.port, server.token, "GET", "/api/status?target=%2Fworkspace%2Fapp");
  assert.equal(reviewStatus.status, 200);
  const failedNotes = await call(server.port, server.token, "GET", "/api/notepad?scope=app");
  assert.equal(failedNotes.status, 500);
});
