import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "edit-html-poll-"));
process.env.EDIT_HTML_STATE_DIR = path.join(tmp, "state");
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function request(port, method, route, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: route,
        headers: body ? { "content-type": "application/json" } : undefined,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
      }
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function collect(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

async function waitForServer() {
  const record = path.join(process.env.EDIT_HTML_STATE_DIR, "server.json");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const { port } = JSON.parse(fs.readFileSync(record, "utf8"));
      const health = await request(port, "GET", "/health");
      if (health.status === 200) return port;
    } catch {
      // The child has not announced its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("review server did not start");
}

test("poll exits with the feedback batch when the user sends", async (t) => {
  const file = path.join(tmp, "review.html");
  fs.writeFileSync(file, "<p>Original</p>");

  const reviewServer = spawn(process.execPath, ["src/server-entry.js"], {
    cwd: project,
    env: { ...process.env, EDIT_HTML_STATE_DIR: process.env.EDIT_HTML_STATE_DIR },
    stdio: "ignore",
  });

  t.after(async () => {
    if (reviewServer.exitCode === null) {
      reviewServer.kill();
      await once(reviewServer, "exit");
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const port = await waitForServer();
  const opened = await request(port, "POST", "/api/session", { file });
  assert.equal(opened.status, 200);

  const commented = await request(port, "POST", `/api/page/${opened.body.key}/comment`, {
    kind: "selection",
    quote: "Original",
    feedback: "Make this clearer.",
  });
  assert.equal(commented.status, 200);

  const child = spawn(process.execPath, ["src/cli.js", "poll", file], {
    cwd: project,
    env: { ...process.env, EDIT_HTML_STATE_DIR: process.env.EDIT_HTML_STATE_DIR },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const resultPromise = collect(child);

  const sent = await request(port, "POST", `/api/page/${opened.body.key}/send`, {
    sessionId: opened.body.sessionId,
    note: "",
  });
  assert.equal(sent.status, 200);

  const result = await resultPromise;
  assert.equal(result.code, 0, result.stderr);
  const batch = JSON.parse(result.stdout);
  assert.equal(batch.status, "feedback");
  assert.equal(batch.pages[0].comments[0].feedback, "Make this clearer.");
});
