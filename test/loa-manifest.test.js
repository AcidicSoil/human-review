import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { validateLoaInput, createLoaReviewHtml } from "../src/loa-review/generator.js";
import { markUnavailableSnapIns } from "../src/loa-review/state.js";

const resources = {
  format: "human-review.resources/v1",
  sources: [
    { id: "team", kind: "library", displayName: "Engineering library", refs: ["skills://engineering/plan", "skills://engineering/review"] },
    { id: "product", kind: "plugin", displayName: "Product integration", refs: ["skills://engineering/review", "mcp://product"] },
    { id: "review-only", kind: "repository", displayName: "Selected review skills", refs: ["skills://engineering/review"] },
  ],
  capabilities: [
    { ref: "skills://engineering/plan", kind: "skill", displayName: "Plan", invocation: "user" },
    { ref: "skills://engineering/review", kind: "skill", displayName: "Review", invocation: "both" },
    { ref: "mcp://product", kind: "mcp", displayName: "Product MCP", availability: "unknown" },
  ],
  relationships: [
    { type: "precedes", from: "skills://engineering/plan", to: "skills://engineering/review" },
  ],
  workflows: [
    { id: "release", displayName: "Review and release", steps: [
      { ref: "skills://engineering/plan" },
      { ref: "skills://engineering/review", after: ["skills://engineering/plan"] },
    ] },
  ],
};
const make = (manifest = resources) => ({
  loa: { title: "Review", actions: [{ id: "a", content: "Review changes", snapIns: [] }] },
  catalog: [], resourceManifest: manifest,
});
const open = (input = make()) => new JSDOM(createLoaReviewHtml(input), { runScripts: "dangerously", url: "file:///tmp/resources.loa.review.html" });
const data = (doc) => JSON.parse(doc.querySelector("#hr-loa-bootstrap").textContent);

test("versioned manifest retains mixed source identity and deduplicated shared capabilities", () => {
  const validated = validateLoaInput(make());
  assert.deepEqual(validated.resourceManifest, resources);
  const dom = open();
  try {
    const doc = dom.window.document;
    const mode = doc.querySelector("#hr-loa-resource-mode");
    assert.ok([...mode.options].some((option) => option.value === "sources"));
    mode.value = "sources";
    mode.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    const selected = doc.querySelector("#hr-loa-source-select");
    assert.equal(selected.value, "team");
    assert.equal(doc.querySelectorAll("[data-add-ref]").length, 2);
    assert.equal(doc.querySelector('[data-add-ref="mcp://product"]'), null);
    selected.value = "product";
    selected.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    assert.equal(doc.querySelectorAll('[data-add-ref="skills://engineering/review"]').length, 1);
    assert.ok(doc.querySelector('[data-add-ref="mcp://product"]'));
    assert.match(doc.querySelector("#hr-loa-rail").textContent, /MCP/);
    assert.match(doc.querySelector("#hr-loa-rail").textContent, /unknown/i);
  } finally { dom.window.close(); }
});

test("select an entire source or a subset without duplicating shared references", () => {
  const dom = open();
  try {
    const doc = dom.window.document;
    const mode = doc.querySelector("#hr-loa-resource-mode");
    mode.value = "sources";
    mode.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    doc.querySelector('[data-resource-select="skills://engineering/plan"]').click();
    doc.querySelector("#hr-loa-attach-selected").click();
    assert.deepEqual(data(doc).loa.actions[0].snapIns.map((item) => item.ref), ["skills://engineering/plan"]);
    doc.querySelector("#hr-loa-attach-all").click();
    assert.deepEqual(data(doc).loa.actions[0].snapIns.map((item) => item.ref),
      ["skills://engineering/plan", "skills://engineering/review"]);
    const select = doc.querySelector("#hr-loa-source-select");
    select.value = "product";
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    doc.querySelector("#hr-loa-attach-all").click();
    assert.deepEqual(data(doc).loa.actions[0].snapIns.map((item) => item.ref),
      ["skills://engineering/plan", "skills://engineering/review", "mcp://product"]);
    assert.equal(data(doc).loa.actions[0].snapIns[2].kind, "mcp");
  } finally { dom.window.close(); }
});

test("explicit workflows show declared steps, never inferred sequences", () => {
  const dom = open();
  try {
    const doc = dom.window.document;
    const mode = doc.querySelector("#hr-loa-resource-mode");
    mode.value = "workflows";
    mode.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    assert.ok(doc.querySelector("#hr-loa-source-select option[value=release]"));
    assert.equal(doc.querySelectorAll("[data-add-ref]").length, 2);
    assert.match(doc.querySelector("#hr-loa-rail").textContent, /after Plan/);
    doc.querySelector("#hr-loa-attach-all").click();
    assert.equal(data(doc).loa.actions[0].snapIns.length, 2);
    assert.deepEqual(data(doc).resourceManifest, resources);
  } finally { dom.window.close(); }
});

test("mixed capability refs stay available with the inspector hidden and through clean export data", () => {
  const input = make();
  input.loa.actions[0].snapIns = [{ kind: "mcp", ref: "mcp://product", displayName: "Product MCP" }];
  assert.equal(markUnavailableSnapIns(input).loa.actions[0].snapIns[0].unavailable, undefined);
  const dom = open(input);
  try {
    const doc = dom.window.document;
    const mode = doc.querySelector("#hr-loa-resource-mode");
    mode.value = "none";
    mode.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    assert.equal(doc.querySelectorAll(".hr-loa-snap-in.is-unavailable").length, 0);
    assert.deepEqual(data(doc).resourceManifest, resources);
    assert.equal(data(doc).loa.actions[0].snapIns[0].kind, "mcp");
  } finally { dom.window.close(); }
});

