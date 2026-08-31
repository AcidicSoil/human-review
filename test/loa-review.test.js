import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createLoaReviewHtml,
  generateLoaArtifact,
  validateLoaInput,
} from "../src/loa-review/artifact.js";
import {
  addAction,
  addSnapIn,
  editAction,
  markUnavailableSnapIns,
  moveAction,
  removeAction,
  removeSnapIn,
  reorderActions,
  serializeLoaBootstrap,
} from "../src/loa-review/client.js";

const validInput = {
  loa: {
    title: "Launch plan",
    actions: [
      {
        id: "research",
        content: "Research the market",
        snapIns: [{ kind: "skill", ref: "research.web", pluginRef: "research", displayName: "Web research" }],
      },
      { id: "ship", content: "Ship the result", snapIns: [] },
    ],
  },
  catalog: [
    {
      category: "Research",
      plugins: [
        {
          ref: "research",
          displayName: "Research tools",
          skills: [{ ref: "research.web", displayName: "Web research" }],
        },
      ],
    },
  ],
};

test("validates the LOA JSON contract and rejects malformed input", () => {
  assert.deepEqual(validateLoaInput(validInput), validInput);
  assert.throws(() => validateLoaInput(null), /input must be an object/i);
  assert.throws(() => validateLoaInput({ ...validInput, loa: {} }), /loa\.actions/i);
  assert.throws(
    () => validateLoaInput({ ...validInput, loa: { ...validInput.loa, actions: [{ id: "x", content: 42, snapIns: [] }] } }),
    /content/i,
  );
  assert.throws(
    () => validateLoaInput({ ...validInput, loa: { ...validInput.loa, actions: [{ id: "x", content: "Do it", snapIns: ["legacy.ref"] }] } }),
    /snapIns\[0\].*object/i,
  );
  assert.throws(
    () => validateLoaInput({
      ...validInput,
      loa: {
        ...validInput.loa,
        actions: [{
          id: "x",
          content: "Do it",
          snapIns: [
            { kind: "skill", ref: "a", pluginRef: "p", displayName: "First" },
            { kind: "skill", ref: "a", pluginRef: "p", displayName: "Second" },
          ],
        }],
      },
    }),
    /duplicate snap-in ref/i,
  );
});

test("accepts multiple typed snap-ins and preserves refs absent from the catalog", () => {
  const input = {
    ...validInput,
    loa: {
      ...validInput.loa,
      actions: [{
        id: "compose",
        content: "Compose the result",
        snapIns: [
          { kind: "plugin", ref: "research", displayName: "Research tools" },
          { kind: "skill", ref: "missing.skill", pluginRef: "missing", displayName: "Missing skill" },
        ],
      }],
    },
  };

  assert.deepEqual(validateLoaInput(input), input);
});

test("requires unique stable action IDs", () => {
  const duplicate = {
    ...validInput,
    loa: {
      ...validInput.loa,
      actions: validInput.loa.actions.map((action) => ({ ...action, id: "same", snapIns: [] })),
    },
  };
  assert.throws(() => validateLoaInput(duplicate), /duplicate action id/i);
});

test("generates a self-contained artifact with a default output path and bootstrap state", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-loa-"));
  const inputPath = path.join(dir, "launch.json");
  fs.writeFileSync(inputPath, JSON.stringify(validInput));

  const result = await generateLoaArtifact(inputPath);
  const expectedOutput = path.join(dir, "launch.loa.review.html");
  assert.equal(result.output, expectedOutput);

  const html = fs.readFileSync(expectedOutput, "utf8");
  const bootstrap = html.match(/<script id="hr-loa-bootstrap" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(bootstrap);
  assert.deepEqual(JSON.parse(bootstrap), {
    version: 1,
    loa: validInput.loa,
    catalog: validInput.catalog,
    sourcePath: inputPath,
    artifactName: "launch.loa.review.html",
  });
  assert.match(html, /Research tools/);
  assert.match(html, /Research the market/);
});

test("embeds bootstrap JSON without allowing script termination", () => {
  const hostile = {
    ...validInput,
    loa: {
      ...validInput.loa,
      title: '</script><script>alert("x")</script>',
    },
  };
  const html = createLoaReviewHtml({ ...hostile, sourcePath: "/tmp/input.json", artifactName: "input.loa.review.html" });
  const bootstrap = html.match(/<script id="hr-loa-bootstrap" type="application\/json">([\s\S]*?)<\/script>/)?.[1];

  assert.ok(bootstrap);
  assert.equal(JSON.parse(bootstrap).loa.title, hostile.loa.title);
  assert.doesNotMatch(html, /<\/script><script>alert/i);
});

