import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LOA_CLIENT_SOURCE } from "./runtime.js";
import { REVIEW_HOST_SOURCE } from "../review-host.js";
import { discoverCodexCatalog } from "./catalog.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export const LOA_REVIEW_CSS = `
:root {
  color-scheme: dark;
  --hr-loa-bg: #0d1118;
  --hr-loa-panel: #151b25;
  --hr-loa-panel-2: #1d2531;
  --hr-loa-border: #303b4c;
  --hr-loa-text: #edf2fb;
  --hr-loa-muted: #98a6b9;
  --hr-loa-accent: #84b4ff;
  --hr-loa-soft: rgba(132, 180, 255, 0.1);
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--hr-loa-bg); color: var(--hr-loa-text); }
body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
button, input, textarea { font: inherit; }
button { cursor: pointer; border: 1px solid var(--hr-loa-border); background: #252e3c; color: var(--hr-loa-text); padding: 8px 12px; border-radius: 8px; font-size: 12px; transition: background .15s ease, border-color .15s ease; }
button:hover { background: #334155; border-color: #7184a0; }
button:focus-visible, input:focus-visible, textarea:focus-visible, .hr-loa-action:focus-visible { outline: 2px solid var(--hr-loa-accent); outline-offset: 2px; }
button:disabled { opacity: .4; cursor: not-allowed; }
button:disabled:hover { background: #252e3c; border-color: var(--hr-loa-border); }
[hidden] { display: none !important; }
#hr-loa-app { min-height: 100vh; }
.hr-loa-shell { width: min(1610px, calc(100vw - 32px)); margin: 0 auto; height: 100vh; min-height: 620px; display: flex; flex-direction: column; gap: 14px; padding: 18px 0; }
.hr-loa-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex: none; padding: 14px 18px; border: 1px solid var(--hr-loa-border); border-radius: 14px; background: var(--hr-loa-panel); }
.hr-loa-brand, .hr-loa-header-actions { display: flex; align-items: center; gap: 12px; min-width: 0; }
.hr-loa-brand-mark { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 11px; background: #27446f; color: #d9e8ff; font-weight: 800; font-size: 20px; }
.hr-loa-brand-copy { min-width: 0; }
.hr-loa-eyebrow { display: block; font-size: 10px; font-weight: 750; letter-spacing: .12em; color: var(--hr-loa-accent); }
.hr-loa-brand h1 { margin: 4px 0 0; font-size: clamp(16px, 1.45vw, 21px); line-height: 1.23; font-weight: 680; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hr-loa-header-actions { flex: none; flex-wrap: wrap; justify-content: end; gap: 8px; }
.hr-loa-header-actions button:last-child, #hr-loa-add-action { background: #416fae; border-color: #608bd0; color: #fff; font-weight: 700; }
.hr-loa-header-actions button:last-child:hover, #hr-loa-add-action:hover { background: #5783c1; }
.hr-loa-session-pill { border: 1px solid #3c5c73; border-radius: 99px; padding: 6px 10px; background: #1c3440; color: #b7e5df; font-size: 11px; white-space: nowrap; }
.hr-loa-live, .hr-loa-sr-only { position: absolute; overflow: hidden; width: 1px; height: 1px; clip: rect(0,0,0,0); white-space: nowrap; }
.hr-loa-layout { display: grid; grid-template-columns: minmax(205px, .85fr) minmax(355px, 1.72fr) minmax(230px, 1fr); gap: 14px; flex: 1 1 auto; min-height: 0; }
.hr-loa-outline, .hr-loa-actions, .hr-loa-rail { min-width: 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; border-radius: 14px; border: 1px solid var(--hr-loa-border); background: var(--hr-loa-panel); scrollbar-color: #46546a transparent; scrollbar-width: thin; }
.hr-loa-outline, .hr-loa-rail { padding: 16px 12px; }
.hr-loa-actions { padding: 20px; background: #171e29; }
.hr-loa-pane-heading { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 0 3px 16px; }
.hr-loa-pane-heading h2, .hr-loa-actions h2 { margin: 4px 0 0; font-size: 16px; line-height: 1.2; letter-spacing: -.015em; color: var(--hr-loa-text); }
.hr-loa-pane-count, .hr-loa-count { font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; color: #aec9ed; border: 1px solid #3a516b; padding: 3px 8px; border-radius: 8px; background: #202e41; }
.hr-loa-outline-hint { margin: 12px 5px 11px; font-size: 11px; color: var(--hr-loa-muted); }
.hr-loa-search { width: 100%; padding: 11px 12px; border-radius: 9px; border: 1px solid #3b495e; outline: none; background: #0e1520; color: var(--hr-loa-text); font-size: 12px; }
.hr-loa-search::placeholder { color: #8492a7; }
.hr-loa-outline-list { display: flex; flex-direction: column; gap: 4px; }

.hr-loa-resource-label { display: block; margin: 12px 1px 6px; color: var(--hr-loa-muted); font-size: 11px; font-weight: 650; }
#hr-loa-resource-mode, #hr-loa-source-select { cursor: pointer; margin-bottom: 4px; }
.hr-loa-tree-phase { border-radius: 9px; background: #192332; margin-bottom: 6px; padding: 4px; }
.hr-loa-tree-phase-toggle { display: flex; align-items: center; gap: 9px; width: 100%; background: transparent; border: none; font-weight: 700; text-align: left; color: #d8e6f8; }
.hr-loa-tree-phase-toggle:hover { background: #27394d; }
.hr-loa-tree-phase-toggle small { margin-left: auto; color: #a7bdd8; font-variant-numeric: tabular-nums; }
.hr-loa-tree-phase-children { display: flex; flex-direction: column; gap: 3px; }
.hr-loa-tree-node { min-width: 0; }
.hr-loa-tree-row { display: flex; align-items: flex-start; gap: 2px; min-width: 0; }
.hr-loa-tree-row .hr-loa-outline-item { min-width: 0; flex: 1; padding: 8px 4px; }
.hr-loa-tree-toggle, .hr-loa-tree-indent { width: 24px; min-width: 24px; height: 30px; flex: none; }
.hr-loa-tree-toggle { padding: 4px; background: transparent; border: 0; color: var(--hr-loa-accent); }
.hr-loa-tree-children { margin-left: 11px; border-left: 1px solid #435674; padding-left: 4px; }
.hr-loa-tree-children .hr-loa-outline-index { color: #a8bedb; }

.hr-loa-outline-item { display: flex; align-items: flex-start; text-align: left; gap: 10px; width: 100%; min-height: 57px; padding: 10px 8px; background: transparent; border-color: transparent; }
.hr-loa-outline-item:hover { background: #202c3b; border-color: #3d4d62; }
.hr-loa-outline-item[aria-current="step"] { background: var(--hr-loa-soft); border-color: #4a76af; }
.hr-loa-outline-index { flex: none; color: #91a7c4; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; padding-top: 2px; }
.hr-loa-outline-summary { min-width: 0; flex: 1; }
.hr-loa-outline-summary > span { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; font-size: 12px; line-height: 1.45; font-weight: 550; }
.hr-loa-outline-summary small { display: block; color: #8b9ab0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 4px; font-size: 10px; }
.hr-loa-outline-pins { border-radius: 7px; background: #2a3f53; padding: 3px 6px; font-size: 10px; }
.hr-loa-actions-title { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 4px; }
.hr-loa-actions-title h2 { font-size: 21px; display: flex; align-items: center; gap: 10px; }
.hr-loa-workbench-hint, .hr-loa-inspector-hint { margin: 10px 0 17px; color: var(--hr-loa-muted); font-size: 12px; line-height: 1.55; }
.hr-loa-action-list { display: flex; flex-direction: column; gap: 7px; padding-bottom: 10px; }
.hr-loa-action { position: relative; border: 1px solid #344052; border-radius: 10px; padding: 10px 13px; background: #1c2633; min-height: 55px; }
.hr-loa-action:not([data-expanded="true"]) { cursor: pointer; }
.hr-loa-action[aria-selected="true"] { border-color: #719de1; background: #222f41; box-shadow: inset 3px 0 0 var(--hr-loa-accent), 0 0 0 1px rgba(132,180,255,.1); padding: 16px 16px 17px; }
.hr-loa-action.is-drop-target { border-color: var(--hr-loa-accent); border-style: dashed; }
.hr-loa-action.is-drop-before { box-shadow: inset 0 3px 0 var(--hr-loa-accent); }
.hr-loa-action.is-drop-after { box-shadow: inset 0 -3px 0 var(--hr-loa-accent); }
.hr-loa-action-head { display: flex; align-items: center; gap: 9px; min-width: 0; }
.hr-loa-action-index { flex: none; min-width: 30px; border-radius: 7px; background: #334254; color: #c4d5eb; font-size: 11px; font-weight: 700; padding: 5px 8px; text-align: center; font-variant-numeric: tabular-nums; }
.hr-loa-action-head code { font-size: 11px; color: #a7b7cc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hr-loa-action-controls, .hr-loa-edit-actions { margin-left: auto; display: flex; gap: 5px; flex-wrap: wrap; }
.hr-loa-action-controls button, .hr-loa-edit-actions button { padding: 5px 8px; }
.hr-loa-action-controls [data-action-remove] { color: #ffc2c1; }
.hr-loa-action-content { margin: 11px 0 0; white-space: pre-wrap; font-size: 13px; line-height: 1.65; overflow-wrap: anywhere; }
.hr-loa-action:not([data-expanded="true"]) .hr-loa-action-content { font-size: 12px; color: #b9c5d7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 5px 0 0 40px; max-width: calc(100% - 42px); }
.hr-loa-action:not([data-expanded="true"]) .hr-loa-action-controls,
.hr-loa-action:not([data-expanded="true"]) .hr-loa-snap-ins { display: none; }
.hr-loa-snap-ins { display: flex; gap: 7px; flex-wrap: wrap; list-style: none; margin: 16px 0 0; padding: 13px 0 0; border-top: 1px solid #3b4a5d; }
.hr-loa-snap-in { display: flex; align-items: center; gap: 7px; max-width: 100%; border-radius: 7px; background: #28394e; padding: 4px 8px; color: #d8e5f7; font-size: 11px; overflow-wrap: anywhere; }
.hr-loa-snap-in button { background: transparent; border: 0; padding: 0 2px; color: inherit; font-size: 15px; }
.hr-loa-snap-in.is-unavailable { background: #493138; color: #ffd5d5; }
.hr-loa-edit-label { display: block; margin-top: 15px; color: #c7d6ea; font-size: 12px; }
.hr-loa-edit { display: block; width: 100%; min-height: 130px; resize: vertical; margin: 8px 0; padding: 12px; color: var(--hr-loa-text); border-radius: 8px; background: #0e1723; border: 1px solid #536b89; line-height: 1.6; }
.hr-loa-edit-actions { justify-content: end; }
.hr-loa-inspector-hint { margin: -6px 3px 13px; }
.hr-loa-category + .hr-loa-category { margin-top: 15px; }
.hr-loa-category-name { color: #8fa7c7; letter-spacing: .07em; text-transform: uppercase; font-weight: 700; font-size: 10px; margin: 14px 3px 7px; }
.hr-loa-plugin { padding: 2px; border: 1px solid #2c394a; border-radius: 9px; margin-bottom: 5px; background: #1b2532; }
.hr-loa-plugin-toggle { display: flex; justify-content: space-between; align-items: center; gap: 6px; background: transparent; border: 0; width: 100%; text-align: left; padding: 9px; }
.hr-loa-plugin-meta { min-width: 0; }
.hr-loa-plugin-name { display: block; font-size: 12px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hr-loa-plugin-meta small { display: block; color: #91a3bb; font-size: 10px; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hr-loa-plugin-chevron { color: var(--hr-loa-accent); }
.hr-loa-skills { list-style: none; margin: 0 6px 5px; padding: 4px 0 0; border-top: 1px solid #3b4858; }
.hr-loa-component { width: 100%; background: transparent; border: 0; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 2px 8px; text-align: left; padding: 9px 7px; }
.hr-loa-component span, .hr-loa-component small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hr-loa-component small { font-size: 10px; color: #93a5bf; grid-column: 1; }
.hr-loa-component b { grid-column: 2; grid-row: 1 / span 2; color: var(--hr-loa-accent); font-size: 15px; align-self: center; }
.hr-loa-empty { padding: 12px 8px; font-size: 12px; color: var(--hr-loa-muted); }
@media(max-width:1130px) {
  .hr-loa-layout { grid-template-columns: minmax(180px,.85fr) minmax(310px,1.55fr) minmax(195px,1fr); gap: 9px; }
  .hr-loa-shell { width: calc(100vw - 18px); }
  .hr-loa-rail, .hr-loa-outline { padding: 13px 8px; }
  .hr-loa-actions { padding: 14px; }
}
@media(max-width:820px) {
  .hr-loa-shell { min-height: 100vh; height: auto; }
  .hr-loa-layout { grid-template-columns: minmax(190px,.78fr) minmax(0,1.5fr); }
  .hr-loa-rail { grid-column: 1 / -1; max-height: 330px; }
  .hr-loa-outline, .hr-loa-actions { height: min(68vh, 740px); }
}
@media(max-width:580px) {
  .hr-loa-shell { padding: 9px 0 20px; gap: 9px; }
  .hr-loa-toolbar { align-items: start; flex-direction: column; gap: 12px; padding: 13px; }
  .hr-loa-brand h1 { white-space: normal; }
  .hr-loa-header-actions { width: 100%; justify-content: start; }
  .hr-loa-layout { grid-template-columns: minmax(0,1fr); }
  .hr-loa-outline { max-height: 210px; }
  .hr-loa-actions { height: auto; max-height: 65vh; }
  .hr-loa-rail { grid-column: 1; }
  .hr-loa-actions-title h2 { font-size: 17px; }
}
@media(prefers-reduced-motion:reduce) { button { transition: none; } }
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

function validateResourceSources(sources) {
  if (!Array.isArray(sources)) throw new TypeError("resourceSources must be an array.");
  const ids = new Set();
  return sources.map((source, index) => {
    const where = `resourceSources[${index}]`;
    if (!isRecord(source)) throw new TypeError(`${where} must be an object.`);
    const id = requireString(source.id, `${where}.id`);
    if (ids.has(id)) throw new TypeError(`Duplicate resource source ID: ${id}`);
    ids.add(id);
    if (source.kind !== "skills" && source.kind !== "skill-set") {
      throw new TypeError(`${where}.kind must be skills or skill-set.`);
    }
    requireString(source.displayName, `${where}.displayName`);
    const validateSkills = (items, location) => {
      if (!Array.isArray(items)) throw new TypeError(`${location} must be an array.`);
      const refs = new Set();
      return items.map((item, n) => {
        const at = `${location}[${n}]`;
        if (!isRecord(item)) throw new TypeError(`${at} must be an object.`);
        const ref = requireString(item.ref, `${at}.ref`);
        requireString(item.displayName, `${at}.displayName`);
        if (item.kind !== undefined && item.kind !== "skill") throw new TypeError(`${at}.kind must be skill.`);
        if (refs.has(ref)) throw new TypeError(`Duplicate skill ref in ${location}: ${ref}`);
        refs.add(ref);
        return { ...item };
      });
    };
    if (source.kind === "skills") {
      return { ...source, id, skills: validateSkills(source.skills, `${where}.skills`) };
    }
    if (!Array.isArray(source.groups)) throw new TypeError(`${where}.groups must be an array.`);
    const groups = new Set();
    return { ...source, id, groups: source.groups.map((group, n) => {
      const at = `${where}.groups[${n}]`;
      if (!isRecord(group)) throw new TypeError(`${at} must be an object.`);
      const groupId = requireString(group.id, `${at}.id`);
      if (groups.has(groupId)) throw new TypeError(`Duplicate group ID: ${groupId}`);
      groups.add(groupId);
      requireString(group.displayName, `${at}.displayName`);
      return { ...group, skills: validateSkills(group.skills, `${at}.skills`) };
    }) };
  });
}

function validateActionTree(actions) {
  const byId = new Map(actions.map((action) => [action.id, action]));
  const inProgress = new Set();
  const phaseById = new Map();
  const effectivePhase = (action) => {
    if (phaseById.has(action.id)) return phaseById.get(action.id);
    if (inProgress.has(action.id)) throw new TypeError(`Action parent cycle involving ${action.id}`);
    inProgress.add(action.id);
    let phase = action.phase || "Actions";
    if (action.parentId !== undefined) {
      const parent = byId.get(action.parentId);
      if (!parent) throw new TypeError(`Unknown parentId for action ${action.id}: ${action.parentId}`);
      const parentPhase = effectivePhase(parent);
      if (action.phase && action.phase !== parentPhase) throw new TypeError(`Action phase conflicts with parent for ${action.id}`);
      phase = parentPhase;
    }
    inProgress.delete(action.id);
    phaseById.set(action.id, phase);
    return phase;
  };
  for (const action of actions) effectivePhase(action);
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
    if (action.phase !== undefined) requireString(action.phase, `${actionPath}.phase`);
    if (action.parentId !== undefined) requireString(action.parentId, `${actionPath}.parentId`);
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

  validateActionTree(actions);
  return {
    ...input,
    loa: { ...input.loa, actions },
    catalog: validateCatalog(input.catalog),
    ...(input.resourceSources === undefined ? {} : { resourceSources: validateResourceSources(input.resourceSources) }),
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
  return catalog.map((category, categoryIndex) => `
    <section class="hr-loa-category">
      <h3 class="hr-loa-category-name">${escapeHtml(category.category)}</h3>
      ${category.plugins.map((plugin, pluginIndex) => {
        const groupId = `hr-loa-plugin-${categoryIndex}-${pluginIndex}`;
        return `
        <article class="hr-loa-plugin" data-plugin-ref="${escapeHtml(plugin.ref)}">
          <button type="button" class="hr-loa-plugin-toggle" data-plugin-toggle="${escapeHtml(plugin.ref)}" aria-expanded="${plugin.skills.length > 0}" aria-controls="${groupId}"${plugin.skills.length ? "" : " disabled"}>
            <span class="hr-loa-plugin-meta"><span class="hr-loa-plugin-name">${escapeHtml(plugin.displayName)}</span><small>${escapeHtml(plugin.ref)}</small></span>
            <span class="hr-loa-plugin-chevron" aria-hidden="true">${plugin.skills.length ? "▾" : ""}</span>
          </button>
          ${plugin.skills.length ? `<ul id="${groupId}" class="hr-loa-skills" data-plugin-skills="${escapeHtml(plugin.ref)}">${plugin.skills.map((skill) => `<li><button type="button" class="hr-loa-component" draggable="true" data-drag-ref="${escapeHtml(skill.ref)}" data-add-ref="${escapeHtml(skill.ref)}"><span>${escapeHtml(skill.displayName)}</span><small>${escapeHtml(skill.ref)}</small><b aria-hidden="true">+</b></button></li>`).join("")}</ul>` : ""}
        </article>
      `;
      }).join("")}
    </section>
  `).join("");
}

function renderActions(actions, catalog, resourceSources = []) {
  const refs = new Set(catalog.flatMap((category) => category.plugins.flatMap((plugin) => [plugin.ref, ...plugin.skills.map((skill) => skill.ref)])));
  for (const source of resourceSources) {
    const skills = source.kind === "skills" ? source.skills : source.groups.flatMap((group) => group.skills);
    for (const skill of skills) refs.add(skill.ref);
  }
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

export function createLoaReviewHtml({ loa, catalog, resourceSources, sourcePath, artifactName } = {}) {
  const input = validateLoaInput({ loa, catalog: catalog ?? [], ...(resourceSources === undefined ? {} : { resourceSources }) });
  const name = artifactName || "loa.review.html";
  const bootstrap = {
    version: 1,
    loa: input.loa,
    catalog: input.catalog,
    ...(input.resourceSources === undefined ? {} : { resourceSources: input.resourceSources }),
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
        ${renderActions(input.loa.actions, input.catalog, input.resourceSources)}
      </main>
    </div>
  </div>
</div>
<script id="hr-loa-bootstrap" type="application/json">${safeJson(bootstrap)}</script>
<script id="hr-host-bridge">${inlineScript(REVIEW_HOST_SOURCE)}</script>
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
  if (parsed.catalog === undefined) parsed = { ...parsed, catalog: parsed.resourceSources === undefined ? discoverCatalog() : [] };
  const validated = validateLoaInput(parsed);
  const base = path.basename(input, path.extname(input)).replace(/\.loa$/i, "");
  const output = path.resolve(outputFile || path.join(path.dirname(input), `${base}.loa.review.html`));
  fs.writeFileSync(output, createLoaReviewHtml({
    loa: validated.loa,
    catalog: validated.catalog,
    ...(validated.resourceSources === undefined ? {} : { resourceSources: validated.resourceSources }),
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
