# Unified Human Review: shared review core

Status: Proposed specification, approved architecture, implementation pending review
Date: 2026-10-29
Repository: `/home/user/tools/human-review`
Related prototypes: `design-ref/human-review-ui-concepts.figcraft` (visual exploration, not approved implementation)

## Decision and outcome

Keep one Human Review session, feedback, persistence, polling, and acknowledgment system. DOM, LOA, and Planning are editors attached to it through versioned, mode-specific adapters. They do **not** inherit one another's DOM implementation.

A reviewer can open a generated LOA or Planning artifact through the existing Human Review command, edit its native content, attach anchored comments, send a batch to an agent, see acknowledgment and reload, and continue reviewing. Existing standalone exports remain usable offline. The original DOM review behavior does not regress.

This is a product and architecture specification, not authorization to implement.

## Baseline verified in the fork

- `src/server.js` owns the local HTTP server, session registration, browser event stream, feedback collection, agent long-poll, acknowledgment, source watching, and reloads.
- `src/state.js` owns durable DOM review edits/comments and pending feedback batches.
- `src/chrome.html` and `src/chrome-client.js` own the browser session shell, feedback sidebar, Send, End review, and agent status.
- `src/sdk.js` owns DOM-specific interactions inside the sandboxed reviewed page.
- `src/loa-review/generator.js` creates a self-contained LOA HTML editor with `human-review-editor=loa`, state bootstrap, and bundled client code. `src/loa-review/runtime.js` owns action/skill changes, component discovery, and reviewed-HTML/JSON export.
- `src/plate-review/` owns the rich Planning editor, fallback, section navigation, comments, and exports.
- `src/server.js` currently injects the generic DOM SDK into all HTML artifacts at the `/artifact/` route. Serving a LOA file through that route does not by itself turn LOA's internal state into agent feedback.
- `human-review <file>`, `human-review poll <target> --ack`, `human-review-loa`, and `human-review-plan` are existing entry points.
- The existing 145-action, 372-skill negative reference demonstrates that full expansion is not acceptable at scale. Neither FigCraft LOA concept has received visual approval.

Evidence: `src/server.js`, `src/state.js`, `src/chrome.html`, `src/chrome-client.js`, `src/sdk.js`, `src/loa-review/{generator,runtime,state}.js`, `src/plate-review/`, `README.md`, and `test/{agent-loop,poll-handoff,loa-review,plate-review}.test.js`.

## Goals

1. Preserve the upstream-style DOM live review experience and CLI/JSON compatibility.
2. Give LOA and Planning the original session lifecycle: feedback, comments, Send, agent polling/acknowledgment, reload, outstanding feedback, End review, and recovery.
3. Keep native editing semantics. LOA owns stable action IDs, ordering, plugin and skill refs, and canonical LOA JSON. Planning owns rich text, sections, and discussions. DOM owns arbitrary page editing.
4. Support both server-attached live review and standalone offline HTML without requiring a network connection in the latter.
5. Allow another specialized editor to register a well-defined adapter, without creating another server or feedback engine.
6. Keep large reviews operable with search, collapsible groups, focused inspectors, and bounded visible action lists.

## Non-goals

- A new universal document editor, React rewrite, or migration away from Plate.
- Executing or installing attached LOA plugins/skills.
- Forcing LOA `content` strings through generic DOM mutation and HTML autosave.
- Adding image resize, arbitrary inline HTML, or link editing to plain-text LOA fields without separately changing the LOA schema.
- Changing original DOM session behavior or making FigCraft prototypes automatically authoritative.
- Server-side automatic edits of arbitrary `sourcePath` values embedded in generated artifacts.

## User journey and states

### Live LOA

1. Agent generates `plan.loa.review.html` from a valid LOA source with `human-review-loa`.
2. Agent opens the generated HTML through `human-review <generated-file>` and starts `human-review poll <generated-file>`. The server recognizes the embedded LOA review marker and validates the document before enabling its adapter.
3. Reviewer edits action text, adds/removes/reorders actions, attaches/detaches skills, filters the catalog, and adds comments anchored to stable action IDs. An overall note stays available.
4. Local review state persists as a draft. Changes are not silently written back to canonical LOA JSON or converted into DOM edits.
5. **Send** submits a canonical LOA snapshot plus review comments and general note. The agent receives one review batch on the existing long-poll endpoint.
6. Agent applies the reviewed LOA to the actual source, regenerates the review artifact when appropriate, and polls with `--ack`. The reviewer sees acknowledged status and updated content.
7. If the agent has no active poller, the UI reports the feedback as waiting and exposes the existing handoff guidance. On reconnection the same batch is delivered, not duplicated.
8. **End review** releases waiting polls. Unsent changes remain recoverable on reopening, subject to the current retention policy.

### Live Planning

The same lifecycle applies to a generated Planning artifact. Editing remains in Plate (or its embedded fallback). Comments remain section-anchored and retain existing reply/resolve semantics. **Save reviewed HTML** and **Save PRD** remain available.

### Offline

