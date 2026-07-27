#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureStateDir, realFile, serverPath } from "./paths.js";
import { installSkills } from "./setup.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(here, "..", "package.json"), "utf8"));

const HELP = `edit-html ${pkg.version}

  edit-html <file.html>            Open a file for review in your browser
  edit-html poll <file.html>       Wait for feedback, print it as JSON (for agents)
  edit-html poll <file> --ack      Acknowledge the last batch, then keep waiting
  edit-html setup                  Teach Claude Code / Codex how to use edit-html
  edit-html setup --global         ...for every project, not just this one

Everything runs locally. No account, no database, no network.
`;

// --------------------------------------------------------------- server glue

function request(port, options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, ...options }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => resolve({ status: res.statusCode, raw }));
    });
    req.on("error", reject);
    if (options.timeout) req.setTimeout(options.timeout, () => req.destroy(new Error("timeout")));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function alive(port) {
  try {
    const res = await request(port, { method: "GET", path: "/health", timeout: 1200 });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function ensureServer() {
  ensureStateDir();
  try {
    const saved = JSON.parse(fs.readFileSync(serverPath(), "utf8"));
    if (saved.port && (await alive(saved.port))) return saved.port;
  } catch {
    // No usable server on record; start a fresh one below.
  }

  const child = spawn(process.execPath, [path.join(here, "server-entry.js")], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const saved = JSON.parse(fs.readFileSync(serverPath(), "utf8"));
      if (saved.port && (await alive(saved.port))) return saved.port;
    } catch {
      // Keep waiting for the server to announce itself.
    }
  }
  throw new Error("Could not start the local edit-html server.");
}

function openBrowser(url) {
  const command =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try {
    const child = spawn(command[0], command[1], { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    // Printing the URL below is the fallback.
  }
}

// ------------------------------------------------------------------ commands

async function openCommand(file) {
  const target = realFile(file);
  if (!fs.existsSync(target)) {
    console.error(`File not found: ${target}`);
    process.exit(1);
  }
  const port = await ensureServer();
  const res = await request(port, { method: "POST", path: "/api/session", headers: { "content-type": "application/json" } }, { file: target });
  const body = JSON.parse(res.raw);
  if (res.status !== 200) {
    console.error(body.error || "Could not open that file.");
    process.exit(1);
  }
  const url = `http://127.0.0.1:${port}${body.path}`;
  openBrowser(url);
  console.log(`Reviewing ${path.basename(target)}`);
  console.log(url);
  console.log(`\nWaiting for feedback? Run:\n  edit-html poll ${JSON.stringify(target)}`);
}

function pollOnce(port, file, ack) {
  const query = `file=${encodeURIComponent(file)}${ack ? "&ack=1" : ""}`;
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: "GET", path: `/api/poll?${query}` }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => resolve(raw.trim()));
    });
    req.on("error", reject);
    req.end();
  });
}

async function pollCommand(file, ack) {
  const target = realFile(file);
  const port = await ensureServer();

  process.stderr.write(`Waiting for feedback on ${path.basename(target)} — comment in the browser, then hit Send.\n`);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let raw = "";
    try {
      raw = await pollOnce(port, target, ack && attempt === 0);
    } catch (err) {
      process.stderr.write(`Lost the connection (${err.message}); retrying.\n`);
      continue;
    }
    if (!raw) continue;
    try {
      const batch = JSON.parse(raw);
      process.stdout.write(`${JSON.stringify(batch, null, 2)}\n`);
      return;
    } catch {
      process.stderr.write("Unexpected response from the edit-html server; retrying.\n");
    }
  }
  process.stderr.write("Gave up waiting for feedback.\n");
  process.exit(1);
}

// ---------------------------------------------------------------------- main

const argv = process.argv.slice(2);

if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
  console.log(HELP);
  process.exit(0);
}

if (argv[0] === "--version" || argv[0] === "-v") {
  console.log(pkg.version);
  process.exit(0);
}

process.on("SIGINT", () => {
  process.stderr.write("\nStopped waiting. Your feedback is safe — run the same command again to pick it up.\n");
  process.exit(130);
});

try {
  if (argv[0] === "poll") {
    const file = argv.find((a, i) => i > 0 && !a.startsWith("-"));
    if (!file) throw new Error("Usage: edit-html poll <file.html>");
    await pollCommand(file, argv.includes("--ack"));
  } else if (argv[0] === "setup") {
    const isGlobal = argv.includes("--global") || argv.includes("-g");
    installSkills(process.cwd(), { global: isGlobal }).forEach((line) => console.log(line));
  } else {
    await openCommand(argv[0]);
  }
} catch (err) {
  console.error(err.message || String(err));
  process.exit(1);
}
