import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hr-window-reuse-"));
process.env.HUMAN_REVIEW_STATE_DIR = path.join(directory, "state");
process.on("exit", () => fs.rmSync(directory, { recursive: true, force: true }));
const { start } = await import("../src/server.js");

function request(server, route, method = "GET", token = server.token) {
  return new Promise((resolve,reject) => {
    const req = http.request({
      host:"127.0.0.1",port:server.port,method,path:route,
      headers:token?{"x-human-review-token":token}:{},
    },res=>{
      let raw="";
      res.setEncoding("utf8");
      res.on("data",text=>raw+=text);
      res.on("end",()=>resolve({status:res.statusCode,body:JSON.parse(raw)}));
    });
    req.on("error",reject);
    req.end();
  });
}

function observe(server, scope) {
  return new Promise((resolve,reject) => {
    const events = [];
    let buffer = "";
    const req = http.request({
      host:"127.0.0.1",port:server.port,
      path:"/api/notepad/window/connect?scope="+encodeURIComponent(scope),
      headers:{"x-human-review-token":server.token},
    }, res => {
      res.setEncoding("utf8");
      res.on("data",chunk=>{
        buffer += chunk;
        let index;
        while ((index=buffer.indexOf("\n")) !== -1) {
          const line=buffer.slice(0,index).trim();
          buffer=buffer.slice(index+1);
          if(!line) continue;
          events.push(JSON.parse(line));
          if(events.length === 1) resolve({req,res,events});
        }
      });
    });
    req.on("error",reject);
    req.end();
  });
}

async function waitFor(predicate) {
  for(let i=0;i<30;i++) {
    if(predicate())return;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.fail("Expected window event did not arrive");
}

function cli(...args) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,["src/cli.js","notes",...args],{
      cwd:root,
      env:{...process.env,PATH:directory+"/bin:"+process.env.PATH,
        BROWSER:directory+"/bin/browser-stub", OPEN_LOG:directory+"/open.log"},
    });
    let output="", errors="";
    child.stdout.on("data",chunk=>output+=chunk);
    child.stderr.on("data",chunk=>errors+=chunk);
    child.on("error",reject);
    child.on("close",status=>resolve({status,output,errors}));
  });
}

test("open distinguishes new, already opening, active, and closed windows per scope", async t=>{
  const server=await start(0);
  t.after(()=>server.dispose());
  const endpoint="/api/notepad/window/activate?scope=";
  assert.equal((await request(server,endpoint+"one","POST","")).status,401);
  assert.equal((await request(server,"/api/notepad/window/connect?scope=one","GET","")).status,401);
  assert.deepEqual((await request(server,endpoint+"one","POST")).body,{action:"launch"});
  assert.deepEqual((await request(server,endpoint+"one","POST")).body,{action:"opening"});
  assert.deepEqual((await request(server,endpoint+"two","POST")).body,{action:"launch"});
  const listener=await observe(server,"one");
  t.after(()=>listener.req.destroy());
  assert.equal(listener.events[0].event,"ready");
  assert.deepEqual((await request(server,endpoint+"one","POST")).body,{action:"reused"});
  await waitFor(()=>listener.events.some(item=>item.event==="focus"));
  assert.deepEqual((await request(server,endpoint+"two","POST")).body,{action:"opening"});
  listener.req.destroy();
  await new Promise(resolve=>setTimeout(resolve,80));
  assert.deepEqual((await request(server,endpoint+"one","POST")).body,{action:"launch"});
});

test("notes open launches only once per scope and reuses an active window", async t=>{
  const server=await start(0);
  t.after(()=>server.dispose());
  const bin=path.join(directory,"bin");
  fs.mkdirSync(bin,{recursive:true});
  const opener=path.join(bin,"browser-stub");
  fs.writeFileSync(opener,'#!/bin/sh\nprintf "open\\n" >> "$OPEN_LOG"\n');
  fs.chmodSync(opener,0o755);
  const scope=path.join(directory,"workspace-one");
  const first=await cli("open","--scope",scope);
  assert.equal(first.status,0,first.errors);
  const second=await cli("open","--scope",scope);
  assert.equal(second.status,0,second.errors);
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(fs.readFileSync(directory+"/open.log","utf8").trim().split("\n").length,1);
  const listener=await observe(server,scope);
  t.after(()=>listener.req.destroy());
  const third=await cli("open","--scope",scope);
  assert.equal(third.status,0,third.errors);
  assert.match(third.output,/reus/i);
  await waitFor(()=>listener.events.some(event=>event.event==="focus"));
  assert.equal(fs.readFileSync(directory+"/open.log","utf8").trim().split("\n").length,1);
  const different=await cli("open","--scope",path.join(directory,"workspace-two"));
  assert.equal(different.status,0,different.errors);
  await new Promise(resolve=>setTimeout(resolve,80));
  assert.equal(fs.readFileSync(directory+"/open.log","utf8").trim().split("\n").length,2);
});

test("two agents opening the same workspace simultaneously launch one browser", async t => {
  const server = await start(0);
  t.after(() => server.dispose());
  const scope = path.join(directory, "workspace-race");
  fs.writeFileSync(directory + "/open.log", "");
  const results = await Promise.all([cli("open", "--scope", scope), cli("open", "--scope", scope)]);
  for (const result of results) assert.equal(result.status, 0, result.errors);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(fs.readFileSync(directory + "/open.log", "utf8").trim().split("\n").length, 1);
});

test("stalled browser launches can be retried after the reservation expires", async () => {
  const { createNotepadWindowRegistry } = await import("../src/notepad/windows.js");
  let now = 100;
  const windows = createNotepadWindowRegistry({ now: () => now, launchGraceMs: 10 });
  assert.deepEqual(windows.activate("scope"), { action: "launch" });
  assert.deepEqual(windows.activate("scope"), { action: "opening" });
  now = 111;
  assert.deepEqual(windows.activate("scope"), { action: "launch" });
  windows.close();
});
