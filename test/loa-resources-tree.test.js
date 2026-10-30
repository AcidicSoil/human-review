import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import { createLoaReviewHtml, generateLoaArtifact, validateLoaInput } from "../src/loa-review/generator.js";
import { markUnavailableSnapIns } from "../src/loa-review/state.js";

const action = (id, content, extra = {}) => ({ id, content, snapIns: [], ...extra });
const sources = [
  { id: "workspace", kind: "skills", displayName: "Workspace skills", skills: [
    { ref: "skills://workspace/test", displayName: "Test" },
    { ref: "skills://workspace/build", displayName: "Build" },
  ] },
  { id: "delivery", kind: "skill-set", displayName: "Delivery", groups: [
    { id: "plan", displayName: "Plan", skills: [{ ref: "skills://sets/plan", displayName: "Plan" }] },
    { id: "ship", displayName: "Deploy", skills: [{ ref: "skills://sets/deploy", displayName: "Deploy" }] },
  ] },
  { id: "review", kind: "skill-set", displayName: "Review", groups: [
    { id: "quality", displayName: "Quality", skills: [{ ref: "skills://sets/review", displayName: "Review" }] },
  ] },
];
const catalog = [{ category: "Integrations", plugins: [{ ref: "plugin", displayName: "Plugin", skills: [
  { ref: "skills://plugins/plugin/special", displayName: "Special" },
] }] }];
const treeActions = [
  action("scope", "Define scope", { phase: "Planning" }),
  action("technical", "Technical plan", { parentId: "scope" }),
  action("architecture", "Architecture design", { parentId: "technical" }),
  action("release", "Release checklist", { phase: "Delivery" }),
  action("review", "Review changes", { parentId: "release" }),
];

