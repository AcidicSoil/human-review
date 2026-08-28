import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SKIP_DIRS = new Set([".git", "node_modules"]);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function skillName(file) {
  const fallback = path.basename(path.dirname(file));
  try {
    const text = fs.readFileSync(file, "utf8");
    const frontmatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
    const match = frontmatter?.[1].match(/^name:\s*["']?([^\r\n"']+)["']?\s*$/m);
    return match?.[1]?.trim() || fallback;
  } catch {
    return fallback;
  }
}

function findSkillFiles(root) {
  if (!root || !fs.existsSync(root)) return [];
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) stack.push(full);
      else if (entry.isFile() && entry.name === "SKILL.md") files.push(full);
    }
  }
  return files.sort();
}

function pluginMetadata(root, fallbackName) {
  if (!root) return { name: fallbackName, displayName: fallbackName, category: "Installed plugins" };
  for (const relative of [".codex-plugin/plugin.json", ".claude-plugin/plugin.json", "plugin.json"]) {
    const manifest = readJson(path.join(root, relative));
    if (!manifest) continue;
    return {
      name: manifest.name || fallbackName,
      displayName: manifest.interface?.displayName || manifest.displayName || manifest.name || fallbackName,
      category: manifest.interface?.category || manifest.category || "Installed plugins",
    };
  }
  return { name: fallbackName, displayName: fallbackName, category: "Installed plugins" };
}

function marketplaceRoots(marketplaceList) {
  return new Map((marketplaceList?.marketplaces || []).map((item) => [item.name, item.root]));
}

function resolvePluginRoot(plugin, roots, home) {
  if (plugin.source?.source === "local" && plugin.source.path && fs.existsSync(plugin.source.path)) {
    return plugin.source.path;
  }

  const marketplaceRoot = roots.get(plugin.marketplaceName);
  const candidates = [
    path.join(home, ".codex", "plugins", "cache", plugin.marketplaceName || "", plugin.name || "", plugin.version || ""),
    marketplaceRoot && path.join(marketplaceRoot, "plugins", plugin.name),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  if (marketplaceRoot && fs.existsSync(marketplaceRoot)) {
    const metadata = pluginMetadata(marketplaceRoot, "");
    if (metadata.name === plugin.name || plugin.marketplaceName === plugin.name) return marketplaceRoot;
  }
  return null;
}

function pluginEntry(plugin, root) {
  const metadata = pluginMetadata(root || "", plugin.name);
  const base = root && fs.existsSync(path.join(root, "skills")) ? path.join(root, "skills") : root;
  const seen = new Set();
  const skills = findSkillFiles(base).map((file) => skillName(file)).filter((name) => {
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  }).sort().map((name) => ({
    kind: "skill",
    ref: `skills://plugins/${plugin.name}/${name}`,
    pluginRef: plugin.name,
    displayName: name,
  }));

  return {
    category: metadata.category,
    plugin: {
      kind: "plugin",
      ref: plugin.name,
      displayName: metadata.displayName,
      skills,
    },
  };
}

export function buildCodexCatalog({ pluginList, marketplaceList, home = os.homedir() } = {}) {
  const roots = marketplaceRoots(marketplaceList);
  const groups = new Map();
  const byPluginRef = new Map();

  for (const plugin of pluginList?.installed || []) {
    if (!plugin?.installed || !plugin?.enabled || !plugin.name) continue;
    const root = resolvePluginRoot(plugin, roots, home);
    const entry = pluginEntry(plugin, root);
    const existing = byPluginRef.get(plugin.name);
    if (existing) {
      const refs = new Set(existing.plugin.skills.map((skill) => skill.ref));
      for (const skill of entry.plugin.skills) if (!refs.has(skill.ref)) existing.plugin.skills.push(skill);
      existing.plugin.skills.sort((a, b) => a.displayName.localeCompare(b.displayName));
      continue;
    }
    byPluginRef.set(plugin.name, entry);
  }

  for (const entry of byPluginRef.values()) {
    if (!groups.has(entry.category)) groups.set(entry.category, []);
    groups.get(entry.category).push(entry.plugin);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, plugins]) => ({
      category,
      plugins: plugins.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }));
}

function runCodex(args) {
  const command = process.platform === "win32" ? "codex.cmd" : "codex";
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `codex ${args.join(" ")} failed`);
  return JSON.parse(result.stdout);
}

export function discoverCodexCatalog() {
  return buildCodexCatalog({
    pluginList: runCodex(["plugin", "list", "--json"]),
    marketplaceList: runCodex(["plugin", "marketplace", "list", "--json"]),
  });
}