Opening the same generated artifact with `file://` uses its embedded editor and local export. Server-only controls are absent or disabled with a clear unavailable state. `Save reviewed HTML`, clean LOA JSON, and Planning exports continue to work. No API request, CDN, or server is required to load or edit it.

### Failure and recovery

- **Agent absent:** Feedback is queued and the user sees the current stranded/queued state.
- **Agent crashes after delivery:** The batch stays available until acknowledgment, matching current polling semantics.
- **Page reload:** Restore the latest unsent structured draft, anchored comments, and selection when safe.
- **Source changed while reviewer edits:** Detect a mismatch in base revision. Preserve both states and require an explicit keep-local/reload-current decision. Do not overwrite either silently.
- **Deleted action with comments:** Preserve comments as unresolved/orphaned until the user reattaches or removes them.
- **Unknown skill:** Keep its reference and show it as unavailable, matching current LOA behavior.
- **Export unavailable:** Preserve in-memory state and present an error; do not claim that the file was saved.
- **Session expired or tab closed:** Preserve pending feedback and release pollers as the original session contract prescribes.

## Chosen architectural shape

### Existing owner stays authoritative

`src/server.js` remains the owner of session lifetime, pollers, batch delivery, acknowledgment, and event streams. `src/state.js` remains the owner of persisted drafts, comments, and pending batches. No second queue, event log, or server is introduced.

The existing `src/chrome-client.js` and `src/chrome.html` remain the live review shell. They render shared feedback, agent status, Send, and End review. Mode adapters render the editor within the existing sandboxed artifact frame.

### Proposed modules and responsibilities

| Path | Status | Responsibility |
| --- | --- | --- |
| `src/review-modes.js` | Proposed | Mode registry and validated mode detection from generated artifacts |
| `src/review-protocol.js` | Proposed | Versioned structured review messages and payload validation at the frame/server boundary |
| `src/server.js` | Existing, modify | Select adapter when serving an artifact; persist and batch structured review changes |
| `src/state.js` | Existing, modify | Store structured drafts/comments and revision metadata under existing target identity |
| `src/chrome-client.js` | Existing, modify | Route structured messages into feedback/session UI; preserve original DOM path |
| `src/chrome.html` | Existing, modify only if required | Shared controls; no duplicate LOA-specific Send UI |
| `src/loa-review/runtime.js` | Existing, modify | Emit canonical LOA changes through an optional host adapter; keep offline export |
| `src/loa-review/host-bridge.js` | Proposed | Sandboxed LOA-to-parent messages, enabled only under a valid live host handshake |
| `src/loa-review/generator.js` | Existing, modify | Embed the optional host bridge without requiring external scripts |
| `src/plate-review/host-bridge.js` | Proposed | Planning state and discussion integration with the shared host |
| `src/plate-review/generator.js` | Existing, modify | Embed the optional Planning bridge; preserve offline fallback |
| `src/sdk.js` | Existing, preserve | Original DOM editor, not the structured-mode state owner |

A mode registry describes supported capabilities; avoid inheritance chains or per-mode copies of the server. Register only the three existing modes initially.

### Proposed domain contract

```ts
type ReviewMode = "dom" | "loa" | "planning";

type ReviewAnchor =
  | { mode: "dom"; target: string; quote?: string }
  | { mode: "loa"; actionId: string }
  | { mode: "planning"; sectionId: string; discussionId?: string };

type StructuredSnapshot =
  | { format: "human-review.snapshot/v1"; mode: "loa"; revision: number; baseHash: string; document: { loa: unknown; catalog: unknown } }
  | { format: "human-review.snapshot/v1"; mode: "planning"; revision: number; baseHash: string; document: unknown };

type ReviewModeAdapter = {
  mode: ReviewMode;
  capabilities: readonly string[];
  readSnapshot(): StructuredSnapshot | null;
  restoreSnapshot(snapshot: StructuredSnapshot): void;
  resolveAnchor(anchor: ReviewAnchor): boolean;
};
```

These are proposed interface sketches, not implemented types. LOA's document branch must use the existing validated `{ loa, catalog }` contract. Planning's document branch must use the existing Plate/fallback serialization, rather than a generic HTML conversion. The revision number belongs to one target's working draft and advances only after an accepted edit.

A structured batch extends the existing `status: "feedback"` response with a versioned, optional `structured_review` item on the reviewed page. Legacy DOM `pages[].comments` and `pages[].edits` remain unchanged. A structured entry contains the mode, base/source revision, complete canonical snapshot, anchored review comments, and a reviewed document ID. The agent's existing `--ack` acknowledges that submission as part of the same batch. It does not acknowledge newer unsent edits.

Do not persist a separate event log: persist the current draft and the existing pending batch. A complete snapshot is the handoff contract so agents do not have to reconstruct a LOA from UI event history.

### Trust and compatibility boundaries

