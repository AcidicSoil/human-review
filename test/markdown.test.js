import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "edit-html-markdown-"));
process.env.EDIT_HTML_STATE_DIR = path.join(tmp, "state");

const { start } = await import("../src/server.js");
const { isMarkdown, renderMarkdownPage } = await import("../src/markdown.js");

function request(port, token, { method = "GET", route = "/", body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: route,
        headers: {
          "x-edit-html-token": token,
          ...(body ? { "content-type": "application/json" } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, raw }));
      }
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test("isMarkdown matches only markdown extensions", () => {
  assert.equal(isMarkdown("/a/plan.md"), true);
  assert.equal(isMarkdown("/a/plan.markdown"), true);
  assert.equal(isMarkdown("/a/PLAN.MD"), true);
  assert.equal(isMarkdown("/a/plan.html"), false);
  assert.equal(isMarkdown("/a/plan.md.html"), false);
});

test("renderMarkdownPage produces a full document from gfm source", () => {
  const html = renderMarkdownPage("# Plan\n\nShip **soon**.\n\n| a | b |\n| - | - |\n| 1 | 2 |\n", "/x/plan.md");
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<h1[^>]*>Plan<\/h1>/);
  assert.match(html, /<strong>soon<\/strong>/);
  assert.match(html, /<table>/, "gfm tables render");
  assert.match(html, /<title>plan\.md<\/title>/);
});

test("a markdown review is rendered, flagged, and never writable", async (t) => {
  const { port, token, dispose } = await start();
  t.after(() => dispose());

  const file = path.join(tmp, "notes.md");
  fs.writeFileSync(file, "# Notes\n\nFirst draft.\n\nSee [the spec](./spec.md).\n");
  fs.writeFileSync(path.join(tmp, "spec.md"), "# Spec\n\nDetails.\n");

  const opened = await request(port, token, { method: "POST", route: "/api/session", body: { file } });
  assert.equal(opened.status, 200);
  const { key, sessionId } = JSON.parse(opened.raw);

  await t.test("the artifact route serves rendered html with the sdk injected", async () => {
    const res = await request(port, token, { route: `/artifact/${key}/index.html` });
    assert.equal(res.status, 200);
    assert.match(res.raw, /<h1[^>]*>Notes<\/h1>/);
    assert.match(res.raw, /data-eh-sdk/);
    assert.doesNotMatch(res.raw, /# Notes/, "raw markdown syntax does not leak through");
  });

  await t.test("page state marks the page as markdown", async () => {
    const res = await request(port, token, { route: `/api/page/${key}` });
    assert.equal(JSON.parse(res.raw).markdown, true);
  });

  await t.test("saves are refused so the source file survives", async () => {
    const res = await request(port, token, {
      method: "POST",
      route: `/api/page/${key}/save`,
      body: { html: "<!DOCTYPE html><html><body>overwritten</body></html>" },
    });
    assert.equal(res.status, 400);
    assert.equal(fs.readFileSync(file, "utf8"), "# Notes\n\nFirst draft.\n\nSee [the spec](./spec.md).\n");
  });

  await t.test("navigation can follow a link to a sibling markdown page", async () => {
    const res = await request(port, token, {
      method: "POST",
      route: `/api/session/${sessionId}/navigate`,
      body: { href: "./spec.md" },
    });
    assert.equal(res.status, 200);
    const nav = JSON.parse(res.raw);
    assert.equal(nav.page.markdown, true);
    assert.equal(nav.page.filename, "spec.md");
  });

  await t.test("comments on a markdown page ship in the batch with the md path", async () => {
    await request(port, token, {
      method: "POST",
      route: `/api/page/${key}/comment`,
      body: { kind: "selection", quote: "First draft.", feedback: "Add a timeline." },
    });
    const sent = await request(port, token, {
      method: "POST",
      route: `/api/page/${key}/send`,
      body: { sessionId, note: "" },
    });
    assert.equal(sent.status, 200);
    const polled = await request(port, token, { route: `/api/poll?file=${encodeURIComponent(file)}` });
    const batch = JSON.parse(polled.raw);
    assert.equal(batch.status, "feedback");
    // The server canonicalizes paths (symlinked tmpdirs on macOS), so match on realpath.
    const page = batch.pages.find((p) => p.file === fs.realpathSync(file));
    assert.equal(page.comments[0].feedback, "Add a timeline.");
    assert.match(batch.next_step, /Markdown source/);
  });
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
