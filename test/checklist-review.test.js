import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
  createChecklistReviewHtml,
  generateChecklistArtifact,
  readChecklistSelections,
  validateChecklistInput,
} from "../src/checklist-review/generator.js";

const techStack = {
  title: "Tech stack decisions",
  description: "Select every technology to include.",
  groups: [
    { id: "frontend", title: "Frontend", items: [
      { id: "react", label: "React", description: "UI rendering", checked: true },
      { id: "vue", label: "Vue" },
    ] },
    { id: "storage", title: "Database", items: [
      { id: "postgres", label: "PostgreSQL" },
    ] },
  ],
};

test("checklist validates grouped options and stable IDs", () => {
  assert.deepEqual(validateChecklistInput(techStack), techStack);
  assert.throws(() => validateChecklistInput({ ...techStack, groups: [
    techStack.groups[0], { id: "other", title: "Other", items: [
      { id: "react", label: "Duplicated" },
    ] },
  ] }), /duplicate/i);
  assert.throws(() => validateChecklistInput({
    title: "Unsafe", groups: [{ id: "frontend", title: "Frontend", items: [
      { id: "bad path", label: "Bad" },
    ] }],
  }), /id/i);
});

test("checklist HTML uses native labeled checkboxes, distinct layout, and safe text", () => {
  const html = createChecklistReviewHtml(techStack);
  assert.match(html, /<fieldset/);
  assert.match(html, /<legend>Frontend<\/legend>/);
  assert.match(html, /data-hr-choice="react"/);
  assert.match(html, /<input[^>]*data-hr-choice="react"[^>]*checked/);
  assert.match(html, /<label[^>]*>[\s\S]*<input[^>]*type="checkbox"/);
  assert.match(html, /id="hr-checklist-manifest"/);
  assert.match(html, /Check all that apply/);

  const doc = new JSDOM(html).window.document;
  const item = doc.querySelector("#hr-choice-react");
  assert.ok(item, "each choice needs a stable comment anchor");
  assert.equal(item.dataset.hrAnnotatable, "React");
  const comment = item.querySelector("button[data-hr-annotate]");
  assert.equal(comment?.type, "button");
  assert.equal(comment?.getAttribute("aria-label"), "Comment on React");
  assert.equal(comment.closest("label"), null, "comment button must not toggle checkbox");
  assert.ok(doc.querySelector("#hr-group-frontend button[data-hr-annotate]"),
    "group comments reuse the same annotation action");
  assert.equal(html.includes("human-review-editor"), false, "uses existing DOM autosave protocol");
  const escaped = createChecklistReviewHtml({
    title: "<img src=x>", groups: [{ id: "safe", title: "<b>Group</b>",
      items: [{ id: "item", label: "<script>bad</script>" }] }],
  });
  assert.doesNotMatch(escaped, /<script>bad<\/script>|<b>Group<\/b>|<img src=x>/);
});

test("reviewed checkbox selections recover canonical identifiers without changing source input", () => {
  const html = createChecklistReviewHtml(techStack);
  const initial = readChecklistSelections(html);
  assert.deepEqual(initial.selectedIds, ["react"]);
  assert.deepEqual(initial.selections, [
    { id: "react", label: "React", groupId: "frontend", group: "Frontend" },
  ]);
  const reviewed = html.replace(/(data-hr-choice="react"[^>]*?) checked/, "$1")
    .replace(/(data-hr-choice="postgres"[^>]*?)(>)/, '$1 checked$2');
  const selections = readChecklistSelections(reviewed);
  assert.deepEqual(selections.selectedIds, ["postgres"]);
  assert.deepEqual(selections.selections, [
    { id: "postgres", label: "PostgreSQL", groupId: "storage", group: "Database" },
  ]);
  assert.deepEqual(techStack.groups[0].items[0].checked, true);
});

