import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { atomicWrite } from "../state.js";
import { ensureStateDir, stateDir } from "../paths.js";

const FILE = () => path.join(stateDir(), "notepad.json");
const MAX_NOTE_LENGTH = 4000;
const MAX_NOTES_PER_SCOPE = 1000;

function validScope(scope) {
  if (typeof scope !== "string" || !scope.trim() || scope.length > 512) {
    throw new TypeError("A non-empty scope (max 512 characters) is required.");
  }
  return scope;
}

/**
 * Durable, workspace-scoped notes, separate from review feedback batches.
 * The authenticated local server is the only writer; CLI and HUD use its API.
 */
export class NotepadStore {
  constructor() {
    try {
      const stored = JSON.parse(fs.readFileSync(FILE(), "utf8"));
      if (stored.version !== 1 || !stored.scopes || Array.isArray(stored.scopes)) {
        throw new Error("Unsupported notepad file format.");
      }
      this.scopes = Object.assign(Object.create(null), stored.scopes);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.scopes = Object.create(null);
    }
  }

  list(scope) {
    return [...(this.scopes[validScope(scope)] || [])];
  }

  add(scope, text, author = "user") {
    validScope(scope);
    if (typeof text !== "string" || !text.trim()) throw new TypeError("Note text cannot be empty.");
    if (text.length > MAX_NOTE_LENGTH) throw new TypeError("Note text is too long (max 4000 characters).");
    if (author !== "agent" && author !== "user") throw new TypeError("Unknown note author.");
    const notes = this.scopes[scope] || [];
    if (notes.length >= MAX_NOTES_PER_SCOPE) throw new RangeError("Notepad is full (1000 notes per scope).");
    const now = new Date().toISOString();
    const note = {
      id: crypto.randomUUID(),
      text: text.trim(),
      author,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.scopes[scope] = [...notes, note];
    this.save();
    return note;
  }

  setStatus(scope, id, status) {
    validScope(scope);
    if (status !== "pending" && status !== "done") throw new TypeError("Invalid note status.");
    const notes = this.scopes[scope] || [];
    const index = notes.findIndex((note) => note.id === id);
    if (index === -1) return null;
    const note = { ...notes[index], status, updatedAt: new Date().toISOString() };
    this.scopes[scope] = notes.map((item, at) => at === index ? note : item);
    this.save();
    return note;
  }

  save() {
    ensureStateDir();
    atomicWrite(FILE(), JSON.stringify({ version: 1, scopes: this.scopes }, null, 2) + "\n");
  }
}
