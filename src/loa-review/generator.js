import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LOA_CLIENT_SOURCE } from "./runtime.js";
import { discoverCodexCatalog } from "./catalog.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export const LOA_REVIEW_CSS = `
:root {
  color-scheme: dark;
  --hr-loa-bg: #11161d;
  --hr-loa-panel: #18202a;
  --hr-loa-panel-2: #202a36;
  --hr-loa-border: #344252;
  --hr-loa-text: #eef3f8;
  --hr-loa-muted: #a4b0be;
  --hr-loa-accent: #8db7ff;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--hr-loa-bg); color: var(--hr-loa-text); }
body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
button { font: inherit; }
#hr-loa-app { min-height: 100vh; }
.hr-loa-shell { width: min(1380px, calc(100vw - 32px)); margin: 0 auto; padding: 24px 0 72px; }
.hr-loa-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 18px; }
.hr-loa-title { margin: 0; font-size: 20px; }
.hr-loa-status { color: var(--hr-loa-muted); font-size: 12px; }
.hr-loa-layout { display: grid; grid-template-columns: minmax(220px, 280px) minmax(0, 1fr); gap: 18px; align-items: start; }
.hr-loa-rail, .hr-loa-actions { border: 1px solid var(--hr-loa-border); border-radius: 14px; background: var(--hr-loa-panel); }
.hr-loa-rail { padding: 14px; }
.hr-loa-rail h2, .hr-loa-actions h2 { margin: 0 0 12px; font-size: 12px; color: var(--hr-loa-muted); letter-spacing: .08em; text-transform: uppercase; }
.hr-loa-category + .hr-loa-category { margin-top: 16px; }
.hr-loa-category-name { margin: 0 0 7px; color: var(--hr-loa-muted); font-size: 12px; }
.hr-loa-plugin { margin: 0; padding: 8px; border-radius: 8px; background: var(--hr-loa-panel-2); font-size: 13px; }
.hr-loa-plugin + .hr-loa-plugin { margin-top: 7px; }
.hr-loa-plugin-name { display: block; font-weight: 700; }
.hr-loa-skills { margin: 6px 0 0; padding-left: 18px; color: var(--hr-loa-muted); font-size: 12px; }
.hr-loa-actions { padding: 18px; }
.hr-loa-action { padding: 14px; border: 1px solid var(--hr-loa-border); border-radius: 10px; background: #1a232e; }
.hr-loa-action + .hr-loa-action { margin-top: 10px; }
  .hr-loa-action[aria-selected="true"] { border-color: var(--hr-loa-accent); box-shadow: 0 0 0 1px var(--hr-loa-accent); } .hr-loa-action:focus-visible { outline: 2px solid var(--hr-loa-accent); outline-offset: 2px; } .hr-loa-action.is-drop-target { border-style: dashed; border-color: var(--hr-loa-accent); } .hr-loa-action.is-drop-before { box-shadow: inset 0 3px var(--hr-loa-accent); } .hr-loa-action.is-drop-after { box-shadow: inset 0 -3px var(--hr-loa-accent); } .hr-loa-action-head, .hr-loa-actions-title, .hr-loa-toolbar { display: flex; align-items: center; gap: 8px; } .hr-loa-actions-title { justify-content: space-between; } .hr-loa-action-controls, .hr-loa-edit-actions { display: flex; gap: 5px; margin-left: auto; } .hr-loa-toolbar { margin-bottom: 12px; padding: 8px 10px; border: 1px solid var(--hr-loa-border); border-radius: 10px; background: var(--hr-loa-panel); } .hr-loa-spacer { flex: 1; } button { border: 1px solid var(--hr-loa-border); border-radius: 7px; background: var(--hr-loa-panel-2); color: var(--hr-loa-text); padding: 5px 8px; cursor: pointer; } button:hover, button:focus-visible { border-color: var(--hr-loa-accent); outline: 2px solid transparent; } button:disabled { cursor: not-allowed; opacity: .45; } .hr-loa-component { display: grid; grid-template-columns: 1fr auto; width: 100%; border: 0; background: transparent; padding: 5px; text-align: left; } .hr-loa-component small { grid-column: 1; color: var(--hr-loa-muted); font-size: 10px; } .hr-loa-component b { grid-column: 2; grid-row: 1 / span 2; align-self: center; color: var(--hr-loa-accent); } .hr-loa-search, .hr-loa-edit { width: 100%; border: 1px solid var(--hr-loa-border); border-radius: 7px; background: #10161e; color: var(--hr-loa-text); padding: 8px; } .hr-loa-search { margin-bottom: 10px; } .hr-loa-edit { min-height: 90px; margin-top: 5px; resize: vertical; } .hr-loa-edit-label { display: block; margin-top: 8px; color: var(--hr-loa-muted); font-size: 12px; } .hr-loa-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); } .hr-loa-snap-in { display: flex; align-items: center; gap: 6px; } .hr-loa-snap-in span { flex: 1; } .hr-loa-snap-in button { border: 0; background: transparent; padding: 0 2px; } .hr-loa-snap-in.is-unavailable { border-color: #9d6b6b; color: #e0a9a9; }
.hr-loa-action-id { color: var(--hr-loa-muted); font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.hr-loa-action-content { margin: 8px 0 0; white-space: pre-wrap; line-height: 1.5; }
.hr-loa-snap-ins { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; padding: 0; list-style: none; }
.hr-loa-snap-in { border: 1px solid var(--hr-loa-border); border-radius: 999px; padding: 3px 8px; color: var(--hr-loa-muted); font-size: 11px; }
@media (max-width: 760px) {
  .hr-loa-shell { width: min(100% - 18px, 1180px); }
  .hr-loa-layout { grid-template-columns: 1fr; }
  .hr-loa-toolbar { flex-wrap: wrap; }
}
`;

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

function requireString(value, location) {
  if (typeof value !== "string") throw new TypeError(`${location} must be a string.`);
  if (!isNonEmptyString(value)) throw new TypeError(`${location} must not be empty.`);
  return value;
}

function normalizeSnapIn(value, location) {
  if (!isRecord(value)) throw new TypeError(`${location} must be an object.`);
  const kind = requireString(value.kind, `${location}.kind`);
  if (kind !== "plugin" && kind !== "skill") throw new TypeError(`${location}.kind must be plugin or skill.`);
  const normalized = { ...value, kind, ref: requireString(value.ref, `${location}.ref`) };
  if (value.pluginRef !== undefined) normalized.pluginRef = requireString(value.pluginRef, `${location}.pluginRef`);
  if (value.displayName !== undefined) normalized.displayName = requireString(value.displayName, `${location}.displayName`);
  return normalized;
}

function snapInRef(value) {
  return value.ref;
}

function validateCatalog(catalog) {
  if (!Array.isArray(catalog)) throw new TypeError("catalog must be an array.");
  return catalog.map((category, categoryIndex) => {
    const categoryPath = `catalog[${categoryIndex}]`;
    if (!isRecord(category)) throw new TypeError(`${categoryPath} must be an object.`);
    requireString(category.category, `${categoryPath}.category`);
    if (!Array.isArray(category.plugins)) throw new TypeError(`${categoryPath}.plugins must be an array.`);

    const plugins = category.plugins.map((plugin, pluginIndex) => {
      const pluginPath = `${categoryPath}.plugins[${pluginIndex}]`;
      if (!isRecord(plugin)) throw new TypeError(`${pluginPath} must be an object.`);
      requireString(plugin.ref, `${pluginPath}.ref`);
      requireString(plugin.displayName, `${pluginPath}.displayName`);
      if (!Array.isArray(plugin.skills)) throw new TypeError(`${pluginPath}.skills must be an array.`);
      const skills = plugin.skills.map((skill, skillIndex) => {
        const skillPath = `${pluginPath}.skills[${skillIndex}]`;
        if (!isRecord(skill)) throw new TypeError(`${skillPath} must be an object.`);
        requireString(skill.ref, `${skillPath}.ref`);
        requireString(skill.displayName, `${skillPath}.displayName`);
        return { ...skill };
      });
      return { ...plugin, skills };
    });
    return { ...category, plugins };
  });
}

export function validateLoaInput(input) {
  if (!isRecord(input)) throw new TypeError("LOA input must be an object.");
  if (!isRecord(input.loa)) throw new TypeError("loa must be an object.");
  if (!Array.isArray(input.loa.actions)) throw new TypeError("loa.actions must be an array.");

  const actionIds = new Set();
  const actions = input.loa.actions.map((action, actionIndex) => {
    const actionPath = `loa.actions[${actionIndex}]`;
    if (!isRecord(action)) throw new TypeError(`${actionPath} must be an object.`);
    const id = requireString(action.id, `${actionPath}.id`);
    if (actionIds.has(id)) throw new TypeError(`Duplicate action ID: ${id}.`);
    actionIds.add(id);
    if (typeof action.content !== "string") throw new TypeError(`${actionPath}.content must be a string.`);
    if (!Array.isArray(action.snapIns)) throw new TypeError(`${actionPath}.snapIns must be an array.`);

    const snapIns = [];
    const snapInRefs = new Set();
    for (const [snapInIndex, value] of action.snapIns.entries()) {
      const refPath = `${actionPath}.snapIns[${snapInIndex}]`;
      const snapIn = normalizeSnapIn(value, refPath);
      const ref = snapInRef(snapIn);
      if (snapInRefs.has(ref)) throw new TypeError(`Duplicate snap-in ref on action ${id}: ${ref}.`);
      snapInRefs.add(ref);
      snapIns.push(snapIn);
    }
    return { ...action, id, snapIns };
  });

  return {
    ...input,
    loa: { ...input.loa, actions },
    catalog: validateCatalog(input.catalog),
  };
}

const escapeHtml = (value) => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const safeJson = (value) => JSON.stringify(value)
  .replace(/</g, "\\u003c")
  .replace(/>/g, "\\u003e")
  .replace(/&/g, "\\u0026")
  .replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
  .replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
const inlineScript = (source) => String(source || "").replace(/<\/script/gi, "<\\/script");

function renderCatalog(catalog) {
  return catalog.map((category) => `
    <section class="hr-loa-category">
      <h3 class="hr-loa-category-name">${escapeHtml(category.category)}</h3>
      ${category.plugins.map((plugin) => `
        <article class="hr-loa-plugin" data-ref="${escapeHtml(plugin.ref)}" draggable="true">
          <span class="hr-loa-plugin-name">${escapeHtml(plugin.displayName)}</span>
          ${plugin.skills.length ? `<ul class="hr-loa-skills">${plugin.skills.map((skill) => `<li data-ref="${escapeHtml(skill.ref)}" draggable="true">${escapeHtml(skill.displayName)}</li>`).join("")}</ul>` : ""}
        </article>
      `).join("")}
    </section>
  `).join("");
}

function renderActions(actions, catalog) {
  const refs = new Set(catalog.flatMap((category) => category.plugins.flatMap((plugin) => [plugin.ref, ...plugin.skills.map((skill) => skill.ref)])));
  return actions.map((action) => `
    <article class="hr-loa-action" data-action-id="${escapeHtml(action.id)}" draggable="true">
      <div class="hr-loa-action-id">${escapeHtml(action.id)}</div>
      <div class="hr-loa-action-content">${escapeHtml(action.content)}</div>
      ${action.snapIns.length ? `<ul class="hr-loa-snap-ins">${action.snapIns.map((snapIn) => {
        const ref = snapInRef(snapIn);
        const label = isRecord(snapIn) && isNonEmptyString(snapIn.displayName) ? snapIn.displayName : ref;
        return `<li class="hr-loa-snap-in${refs.has(ref) ? "" : " is-unavailable"}" data-ref="${escapeHtml(ref)}">${escapeHtml(label)}${refs.has(ref) ? "" : " · unavailable"}</li>`;
      }).join("")}</ul>` : ""}
    </article>
  `).join("");
}

function titleFrom(loa, artifactName) {
  return isNonEmptyString(loa.title) ? loa.title : `${artifactName || "LOA"} review`;
}

export function createLoaReviewHtml({ loa, catalog, sourcePath, artifactName } = {}) {
  const input = validateLoaInput({ loa, catalog });
  const name = artifactName || "loa.review.html";
  const bootstrap = {
    version: 1,
    loa: input.loa,
    catalog: input.catalog,
    sourcePath,
    artifactName: name,
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="human-review-editor" content="loa">
<title>${escapeHtml(titleFrom(input.loa, name))}</title>
<style id="hr-loa-theme">${LOA_REVIEW_CSS}</style>
</head>
<body>
<div id="hr-loa-app">
  <div class="hr-loa-shell">
    <header class="hr-loa-header">
      <h1 class="hr-loa-title">${escapeHtml(titleFrom(input.loa, name))}</h1>
      <span class="hr-loa-status">LOA review</span>
    </header>
    <div class="hr-loa-layout">
      <aside id="hr-loa-rail" class="hr-loa-rail">
        <h2>Components</h2>
        ${renderCatalog(input.catalog)}
      </aside>
      <main id="hr-loa-actions" class="hr-loa-actions">
        <h2>List of actions</h2>
        ${renderActions(input.loa.actions, input.catalog)}
      </main>
    </div>
  </div>
</div>
<script id="hr-loa-bootstrap" type="application/json">${safeJson(bootstrap)}</script>
<script id="hr-loa-client">${inlineScript(LOA_CLIENT_SOURCE)}</script>
</body>
</html>
`;
}

export async function generateLoaArtifact(inputFile, outputFile, { discoverCatalog = discoverCodexCatalog } = {}) {
  const input = path.resolve(inputFile);
  if (!fs.existsSync(input)) throw new Error(`File not found: ${input}`);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(input, "utf8"));
  } catch (error) {
    throw new Error(`Invalid LOA JSON in ${input}: ${error.message}`);
  }
  if (parsed.catalog === undefined) parsed = { ...parsed, catalog: discoverCatalog() };
  const validated = validateLoaInput(parsed);
  const base = path.basename(input, path.extname(input)).replace(/\.loa$/i, "");
  const output = path.resolve(outputFile || path.join(path.dirname(input), `${base}.loa.review.html`));
  fs.writeFileSync(output, createLoaReviewHtml({
    loa: validated.loa,
    catalog: validated.catalog,
    sourcePath: input,
    artifactName: path.basename(output),
  }));
  return { output };
}

export const generateLoaReviewArtifact = generateLoaArtifact;

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
    console.log("Usage: human-review-loa <input.json> [output.loa.review.html] [--no-open]");
    return clean[0] ? 0 : 1;
  }
  try {
    const result = await generateLoaArtifact(clean[0], clean[1]);
    console.log(result.output);
    if (!noOpen) {
      try { openArtifact(result.output); } catch {}
    }
    return 0;
  } catch (error) {
    console.error(error.message || error);
    return 1;
  }
}
