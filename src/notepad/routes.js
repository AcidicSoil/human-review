import fs from "node:fs";
import { NotepadStore } from "./store.js";
import { createNotepadWindowRegistry } from "./windows.js";

const template = new URL("./index.html", import.meta.url);
const MAX_WAIT_MS = 25000;

/** Notepad delivery is independent of review Send/Poll/Ack and feedback batches. */
export function createNotepadRoute({ token, viewToken }) {
  let store;
  const notepad = () => (store ||= new NotepadStore());
  const waiting = new Map();
  const windows = createNotepadWindowRegistry();

  const badInput = (error, res, json) => {
    if (!(error instanceof TypeError || error instanceof RangeError)) throw error;
    json(res, 400, { error: error.message });
  };

  const finish = (scope, payload, json) => {
    const listener = waiting.get(scope);
    if (!listener) return;
    waiting.delete(scope);
    clearTimeout(listener.timer);
    json(listener.res, 200, payload);
  };

  const handle = async ({ req, res, url, json, readBody }) => {
    const route = url.pathname;
    const scope = url.searchParams.get("scope");

    if (route === "/notepad/" + viewToken && req.method === "GET") {
      const html = fs.readFileSync(template, "utf8");
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
      });
      res.end(html.replace("__TOKEN__", token));
      return true;
    }

    if (route === "/api/notepad/window/connect" && req.method === "GET") {
      try {
        notepad().list(scope);
        windows.connect(scope, res);
      } catch (error) {
        badInput(error, res, json);
      }
      return true;
    }

    if (route === "/api/notepad/window/activate" && req.method === "POST") {
      try {
        notepad().list(scope);
        json(res, 200, windows.activate(scope));
      } catch (error) {
        badInput(error, res, json);
      }
      return true;
    }

    if (route === "/api/notepad/open" && req.method === "GET") {
      try {
        notepad().list(scope);
        json(res, 200, { path: "/notepad/" + viewToken + "?scope=" + encodeURIComponent(scope) });
      } catch (error) {
        badInput(error, res, json);
      }
      return true;
    }

    if (route === "/api/notepad/scopes" && req.method === "GET") {
      json(res, 200, { scopes: notepad().listScopes() });
      return true;
    }

    if (route === "/api/notepad/scope" && req.method === "DELETE") {
      try {
        const removed = notepad().deleteScope(scope);
        json(res, removed ? 200 : 404, removed || { error: "Unknown notebook." });
        if (removed) finish(scope, { status: "deleted" }, json);
      } catch (error) {
        badInput(error, res, json);
      }
      return true;
    }

    if (route === "/api/notepad" && req.method === "GET") {
      try {
        json(res, 200, { notes: notepad().list(scope), handoffs: notepad().outbox(scope) });
      } catch (error) {
        badInput(error, res, json);
      }
      return true;
    }

    if (route === "/api/notepad" && req.method === "POST") {
      try {
        const body = await readBody(req);
        json(res, 201, { note: notepad().add(scope, body.text, body.author || "user") });
      } catch (error) {
        badInput(error, res, json);
      }
      return true;
    }

    if (route === "/api/notepad/move" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const moved = notepad().move(scope, body.destination, body.noteIds);
        json(res, 200, { destination: body.destination, moved });
      } catch (error) {
        badInput(error, res, json);
      }
      return true;
    }

    if (route === "/api/notepad/send" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const handoff = notepad().send(scope, body.noteIds);
        json(res, 201, { handoff });
        finish(scope, { handoff }, json);
      } catch (error) {
        badInput(error, res, json);
      }
      return true;
    }

    if (route === "/api/notepad/inbox" && req.method === "GET") {
      try {
        json(res, 200, { handoffs: notepad().inbox(scope) });
      } catch (error) {
        badInput(error, res, json);
      }
      return true;
    }

    if (route === "/api/notepad/ack" && req.method === "POST") {
      try {
        const body = await readBody(req);
        if (typeof body.handoffId !== "string" || !body.handoffId) throw new TypeError("A handoff ID is required.");
        const handoff = notepad().ack(scope, body.handoffId);
        json(res, handoff ? 200 : 404, handoff ? { handoff } : { error: "Unknown handoff." });
      } catch (error) {
        badInput(error, res, json);
      }
      return true;
    }

    if (route === "/api/notepad/poll" && req.method === "GET") {
      try {
        const inbox = notepad().inbox(scope);
        if (inbox.length) {
          json(res, 200, { handoff: inbox[0] });
          return true;
        }
        const timeout = Number(url.searchParams.get("timeout") || MAX_WAIT_MS);
        if (!Number.isFinite(timeout) || timeout < 1 || timeout > MAX_WAIT_MS) {
          throw new TypeError("Invalid poll timeout.");
        }
        // A single waiting agent per workspace, matching the Human Review poll contract.
        finish(scope, { status: "superseded" }, json);
        const listener = { res, timer: null };
        listener.timer = setTimeout(() => finish(scope, { status: "timeout" }, json), timeout);
        waiting.set(scope, listener);
        res.on("close", () => {
          if (waiting.get(scope) !== listener) return;
          clearTimeout(listener.timer);
          waiting.delete(scope);
        });
      } catch (error) {
        badInput(error, res, json);
      }
      return true;
    }

    const noteRoute = route.match(/^\/api\/notepad\/([a-f0-9-]+)$/);
    if (noteRoute && req.method === "PATCH") {
      try {
        const body = await readBody(req);
        const note = notepad().setStatus(scope, noteRoute[1], body.status);
        json(res, note ? 200 : 404, note ? { note } : { error: "Unknown note." });
      } catch (error) {
        badInput(error, res, json);
      }
      return true;
    }

    if (noteRoute && req.method === "DELETE") {
      try {
        const note = notepad().remove(scope, noteRoute[1]);
        json(res, note ? 200 : 404, note ? { deletedId: note.id } : { error: "Unknown note." });
      } catch (error) {
        badInput(error, res, json);
      }
      return true;
    }

    return false;
  };

  return { handle, hasOpenWindows: windows.hasOpenWindows, close: windows.close };
}
