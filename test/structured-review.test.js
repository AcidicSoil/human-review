import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createLoaReviewHtml } from "../src/loa-review/generator.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-structured-"));
process.env.HUMAN_REVIEW_STATE_DIR = path.join(root, "state");
const { createServer } = await import("../src/server.js");

test("LOA changes persist and reach the original agent poll as structured feedback", async () => {
  const file = path.join(root, "review.loa.review.html");
  const resourceSources = [{ id: "example", kind: "skills", displayName: "Example skills", skills: [
    { ref: "example://skill/check", displayName: "Check" },
  ] }];
  const resourceManifest = {
    format: "human-review.resources/v1",
    sources: [{ id: "mixed", kind: "plugin", displayName: "Mixed plugin", refs: ["example://mcp"] }],
    capabilities: [{ ref: "example://mcp", kind: "mcp", displayName: "MCP integration" }],
    relationships: [], workflows: [],
  };
  fs.writeFileSync(file, createLoaReviewHtml({
    loa: { actions: [{ id: "a1", content: "Original action", snapIns: [], phase: "Review" }] },
    catalog: [],
    resourceSources,
    resourceManifest,
  }));
  const app = createServer();
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const port = app.server.address().port;
  const api = async (url, { method = "GET", body } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: { "x-human-review-token": app.token, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    const opened = await api("/api/session", { method: "POST", body: { target: file } });
    assert.equal(opened.status, 200);
    const { sessionId, key } = opened.data;
    const before = await api(`/api/page/${key}?session=${sessionId}`);
    assert.equal(before.data.reviewMode, "loa");
    const draft = {
      format: "human-review.snapshot/v1",
      mode: "loa",
      document: { loa: { actions: [{ id: "a1", content: "Reviewed action", snapIns: [
        { kind: "mcp", ref: "example://mcp", displayName: "MCP integration" },
      ], phase: "Review" }] }, catalog: [], resourceSources, resourceManifest },
      baseHash: before.data.sourceHash,
      expectedRevision: 0,
    };
    const updated = await api(`/api/page/${key}/structured`, { method: "POST", body: draft });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.page.unsent.structured, 1);
    const duplicate = await api(`/api/page/${key}/structured`, { method: "POST", body: draft });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.data.page.structured.revision, 1);
    const send = await api(`/api/page/${key}/send`, { method: "POST", body: { sessionId, note: "Review the action" } });
    assert.equal(send.status, 200);
    const poll = await api(`/api/poll?target=${encodeURIComponent(file)}`);
    assert.equal(poll.data.status, "feedback");
    assert.equal(poll.data.pages[0].structured_review.mode, "loa");
    assert.equal(poll.data.pages[0].structured_review.document.loa.actions[0].content, "Reviewed action");
    assert.deepEqual(poll.data.pages[0].structured_review.document.resourceSources, resourceSources);
    assert.deepEqual(poll.data.pages[0].structured_review.document.resourceManifest, resourceManifest);
    assert.equal(poll.data.pages[0].structured_review.document.loa.actions[0].snapIns[0].kind, "mcp");
    assert.equal(poll.data.pages[0].structured_review.document.loa.actions[0].phase, "Review");
    assert.equal(poll.data.overall_note, "Review the action");
    assert.equal((await api(`/api/page/${key}`)).data.unsent.structured, 0);
    const after = await api(`/api/page/${key}/structured`, { method: "POST", body: {
      ...draft, expectedRevision: 1,
      document: { ...draft.document, loa: { actions: [{ id: "a1", content: "Second edit", snapIns: [] }] } },
    } });
    assert.equal(after.status, 200);
    assert.equal(after.data.page.unsent.structured, 1);
    const conflict = await api(`/api/page/${key}/structured`, { method: "POST", body: {
      ...draft, expectedRevision: 0,
      document: { ...draft.document, loa: { actions: [{ id: "a1", content: "Stale", snapIns: [] }] } },
    } });
    assert.equal(conflict.status, 409);
    await fetch(`http://127.0.0.1:${port}/api/poll?target=${encodeURIComponent(file)}&ack=1`, {
      headers: { "x-human-review-token": app.token },
      signal: AbortSignal.timeout(120),
    }).catch(() => {});
    assert.equal((await api(`/api/page/${key}`)).data.unsent.structured, 1, "ack cannot clear a newer unsent revision");
    fs.writeFileSync(file, createLoaReviewHtml({
      loa: { actions: [{ id: "a1", content: "Agent updated source", snapIns: [] }] },
      catalog: [],
    }));
    await api("/api/session", { method: "POST", body: { target: file } });
    const stale = await api(`/api/page/${key}`);
    assert.equal(stale.data.structuredConflict, true);
    const rejected = await api(`/api/page/${key}/structured`, {
      method: "POST", body: { ...draft, expectedRevision: 2 },
    });
    assert.equal(rejected.status, 409);
    const discarded = await api(`/api/page/${key}/structured`, { method: "DELETE" });
    assert.equal(discarded.status, 200);
    assert.equal(discarded.data.page.structured, null);
    assert.equal(fs.readFileSync(file, "utf8").includes("Agent updated source"), true);
  } finally {
    app.dispose();
    await once(app.server, "close");
    fs.rmSync(root, { recursive: true, force: true });
  }
});