test("checklist command generates offline HTML and extracts selected choices as JSON", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hr-checklist-"));
  try {
    const input = path.join(dir, "technologies.json");
    const output = path.join(dir, "technologies.checklist.review.html");
    fs.writeFileSync(input, JSON.stringify(techStack));
    const result = await generateChecklistArtifact(input, output);
    assert.equal(result.output, output);
    const html = fs.readFileSync(output, "utf8");
    assert.equal(readChecklistSelections(html).selectedIds[0], "react");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("native checkbox changes survive the existing DOM autosave serialization", async () => {
  const { JSDOM } = await import("jsdom");
  const { serializeDocument } = await import("../src/serialize.js");
  const { detectReviewMode } = await import("../src/review-modes.js");
  const html = createChecklistReviewHtml(techStack);
  assert.equal(detectReviewMode(html), "dom");
  const dom = new JSDOM(html);
  try {
    const react = dom.window.document.querySelector('[data-hr-choice="react"]');
    const postgres = dom.window.document.querySelector('[data-hr-choice="postgres"]');
    react.checked = false;
    postgres.checked = true;
    const saved = serializeDocument(dom.window.document);
    assert.deepEqual(readChecklistSelections(saved).selectedIds, ["postgres"]);
  } finally {
    dom.window.close();
  }
});

test("installed checklist runner works independently of the source checkout", async () => {
  const { installSkills } = await import("../src/setup.js");
  const { spawnSync } = await import("node:child_process");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "hr-checklist-standalone-"));
  try {
    installSkills(home, { global: true, home });
    const runner = path.join(home, ".agents/skills/human-review/human-review-checklist.mjs");
    const input = path.join(home, "choices.json");
    const artifact = path.join(home, "selection.review.html");
    fs.writeFileSync(input, JSON.stringify(techStack));
    const generate = spawnSync(process.execPath, [runner, input, artifact, "--no-open"], {
      encoding: "utf8", cwd: home, env: { ...process.env, NODE_PATH: "" },
    });
    assert.equal(generate.status, 0, generate.stderr);
    assert.ok(fs.existsSync(artifact));
    const extracted = spawnSync(process.execPath, [runner, "--extract", artifact], {
      encoding: "utf8", cwd: home, env: { ...process.env, NODE_PATH: "" },
    });
    assert.equal(extracted.status, 0, extracted.stderr);
    assert.deepEqual(JSON.parse(extracted.stdout).selectedIds, ["react"]);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("checklist group and option annotations reach the agent alongside choices", async () => {
  const { once } = await import("node:events");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hr-annotate-feedback-"));
  const previousState = process.env.HUMAN_REVIEW_STATE_DIR;
  process.env.HUMAN_REVIEW_STATE_DIR = path.join(root, "state");
  const { createServer } = await import("../src/server.js");
  const file = path.join(root, "stack.review.html");
  fs.writeFileSync(file, createChecklistReviewHtml(techStack));
  const app = createServer();
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const port = app.server.address().port;
  const request = async (route, method = "GET", body) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method,
      headers: { "x-human-review-token": app.token, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal(response.ok, true, `Unexpected status ${response.status}`);
    return response.json();
  };
  try {
    const session = await request("/api/session", "POST", { target: file });
    for (const [selector, quote, feedback] of [
      ["#hr-group-frontend", "Frontend", "Keep the frontend minimal."],
      ["#hr-choice-react", "React", "Select only if the design needs it."],
    ]) {
      await request(`/api/page/${session.key}/comment`, "POST", {
        kind: "element", quote, anchor: { selector, label: quote }, feedback,
      });
    }
    await request(`/api/page/${session.key}/send`, "POST",
      { sessionId: session.sessionId, note: "" });
    const batch = await request(`/api/poll?target=${encodeURIComponent(file)}`);
    assert.equal(batch.status, "feedback");
    assert.deepEqual(batch.pages[0].comments.map(item => item.anchor.selector),
      ["#hr-group-frontend", "#hr-choice-react"]);
    assert.deepEqual(readChecklistSelections(fs.readFileSync(file, "utf8")).selectedIds,
      ["react"], "adding comments does not alter the selected options");
  } finally {
    const closed = once(app.server, "close");
    app.dispose();
    await closed;
    if (previousState === undefined) delete process.env.HUMAN_REVIEW_STATE_DIR;
    else process.env.HUMAN_REVIEW_STATE_DIR = previousState;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