- The parent browser session alone holds the server API credential. An editor iframe must not receive that credential.
- The iframe is sandboxed; its origin may be opaque. The parent checks `event.source`, expected message type/version, handshake nonce, and known target/session before accepting edits. Do not enable `allow-same-origin` merely to simplify messaging.
- Validate mode metadata and snapshot input once at server boundaries. A malicious file or user-supplied `sourcePath` does not grant disk-write authority.
- In DOM mode, retain the existing `injectSdk` behavior. In recognized structured modes, do not mount the generic DOM editor on top of native editor controls.
- Keep the existing CLI commands, baseline JSON feedback fields, offline artifact formats, keyboard controls, and DOM source-save semantics.
- Batches must remain idempotent under disconnects, duplicate Send, multiple browser windows, and repeated polls. Match current single-poller and acknowledgment behavior rather than introducing a second coordinator.
- Version the structured feedback envelope and adapter interface independently of the package version. Reject unsupported major versions with a readable error; do not reinterpret unknown data.

## Delivery sequence

### Milestone 1. Characterize the existing behavior

Add focused compatibility tests that exercise real DOM polling, Send, outstanding feedback, acknowledgment, reopen, and source autosave, plus offline LOA and Planning exports. Confirm existing expected output shapes before changing production code.

### Milestone 2. Add mode detection and structured submission

Add registry and protocol helpers. Route recognized LOA and Planning artifacts through the shared shell without the generic DOM editor. Extend the existing state and batch owner to accept versioned structured drafts and comments. Verify the original DOM test contract remains identical.

### Milestone 3. Connect LOA

Keep action/snap-in logic in the existing LOA runtime. Add host handshake, change notifications, action-anchored comments, overall notes, Send, recovery, acknowledgment, and generated-artifact reload. Keep the standalone `file://` editor and both exports. Verify malformed/unavailable refs and 145-action data.

### Milestone 4. Connect Planning

Attach Plate and fallback state to the same review session contract. Preserve selection, sections, discussions, replies, resolved state, PRD export, and reviewed-HTML export. Test live and offline modes independently.

### Milestone 5. Visual integration and release checks

After a separate UI review, revise FigCraft LOA concepts with complete functionality and realistic volumes, then adopt approved layout changes. Validate keyboard/focus behavior, contrast, narrow screens, large catalogs, server restarts, and cross-mode regressions. Update README, skill instructions, CLI help only where behavior changes.

## Acceptance and impact-scoped verification

Run only tests covering changed code and its direct consumers during development. Expand scope for failures or dependency changes. Candidate tests and expected outcomes:

| Scope | Focused command | Expected result |
| --- | --- | --- |
| Original send/poll | `node --test test/agent-loop.test.js test/poll-handoff.test.js` | Existing DOM feedback and acknowledgment remain intact |
| LOA contracts | `node --test test/loa-review.test.js` | Stable IDs, edits, skills, offline export still work |
| Planning contracts | `node --test test/plate-review.test.js` | Plate/fallback sections, comments and exports remain intact |
| Proposed adapter integration | `node --test test/review-modes.test.js test/structured-review.test.js` | Live LOA/Planning handshake, batch, ack, draft persistence, conflict protection |
| Boundary behavior | `node --test test/security.test.js test/lifecycle.test.js test/concurrent.test.js` | Isolation, invalid messages, closure, and in-flight behavior preserved |
| Release packaging | `node --test test/setup.test.js test/plugin-skills.test.js` | Installed generators and skills still produce self-contained artifacts |

The new test filenames are **proposed** and must be created with the milestones. Run rendered-browser checks against a real session before claiming functional parity. Include a 145-action fixture, at least 372 catalog skill entries, long text, missing skill refs, many comments, and a narrow viewport. Record baseline metrics and verify that the new view does not generate a single 40,000px fully expanded primary document by default.

Definition of done: DOM regression checks pass; LOA and Planning both complete edit -> comment -> Send -> agent poll -> apply -> ack -> updated review; offline output works; pending edits survive reload; stale source conflicts never silently overwrite content; release docs match actual commands.

## Alternative designs considered

1. **Chosen:** One session/feedback core and typed mode adapters. Reuses the tested queue and keeps mode-specific editors independent.
2. **Keep separate review servers:** Smaller immediate change, but duplicates Send, polling, persistence, crash recovery, and security across three modes.
3. **Make every editor a generic DOM SDK document:** Reuses the editor surface but loses canonical LOA action identities, native Planning document semantics, and durable typed exports.

## Risks and gates

- **Semantic mismatch:** The original DOM page store is not the LOA document store. Preserve separate structured document data under one session owner.
- **Sandbox messaging:** Parent/iframe communication needs explicit checks without weakening iframe isolation.
- **Concurrent authoring:** Acks and reloads cannot discard edits made after Send. Record base revisions and handle conflicts visibly.
- **Large LOAs:** A compact, indexed view must not hide actions or silently truncate exports.
- **Standards:** Read-only preflight reported missing `.design/standards.json` and `DESIGN.md`. This checkout is outside the approved auto-creation root. Do not create either without a specific approval for this project and these files.
- **Visual direction:** The FigCraft concepts were exploratory. Neither LOA layout is approved for production; functional parity comes before visual changes.
- **Review gate:** Approval of this architecture authorizes the specification. Obtain approval of the completed specification and its UI composition before implementing production changes.
