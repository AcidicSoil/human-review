# LOA Component Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development while implementing and superpowers:verification-before-completion before completion claims.

**Goal:** Add a third Human Review mode that turns a structured List of Actions plus a plugin/skill catalog into a self-contained, offline, directly editable LOA composition artifact.

**Architecture:** Keep LOA review separate from ordinary DOM review and Plate planning review. Add `src/loa-review/` with a JSON-driven generator and vanilla browser runtime embedded into each artifact. Reuse setup/install conventions so the installed skill carries the generator/runtime locally.

**Tech Stack:** Node.js ESM, vanilla browser HTML/CSS/JavaScript, existing Node test runner + jsdom.

**Spec:** Approved Component Rail prototype and conversation requirements on 2026-08-26.

## Global Constraints

- UI is two columns: categorized component rail + ordered action list.
- Rail hierarchy is category -> plugin -> nested skills; plugins and skills are draggable.
- Dropping a component anywhere on an action adds it.
- Actions use unbounded `snapIns[]`; exact duplicate refs on one action are rejected.
- Actions reorder by dragging the action card itself; accessible move controls remain available.
- The artifact never installs or executes plugins/skills.
- Existing snap-in refs missing from the current catalog are preserved and shown unavailable.
- The complete canonical LOA is the review result; do not persist an event log.
- No branching, execution engine, semantic compatibility, or workflow graph scope.

---
### Task 1: LOA artifact contract and generator

**Files:**
- Create: `src/loa-review/generator.js`
- Create: `src/loa-review/artifact.js`
- Create: `test/loa-review.test.js`

**Interfaces:**
- Input JSON: `{ loa, catalog }` where `loa.actions[]` contains stable `id`, `content`, and `snapIns[]` references.
- Catalog: `[{ category, plugins: [{ ref, displayName, skills: [{ ref, displayName }] }] }]`.
- Bootstrap: `<script id="hr-loa-bootstrap" type="application/json">...</script>`.
- CLI: `human-review-loa <input.json> [output.loa.review.html]`.

- [ ] Write failing tests for JSON validation, unique action IDs, default output path, embedded bootstrap, and offline/self-contained HTML.
- [ ] Run `node --test test/loa-review.test.js` and confirm RED failures are feature-missing failures.
- [ ] Implement minimal generator and CLI until the tests pass.
- [ ] Re-run the targeted test file.

### Task 2: Browser composition runtime

**Files:**
- Create: `src/loa-review/client.js`
- Extend: `test/loa-review.test.js`

- [ ] Write failing jsdom tests for add/remove/edit actions, multiple snap-ins, duplicate prevention, missing-ref preservation, click-to-add for accessibility, and reorder controls.
- [ ] Add the self-contained Component Rail runtime and whole-card drag/drop handlers.
- [ ] Verify generated artifacts contain no remote scripts/styles/fetches and reopen from bootstrap state.
### Task 3: Human Review integration

**Files:**
- Modify: `package.json`
- Modify: `src/setup.js`
- Modify: `src/SKILL.md`
- Modify: `README.md`
- Modify: setup tests where needed.

- [ ] Write failing tests that setup installs a local LOA generator/runtime and rewrites skill instructions to the installed command.
- [ ] Add `human-review-loa` to package bins.
- [ ] Extend setup to copy the LOA runtime into each installed Human Review skill and emit a local runner.
- [ ] Document LOA review as the third review mode and document how agents consume reviewed bootstrap state.
- [ ] Run targeted setup + LOA tests.

### Task 4: Verification and review

- [ ] Run `npm test`.
- [ ] Run `npm run build:plate-review` to prove existing planning packaging still builds.
- [ ] Generate a fixture LOA artifact and inspect it for the approved rail/action behavior.
- [ ] Verify keyboard move controls, focus visibility, mobile reflow, whole-card action dragging, and whole-card component drop targets.
- [ ] Inspect `git diff` for unrelated changes.
- [ ] Run a code-review pass against this plan and the approved prototype behavior.
- [ ] Commit the local feature branch only after verification passes.

## Done When

- LOA review is independently invokable through `human-review-loa`.
- Generated artifacts work from `file://` without network/runtime dependencies.
- `snapIns[]` is unbounded, duplicate-safe, and preserves unavailable references.
- Component rail renders category -> plugin -> skills and supports drag or click addition.
- Action cards are the reorder grab surface and component drop surface.
- Full canonical LOA can be saved as stateful reviewed HTML and clean LOA JSON.
- Existing ordinary and planning review behavior remains green.