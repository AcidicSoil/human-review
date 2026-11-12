/**
 * Tracks live Notepad browser windows across all project scopes.
 *
 * A browser's authenticated streaming connection is its live registration.
 * One launch reservation prevents duplicate HUDs even when different agents
 * request different project scopes concurrently.
 *
 * This does not own Human Review's session or feedback state.
 */
export function createNotepadWindowRegistry({ now = Date.now, launchGraceMs = 20000 } = {}) {
  const connections = new Map();
  let launchingUntil = 0;

  function connect(scope, response) {
    let active = connections.get(scope);
    if (!active) {
      active = new Set();
      connections.set(scope, active);
    }
    active.add(response);
    launchingUntil = 0;

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
    const active = connections.get(scope) || connections.values().next().value;
    if (active?.size) {
      active.values().next().value.write(JSON.stringify({ event: "focus", scope }) + "\n");
      return { action: "reused" };
    }
    if (launchingUntil > now()) return { action: "opening" };
    launchingUntil = now() + launchGraceMs;
    return { action: "launch" };
  }

  function status() {
    return {
      open: connections.size > 0,
      opening: connections.size === 0 && launchingUntil > now(),
      scopes: [...connections.keys()],
    };
  }

  function hasOpenWindows() {
    return connections.size > 0;
  }

  function close() {
    for (const active of connections.values()) {
      for (const response of active) response.end();
    }
    connections.clear();
    launchingUntil = 0;
  }

  return { connect, activate, status, hasOpenWindows, close };
}
