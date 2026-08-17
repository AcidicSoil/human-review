import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const REVIEW_CSS = `
:root {
  color-scheme: dark;
  --hr-bg: #11161d;
  --hr-panel: #18202a;
  --hr-panel-2: #202a36;
  --hr-border: #344252;
  --hr-text: #eef3f8;
  --hr-muted: #a4b0be;
  --hr-accent: #8db7ff;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--hr-bg); color: var(--hr-text); }
body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at 20% -10%, #233248 0, transparent 38rem), #11161d; }
button, textarea, input, select { font: inherit; }
#hr-app { min-height: 100vh; }
.hr-shell { width: min(1380px, calc(100vw - 32px)); margin: 0 auto; padding: 24px 0 72px; }
body.hr-sidebar-mounted .hr-shell { padding-left: 258px; }
.hr-topbar { position: sticky; top: 12px; z-index: 40; display: flex; align-items: center; gap: 8px; margin-bottom: 18px; padding: 8px; border: 1px solid var(--hr-border); border-radius: 12px; background: rgba(24,32,42,.96); backdrop-filter: blur(12px); }
.hr-topbar .spacer, .hr-thread-head .spacer { flex: 1; }
.hr-title, .hr-status, .hr-section-name, .hr-thread-head { color: var(--hr-muted); font-size: 12px; }
.hr-btn { border: 1px solid var(--hr-border); border-radius: 8px; background: #202a36; color: var(--hr-text); padding: 7px 10px; cursor: pointer; }
.hr-btn:hover, .hr-btn:focus-visible { background: #283545; outline: none; }
.hr-btn[data-active="true"] { border-color: #5b7eab; background: #263d5b; }
.hr-sidebar { position: fixed; z-index: 35; top: 78px; left: max(16px, calc((100vw - 1380px) / 2)); width: 240px; max-height: calc(100vh - 96px); overflow: auto; border: 1px solid var(--hr-border); border-radius: 14px; background: rgba(24,32,42,.96); padding: 10px; backdrop-filter: blur(12px); }
.hr-sidebar-title { padding: 7px 9px 9px; color: var(--hr-muted); font-size: 11px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
.hr-nav { display: flex; flex-direction: column; gap: 3px; }
.hr-nav-btn { width: 100%; border: 0; border-radius: 8px; background: transparent; color: #c4ced9; padding: 8px 9px; cursor: pointer; text-align: left; line-height: 1.3; }
.hr-nav-btn:hover, .hr-nav-btn:focus-visible { background: #202a36; color: var(--hr-text); outline: none; }
.hr-nav-btn[data-active="true"] { background: #263d5b; color: #f3f7fc; }
.hr-sidebar-footer { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--hr-border); }
.hr-save-prd { width: 100%; }
.hr-editor { min-height: 70vh; outline: none; border: 1px solid var(--hr-border); border-radius: 16px; background: #151c25; padding: clamp(22px, 4vw, 54px); }
.hr-section { position: relative; margin: 0 0 18px; padding: 22px 24px; border: 1px solid var(--hr-border); border-radius: 12px; background: #1a232e; scroll-margin-top: 86px; }
.hr-section-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: -4px 0 14px; user-select: none; }
.hr-section-name { margin-right: auto; font-weight: 700; }
.hr-action { padding: 5px 8px; font-size: 12px; }
.hr-editor h1, .hr-editor h2, .hr-editor h3, .hr-editor h4, .hr-editor h5, .hr-editor h6 { color: #f4f7fb; }
.hr-editor p, .hr-editor li, .hr-editor blockquote { line-height: 1.65; }
.hr-editor a { color: var(--hr-accent); }
.hr-comment-mark { border-bottom: 2px solid #d1a34d; background: rgba(209,163,77,.16); }
.hr-discussion-wrap { position: relative; }
.hr-discussion-trigger { position: absolute; right: -10px; top: 18px; transform: translateX(100%); border: 1px solid var(--hr-border); border-radius: 8px; background: #202a36; color: var(--hr-text); padding: 5px 7px; cursor: pointer; }
.hr-thread { margin: 12px 0 0; border: 1px solid var(--hr-border); border-radius: 10px; background: #141b24; padding: 12px; }
.hr-thread-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.hr-comment-body { white-space: pre-wrap; line-height: 1.45; padding: 6px 0; }
.hr-comment-compose { display: flex; gap: 8px; margin-top: 10px; }
.hr-comment-compose textarea { flex: 1; min-height: 56px; resize: vertical; border: 1px solid var(--hr-border); border-radius: 8px; background: #10161e; color: var(--hr-text); padding: 8px 10px; }
.hr-fallback-content { outline: none; }
@media (max-width: 900px) {
  .hr-shell { width: min(100% - 18px, 1180px); }
  body.hr-sidebar-mounted .hr-shell { padding-left: 0; }
  .hr-sidebar { position: relative; top: auto; left: auto; width: min(100% - 18px, 1180px); max-height: none; margin: 12px auto 0; }
  .hr-nav { flex-direction: row; overflow-x: auto; padding-bottom: 2px; }
  .hr-nav-btn { width: auto; flex: 0 0 auto; white-space: nowrap; }
  .hr-sidebar-footer { display: flex; justify-content: flex-end; }
  .hr-save-prd { width: auto; }
  .hr-editor, .hr-section { padding: 18px; }
  .hr-discussion-trigger { position: static; transform: none; float: right; }
}
`;

const safeJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
const bodyHtml = (source) => String(source).match(/<body(?:\s[^>]*)?>([\s\S]*?)<\/body\s*>/i)?.[1] || String(source);
const titleFrom = (source, fallback) => (String(source).match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title\s*>/i)?.[1] || fallback).replace(/<[^>]+>/g, "").trim() || fallback;
const inlineScript = (source) => String(source || "").replace(/<\/script/gi, "<\\/script");

function basicMarkdown(source) {
  const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = String(source).split(/\r?\n/);
  let html = "";
  let paragraph = [];
  const flush = () => { if (paragraph.length) { html += `<p>${escape(paragraph.join(" "))}</p>\n`; paragraph = []; } };
  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { flush(); const level = heading[1].length; html += `<h${level}>${escape(heading[2])}</h${level}>\n`; continue; }
    if (!line.trim()) { flush(); continue; }
    paragraph.push(line.trim());
  }
  flush();
  return html;
}

async function renderSource(raw, ext) {
  if (ext !== ".md" && ext !== ".markdown") return raw;
  try {
    const { marked } = await import("marked");
    return marked.parse(raw);
  } catch {
    return basicMarkdown(raw);
  }
}

async function buildPlateBundle() {
  const prebuilt = path.join(here, "client.bundle.js");
  if (fs.existsSync(prebuilt) && fs.statSync(prebuilt).size > 1000) {
    return { bundle: fs.readFileSync(prebuilt, "utf8"), editor: "plate" };
  }
  try {
    const { build } = await import("esbuild");
    const result = await build({
      entryPoints: [path.join(here, "client.jsx")], bundle: true, format: "iife", platform: "browser",
      target: ["chrome120", "edge120", "firefox121", "safari17"], write: false, minify: true,
      jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
    });
    return { bundle: result.outputFiles[0].text, editor: "plate" };
  } catch {
    return { bundle: fs.readFileSync(path.join(here, "fallback-client.js"), "utf8"), editor: "embedded-dom" };
  }
}

export function createReviewHtml({ sourceHtml, title, sourcePath, artifactName, bundle, editor, tools = "" }) {
  const bootstrap = { version: 1, editor, sourceHtml: bodyHtml(sourceHtml), sourcePath, artifactName, document: null, discussions: [] };
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="human-review-editor" content="${editor}">\n<title>${String(title).replace(/[<&]/g, "")}</title>\n<style id="hr-review-theme">${REVIEW_CSS}</style>\n</head>\n<body>\n<div id="hr-app"></div>\n<script id="hr-bootstrap" type="application/json">${safeJson(bootstrap)}</script>\n<script id="hr-editor-bundle">${inlineScript(bundle)}</script>\n<script id="hr-artifact-tools">${inlineScript(tools)}</script>\n</body>\n</html>\n`;
}

export async function generateReviewArtifact(inputFile, outputFile) {
  const input = path.resolve(inputFile);
  if (!fs.existsSync(input)) throw new Error(`File not found: ${input}`);
  const raw = fs.readFileSync(input, "utf8");
  const ext = path.extname(input).toLowerCase();
  const rendered = await renderSource(raw, ext);
  const base = path.basename(input, ext).replace(/\.review$/i, "");
  const output = path.resolve(outputFile || path.join(path.dirname(input), `${base}.review.html`));
  const { bundle, editor } = await buildPlateBundle();
  const tools = fs.readFileSync(path.join(here, "artifact-tools.js"), "utf8");
  fs.writeFileSync(output, createReviewHtml({ sourceHtml: rendered, title: titleFrom(raw, base), sourcePath: input, artifactName: path.basename(output), bundle, editor, tools }));
  return { output, editor };
}

function openArtifact(file) {
  const detached = { detached: true, stdio: "ignore" };
  if (process.platform === "darwin") return spawn("open", [file], detached).unref();
  if (process.platform === "win32") return spawn("cmd", ["/c", "start", "", file], { ...detached, windowsHide: true }).unref();
  return spawn("xdg-open", [file], detached).unref();
}

export async function runCli(argv = process.argv.slice(2)) {
  const noOpen = argv.includes("--no-open");
  const clean = argv.filter((arg) => arg !== "--no-open");
  if (!clean[0] || clean.includes("--help") || clean.includes("-h")) {
    console.log("Usage: human-review-plan <plan.md|plan.html> [output.review.html] [--no-open]");
    return clean[0] ? 0 : 1;
  }
  const result = await generateReviewArtifact(clean[0], clean[1]);
  console.log(result.output);
  if (!noOpen) { try { openArtifact(result.output); } catch {} }
  return 0;
}
