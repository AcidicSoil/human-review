import path from "node:path";
import { spawnSync } from "node:child_process";

/** Resolve the notebook identity once, before making any notepad request. */
export function resolveNotesScope({
  explicitScope,
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  if (explicitScope !== undefined) return explicitScope;
  if (env.HUMAN_REVIEW_DEFAULT_SCOPE) return env.HUMAN_REVIEW_DEFAULT_SCOPE;

  const directory = path.resolve(cwd);
  const result = spawnSync("git", ["-C", directory, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 1000,
  });
  return result.status === 0 && result.stdout.trim() || directory;
}
