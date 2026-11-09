import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hr-handoffs-"));
process.env.HUMAN_REVIEW_STATE_DIR = path.join(directory, "state");
const { NotepadStore } = await import("../src/notepad/store.js");
const { start } = await import("../src/server.js");

process.on("exit", () => fs.rmSync(directory, { recursive: true, force: true }));

function request(server, route, method = "GET", body, token = server.token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port: server.port, method, path: route,
      headers: {
        ...(token ? { "x-human-review-token": token } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
    }, res => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { raw += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function runCli(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["src/cli.js", "notes", ...args], {
      cwd: root, env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
}

test("handoffs contain only explicitly selected notes and survive restart", () => {
  const store = new NotepadStore();
  const first = store.add("handoff-storage", "First", "user");
  const second = store.add("handoff-storage", "Second", "agent");
  const third = store.add("handoff-storage", "Third", "user");
  const handoff = store.send("handoff-storage", [third.id, first.id]);
  assert.deepEqual(handoff.notes.map(n => n.id), [third.id, first.id]);
  assert.equal(handoff.status, "pending");
  assert.equal(store.inbox("handoff-storage").length, 1);
  assert.equal(store.inbox("different-scope").length, 0);
  assert.deepEqual(new NotepadStore().inbox("handoff-storage"), [handoff]);
  assert.equal(store.ack("different-scope", handoff.id), null);
  assert.equal(store.ack("handoff-storage", handoff.id)?.status, "acknowledged");
  assert.equal(store.ack("handoff-storage", handoff.id)?.status, "acknowledged");
  assert.equal(new NotepadStore().inbox("handoff-storage").length, 0);
  assert.equal(new NotepadStore().outbox("handoff-storage")[0].status, "acknowledged");
  assert.equal(new NotepadStore().list("handoff-storage")[1].id, second.id);
});

test("handoff validates selections atomically and does not execute, complete, or delete notes", () => {
  const store = new NotepadStore();
  const a = store.add("validation", "Keep pending", "user");
  assert.throws(() => store.send("validation", []), /select|note/i);
  assert.throws(() => store.send("validation", [a.id, a.id]), /duplicate/i);
  assert.throws(() => store.send("validation", [a.id, "missing"]), /unknown|missing/i);
  assert.throws(() => store.send("validation", [42]), /id/i);
  assert.deepEqual(store.inbox("validation"), []);
  store.setStatus("validation", a.id, "done");
  const handoff = store.send("validation", [a.id]);
  assert.equal(store.ack("validation", handoff.id)?.status, "acknowledged");
  assert.equal(store.list("validation")[0].status, "done");
});

test("authenticated Send releases waiting agent, Ack persists and replay stops", async t => {
  const server = await start(0);
  t.after(() => server.dispose());
  const scope = "http-handoff";
  const base = "/api/notepad";
  const note = (await request(server, base + "?scope=" + scope, "POST", { text: "Check API result" })).body.note;
  let resolved = false;
  const pending = request(server, base + "/poll?scope=" + scope + "&timeout=5000").then(result => {
    resolved = true; return result;
  });
  await new Promise(resolve => setTimeout(resolve, 70));
  assert.equal(resolved, false, "poll must stay waiting before Send");
  assert.equal((await request(server, base + "/send?scope=" + scope, "POST", { noteIds: [note.id] }, "")).status, 401);
  const sent = await request(server, base + "/send?scope=" + scope, "POST", { noteIds: [note.id] });
  assert.equal(sent.status, 201);
  const delivered = await pending;
  assert.equal(delivered.status, 200);
  assert.equal(delivered.body.handoff.id, sent.body.handoff.id);
  assert.deepEqual(delivered.body.handoff.notes.map(n => n.text), ["Check API result"]);
  const inbox = await request(server, base + "/inbox?scope=" + scope);
  assert.equal(inbox.body.handoffs.length, 1);
  assert.equal((await request(server, base + "/ack?scope=other", "POST", { handoffId: sent.body.handoff.id })).status, 404);
  assert.equal((await request(server, base + "/ack?scope=" + scope, "POST", { handoffId: sent.body.handoff.id })).body.handoff.status, "acknowledged");
  assert.deepEqual((await request(server, base + "/inbox?scope=" + scope)).body.handoffs, []);
  assert.equal((await request(server, base + "/poll?scope=" + scope + "&timeout=50")).body.status, "timeout");
  assert.equal((await request(server, base + "?scope=" + scope)).body.notes[0].status, "pending");
  assert.equal((await request(server, "/api/status?target=" + scope)).body.feedback_waiting, false);
});

test("multiple sends preserve order until individually acknowledged", async t => {
  const server = await start(0);
  t.after(() => server.dispose());
  const scope = "ordered";
  const base = "/api/notepad";
  const note = (await request(server, base + "?scope=" + scope, "POST", { text: "Shared note" })).body.note;
  const first = (await request(server, base + "/send?scope=" + scope, "POST", { noteIds: [note.id] })).body.handoff;
  const second = (await request(server, base + "/send?scope=" + scope, "POST", { noteIds: [note.id] })).body.handoff;
  assert.deepEqual((await request(server, base + "/inbox?scope=" + scope)).body.handoffs.map(h => h.id), [first.id, second.id]);
  await request(server, base + "/ack?scope=" + scope, "POST", { handoffId: first.id });
  assert.deepEqual((await request(server, base + "/inbox?scope=" + scope)).body.handoffs.map(h => h.id), [second.id]);
});

test("agent CLI inbox, bounded poll and acknowledgement", async t => {
  const server = await start(0);
  t.after(() => server.dispose());
  const scope = "agent-cli";
  const base = "/api/notepad";
  const note = (await request(server, base + "?scope=" + scope, "POST", { text: "Agent should inspect this" })).body.note;
  const listed = await runCli("inbox", "--scope", scope);
  assert.equal(listed.code, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout), []);
  const timeout = await runCli("poll", "--timeout", "0.2", "--scope", scope);
  assert.equal(timeout.code, 0, timeout.stderr);
  assert.equal(JSON.parse(timeout.stdout).status, "timeout");
  const sent = (await request(server, base + "/send?scope=" + scope, "POST", { noteIds: [note.id] })).body.handoff;
  const polled = await runCli("poll", "--timeout", "2", "--scope", scope);
  assert.equal(polled.code, 0, polled.stderr);
  assert.equal(JSON.parse(polled.stdout).handoff.id, sent.id);
  const acknowledged = await runCli("ack", sent.id, "--scope", scope);
  assert.equal(acknowledged.code, 0, acknowledged.stderr);
  assert.equal(JSON.parse(acknowledged.stdout).status, "acknowledged");
  assert.deepEqual(JSON.parse((await runCli("inbox", "--scope", scope)).stdout), []);
});

test("note handoff never wakes a simultaneous Human Review poll", async t => {
  const server = await start(0);
  t.after(() => server.dispose());
  const reviewFile = path.join(directory, "review-while-notes-open.html");
  fs.writeFileSync(reviewFile, "<h1>Keep reviewing</h1>");
  const opened = await request(server, "/api/session", "POST", { file: reviewFile });
  assert.equal(opened.status, 200);

  let reviewFinished = false;
  const reviewPoll = http.get({
    host: "127.0.0.1", port: server.port,
    path: "/api/poll?target=" + encodeURIComponent(reviewFile),
    headers: { "x-human-review-token": server.token },
  }, res => {
    res.resume();
    res.on("end", () => { reviewFinished = true; });
  });
  reviewPoll.on("error", () => {});
  t.after(() => reviewPoll.destroy());

  const scope = "concurrent-handoff";
  const base = "/api/notepad";
  const note = (await request(server, base + "?scope=" + scope, "POST", { text: "Check later" })).body.note;
  const handoff = (await request(server, base + "/send?scope=" + scope, "POST", { noteIds: [note.id] })).body.handoff;
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(reviewFinished, false, "agent review polling must remain independent");
  assert.equal((await request(server, "/api/status?target=" + encodeURIComponent(reviewFile))).body.feedback_waiting, false);
  assert.equal((await request(server, base + "/inbox?scope=" + scope)).body.handoffs[0].id, handoff.id);
});

test("sent snapshots remain stable when an original note is deleted", () => {
  const store = new NotepadStore();
  const scope = "removed-after-send";
  const note = store.add(scope, "Original note to read", "user");
  const handoff = store.send(scope, [note.id]);
  assert.ok(store.remove(scope, note.id));
  assert.deepEqual(store.list(scope), []);
  assert.equal(new NotepadStore().inbox(scope)[0].notes[0].text, "Original note to read");
});

test("a newer agent poll supersedes the old listener without consuming its notification", async t => {
  const server = await start(0);
  t.after(() => server.dispose());
  const scope = "supersede-test";
  const base = "/api/notepad";
  const first = request(server, base + "/poll?scope=" + scope + "&timeout=5000");
  await new Promise(resolve => setTimeout(resolve, 60));
  const second = request(server, base + "/poll?scope=" + scope + "&timeout=5000");
  const superseded = await first;
  assert.deepEqual(superseded.body, { status: "superseded" });

  const note = (await request(server, base + "?scope=" + scope, "POST", { text: "Deliver to new waiter" })).body.note;
  const sent = (await request(server, base + "/send?scope=" + scope, "POST", { noteIds: [note.id] })).body.handoff;
  assert.equal((await second).body.handoff.id, sent.id);
  assert.deepEqual((await request(server, base + "/inbox?scope=" + scope)).body.handoffs.map(h => h.id), [sent.id]);
});
