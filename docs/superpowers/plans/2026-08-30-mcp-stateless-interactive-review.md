# MCP Stateless Transport + Interactive Review UI Plan

**Goal:** Modernize Human Review's MCP boundary for the 2026-07-28 stateless protocol while evaluating an additive interactive review UI that preserves explicit human approval.

**Sources:** X saved items `2093632264408273011`, `1975912452287238464`, and `1973792590647681479`; authoritative requirements come from the MCP 2026-07-28 specification, not the social posts.

## Verified protocol facts

The 2026-07-28 MCP specification removes protocol-level sessions and the `Mcp-Session-Id` header, removes the `initialize` / `notifications/initialized` handshake, carries protocol/client capability metadata on each request, adds `server/discover`, and moves cross-call application state to explicit handles passed through normal arguments.

## User-visible outcome

Human Review remains usable by modern stateless MCP clients, durable review state is explicit and recoverable, and clients that support interactive MCP/App UI can render one review artifact without changing the underlying approval contract.

## Slice 1 — protocol compatibility audit

**Allowed evidence:** current MCP server/client code, protocol fixtures, official 2026-07-28 spec, intentionally supported legacy-client contracts.

**Output:** an inventory of session/initialize/header assumptions plus the smallest compatibility patch plan.

**Acceptance criteria:**
- no durable review state depends on an invisible transport session;
- 2026-07-28 version/capability metadata is validated per request;
- `server/discover` behavior is defined where this repository owns the server boundary;
- any legacy compatibility path is explicit, bounded, and tested;
- application continuity uses typed explicit handles when needed.

**Affected surfaces:** MCP transport/adapter code, protocol fixtures/tests, operator/API docs.

**Verification:** focused protocol contract tests, existing local test/lint/type gates, direct client/server smoke where applicable; no GitHub Actions as authority.

## Slice 2 — interactive review artifact prototype

**Allowed evidence:** one existing canonical Human Review artifact/action contract plus the current plugin/App UI integration surface.

**Output:** one interactive review rendering that is strictly additive to the structured artifact.

**Acceptance criteria:**
- UI cannot approve, reject, or mutate outside existing explicit action contracts;
- clients without rich UI receive the same structured review artifact;
- interaction state does not become the source of truth for review state;
- accessibility and keyboard behavior are verified for the interactive surface;
- no second task/review storage layer is introduced.

**Affected surfaces:** MCP/App resource presentation, review artifact renderer, focused UI tests/docs.

**Dependencies / blockers:** complete Slice 1 audit first; confirm the exact current Human Review MCP/App surface before choosing implementation files.

## Out of scope

- Replacing the review state machine.
- Weakening approval gates.
- Adding a new persistence service.
- Treating the social posts as protocol authority.
- Unrelated Human Review UI redesign.
