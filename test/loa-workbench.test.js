import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createLoaReviewHtml } from "../src/loa-review/generator.js";

const actions = Array.from({ length: 145 }, (_, i) => ({
  id: `task-${String(i + 1).padStart(3, "0")}`,
  content: `Complete action ${i + 1}: independently review the source artifacts and outcomes.`,
  snapIns: [],
}));
const catalog = [{
  category: "Available integrations",
  plugins: Array.from({ length: 45 }, (_, i) => ({
    ref: `plugin-${i}`,
    displayName: `Plugin ${i + 1}`,
    skills: Array.from({ length: i < 12 ? 9 : 8 }, (_, j) => ({
      ref: `skills://plugins/plugin-${i}/skill-${j}`,
      displayName: `Skill ${j + 1}`,
    })),
  })),
}];

test("LOA workbench keeps 145 actions navigable and 372 skills collapsed until requested", () => {
  const dom = new JSDOM(createLoaReviewHtml({ loa: { title: "Production launch", actions }, catalog }), {
    runScripts: "dangerously", url: "file:///tmp/production.loa.review.html",
  });
  try {
    const doc = dom.window.document;
    assert.ok(doc.querySelector("#hr-loa-outline"), "left action outline");
    assert.ok(doc.querySelector("#hr-loa-actions"), "main action editor");
    assert.ok(doc.querySelector("#hr-loa-rail"), "right catalog inspector");
    assert.equal(doc.querySelectorAll("[data-outline-action]").length, 145);
    assert.equal(doc.querySelectorAll("[data-action-id]").length, 145);
    assert.equal(doc.querySelectorAll(".hr-loa-action[data-expanded=true]").length, 1);
    assert.equal(doc.querySelectorAll("[data-plugin-toggle]").length, 45);
    assert.equal(doc.querySelectorAll(".hr-loa-plugin-toggle[aria-expanded=true]").length, 0,
      "large catalog should not expand all skills by default");
    assert.match(doc.querySelector(".hr-loa-count").textContent, /145/);

    doc.querySelector('[data-outline-action="task-145"]').click();
    assert.equal(doc.querySelector(".hr-loa-action[aria-selected=true]").dataset.actionId, "task-145");
    assert.match(doc.querySelector(".hr-loa-action[aria-selected=true]").textContent, /Complete action 145/);
    const search = doc.querySelector("#hr-loa-action-search");
    search.value = "action 124";
    search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.equal(doc.querySelectorAll("[data-outline-action]").length, 1);
    assert.equal(doc.querySelectorAll("[data-action-id]").length, 145, "filtering is navigation only; preserve all actions");

    const toggle = doc.querySelector('[data-plugin-toggle="plugin-0"]');
    toggle.click();
    assert.equal(doc.querySelector('[data-plugin-toggle="plugin-0"]').getAttribute("aria-expanded"), "true");
    assert.equal(doc.querySelectorAll('[data-plugin-skills="plugin-0"] [data-add-ref]').length, 9);
    doc.querySelector('[data-plugin-skills="plugin-0"] [data-add-ref]').click();
    assert.equal(JSON.parse(doc.querySelector("#hr-loa-bootstrap").textContent).loa.actions[144].snapIns.length, 1);
    assert.equal(doc.querySelectorAll("[data-outline-action]").length, 1,
      "search and selection persist after attaching a skill");
  } finally { dom.window.close(); }
});
