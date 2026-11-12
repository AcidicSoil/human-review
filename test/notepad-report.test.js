import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hr-bug-report-"));
process.env.HUMAN_REVIEW_STATE_DIR = path.join(temporary, "state");
process.on("exit", () => fs.rmSync(temporary, { recursive: true, force: true }));
const { NotepadStore } = await import("../src/notepad/store.js");
const { start } = await import("../src/server.js");

function request(server, method, url, body, token = server.token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port: server.port, method, path: url,
      headers: { ...(token ? { "x-human-review-token": token } : {}),
        ...(body ? { "content-type": "application/json" } : {}) },
    }, res => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", chunk => text += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test("a tool receives a linked actionable bug report; source tracks resolution", () => {
  const source = "/report/consumer";
  const owner = path.join(temporary, "tool-owner");
  fs.mkdirSync(owner);
  const store = new NotepadStore();
  const original = store.add(source, "Tool fails on valid configuration", "agent");
  const details = {
    expected: "Recognize valid configuration",
    actual: "Throws unsupported adapter error",
    steps: "Run tool with project configuration",
  };
  const report = store.reportIssue(source, original.id, owner, details);
  assert.equal(report.status, "pending");
  assert.match(report.text, /valid configuration/);
  assert.equal(report.bugReport.expected, details.expected);
  assert.equal(report.bugReport.actual, details.actual);
  assert.equal(report.bugReport.steps, details.steps);
  assert.equal(report.bugReport.sourceScope, source);
  assert.equal(report.bugReport.sourceNoteId, original.id);
  assert.equal(store.list(source)[0].id, original.id);
  assert.equal(store.list(owner)[0].id, report.id);
  assert.ok(store.listScopes().includes(owner), "reporting initializes owner notebook only");
  assert.equal(store.reportIssue(source, original.id, owner, details).id, report.id, "retries do not duplicate");
  assert.equal(store.list(owner).length, 1);
  assert.equal(new NotepadStore().listWithReports(source)[0].reportedTo[0].status, "pending");
  store.setStatus(owner, report.id, "done");
  assert.equal(new NotepadStore().listWithReports(source)[0].reportedTo[0].status, "done");
  assert.equal(store.list(source)[0].status, "pending", "source verifies fix separately");
  store.setStatus(owner, report.id, "pending");
  assert.equal(store.listWithReports(source)[0].reportedTo[0].status, "pending");
  store.remove(owner, report.id);
  assert.equal(store.listWithReports(source)[0].reportedTo[0].status, "deleted");
  const reopened = store.reportIssue(source, original.id, owner, details);
  assert.notEqual(reopened.id, report.id);
  assert.equal(store.listWithReports(source)[0].reportedTo.length, 1);
  assert.equal(store.listWithReports(source)[0].reportedTo[0].noteId, reopened.id);
});

test("invalid reports cannot modify either notebook", () => {
  const source = "/report/invalid-source";
  const owner = path.join(temporary, "existing-owner");
  fs.mkdirSync(owner);
  const store = new NotepadStore();
  const note = store.add(source, "Failure", "user");
  const details = { expected: "Works", actual: "Throws", steps: "Run tool" };
  const before = store.list(source);
  for (const [target, payload] of [
    [source, details],
    ["/missing/ownership/not-real", details],
    [owner, { ...details, actual: "" }],
    [owner, { ...details, expected: " " }],
  ]) assert.throws(() => store.reportIssue(source, note.id, target, payload), TypeError);
  assert.equal(store.reportIssue(source, "unknown-note", owner, details), null);
  assert.deepEqual(new NotepadStore().list(source), before);
  assert.equal(new NotepadStore().list(owner).length, 0);
});

test("authenticated report API exposes bug status to originating project", async t => {
  const server = await start(0);
  t.after(() => server.dispose());
  const source = "/report/http-consumer";
  const owner = path.join(temporary, "http-tool");
  fs.mkdirSync(owner);
  const created = await request(server, "POST", "/api/notepad?scope=" + encodeURIComponent(source), {
    text: "Tool rejects valid input", author: "user",
  });
  const url = "/api/notepad/report?scope=" + encodeURIComponent(source);
  const payload = { noteId: created.body.note.id, destination: owner,
    expected: "Accept input", actual: "Error", steps: "Run command" };
  assert.equal((await request(server, "POST", url, payload, null)).status, 401);
  const published = await request(server, "POST", url, payload);
  assert.equal(published.status, 201);
  assert.equal(published.body.report.bugReport.sourceScope, source);
  const receiving = await request(server, "GET", "/api/notepad?scope=" + encodeURIComponent(owner));
  assert.equal(receiving.body.notes[0].id, published.body.report.id);
  await request(server, "PATCH",
    "/api/notepad/" + published.body.report.id + "?scope=" + encodeURIComponent(owner),
    { status: "done" });
  const originating = await request(server, "GET", "/api/notepad?scope=" + encodeURIComponent(source));
  assert.equal(originating.body.notes[0].reportedTo[0].status, "done");
});