test("manifest rejects unknown refs, duplicate resources, broken relations, and cycles", () => {
  const bad = (change) => validateLoaInput(make(change));
  assert.throws(() => bad({ ...resources, format: "future/v2" }), /format/i);
  assert.throws(() => bad({ ...resources, sources: [{ ...resources.sources[0], refs: ["unknown"] }] }), /unknown/i);
  assert.throws(() => bad({ ...resources, capabilities: [...resources.capabilities, resources.capabilities[0]] }), /duplicate/i);
  assert.throws(() => bad({ ...resources, relationships: [{ type: "invokes", from: "missing", to: "mcp://product" }] }), /unknown/i);
  assert.throws(() => bad({ ...resources, workflows: [{ id: "bad", displayName: "Bad", steps: [{ ref: "missing" }] }] }), /unknown/i);
  assert.throws(() => bad({ ...resources, workflows: [{ id: "cycle", displayName: "Cycle", steps: [
    { ref: "skills://engineering/plan", after: ["skills://engineering/review"] },
    { ref: "skills://engineering/review", after: ["skills://engineering/plan"] },
  ] }] }), /cycle/i);
});

test("legacy skill grouping remains usable and is identified as a collection", () => {
  const dom = new JSDOM(createLoaReviewHtml({
    loa: { actions: [{ id: "a", content: "Review", snapIns: [] }] }, catalog: [],
    resourceSources: [{ id: "legacy", kind: "skill-set", displayName: "Old collection", groups: [
      { id: "phase", displayName: "Phase", skills: [{ ref: "old.skill", displayName: "Old skill" }] },
    ] }],
  }), { runScripts: "dangerously", url: "file:///tmp/legacy-resource.html" });
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelector("#hr-loa-resource-mode option[value=skill-set]").textContent, "Skill collections");
    assert.equal(doc.querySelector("#hr-loa-source-select").value, "legacy");
  } finally { dom.window.close(); }
});

test("relationships and explicit unavailable status are visible without inventing workflow order", () => {
  const manifest = {
    ...resources,
    capabilities: resources.capabilities.map((item) => item.ref === "mcp://product" ? { ...item, availability: "unavailable" } : item),
  };
  const input = make(manifest);
  input.loa.actions[0].snapIns = [{ kind: "mcp", ref: "mcp://product", displayName: "Product MCP" }];
  assert.equal(markUnavailableSnapIns(input).loa.actions[0].snapIns[0].unavailable, true);
  const dom = open(input);
  try {
    const doc = dom.window.document;
    const mode = doc.querySelector("#hr-loa-resource-mode");
    mode.value = "sources";
    mode.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    assert.match(doc.querySelector("#hr-loa-rail").textContent, /precedes Review/);
    const source = doc.querySelector("#hr-loa-source-select");
    source.value = "product";
    source.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    assert.match(doc.querySelector("#hr-loa-rail").textContent, /unavailable/);
    assert.equal(doc.querySelector(".hr-loa-snap-in.is-unavailable") !== null, true);
  } finally { dom.window.close(); }
});

test("manifest-only generation avoids plugin discovery and survives serialized HTML", async () => {
  const { generateLoaArtifact } = await import("../src/loa-review/generator.js");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hr-manifest-artifact-"));
  try {
    const input = path.join(dir, "input.json");
    const output = path.join(dir, "output.loa.review.html");
    fs.writeFileSync(input, JSON.stringify({ loa: make().loa, resourceManifest: resources }));
    let called = false;
    await generateLoaArtifact(input, output, { discoverCatalog() { called = true; return []; } });
    assert.equal(called, false);
    const html = fs.readFileSync(output, "utf8");
    const dom = new JSDOM(html, { runScripts: "dangerously", url: "file://" + output });
    try {
      assert.deepEqual(data(dom.window.document).resourceManifest, resources);
      assert.deepEqual(data(dom.window.document).catalog, []);
    } finally { dom.window.close(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("restoring a legacy agent snapshot clears stale manifest data", () => {
  const parent = { postMessage() {} };
  const dom = new JSDOM(createLoaReviewHtml(make()), {
    runScripts: "dangerously", url: "file:///tmp/restore-legacy.html",
    beforeParse(window) { Object.defineProperty(window, "parent", { value: parent }); },
  });
  try {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
      source: parent,
      data: { type: "hr:restore", mode: "loa", nonce: "active-session", structured: {
        document: { loa: make().loa, catalog: [] },
      } },
    }));
    assert.equal(data(dom.window.document).resourceManifest, undefined);
    assert.equal(dom.window.document.querySelector("#hr-loa-resource-mode").value, "none");
  } finally { dom.window.close(); }
});

test("MCP-only plugin and other capability kinds do not require any skill package", () => {
  const manifest = {
    format: "human-review.resources/v1",
    sources: [{ id: "service", kind: "plugin", displayName: "Service integration", refs: ["mcp://service"] }],
    capabilities: [{ ref: "mcp://service", kind: "mcp", displayName: "MCP service" },
      { ref: "cmd://build", kind: "command", displayName: "Build" },
      { ref: "rule://checks", kind: "rule", displayName: "Checks" },
      { ref: "agent://tester", kind: "agent", displayName: "Tester" },
      { ref: "hook://verify", kind: "hook", displayName: "Verify" }],
  };
  const dom = open(make(manifest));
  try {
    const doc = dom.window.document;
    doc.querySelector("#hr-loa-attach-all").click();
    assert.deepEqual(data(doc).loa.actions[0].snapIns.map((entry) => entry.kind), ["mcp"]);
    assert.deepEqual(data(doc).resourceManifest.capabilities, manifest.capabilities);
  } finally { dom.window.close(); }
});
