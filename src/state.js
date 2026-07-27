import fs from "node:fs";
import path from "node:path";
import { ensureStateDir, pageKey, realFile, statePath } from "./paths.js";

/**
 * All durable state lives in one JSON file. No database, no network.
 *
 * Shape:
 *   { pages: { <key>: { key, file, pristine, comments[], edits[], updatedAt } } }
 *
 * Pages are fully independent: no page ever references another.
 */
export class Store {
  constructor() {
    this.data = { pages: {} };
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(statePath(), "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.pages) this.data = parsed;
    } catch {
      // Missing or unreadable state is not an error; start empty.
    }
    return this.data;
  }

  save() {
    ensureStateDir();
    const target = statePath();
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, target);
  }

  /** Register a file as a reviewable page, capturing the agent's version. */
  openPage(file, pristine) {
    const key = pageKey(file);
    const existing = this.data.pages[key];
    const page = existing || {
      key,
      file: realFile(file),
      pristine: "",
      comments: [],
      edits: [],
      updatedAt: 0,
    };
    page.file = realFile(file);
    if (!existing || typeof pristine === "string") {
      page.pristine = typeof pristine === "string" ? pristine : page.pristine;
    }
    page.updatedAt = Date.now();
    this.data.pages[key] = page;
    this.save();
    return page;
  }

  page(key) {
    return this.data.pages[key] || null;
  }

  pageForFile(file) {
    return this.page(pageKey(file));
  }

  update(key, mutate) {
    const page = this.page(key);
    if (!page) return null;
    mutate(page);
    page.updatedAt = Date.now();
    this.save();
    return page;
  }

  addComment(key, comment) {
    return this.update(key, (page) => {
      page.comments.push(comment);
    });
  }

  removeComment(key, id) {
    return this.update(key, (page) => {
      page.comments = page.comments.filter((c) => c.id !== id);
    });
  }

  /** Edits are deduped by label+kind so retyping one block stays one row. */
  addEdit(key, label, kind) {
    return this.update(key, (page) => {
      const already = page.edits.some((e) => e.label === label && e.kind === kind);
      if (!already) page.edits.push({ label, kind, at: Date.now() });
    });
  }

  clearEdits(key) {
    return this.update(key, (page) => {
      page.edits = [];
    });
  }

  /** After the agent writes, its version becomes the new revert target. */
  setPristine(key, html) {
    return this.update(key, (page) => {
      page.pristine = html;
      page.edits = [];
    });
  }

  clearSent(key, ids) {
    return this.update(key, (page) => {
      const drop = new Set(ids);
      page.comments = page.comments.filter((c) => !drop.has(c.id));
      page.edits = [];
    });
  }
}

/** Resolve a sibling asset request without escaping the artifact's directory. */
export function resolveAsset(pageFile, relative) {
  const base = path.dirname(pageFile);
  const target = path.resolve(base, decodeURIComponent(relative));
  const rel = path.relative(base, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return target;
}
