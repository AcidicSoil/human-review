import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Store, resolveAsset } from "./state.js";
import { injectSdk, stripSdk } from "./html-transform.js";
import { ensureStateDir, pageKey, realFile, serverPath } from "./paths.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const MAX_BODY = 24 * 1024 * 1024;
const POLL_HEARTBEAT_MS = 15000;
const WATCH_INTERVAL_MS = 400;
const IDLE_SHUTDOWN_MS = Number(process.env.EDIT_HTML_IDLE_MS || 45 * 60 * 1000);

const hash = (text) => crypto.createHash("sha1").update(text).digest("hex");
const uid = (prefix) => `${prefix}_${crypto.randomBytes(6).toString("hex")}`;

export function createServer() {
  const store = new Store();

  /** Browser windows. Ephemeral — nothing durable lives here. */
  const sessions = new Map(); // sessionId -> { id, entryKey, activeKey, clients:Set<res> }
  /** Agent long-polls, keyed by the entry page they were started on. */
  const pollers = new Map(); // entryKey -> Set<{ res, timer }>
  const batches = new Map(); // entryKey -> pending batch awaiting --ack
  const watched = new Map(); // key -> { file }
  const lastWritten = new Map(); // key -> content hash edit-html itself wrote

  let lastActivity = Date.now();
  const touch = () => {
    lastActivity = Date.now();
  };

  // ---------------------------------------------------------------- helpers

  function sessionsForKey(key) {
    return [...sessions.values()].filter((s) => s.activeKey === key);
  }

  function sessionsForEntry(entryKey) {
    return [...sessions.values()].filter((s) => s.entryKey === entryKey);
  }

  function emit(session, event, data) {
    for (const res of session.clients) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data || {})}\n\n`);
    }
  }

  function agentState(entryKey) {
    if (batches.has(entryKey)) return "working";
    const set = pollers.get(entryKey);
    return set && set.size ? "listening" : "idle";
  }

  function broadcastAgent(entryKey) {
    const state = agentState(entryKey);
    for (const session of sessionsForEntry(entryKey)) emit(session, "agent", { state });
  }

  // ------------------------------------------------------------- file watch

  function watchPage(key) {
    if (watched.has(key)) return;
    const page = store.page(key);
    if (!page) return;
    watched.set(key, { file: page.file });

    fs.watchFile(page.file, { interval: WATCH_INTERVAL_MS }, () => {
      let html = "";
      try {
        html = fs.readFileSync(page.file, "utf8");
      } catch {
        return;
      }
      const current = hash(html);
      // Our own autosave must never bounce back as a reload.
      if (lastWritten.get(key) === current) return;
      lastWritten.set(key, current);
      store.setPristine(key, html);
      for (const session of sessionsForKey(key)) emit(session, "reload", { key });
    });
  }

  function writePage(key, html) {
    const page = store.page(key);
    if (!page) throw new Error("unknown page");
    const clean = stripSdk(html);
    const tmp = `${page.file}.edit-html.tmp`;
    fs.writeFileSync(tmp, clean);
    fs.renameSync(tmp, page.file);
    lastWritten.set(key, hash(clean));
    return clean;
  }

  // ------------------------------------------------------------------ batch

  function deliver(entryKey, batch) {
    const set = pollers.get(entryKey);
    if (!set || set.size === 0) return false;
    for (const poller of [...set]) {
      clearInterval(poller.timer);
      set.delete(poller);
      poller.res.end(JSON.stringify(batch));
    }
    return true;
  }

  function sendBatch(sessionId, note) {
    const session = sessions.get(sessionId);
    if (!session) return { error: "unknown session" };
    const key = session.activeKey;
    const page = store.page(key);
    if (!page) return { error: "unknown page" };

    const batch = {
      status: "feedback",
      file: page.file,
      comments: page.comments.map((c) => ({
        id: c.id,
        kind: c.kind,
        quote: c.quote,
        anchor: c.anchor,
        feedback: c.feedback,
      })),
      edits: page.edits.map((e) => ({ label: e.label, kind: e.kind })),
      overall_note: note || "",
      sent_at: new Date().toISOString(),
      next_step:
        "Apply this feedback to `file`. Items under `edits` are changes the human already made — keep them. " +
        "When the file is updated, run the same poll command again with --ack to clear this batch and wait for more.",
    };

    if (!batch.comments.length && !batch.edits.length && !batch.overall_note) {
      return { error: "nothing to send" };
    }

    batches.set(session.entryKey, { batch, key, ids: page.comments.map((c) => c.id) });
    deliver(session.entryKey, batch);
    broadcastAgent(session.entryKey);
    return { ok: true };
  }

  function ack(entryKey) {
    const pending = batches.get(entryKey);
    if (!pending) return false;
    batches.delete(entryKey);
    store.clearSent(pending.key, pending.ids);
    for (const session of sessionsForEntry(entryKey)) emit(session, "refresh", {});
    broadcastAgent(entryKey);
    return true;
  }

  // ----------------------------------------------------------------- routes

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          reject(new Error("body too large"));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw) return resolve({});
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error("invalid json"));
        }
      });
      req.on("error", reject);
    });
  }

  const json = (res, code, payload) => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
  };

  function serveFile(res, file, extraHeaders) {
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-store",
        ...(extraHeaders || {}),
      });
      res.end(buf);
    });
  }

  // The artifact iframe is sandboxed without allow-same-origin, so its module
  // scripts are fetched from a null origin and need CORS to load at all.
  const CORS = { "access-control-allow-origin": "*" };

  function pageState(key) {
    const page = store.page(key);
    if (!page) return null;
    return {
      key: page.key,
      file: page.file,
      filename: path.basename(page.file),
      comments: page.comments,
      edits: page.edits,
      canRevert: typeof page.pristine === "string" && page.pristine.length > 0,
    };
  }

  const server = http.createServer(async (req, res) => {
    touch();
    const url = new URL(req.url, "http://127.0.0.1");
    const route = url.pathname;

    try {
      if (route === "/health") return json(res, 200, { ok: true, pid: process.pid });

      // --- static chrome assets
      if (route === "/chrome.css") return serveFile(res, path.join(here, "chrome.css"));
      if (route === "/chrome.js") return serveFile(res, path.join(here, "chrome-client.js"), CORS);
      if (route === "/sdk.js") return serveFile(res, path.join(here, "sdk.js"), CORS);
      if (route === "/anchor-text.js") return serveFile(res, path.join(here, "anchor-text.js"), CORS);

      // --- open a browser session for a file
      if (route === "/api/session" && req.method === "POST") {
        const body = await readBody(req);
        const file = realFile(body.file || "");
        if (!fs.existsSync(file)) return json(res, 404, { error: `File not found: ${file}` });
        const html = fs.readFileSync(file, "utf8");
        const page = store.openPage(file, stripSdk(html));
        lastWritten.set(page.key, hash(stripSdk(html)));
        watchPage(page.key);
        const id = uid("s");
        sessions.set(id, { id, entryKey: page.key, activeKey: page.key, clients: new Set() });
        return json(res, 200, { sessionId: id, key: page.key, path: `/s/${id}` });
      }

      // --- the chrome page
      if (route.startsWith("/s/")) {
        const id = route.slice(3);
        if (!sessions.has(id)) {
          res.writeHead(404, { "content-type": "text/plain" });
          return res.end("This review session has ended. Run edit-html <file> again.");
        }
        const shell = fs.readFileSync(path.join(here, "chrome.html"), "utf8");
        res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" });
        return res.end(shell.replace("__SESSION_ID__", id));
      }

      // --- the artifact itself, plus its sibling assets
      if (route.startsWith("/artifact/")) {
        const rest = route.slice("/artifact/".length);
        const slash = rest.indexOf("/");
        const key = slash === -1 ? rest : rest.slice(0, slash);
        const asset = slash === -1 ? "" : rest.slice(slash + 1);
        const page = store.page(key);
        if (!page) {
          res.writeHead(404, { "content-type": "text/plain" });
          return res.end("Unknown page");
        }
        if (!asset || asset === "index.html") {
          let html = "";
          try {
            html = fs.readFileSync(page.file, "utf8");
          } catch {
            res.writeHead(404, { "content-type": "text/plain" });
            return res.end("File is gone");
          }
          res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" });
          return res.end(injectSdk(html, key));
        }
        const target = resolveAsset(page.file, asset.split("?")[0]);
        if (!target) {
          res.writeHead(403, { "content-type": "text/plain" });
          return res.end("Forbidden");
        }
        return serveFile(res, target);
      }

      // --- page data
      const pageMatch = route.match(/^\/api\/page\/([a-f0-9]+)(?:\/(\w+))?(?:\/(.+))?$/);
      if (pageMatch) {
        const [, key, action, tail] = pageMatch;
        if (!store.page(key)) return json(res, 404, { error: "unknown page" });

        if (!action && req.method === "GET") return json(res, 200, pageState(key));

        if (action === "comment" && req.method === "POST") {
          const body = await readBody(req);
          const comment = {
            id: uid("c"),
            kind: body.kind === "element" ? "element" : "selection",
            quote: String(body.quote || ""),
            anchor: body.anchor || null,
            feedback: String(body.feedback || ""),
            createdAt: Date.now(),
          };
          if (!comment.feedback) return json(res, 400, { error: "empty feedback" });
          store.addComment(key, comment);
          return json(res, 200, { comment, page: pageState(key) });
        }

        if (action === "comment" && req.method === "DELETE") {
          store.removeComment(key, tail);
          return json(res, 200, { page: pageState(key) });
        }

        if (action === "edit" && req.method === "POST") {
          const body = await readBody(req);
          const label = String(body.label || "Document");
          const kind = body.kind === "deleted" ? "deleted" : "edited";
          store.addEdit(key, label, kind);
          return json(res, 200, { page: pageState(key) });
        }

        if (action === "save" && req.method === "POST") {
          const body = await readBody(req);
          if (typeof body.html !== "string" || !body.html.trim()) {
            return json(res, 400, { error: "empty html" });
          }
          try {
            writePage(key, body.html);
          } catch (err) {
            return json(res, 500, { error: String(err.message || err) });
          }
          return json(res, 200, { savedAt: Date.now() });
        }

        if (action === "revert" && req.method === "POST") {
          const page = store.page(key);
          if (!page.pristine) return json(res, 400, { error: "nothing to revert to" });
          writePage(key, page.pristine);
          store.clearEdits(key);
          for (const session of sessionsForKey(key)) emit(session, "reload", { key });
          return json(res, 200, { page: pageState(key) });
        }

        if (action === "send" && req.method === "POST") {
          const body = await readBody(req);
          const result = sendBatch(body.sessionId, body.note);
          if (result.error) return json(res, 400, result);
          return json(res, 200, { ok: true, page: pageState(key) });
        }
      }

      // --- which page a window is currently showing
      const bootMatch = route.match(/^\/api\/session\/(\w+)\/page$/);
      if (bootMatch && req.method === "GET") {
        const session = sessions.get(bootMatch[1]);
        if (!session) return json(res, 404, { error: "unknown session" });
        return json(res, 200, { key: session.activeKey, page: pageState(session.activeKey) });
      }

      // --- navigation between local pages inside one window
      const navMatch = route.match(/^\/api\/session\/(\w+)\/navigate$/);
      if (navMatch && req.method === "POST") {
        const session = sessions.get(navMatch[1]);
        if (!session) return json(res, 404, { error: "unknown session" });
        const body = await readBody(req);
        const from = store.page(session.activeKey);
        if (!from) return json(res, 404, { error: "unknown page" });
        const target = resolveAsset(from.file, String(body.href || "").split(/[?#]/)[0]);
        if (!target || !fs.existsSync(target) || !/\.x?html?$/i.test(target)) {
          return json(res, 400, { error: "not a local html page" });
        }
        const html = fs.readFileSync(target, "utf8");
        const page = store.openPage(target, stripSdk(html));
        lastWritten.set(page.key, hash(stripSdk(html)));
        watchPage(page.key);
        session.activeKey = page.key;
        return json(res, 200, { key: page.key, page: pageState(page.key) });
      }

      // --- server-sent events for one window
      if (route.startsWith("/events/")) {
        const session = sessions.get(route.slice("/events/".length));
        if (!session) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write(": open\n\n");
        session.clients.add(res);
        emit(session, "agent", { state: agentState(session.entryKey) });
        const beat = setInterval(() => res.write(": beat\n\n"), POLL_HEARTBEAT_MS);
        req.on("close", () => {
          clearInterval(beat);
          session.clients.delete(res);
        });
        return undefined;
      }

      // --- the agent long-poll
      if (route === "/api/poll") {
        const file = url.searchParams.get("file") || "";
        const entryKey = pageKey(file);
        if (url.searchParams.get("ack") === "1") ack(entryKey);

        const pending = batches.get(entryKey);
        if (pending) {
          broadcastAgent(entryKey);
          return json(res, 200, pending.batch);
        }

        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.write(" ");
        const set = pollers.get(entryKey) || new Set();
        pollers.set(entryKey, set);
        const poller = {
          res,
          timer: setInterval(() => res.write(" "), POLL_HEARTBEAT_MS),
        };
        set.add(poller);
        broadcastAgent(entryKey);
        req.on("close", () => {
          clearInterval(poller.timer);
          set.delete(poller);
          broadcastAgent(entryKey);
        });
        return undefined;
      }

      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("Not found");
    } catch (err) {
      return json(res, 500, { error: String(err.message || err) });
    }
  });

  setInterval(() => {
    const busy = sessions.size > 0 || [...pollers.values()].some((s) => s.size > 0);
    if (!busy && Date.now() - lastActivity > IDLE_SHUTDOWN_MS) process.exit(0);
  }, 60000).unref();

  return { server, store };
}

export function start(port = 0) {
  const { server } = createServer();
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const actual = server.address().port;
      ensureStateDir();
      fs.writeFileSync(serverPath(), JSON.stringify({ port: actual, pid: process.pid }));
      resolve({ server, port: actual });
    });
  });
}
