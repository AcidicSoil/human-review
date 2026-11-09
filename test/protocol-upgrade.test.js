import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SERVER_PROTOCOL } from "../src/paths.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const oldServer = [
  'const fs=require("node:fs");',
  'const http=require("node:http");',
  'const path=require("node:path");',
  'const home=process.env.HUMAN_REVIEW_STATE_DIR;',
  'fs.mkdirSync(home,{recursive:true});',
  'const lock=path.join(home,"server.lock");',
  'fs.writeFileSync(lock,String(process.pid),{flag:"wx"});',
  'const app=http.createServer((req,res)=>{',
  'res.setHeader("Content-Type","application/json");',
  'res.end(JSON.stringify({ok:true,pid:process.pid,protocol:13}));',
  '});',
  'app.listen(0,"127.0.0.1",()=>{',
  'fs.writeFileSync(path.join(home,"server.json"),JSON.stringify({pid:process.pid,port:app.address().port,protocol:13,token:"old"}));',
  '});',
  'process.on("exit",()=>{try{if(fs.readFileSync(lock,"utf8")===String(process.pid))fs.unlinkSync(lock)}catch{}});',
  'process.on("SIGTERM",()=>app.close(()=>process.exit(0)));',
].join("\n");

async function awaitRecord(file, predicate) {
  for (let i=0;i<150;i++) {
    try {
      const info=JSON.parse(fs.readFileSync(file,"utf8"));
      if(predicate(info)) return info;
    } catch {}
    await new Promise(resolve=>setTimeout(resolve,40));
  }
  throw new Error("Updated server record never arrived");
}

function cli(cwd, env) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,["src/cli.js","notes","list"],{cwd,env});
    let stdout="",stderr="";
    child.stdout.on("data",chunk=>stdout+=chunk);
    child.stderr.on("data",chunk=>stderr+=chunk);
    child.on("error",reject);
    child.on("exit",code=>resolve({code,stdout,stderr}));
  });
}

test("the new CLI replaces a verified older protocol server without lock deadlock", async t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"hr-protocol-upgrade-"));
  const stateDir=path.join(directory,"state");
  const env={...process.env,HUMAN_REVIEW_STATE_DIR:stateDir};
  const record=path.join(stateDir,"server.json");
  const outdated=spawn(process.execPath,["-e",oldServer],{env,stdio:"ignore"});
  let replacement;
  t.after(async()=>{
    if(outdated.exitCode===null && outdated.signalCode===null) outdated.kill("SIGTERM");
    if(replacement?.pid) try { process.kill(replacement.pid,"SIGTERM"); } catch {}
    await new Promise(resolve=>setTimeout(resolve,200));
    fs.rmSync(directory,{recursive:true,force:true});
  });
  const previous=await awaitRecord(record,value=>value.protocol===13);
  assert.equal(previous.pid,outdated.pid);
  const result=await cli(root,env);
  assert.equal(result.code,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),[]);
  replacement=await awaitRecord(record,value=>value.protocol===SERVER_PROTOCOL);
  assert.notEqual(replacement.pid,outdated.pid);
  assert.equal(replacement.protocol,SERVER_PROTOCOL);
});

test("two CLIs replacing an older server converge on one replacement", async t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"hr-protocol-race-"));
  const stateDir=path.join(directory,"state");
  const env={...process.env,HUMAN_REVIEW_STATE_DIR:stateDir};
  const record=path.join(stateDir,"server.json");
  const outdated=spawn(process.execPath,["-e",oldServer],{env,stdio:"ignore"});
  let replacement;
  t.after(async()=>{
    if(outdated.exitCode===null && outdated.signalCode===null) outdated.kill("SIGTERM");
    if(replacement?.pid) try {process.kill(replacement.pid,"SIGTERM");}catch{}
    await new Promise(resolve=>setTimeout(resolve,200));
    fs.rmSync(directory,{recursive:true,force:true});
  });
  await awaitRecord(record,value=>value.protocol===13);
  const results=await Promise.all([cli(root,env),cli(root,env)]);
  for(const result of results){
    assert.equal(result.code,0,result.stderr);
    assert.deepEqual(JSON.parse(result.stdout),[]);
  }
  replacement=await awaitRecord(record,value=>value.protocol===SERVER_PROTOCOL);
  assert.notEqual(replacement.pid,outdated.pid);
});