test("catalog sources are explicit, validated, and do not trigger automatic plugin discovery", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hr-sources-"));
  try {
    const input = path.join(dir, "input.json");
    const output = path.join(dir, "artifact.html");
    fs.writeFileSync(input, JSON.stringify({ loa: { actions: [action("a", "Review")] }, resourceSources: sources }));
    let calls = 0;
    await generateLoaArtifact(input, output, { discoverCatalog: () => { calls++; return catalog; } });
    assert.equal(calls, 0);
    const html = fs.readFileSync(output, "utf8");
    const bootstrap = JSON.parse(html.split('<script id="hr-loa-bootstrap" type="application/json">')[1].split("</script>")[0]);
    assert.deepEqual(bootstrap.resourceSources, sources);
    assert.deepEqual(bootstrap.catalog, []);
    assert.throws(() => validateLoaInput({ loa: { actions: [action("a", "One")] }, catalog: [], resourceSources: [
      { ...sources[0], kind: "fake" },
    ] }), /kind/i);
    assert.throws(() => validateLoaInput({ loa: { actions: [action("a", "One")] }, catalog: [], resourceSources: [
      sources[0], { ...sources[0] },
    ] }), /duplicate/i);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("resource inspector switches between plugins, standalone skills, one named set and none without changing attachments", () => {
  const dom = new JSDOM(createLoaReviewHtml({
    loa: { actions: [action("a", "Review")] }, catalog, resourceSources: sources,
  }), { runScripts: "dangerously", url: "file:///tmp/source-review.html" });
  const doc = dom.window.document;
  const bootstrap = () => JSON.parse(doc.querySelector("#hr-loa-bootstrap").textContent);
  try {
    const select = doc.querySelector("#hr-loa-resource-mode");
    assert.ok(select);
    assert.equal(select.value, "plugins");
    assert.ok(doc.querySelector('[data-plugin-toggle="plugin"]'));
    select.value = "skills";
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    assert.equal(doc.querySelector('[data-add-ref="skills://workspace/test"]') !== null, true);
    doc.querySelector('[data-add-ref="skills://workspace/test"]').click();
    assert.equal(bootstrap().loa.actions[0].snapIns[0].ref, "skills://workspace/test");
    const setMode = doc.querySelector("#hr-loa-resource-mode");
    setMode.value = "skill-set";
    setMode.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    const sets = doc.querySelector("#hr-loa-source-select");
    assert.ok(sets);
    sets.value = "review";
    sets.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    assert.ok(doc.querySelector('[data-add-ref="skills://sets/review"]'));
    assert.equal(doc.querySelector('[data-add-ref="skills://sets/plan"]'), null);
    const noneMode = doc.querySelector("#hr-loa-resource-mode");
    noneMode.value = "none";
    noneMode.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    assert.equal(doc.querySelectorAll("[data-add-ref]").length, 0);
    assert.equal(doc.querySelectorAll(".hr-loa-snap-in.is-unavailable").length, 0,
      "switching visibility cannot mark a retained attached skill unavailable");
    assert.equal(bootstrap().loa.actions[0].snapIns.length, 1);
    assert.equal(bootstrap().resourceSources.length, 3);
  } finally { dom.window.close(); }
});

test("action tree renders explicit phases, nested parents and search-revealed ancestors", () => {
  const dom = new JSDOM(createLoaReviewHtml({ loa: { actions: treeActions }, catalog: [] }), {
    runScripts: "dangerously", url: "file:///tmp/tree-review.html",
  });
  const doc = dom.window.document;
  try {
    assert.equal(doc.querySelectorAll("[data-outline-action]").length, 5);
    assert.equal(doc.querySelectorAll("[data-outline-phase]").length, 2);
    assert.equal(doc.querySelector('[data-outline-action="architecture"]').closest('[data-outline-children]').dataset.outlineChildren, "technical");
    doc.querySelector('[data-outline-toggle="scope"]').click();
    assert.equal(doc.querySelector('[data-outline-action="architecture"]'), null);
    const search = doc.querySelector("#hr-loa-action-search");
    search.value = "Architecture design";
    search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.ok(doc.querySelector('[data-outline-action="scope"]'));
    assert.ok(doc.querySelector('[data-outline-action="technical"]'));
    doc.querySelector('[data-outline-action="architecture"]').click();
    assert.equal(doc.querySelector('.hr-loa-action[aria-selected="true"]').dataset.actionId, "architecture");
    assert.equal(doc.querySelectorAll("[data-action-id]").length, 5);
  } finally { dom.window.close(); }
});

test("tree rejects cycles and missing parents; deleting a parent retains its descendants", () => {
  const valid = (actions) => ({ loa: { actions }, catalog: [] });
  assert.throws(() => validateLoaInput(valid([action("a", "A", { parentId: "missing" })])), /parent/i);
  assert.throws(() => validateLoaInput(valid([
    action("a", "A", { parentId: "b" }), action("b", "B", { parentId: "a" }),
  ])), /cycle/i);
  const dom = new JSDOM(createLoaReviewHtml({ loa: { actions: treeActions }, catalog: [] }), {
    runScripts: "dangerously", url: "file:///tmp/tree-delete.html",
  });
  try {
    const doc = dom.window.document;
    doc.querySelector('[data-outline-action="technical"]').click();
    doc.querySelector('.hr-loa-action[aria-selected="true"] [data-action-remove]').click();
    const data = JSON.parse(doc.querySelector("#hr-loa-bootstrap").textContent);
    assert.equal(data.loa.actions.find((a) => a.id === "architecture").parentId, "scope");
    assert.doesNotThrow(() => validateLoaInput({ loa: data.loa, catalog: data.catalog }));
  } finally { dom.window.close(); }
});

test('selected inspector view survives reopening a reviewed HTML artifact', () => {
  const dom = new JSDOM(createLoaReviewHtml({
    loa: { actions: [action('a', 'Review')] }, catalog, resourceSources: sources,
  }), { runScripts: 'dangerously', url: 'file:///tmp/review-view.html' });
  try {
    const select = dom.window.document.querySelector('#hr-loa-resource-mode');
    select.value = 'skill-set';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    const named = dom.window.document.querySelector('#hr-loa-source-select');
    named.value = 'review';
    named.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    const html = dom.serialize();
    const reopened = new JSDOM(html, { runScripts: 'dangerously', url: 'file:///tmp/review-view.html' });
    try {
      const doc = reopened.window.document;
      assert.equal(doc.querySelector('#hr-loa-resource-mode').value, 'skill-set');
      assert.equal(doc.querySelector('#hr-loa-source-select').value, 'review');
      assert.ok(doc.querySelector('[data-add-ref="skills://sets/review"]'));
    } finally { reopened.window.close(); }
  } finally { dom.window.close(); }
});

test('tree items support keyboard navigation and collapse or expand their children', () => {
  const dom = new JSDOM(createLoaReviewHtml({ loa: { actions: treeActions }, catalog: [] }), {
    runScripts: 'dangerously', url: 'file:///tmp/tree-keyboard.html',
  });
  try {
    const doc = dom.window.document;
    const button = doc.querySelector('[data-outline-action="scope"]');
    button.focus();
    button.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(doc.activeElement.dataset.outlineAction, 'technical');
    doc.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    assert.equal(doc.activeElement.dataset.outlineAction, 'technical');
    assert.equal(doc.querySelector('[data-outline-action="architecture"]'), null);
    doc.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    assert.equal(doc.activeElement.dataset.outlineAction, 'scope');
    doc.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    assert.equal(doc.querySelector('[data-outline-action="technical"]'), null);
  } finally { dom.window.close(); }
});


test("availability uses all configured sources, not just plugin catalog or active inspector", () => {
  const input = { loa: { actions: [action("a", "Review", { snapIns: [
    { kind: "skill", ref: "skills://workspace/test", displayName: "Test" },
    { kind: "skill", ref: "skills://sets/plan", displayName: "Plan" },
    { kind: "skill", ref: "missing.ref", displayName: "Missing" },
  ] })] }, catalog: [], resourceSources: sources };
  const output = markUnavailableSnapIns(input).loa.actions[0].snapIns;
  assert.equal(output[0].unavailable, undefined);
  assert.equal(output[1].unavailable, undefined);
  assert.equal(output[2].unavailable, true);
});

test('searching a phase name shows its member actions and descendants', () => {
  const dom = new JSDOM(createLoaReviewHtml({ loa: { actions: treeActions }, catalog: [] }), {
    runScripts: 'dangerously', url: 'file:///tmp/search-phase.html',
  });
  try {
    const doc = dom.window.document;
    const field = doc.querySelector('#hr-loa-action-search');
    field.value = 'Planning';
    field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.ok(doc.querySelector('[data-outline-action="scope"]'));
    assert.ok(doc.querySelector('[data-outline-action="architecture"]'));
    assert.equal(doc.querySelector('[data-outline-action="release"]'), null);
  } finally { dom.window.close(); }
});

test('single declared skill set is the default and an empty configuration has no inspector resources', () => {
  const doc = (resourceSources) => {
    const dom = new JSDOM(createLoaReviewHtml({ loa: { actions: [action('a', 'Review')] }, catalog: [], resourceSources }), {
      runScripts: 'dangerously', url: 'file:///tmp/one-set.html',
    });
    return dom;
  };
  const only = doc([sources[1]]);
  try {
    assert.equal(only.window.document.querySelector('#hr-loa-resource-mode').value, 'skill-set');
    assert.equal(only.window.document.querySelector('#hr-loa-source-select').value, 'delivery');
    assert.equal(only.window.document.querySelectorAll('[data-add-ref]').length, 2);
  } finally { only.window.close(); }
  const empty = doc([]);
  try {
    assert.equal(empty.window.document.querySelector('#hr-loa-resource-mode').value, 'none');
    assert.equal(empty.window.document.querySelectorAll('[data-add-ref]').length, 0);
  } finally { empty.window.close(); }
});

test('child phases cannot conflict with their parent phase', () => {
  assert.throws(() => validateLoaInput({ loa: { actions: [
    action('a', 'Parent', { phase: 'Plan' }),
    action('b', 'Child', { parentId: 'a', phase: 'Deploy' }),
  ] }, catalog: [] }), /phase conflicts/i);
});

test('live editor transmits explicit source data with skill attachments', () => {
  const messages = [];
  const parent = { postMessage: (message) => messages.push(message) };
  const dom = new JSDOM(createLoaReviewHtml({
    loa: { actions: [action('a', 'Review', { phase: 'Verify' })] },
    catalog: [], resourceSources: [sources[0]],
  }), { runScripts: 'dangerously', url: 'file:///tmp/live-skill.html', beforeParse(window) {
    Object.defineProperty(window, 'parent', { value: parent });
  } });
  try {
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      source: parent, data: { type: 'hr:restore', nonce: 'test-session', mode: 'loa' },
    }));
    dom.window.document.querySelector('[data-add-ref="skills://workspace/build"]').click();
    const submission = messages.find(message => message.type === 'hr:change');
    assert.equal(submission.nonce, 'test-session');
    assert.equal(submission.document.resourceSources[0].id, 'workspace');
    assert.equal(submission.document.loa.actions[0].phase, 'Verify');
    assert.equal(submission.document.loa.actions[0].snapIns[0].ref, 'skills://workspace/build');
  } finally { dom.window.close(); }
});

