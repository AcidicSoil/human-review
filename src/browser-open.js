import { spawn } from "node:child_process";

export function browserCommand(target, env = process.env, platform = process.platform) {
  const preferred = env.BROWSER?.trim();
  if (preferred) return { command: preferred, args: [target] };
  if (platform === "darwin") return { command: "open", args: [target] };
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", target] };
  return { command: "xdg-open", args: [target] };
}

export function openBrowser(target) {
  const { command, args } = browserCommand(target);
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  // On headless hosts, keep the printed target usable if the opener is missing.
  child.on("error", () => {});
  child.unref();
}
