import fs from "node:fs";
import { NotepadStore } from "./store.js";

const template = new URL("./index.html", import.meta.url);

/** Keep notepad transport separate from review sessions and feedback batches. */
export function createNotepadRoute({ token, viewToken }) {
  // Loading a damaged notebook must not prevent ordinary reviews from starting.
  let store;
  const notepad = () => (store ||= new NotepadStore());
  const badInput = (error, res, json) => {
    if (!(error instanceof TypeError || error instanceof RangeError)) throw error;
    json(res, 400, { error: error.message });
  };

  return async ({ req, res, url, json, readBody }) => {
    const route = url.pathname;
    const scope = url.searchParams.get("scope");

    if (route === `/notepad/${viewToken}` && req.method === "GET") {
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

    if (route === "/api/notepad/open" && req.method === "GET") {
      try {
        notepad().list(scope);
        json(res, 200, { path: `/notepad/${viewToken}?scope=${encodeURIComponent(scope)}` });
      } catch (error) {
        badInput(error, res, json);
      }
      return true;
    }

    if (route === "/api/notepad" && req.method === "GET") {
      try { json(res, 200, { notes: notepad().list(scope) }); }
      catch (error) { badInput(error, res, json); }
      return true;
    }

    if (route === "/api/notepad" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const note = notepad().add(scope, body.text, body.author || "user");
        json(res, 201, { note });
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

    return false;
  };
}
