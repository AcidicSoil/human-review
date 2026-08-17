#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { marked } from "marked";

const here = path.dirname(fileURLToPath(import.meta.url));

export const DARK_REVIEW_CSS = `
:root {
  color-scheme: dark;
  --hr-bg: #090d12;
  --hr-panel: #0f1620;
  --hr-panel-2: #141d29;
  --hr-border: #263244;
  --hr-border-strong: #3a4a60;
  --hr-text: #e8edf4;
  --hr-muted: #8e9bad;
  --hr-accent: #79a8ff;
  --hr-accent-soft: rgba(121, 168, 255, .14);
  --hr-danger: #ff8b83;
  --hr-highlight: #d7a74a;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--hr-bg) !important; color: var(--hr-text) !important; }
body {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background:
    radial-gradient(circle at 15% -10%, rgba(69, 101, 143, .18), transparent 34rem),
    linear-gradient(180deg, #0b1017 0%, var(--hr-bg) 42rem) !important;
}
button, input, textarea, select { color-scheme: dark; font: inherit; }
button { color: var(--hr-text); }
::selection { background: rgba(121, 168, 255, .34); }
#hr-app { min-height: 100vh; }
.hr-shell { width: min(1180px, calc(100vw - 32px)); margin: 0 auto; padding: 24px 0 72px; }
.hr-topbar {
  position: sticky; top: 12px; z-index: 40; display: flex; align-items: center; gap: 8px;
  margin-bottom: 18px; padding: 8px; border: 1px solid var(--hr-border); border-radius: 12px;
  background: rgba(15, 22, 32, .94) !important; backdrop-filter: blur(14px); box-shadow: 0 16px 48px rgba(0,0,0,.24);
}
.hr-topbar .spacer { flex: 1; }
.hr-btn {
  border: 1px solid var(--hr-border); border-radius: 8px; background: #151e2a !important;
  padding: 7px 10px; cursor: pointer;
}
.hr-btn:hover, .hr-btn:focus-visible { border-color: var(--hr-border-strong); background: #1b2736 !important; outline: none; }
.hr-btn[data-active="true"] { border-color: #557bb2; background: #1c3150 !important; }
.hr-btn-danger[data-active="true"] { border-color: #8a4744; background: #3a2020 !important; color: #ffb0aa; }
.hr-title { color: var(--hr-muted); font-size: 13px; font-weight: 650; padding: 0 5px; }
.hr-editor {
  min-height: 70vh; outline: none; border: 1px solid var(--hr-border); border-radius: 16px;
  background: #0d141d !important; padding: clamp(22px, 4vw, 54px); box-shadow: 0 24px 70px rgba(0,0,0,.2);
}
.hr-section {
  position: relative; margin: 0 0 18px; padding: 22px 24px; border: 1px solid var(--hr-border);
  border-radius: 12px; background: #111923 !important;
}
.hr-section:focus-within { border-color: #3c5675; box-shadow: 0 0 0 1px rgba(121,168,255,.12); }
.hr-section-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: -4px 0 14px; user-select: none; }
.hr-section-name { margin-right: auto; color: var(--hr-muted); font-size: 12px; font-weight: 700; letter-spacing: .03em; }
.hr-action { padding: 5px 8px; font-size: 12px; }
.hr-editor h1, .hr-editor h2, .hr-editor h3, .hr-editor h4, .hr-editor h5, .hr-editor h6 { color: #f0f4fa; line-height: 1.22; margin: 1.1em 0 .45em; }
.hr-editor h1 { font-size: 2rem; } .hr-editor h2 { font-size: 1.55rem; } .hr-editor h3 { font-size: 1.25rem; }
.hr-editor p, .hr-editor li, .hr-editor blockquote { line-height: 1.68; }
.hr-editor p { margin: .55em 0; }
.hr-editor blockquote { border-left: 3px solid #526780; margin: 1em 0; padding: .1em 0 .1em 1em; color: #b8c3d1; }
.hr-editor a { color: #8db8ff; }
.hr-editor code { border: 1px solid #2b3748; border-radius: 5px; background: #0a1018 !important; padding: .1em .3em; }
.hr-editor ul, .hr-editor ol { padding-left: 1.6rem; }
.hr-comment-mark { border-bottom: 2px solid rgba(215,167,74,.8); background: rgba(215,167,74,.12) !important; border-radius: 2px; }
.hr-comment-mark[data-active="true"] { background: rgba(215,167,74,.25) !important; }
.hr-discussion-wrap { position: relative; }
.hr-discussion-trigger {
  position: absolute; right: -10px; top: 18px; transform: translateX(100%); min-width: 30px;
  border: 1px solid var(--hr-border); border-radius: 8px; background: #141d29 !important; padding: 5px 7px; cursor: pointer;
}
.hr-thread {
  margin: 14px 0 0; border: 1px solid #33435a; border-radius: 10px; background: #0c121a !important; padding: 12px;
}
.hr-thread-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: var(--hr-muted); font-size: 12px; }
.hr-thread-head .spacer { flex: 1; }
.hr-comment { border-left: 2px solid #34445a; padding: 5px 0 5px 10px; margin: 7px 0; }
.hr-comment-meta { color: var(--hr-muted); font-size: 11px; margin-bottom: 3px; }
.hr-comment-body { white-space: pre-wrap; line-height: 1.45; }
.hr-comment-compose { display: flex; gap: 8px; margin-top: 10px; }
.hr-comment-compose textarea {
  flex: 1; min-height: 54px; resize: vertical; border: 1px solid var(--hr-border); border-radius: 8px;
  background: #090f16 !important; color: var(--hr-text); padding: 8px 10px; outline: none;
}
.hr-comment-compose textarea:focus { border-color: #4c6d96; }
.hr-status { color: var(--hr-muted); font-size: 12px; }
.hr-empty { color: var(--hr-muted); padding: 44px 12px; text-align: center; }
@media (max-width: 900px) {
  .hr-discussion-trigger { position: static; transform: none; float: right; margin-left: 8px; }
  .hr-shell { width: min(100% - 18px, 1180px); }
  .hr-editor { padding: 18px; }
  .hr-section { padding: 18px; }
}
`;

