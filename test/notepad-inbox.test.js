import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "hr-reports-inbox-"));
process.env.HUMAN_REVIEW_STATE_DIR = path.join(root, "state");
process.on("exit", () => fs.rmSync(root, { recursive: true, force: true }));
const { NotepadStore } = await import("../src/notepad/store.js");
const { start } = await import("../src/server.js");

const details = {
  expected: "Return **valid** output",
  actual: "Throws `BadValue`",
  steps: "Run `tool --check`",
};
function call(server, method, route, body, token = server.token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1", port: server.port, method, path: route,
      headers: { ...(token ? { "x-human-review-token": token } : {}),
        ...(body ? { "content-type": "application/json" } : {}) },
    }, res => {
      let raw = "";
      res.on("data", chunk => raw += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test("incoming reports remain in the owner inbox until promoted with their ID preserved", () => {
  const source = "/inbox-consumer";
  const owner = path.join(root, "inbox-tool");
  fs.mkdirSync(owner, { recursive: true });
  const store = new NotepadStore();
  const original = store.add(source, "Broken tool", "agent");
  const report = store.reportIssue(source, original.id, owner, details);
  assert.equal(store.list(owner).length, 0);
  assert.deepEqual(store.listReports(owner).map(item => item.id), [report.id]);
  assert.equal(store.reportIssue(source, original.id, owner, details).id, report.id);
  store.setStatus(owner, report.id, "done");
  assert.equal(store.listReports(owner)[0].status, "done");
  assert.equal(store.listWithReports(source)[0].reportedTo[0].status, "done");
  const promoted = store.promoteReport(owner, report.id);
  assert.equal(promoted.id, report.id);
  assert.equal(promoted.status, "done");
  assert.equal(store.listReports(owner).length, 0);
  assert.equal(store.list(owner)[0].id, report.id);
  assert.equal(store.promoteReport(owner, report.id), null);
  assert.equal(new NotepadStore().listWithReports(source)[0].reportedTo[0].status, "done");
  assert.equal(store.list(source)[0].status, "pending");
});

test("legacy received reports migrate into inbox without losing links or promoted state", () => {
  const source = "/inbox-migrate-source";
  const owner = "/inbox-migrate-owner";
  const id = "550e8400-e29b-41d4-a716-446655440000";
  fs.mkdirSync(process.env.HUMAN_REVIEW_STATE_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.HUMAN_REVIEW_STATE_DIR, "notepad.json"), JSON.stringify({
    version: 1, notebooks: [source, owner],
    handoffs: {},
    scopes: {
      [source]: [{ id: "source-1", text: "Original", status: "pending", reportedTo: [{ scope: owner, noteId: id }] }],
      [owner]: [{ id, text: "Legacy **report**", status: "pending",
        bugReport: { sourceScope: source, sourceNoteId: "source-1", ...details } }],
    },
  }));
  const store = new NotepadStore();
  assert.equal(store.list(owner).length, 0);
  assert.deepEqual(store.listReports(owner).map(item => item.id), [id]);
  store.promoteReport(owner, id);
  const loaded = new NotepadStore();
  assert.equal(loaded.listReports(owner).length, 0);
  assert.equal(loaded.list(owner)[0].id, id);
  assert.equal(loaded.listWithReports(source)[0].reportedTo[0].status, "pending");
});

test("authenticated API serves inbox separately, promotes once, and renders safe Markdown", async t => {
  const server = await start(0);
  t.after(() => server.dispose());
  const owner = path.join(root, "inbox-http-owner");
  fs.mkdirSync(owner, { recursive: true });
  const source = "/inbox-http-source";
  const sourceRoute = "?scope=" + encodeURIComponent(source);
  const ownerRoute = "?scope=" + encodeURIComponent(owner);
  const created = await call(server, "POST", "/api/notepad" + sourceRoute, {
    text: "A **bold** note and `code` with [bad](javascript:alert(1)) <img src=x onerror=alert(1)>",
  });
  const reported = await call(server, "POST", "/api/notepad/report" + sourceRoute,
    { noteId: created.body.note.id, destination: owner, ...details });
  assert.equal(reported.status, 201);
  const reportId = reported.body.report.id;
  assert.equal((await call(server, "GET", "/api/notepad/reports" + ownerRoute, null, "")).status, 401);
  const inbox = await call(server, "GET", "/api/notepad" + ownerRoute);
  assert.equal(inbox.body.notes.length, 0);
  assert.equal(inbox.body.reports[0].id, reportId);
  assert.match(inbox.body.reports[0].html, /<strong>bold<\/strong>/);
  assert.match(inbox.body.reports[0].html, /<code>code<\/code>/);
  assert.doesNotMatch(inbox.body.reports[0].html, /onerror|javascript:|<img/i);
  assert.equal((await call(server, "GET", "/api/notepad/reports" + ownerRoute)).body.reports.length, 1);
  const moved = await call(server, "POST", "/api/notepad/reports/" + reportId + "/promote" + ownerRoute);
  assert.equal(moved.status, 200);
  assert.equal(moved.body.note.id, reportId);
  assert.equal((await call(server, "POST", "/api/notepad/reports/" + reportId + "/promote" + ownerRoute)).status, 404);
  const after = await call(server, "GET", "/api/notepad" + ownerRoute);
  assert.equal(after.body.reports.length, 0);
  assert.equal(after.body.notes[0].id, reportId);
});
