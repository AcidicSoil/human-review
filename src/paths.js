import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import fs from "node:fs";

export function stateDir() {
  const override = process.env.EDIT_HTML_STATE_DIR;
  return override ? path.resolve(override) : path.join(homedir(), ".edit-html");
}

export function statePath() {
  return path.join(stateDir(), "state.json");
}

export function serverPath() {
  return path.join(stateDir(), "server.json");
}

export function ensureStateDir() {
  fs.mkdirSync(stateDir(), { recursive: true });
}

/** Canonical identity for a page: the real path of the file on disk. */
export function pageKey(file) {
  let real = path.resolve(file);
  try {
    real = fs.realpathSync(real);
  } catch {
    // File may not exist yet; the resolved path is still a stable identity.
  }
  return createHash("sha256").update(real).digest("hex").slice(0, 16);
}

export function realFile(file) {
  const resolved = path.resolve(file);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}
