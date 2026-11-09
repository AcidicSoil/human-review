/**
 * Tracks open Notepad browser windows per workspace.
 *
 * A browser's authenticated streaming connection is its live registration.
 * Launch reservations cover the short interval before the first connection,
 * so simultaneous CLI invocations don't each open a window.
 *
 * This does not own Human Review's session or feedback state.
 */
export function createNotepadWindowRegistry({ now = Date.now, launchGraceMs = 20000 } = {}) {
  const connections = new Map();
  const launching = new Map();

  function connect(scope, response) {
    let active = connections.get(scope);
    if (!active) {
      active = new Set();
      connections.set(scope, active);
    }
    active.add(response);
    launching.delete(scope);

    response.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    response.write('{"event":"ready"}\n');

    const heartbeat = setInterval(() => response.write("\n"), 15000);
    heartbeat.unref();

    response.on("close", () => {
      clearInterval(heartbeat);
      active.delete(response);
      if (active.size === 0) connections.delete(scope);
    });
  }

  function activate(scope) {
    const active = connections.get(scope);
    if (active?.size) {
      active.values().next().value.write('{"event":"focus"}\n');
      return { action: "reused" };
    }
    if ((launching.get(scope) || 0) > now()) return { action: "opening" };
    launching.set(scope, now() + launchGraceMs);
    return { action: "launch" };
  }

  function hasOpenWindows() {
    return connections.size > 0;
  }

  function close() {
    for (const active of connections.values()) {
      for (const response of active) response.end();
    }
    connections.clear();
    launching.clear();
  }

  return { connect, activate, hasOpenWindows, close };
}