test('explicit source labels remain inert HTML and round-trip through the bootstrap', () => {
  const attack = '</script><script>window.evil=true</script>';
  const html = createLoaReviewHtml({ loa: { actions: [action('a', 'Safe')] }, catalog: [],
    resourceSources: [{ id: 'safe', kind: 'skills', displayName: attack, skills: [
      { ref: 'example://safe', displayName: attack },
    ] }],
  });
  assert.equal(html.includes('</script><script>window.evil'), false);
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'file:///tmp/safe-sources.html' });
  try {
    assert.equal(dom.window.evil, undefined);
    const parsed = JSON.parse(dom.window.document.querySelector('#hr-loa-bootstrap').textContent);
    assert.equal(parsed.resourceSources[0].skills[0].displayName, attack);
  } finally { dom.window.close(); }
});

test('phase counts include descendants rather than only top-level actions', () => {
  const dom = new JSDOM(createLoaReviewHtml({ loa: { actions: treeActions }, catalog: [] }), {
    runScripts: 'dangerously', url: 'file:///tmp/tree-counts.html',
  });
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelector('[data-outline-phase="Planning"] small').textContent, '3');
    assert.equal(doc.querySelector('[data-outline-phase="Delivery"] small').textContent, '2');
  } finally { dom.window.close(); }
});
