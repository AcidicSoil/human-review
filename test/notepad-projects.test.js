import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { JSDOM } from "jsdom";

const root = path.resolve(import.meta.dirname, "..");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-projects-"));
process.env.HUMAN_REVIEW_STATE_DIR = path.join(directory, "state");
process.on("exit", () => fs.rmSync(directory, { recursive: true, force: true }));
const { NotepadStore } = await import("../src/notepad/store.js");
const { start } = await import("../src/server.js");

function request(server, method, route, body, authenticated = true) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1", port: server.port, method, path: route,
      headers: {
        ...(authenticated ? { "x-human-review-token": server.token } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
    }, res => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test("lists only persisted notebooks and deletes only the selected scope", () => {
  const store = new NotepadStore();
  const first = store.add("/project/first", "Keep", "user");
  const second = store.add("/project/second", "Delete", "agent");
  const handoff = store.send("/project/second", [second.id]);
  store.add("/project/third", "Transient", "user");
  store.remove("/project/third", store.list("/project/third")[0].id);
  store.list("/project/not-created");

  assert.deepEqual(store.listScopes(), ["/project/first", "/project/second", "/project/third"]);
  assert.deepEqual(store.deleteScope("/project/third"), {
    scope: "/project/third", notesDeleted: 0, handoffsDeleted: 0,
  });
  assert.deepEqual(store.deleteScope("/project/second"), {
    scope: "/project/second", notesDeleted: 1, handoffsDeleted: 1,
  });
  assert.equal(store.deleteScope("/project/second"), null);
  assert.deepEqual(new NotepadStore().listScopes(), ["/project/first"]);
  assert.deepEqual(new NotepadStore().list("/project/first").map(note => note.id), [first.id]);
  assert.deepEqual(new NotepadStore().outbox("/project/second"), []);
  assert.equal(handoff.status, "pending");
});

test("legacy notebook files migrate without creating phantom notebooks", () => {
  const previousDir = process.env.HUMAN_REVIEW_STATE_DIR;
  const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-legacy-notes-"));
  try {
    process.env.HUMAN_REVIEW_STATE_DIR = legacyDir;
    const note = {
      id: "legacy-note", text: "Keep", author: "user", status: "pending",
      createdAt: "2026-11-11T00:00:00Z", updatedAt: "2026-11-11T00:00:00Z",
    };
    fs.writeFileSync(path.join(legacyDir, "notepad.json"), JSON.stringify({
      version: 1, scopes: { "/legacy/active": [note], "/legacy/empty": [] },
      handoffs: { "/legacy/destination": [{ id: "archived", status: "acknowledged", notes: [] }] },
    }));
    const store = new NotepadStore();
    assert.deepEqual(store.listScopes(), ["/legacy/active", "/legacy/destination", "/legacy/empty"]);
    store.move("/legacy/active", "/legacy/destination", [note.id]);
    assert.deepEqual(new NotepadStore().listScopes(), ["/legacy/active", "/legacy/destination", "/legacy/empty"]);
  } finally {
    process.env.HUMAN_REVIEW_STATE_DIR = previousDir;
    fs.rmSync(legacyDir, { recursive: true, force: true });
  }
});

test("project notebook API requires authentication and does not touch other notes", async t => {
  const server = await start(0);
  t.after(() => server.dispose());
  const base = "/api/notepad";
  const first = "/project/api-first";
  const second = "/project/api-second";
  await request(server, "POST", base + "?scope=" + encodeURIComponent(first), { text: "Preserve" });
  const created = await request(server, "POST", base + "?scope=" + encodeURIComponent(second), { text: "Remove" });
  await request(server, "POST", base + "/send?scope=" + encodeURIComponent(second), { noteIds: [created.body.note.id] });

  assert.equal((await request(server, "GET", base + "/scopes", null, false)).status, 401);
  const scopes = await request(server, "GET", base + "/scopes");
  assert.equal(scopes.status, 200);
  assert.ok(scopes.body.scopes.includes(first));
  assert.ok(scopes.body.scopes.includes(second));
  const route = base + "/scope?scope=" + encodeURIComponent(second);
  assert.equal((await request(server, "DELETE", route, null, false)).status, 401);
  assert.equal((await request(server, "DELETE", base + "/scope")).status, 400);
  const deleted = await request(server, "DELETE", route);
  assert.deepEqual(deleted.body, { scope: second, notesDeleted: 1, handoffsDeleted: 1 });
  assert.equal((await request(server, "DELETE", route)).status, 404);
  assert.equal((await request(server, "GET", base + "?scope=" + encodeURIComponent(second))).body.notes.length, 0);
  assert.equal((await request(server, "GET", base + "?scope=" + encodeURIComponent(first))).body.notes.length, 1);
  assert.ok(!(await request(server, "GET", base + "/scopes")).body.scopes.includes(second));
});

test("deleting a notebook releases a waiting agent without deleting other work", async t => {
  const server = await start(0);
  t.after(() => server.dispose());
  const scope = "/project/with-poll";
  await request(server, "POST", "/api/notepad?scope=" + encodeURIComponent(scope), { text: "Pending" });
  const polling = request(server, "GET", "/api/notepad/poll?scope=" + encodeURIComponent(scope) + "&timeout=5000");
  await new Promise(resolve => setTimeout(resolve, 40));
  const removed = await request(server, "DELETE", "/api/notepad/scope?scope=" + encodeURIComponent(scope));
  assert.equal(removed.status, 200);
  assert.deepEqual((await polling).body, { status: "deleted" });
});

test("HUD switches notebooks in place and confirms whole-project deletion", async () => {
  const markup = fs.readFileSync(path.join(root, "src/notepad/index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "src/notepad/client.js"), "utf8");
  const first = "/projects/alpha";
  const second = "/work/alpha";
  const third = "/projects/gamma";
  const scopes = [first, second, third];
  const notes = new Map(scopes.map((scope, index) => [scope, [{
    id: "note-" + index, text: "Note " + index, author: "user",
    status: "pending", createdAt: "2026-11-11T00:00:00Z",
  }]]));
  const calls = [];
  const dom = new JSDOM(markup.replace("__TOKEN__", "test-token"), {
    url: "http://localhost/notepad/preview?scope=" + encodeURIComponent(first),
    runScripts: "outside-only",
  });
  const { window } = dom;
  const flush = async () => {
    for (let i = 0; i < 7; i++) await new Promise(resolve => setImmediate(resolve));
  };
  try {
    window.setInterval = () => 0;
    window.fetch = async (url, init = {}) => {
      const method = init.method || "GET";
      const parsed = new URL(url, window.location.href);
      calls.push({ method, pathname: parsed.pathname, scope: parsed.searchParams.get("scope") });
      const response = body => ({ ok: true, status: 200, json: async () => body });
      if (parsed.pathname === "/api/notepad/scopes" && method === "GET") return response({ scopes: [...scopes] });
      if (parsed.pathname === "/api/notepad" && method === "GET") return response({
        notes: [...(notes.get(parsed.searchParams.get("scope")) || [])], handoffs: [],
      });
      if (parsed.pathname === "/api/notepad/scope" && method === "DELETE") {
        const scope = parsed.searchParams.get("scope");
        scopes.splice(scopes.indexOf(scope), 1);
        const count = notes.get(scope)?.length || 0;
        notes.delete(scope);
        return response({ scope, notesDeleted: count, handoffsDeleted: 0 });
      }
      throw new Error("Unexpected request " + method + " " + parsed.pathname);
    };
    window.eval(script);
    await flush();
    const doc = window.document;
    const picker = doc.getElementById("project-notebooks");
    assert.equal(picker.options.length, 3);
    assert.equal(picker.value, first);
    assert.equal(doc.querySelector("#notes .note-text").textContent, "Note 0");
    assert.notEqual(picker.options[0].textContent, picker.options[1].textContent, "same basename scopes must disambiguate");

    doc.getElementById("note-text").value = "Unsent draft";
    picker.value = second;
    picker.dispatchEvent(new window.Event("change", { bubbles: true }));
    await flush();
    assert.equal(new URL(window.location.href).searchParams.get("scope"), second);
    assert.equal(doc.querySelector("#notes .note-text").textContent, "Note 1");
    assert.equal(doc.getElementById("note-text").value, "");

    picker.value = first;
    picker.dispatchEvent(new window.Event("change", { bubbles: true }));
    await flush();
    assert.equal(doc.getElementById("note-text").value, "Unsent draft");
    picker.value = second;
    picker.dispatchEvent(new window.Event("change", { bubbles: true }));
    await flush();

    doc.getElementById("delete-notebook").click();
    assert.equal(doc.getElementById("notebook-delete-confirm").hidden, false);
    assert.equal(calls.some(call => call.method === "DELETE"), false);
    doc.getElementById("cancel-delete-notebook").click();
    assert.equal(calls.some(call => call.method === "DELETE"), false);

    doc.getElementById("delete-notebook").click();
    doc.getElementById("confirm-delete-notebook").click();
    await flush();
    assert.deepEqual(scopes, [first, third]);
    assert.equal(notes.has(first), true);
    assert.equal(new URL(window.location.href).searchParams.get("scope"), first);
    assert.equal(picker.options.length, 2);
    assert.equal(doc.querySelector("#notes .note-text").textContent, "Note 0");
  } finally {
    window.close();
  }
});

test("HUD receives focus and switches to the requested project without opening a tab", async () => {
  const first="/project/window-first";
  const second="/project/window-second";
  const markup=fs.readFileSync(path.join(root,"src/notepad/index.html"),"utf8");
  const script=fs.readFileSync(path.join(root,"src/notepad/client.js"),"utf8");
  const dom=new JSDOM(markup.replace("__TOKEN__","test-token"), {
    url:"http://localhost/notepad/preview?scope="+encodeURIComponent(first),
    runScripts:"outside-only",
  });
  const {window}=dom;
  const streams=[];
  let focused=0;
  const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
  try {
    window.setInterval=()=>0;
    window.ReadableStream=class {};
    window.TextDecoder=TextDecoder;
    window.focus=()=>{focused++;};
    window.fetch=async url=>{
      const parsed=new URL(url,window.location.href);
      if(parsed.pathname==="/api/notepad/window/connect"){
        const feed={scope:parsed.searchParams.get("scope")};
        streams.push(feed);
        return {ok:true,body:{getReader:()=>({
          read:()=>new Promise(resolve=>{
            feed.send=event=>resolve({value:new TextEncoder().encode(JSON.stringify(event)+"\n"),done:false});
          }),
        })}};
      }
      const body=parsed.pathname==="/api/notepad/scopes"
        ?{scopes:[first,second]}
        :{notes:[{id:"note-"+parsed.searchParams.get("scope"),text:parsed.searchParams.get("scope"),
          status:"pending",author:"user",createdAt:"2026-11-11T00:00:00Z"}],handoffs:[]};
      return {ok:true,json:async()=>body};
    };
    window.eval(script);
    await flush();
    assert.equal(streams[0]?.scope,first);
    streams[0].send({event:"focus",scope:second});
    await flush();
    assert.equal(new URL(window.location.href).searchParams.get("scope"),second);
    assert.equal(window.document.querySelector("#notes .note-text").textContent,second);
    assert.ok(streams.some(stream=>stream.scope===second),"HUD re-registers new scope");
    assert.equal(focused,1);
  }finally{
    window.close();
  }
});
