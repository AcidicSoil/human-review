import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { atomicWrite } from "../state.js";
import { ensureStateDir, stateDir } from "../paths.js";

const FILE = () => path.join(stateDir(), "notepad.json");
const MAX_NOTE_LENGTH = 4000;
const MAX_NOTES_PER_SCOPE = 1000;
const MAX_SELECTED_NOTES = 100;

function validScope(scope) {
  if (typeof scope !== "string" || !scope.trim() || scope.length > 512) {
    throw new TypeError("A non-empty scope (max 512 characters) is required.");
  }
  return scope;
}

function validText(text) {
  if (typeof text !== "string" || !text.trim()) throw new TypeError("Note text cannot be empty.");
  if (text.length > MAX_NOTE_LENGTH) throw new TypeError("Note text is too long (max 4000 characters).");
  return text.trim();
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
      this.handoffs = Object.assign(Object.create(null), stored.handoffs || {});
      // Legacy files already retained empty scopes after their final note moved.
      this.notebooks = new Set(stored.notebooks || [
        ...Object.keys(this.scopes), ...Object.keys(this.handoffs),
      ]);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.scopes = Object.create(null);
      this.handoffs = Object.create(null);
      this.notebooks = new Set();
    }
  }

  list(scope) {
    return [...(this.scopes[validScope(scope)] || [])];
  }

  listScopes() {
    return [...this.notebooks].sort((a, b) => a.localeCompare(b));
  }

  deleteScope(scope) {
    validScope(scope);
    const notesDeleted = this.scopes[scope]?.length || 0;
    const handoffsDeleted = this.handoffs[scope]?.length || 0;
    if (!this.notebooks.has(scope)) return null;
    this.notebooks.delete(scope);
    delete this.scopes[scope];
    delete this.handoffs[scope];
    this.save();
    return { scope, notesDeleted, handoffsDeleted };
  }

  add(scope, text, author = "user") {
    validScope(scope);
    const noteText = validText(text);
    if (author !== "agent" && author !== "user") throw new TypeError("Unknown note author.");
    const notes = this.scopes[scope] || [];
    if (notes.length >= MAX_NOTES_PER_SCOPE) throw new RangeError("Notepad is full (1000 notes per scope).");
    const now = new Date().toISOString();
    const note = {
      id: crypto.randomUUID(),
      text: noteText,
      author,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.scopes[scope] = [...notes, note];
    this.notebooks.add(scope);
    this.save();
    return note;
  }

  setStatus(scope, id, status) {
    if (status !== "pending" && status !== "done") throw new TypeError("Invalid note status.");
    return this.updateNote(scope, id, { status });
  }

  edit(scope, id, text) {
    return this.updateNote(scope, id, { text: validText(text) });
  }

  updateNote(scope, id, changes) {
    validScope(scope);
    const notes = this.scopes[scope] || [];
    const index = notes.findIndex(note => note.id === id);
    if (index === -1) return null;
    const note = { ...notes[index], ...changes, updatedAt: new Date().toISOString() };
    this.scopes[scope] = notes.map((item, at) => at === index ? note : item);
    this.save();
    return note;
  }

  remove(scope, id) {
    validScope(scope);
    const notes = this.scopes[scope] || [];
    const removed = notes.find((note) => note.id === id);
    if (!removed) return null;
    this.scopes[scope] = notes.filter((note) => note.id !== id);
    this.save();
    return removed;
  }

  selectedNotes(scope, noteIds) {
    if (!Array.isArray(noteIds) || noteIds.length === 0 || noteIds.length > MAX_SELECTED_NOTES) {
      throw new TypeError("Select between 1 and 100 notes.");
    }
    if (noteIds.some(id => typeof id !== "string" || !id.trim())) {
      throw new TypeError("Each selected note ID must be a string.");
    }
    if (new Set(noteIds).size !== noteIds.length) {
      throw new TypeError("Duplicate note IDs are not allowed.");
    }
    const available = new Map(this.list(scope).map(note => [note.id, note]));
    if (noteIds.some(id => !available.has(id))) throw new TypeError("Unknown selected note ID.");
    return noteIds.map(id => available.get(id));
  }

  move(scope, destination, noteIds, { all = false } = {}) {
    validScope(scope);
    validScope(destination);
    if (scope === destination) throw new TypeError("Choose another project notebook.");
    if (!this.notebooks.has(destination)) throw new TypeError("Unknown destination notebook.");
    if (all && noteIds !== undefined) throw new TypeError("Move all does not accept selected note IDs.");
    const moved = all ? this.list(scope) : this.selectedNotes(scope, noteIds);
    if (!moved.length) throw new TypeError("No notes to move.");
    const targetNotes = this.list(destination);
    if (targetNotes.length + moved.length > MAX_NOTES_PER_SCOPE) {
      throw new RangeError("Destination notebook is full (1000 notes per scope).");
    }
    const movedIds = new Set(moved.map(note => note.id));
    this.scopes[scope] = this.list(scope).filter(note => !movedIds.has(note.id));
    this.scopes[destination] = [...targetNotes, ...moved];
    this.save();
    return moved;
  }

  /** Only explicitly selected note IDs enter a handoff. Handoffs never execute notes. */
  send(scope, noteIds) {
    const selected = this.selectedNotes(scope, noteIds);
    const now = new Date().toISOString();
    const handoff = {
      id: crypto.randomUUID(),
      status: "pending",
      createdAt: now,
      acknowledgedAt: null,
      notes: selected.map(note => ({
        id: note.id, text: note.text, author: note.author, createdAt: note.createdAt,
      })),
    };
    this.handoffs[scope] = [...this.outbox(scope), handoff];
    this.save();
    return handoff;
  }

  outbox(scope) {
    return [...(this.handoffs[validScope(scope)] || [])];
  }

  inbox(scope) {
    return this.outbox(scope).filter(handoff => handoff.status === "pending");
  }

  ack(scope, handoffId) {
    const items = this.outbox(scope);
    const matching = items.find(item => item.id === handoffId);
    if (!matching) return null;
    if (matching.status === "acknowledged") return matching;
    const updated = { ...matching, status: "acknowledged", acknowledgedAt: new Date().toISOString() };
    this.handoffs[scope] = items.map(item => item.id === handoffId ? updated : item);
    this.save();
    return updated;
  }

  save() {
    ensureStateDir();
    atomicWrite(FILE(), JSON.stringify({
      version: 1, notebooks: this.listScopes(), scopes: this.scopes, handoffs: this.handoffs,
    }, null, 2) + "\n");
  }
}