test("HTML has no runtime or network dependency", () => {
  const html = createLoaReviewHtml({ ...validInput, sourcePath: "/tmp/input.json", artifactName: "input.loa.review.html" });
  assert.match(html, /id="hr-loa-bootstrap" type="application\/json"/);
  assert.match(html, /id="hr-loa-rail"/);
  assert.match(html, /id="hr-loa-actions"/);
  assert.doesNotMatch(html, /<(?:link|script)[^>]+(?:src|href)=/i);
  assert.doesNotMatch(html, /(?:https?:|fetch\s*\(|import\s*\()/i);
});

test("pure LOA state helpers add, edit, remove, and reorder without mutation", () => {
  const state = { version: 1, loa: validInput.loa, catalog: validInput.catalog };
  const added = addAction(state, { id: "draft", content: "Draft the result", snapIns: [] });
  assert.equal(state.loa.actions.length, 2);
  assert.equal(added.loa.actions.length, 3);

  const edited = editAction(added, "draft", { content: "Draft the final result" });
  assert.equal(edited.loa.actions[2].content, "Draft the final result");
  assert.equal(added.loa.actions[2].content, "Draft the result");

  const reordered = reorderActions(edited, "draft", 0);
  assert.deepEqual(reordered.loa.actions.map(({ id }) => id), ["draft", "research", "ship"]);
  const removed = removeAction(reordered, "research");
  assert.deepEqual(removed.loa.actions.map(({ id }) => id), ["draft", "ship"]);
  assert.deepEqual(moveAction(removed, "ship", "up").loa.actions.map(({ id }) => id), ["ship", "draft"]);
});

test("snap-in helpers support multiple refs and prevent duplicates immutably", () => {
  const state = addAction({ loa: { actions: [] }, catalog: validInput.catalog }, {
    id: "compose", content: "Compose", snapIns: [],
  });
  const withPlugin = addSnapIn(state, "compose", { kind: "plugin", ref: "research", displayName: "Research tools" });
  const withSkill = addSnapIn(withPlugin, "compose", { kind: "skill", ref: "research.web", pluginRef: "research", displayName: "Web research" });
  const duplicate = addSnapIn(withSkill, "compose", { kind: "skill", ref: "research.web", displayName: "Duplicate" });
  assert.equal(withSkill.loa.actions[0].snapIns.length, 2);
  assert.deepEqual(duplicate, withSkill);
  const repeated = [{ kind: "skill", ref: "x" }, { kind: "plugin", ref: "x" }];
  assert.throws(() => addAction(state, { id: "bad", content: "Bad", snapIns: repeated }), /duplicate snap-in ref/i);
  assert.throws(() => editAction(withSkill, "compose", { snapIns: repeated }), /duplicate snap-in ref/i);
  assert.deepEqual(removeSnapIn(withSkill, "compose", "research"), {
    ...withSkill,
    loa: { ...withSkill.loa, actions: [{ ...withSkill.loa.actions[0], snapIns: [withSkill.loa.actions[0].snapIns[1]] }] },
  });
});

test("missing catalog refs remain present and are marked unavailable", () => {
  const state = {
    loa: { actions: [{ id: "x", content: "Do it", snapIns: [{ kind: "skill", ref: "missing.ref" }, { ref: "research", kind: "plugin" }] }] },
    catalog: validInput.catalog,
  };
  const marked = markUnavailableSnapIns(state);
  assert.equal(marked.loa.actions[0].snapIns[0].ref, "missing.ref");
  assert.equal(marked.loa.actions[0].snapIns[0].unavailable, true);
  assert.equal(marked.loa.actions[0].snapIns[1].unavailable, undefined);
  assert.deepEqual(state.loa.actions[0].snapIns[0], { kind: "skill", ref: "missing.ref" });
});

test("generated runtime exposes click addition, editing, removal, and keyboard reorder controls", () => {
  const html = createLoaReviewHtml({ ...validInput, sourcePath: "/tmp/input.json", artifactName: "input.loa.review.html" });
  assert.match(html, /id="hr-loa-client"/);
  assert.match(html, /hr-loa-search/);
  assert.match(html, /data-add-ref/);
  assert.match(html, /data-action-edit/);
  assert.match(html, /data-action-remove/);
  assert.match(html, /data-snap-in-remove/);
  assert.match(html, /data-action-move-up/);
  assert.match(html, /data-action-move-down/);
  assert.match(html, /Save reviewed HTML/);
  assert.match(html, /Save clean LOA JSON/);
});

test("bootstrap serialization is canonical and can be reopened", () => {
  const state = {
    version: 1,
    loa: { actions: [{ id: "x", content: "Do it", snapIns: [{ kind: "skill", ref: "missing.ref" }] }] },
    catalog: validInput.catalog,
    sourcePath: "/tmp/input.json",
    artifactName: "input.loa.review.html",
  };
  const serialized = serializeLoaBootstrap(state, { savedAt: "2026-08-27T00:00:00.000Z" });
  const reopened = JSON.parse(serialized);
  assert.deepEqual(reopened.loa, state.loa);
  assert.deepEqual(reopened.catalog, state.catalog);
  assert.equal(reopened.savedAt, "2026-08-27T00:00:00.000Z");
});

test("embedded runtime supports component attachment, action editing, and keyboard controls", async (t) => {
  let JSDOM;
  try {
    ({ JSDOM } = await import("jsdom"));
  } catch {
    t.skip("jsdom is unavailable");
    return;
  }
  const input = {
    loa: {
      actions: [
        { id: "first", content: "First", snapIns: [{ kind: "skill", ref: "missing.ref" }] },
        { id: "second", content: "Second", snapIns: [] },
        { id: "third", content: "Third", snapIns: [] },
      ],
    },
    catalog: [{ category: "Tools", plugins: [{ ref: "plugin", displayName: "Plugin", skills: [{ ref: "skill", displayName: "Skill" }] }] }],
  };
  const dom = new JSDOM(createLoaReviewHtml(input), { runScripts: "dangerously", url: "file:///tmp/loa.html" });
  const cards = () => [...dom.window.document.querySelectorAll("[data-action-id]")];
  assert.match(cards()[0].textContent, /missing\.ref.*unavailable/);
  const skill = dom.window.document.querySelector('[data-add-ref="skill"]');
  assert.ok(skill);
  skill.click();
  skill.click();
  assert.equal(cards()[0].querySelectorAll(".hr-loa-snap-in").length, 2);
  cards()[0].querySelector("[data-action-edit]").click();
  cards()[0].querySelector("[data-edit-input]").value = "Updated";
  cards()[0].querySelector("[data-edit-save]").click();
  assert.match(cards()[0].textContent, /Updated/);
  cards()[0].querySelector("[data-action-move-down]").click();
  assert.deepEqual(cards().map((card) => card.dataset.actionId), ["second", "first", "third"]);
});

test("component rail exposes leaf skills only and plugin groups collapse independently", async (t) => {
  let JSDOM;
  try {
    ({ JSDOM } = await import("jsdom"));
  } catch {
    t.skip("jsdom is unavailable");
    return;
  }
  const input = {
    loa: { actions: [{ id: "compose", content: "Compose", snapIns: [] }] },
    catalog: [{
      category: "Developer Tools",
      plugins: [{
        ref: "github",
        displayName: "GitHub",
        skills: [
          { ref: "skills://plugins/github/github", displayName: "github" },
          { ref: "skills://plugins/github/yeet", displayName: "yeet" },
        ],
      }],
    }],
  };
  const dom = new JSDOM(createLoaReviewHtml(input), { runScripts: "dangerously", url: "file:///tmp/loa.html" });
  const doc = dom.window.document;

  assert.equal(doc.querySelector('[data-add-ref="github"]'), null);
  assert.equal(doc.querySelectorAll("[data-add-ref]").length, 2);
  const toggle = doc.querySelector('[data-plugin-toggle="github"]');
  assert.ok(toggle);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");

  doc.querySelector('[data-add-ref="skills://plugins/github/yeet"]').click();
  const bootstrap = JSON.parse(doc.getElementById("hr-loa-bootstrap").textContent);
  assert.deepEqual(bootstrap.loa.actions[0].snapIns, [{
    kind: "skill",
    ref: "skills://plugins/github/yeet",
    pluginRef: "github",
    displayName: "yeet",
  }]);

  toggle.click();
  const collapsedToggle = doc.querySelector('[data-plugin-toggle="github"]');
  assert.equal(collapsedToggle.getAttribute("aria-expanded"), "false");
  assert.ok(doc.querySelector('[data-plugin-skills="github"]').hidden);

  collapsedToggle.click();
  assert.equal(doc.querySelector('[data-plugin-toggle="github"]').getAttribute("aria-expanded"), "true");
  assert.equal(doc.querySelector('[data-plugin-skills="github"]').hidden, false);
});

test("generator auto-populates a missing catalog before rendering the component rail", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-loa-auto-catalog-"));
  const inputPath = path.join(dir, "auto.json");
  const outputPath = path.join(dir, "auto.review.html");
  fs.writeFileSync(inputPath, JSON.stringify({ loa: { title: "Auto catalog", actions: [{ id: "x", content: "Do it", snapIns: [] }] } }));

  await generateLoaArtifact(inputPath, outputPath, { discoverCatalog: () => validInput.catalog });
  const html = fs.readFileSync(outputPath, "utf8");
  const bootstrap = html.match(/<script id="hr-loa-bootstrap" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  assert.deepEqual(JSON.parse(bootstrap).catalog, validInput.catalog);
  assert.match(html, /Research tools/);
});

test("generator preserves an explicitly supplied catalog instead of replacing it", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-loa-manual-catalog-"));
  const inputPath = path.join(dir, "manual.json");
  fs.writeFileSync(inputPath, JSON.stringify(validInput));
  let discoveryCalls = 0;

  await generateLoaArtifact(inputPath, undefined, { discoverCatalog: () => {
    discoveryCalls += 1;
    return [];
  } });

  assert.equal(discoveryCalls, 0);
});