function bodyHtml(source) {
  const match = String(source).match(/<body(?:\s[^>]*)?>([\s\S]*?)<\/body\s*>/i);
  return match ? match[1] : String(source);
}

function titleFrom(source, fallback) {
  const match = String(source).match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title\s*>/i);
  return (match ? match[1].replace(/<[^>]+>/g, "").trim() : "") || fallback;
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export async function bundlePlateReviewClient() {
  const result = await build({
    entryPoints: [path.join(here, "client.jsx")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120", "edge120", "firefox121", "safari17"],
    write: false,
    minify: true,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  return result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
}

export function createPlateReviewHtml({ sourceHtml, title, sourcePath, artifactName, bundle }) {
  const bootstrap = {
    version: 1,
    editor: "plate",
    sourceHtml: bodyHtml(sourceHtml),
    sourcePath,
    artifactName,
    document: null,
    discussions: [],
  };
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="human-review-editor" content="plate">
<title>${String(title).replace(/[<&]/g, "")}</title>
<style id="hr-dark-theme">${DARK_REVIEW_CSS}</style>
</head>
<body>
<div id="hr-app"></div>
<script id="hr-bootstrap" type="application/json">${safeJson(bootstrap)}</script>
<script id="hr-plate-bundle">${bundle}</script>
</body>
</html>
`;
}

export async function generatePlateReviewArtifact(inputFile, outputFile) {
  const input = path.resolve(inputFile);
  if (!fs.existsSync(input)) throw new Error(`File not found: ${input}`);
  const raw = fs.readFileSync(input, "utf8");
  const ext = path.extname(input).toLowerCase();
  const rendered = ext === ".md" || ext === ".markdown" ? marked.parse(raw) : raw;
  const base = path.basename(input, ext).replace(/\.review$/i, "");
  const output = path.resolve(outputFile || path.join(path.dirname(input), `${base}.review.html`));
  const bundle = await bundlePlateReviewClient();
  const html = createPlateReviewHtml({
    sourceHtml: rendered,
    title: titleFrom(raw, base),
    sourcePath: input,
    artifactName: path.basename(output),
    bundle,
  });
  fs.writeFileSync(output, html);
  return output;
}

function openArtifact(file) {
  const detached = { detached: true, stdio: "ignore" };
  if (process.platform === "darwin") return spawn("open", [file], detached).unref();
  if (process.platform === "win32") return spawn("cmd", ["/c", "start", "", file], { ...detached, windowsHide: true }).unref();
  return spawn("xdg-open", [file], detached).unref();
}

async function main() {
  const args = process.argv.slice(2);
  const noOpen = args.includes("--no-open");
  const clean = args.filter((arg) => arg !== "--no-open");
  if (!clean[0] || clean.includes("--help") || clean.includes("-h")) {
    console.log("Usage: human-review-plan <plan.md|plan.html> [output.review.html] [--no-open]");
    process.exitCode = clean[0] ? 0 : 1;
    return;
  }
  const output = await generatePlateReviewArtifact(clean[0], clean[1]);
  console.log(output);
  if (!noOpen) {
    try { openArtifact(output); } catch {}
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
