let scope = new URL(location.href).searchParams.get("scope") || "";
const token = document.body.dataset.token;
const endpoint = () => `/api/notepad?scope=${encodeURIComponent(scope)}`;

const projectPicker = document.getElementById("project-notebooks");
const deleteNotebook = document.getElementById("delete-notebook");
const notebookConfirm = document.getElementById("notebook-delete-confirm");
const confirmNotebookDeletion = document.getElementById("confirm-delete-notebook");
const list = document.getElementById("notes");
const input = document.getElementById("note-text");
const form = document.getElementById("capture");
const message = document.getElementById("message");
const addButton = document.getElementById("add");
const sendButton = document.getElementById("send-to-agent");
const moveButton = document.getElementById("move-notes");
const moveAllButton = document.getElementById("move-all-notes");
const movePanel = document.getElementById("move-panel");
const moveDestination = document.getElementById("move-destination");
const confirmMove = document.getElementById("confirm-move");
const selectedCount = document.getElementById("selected-count");
const filters = [...document.querySelectorAll("[data-filter]")];

let notes = [];
let filter = "pending";
let updating = false;
let confirmingDeleteId = null;
let handoffs = [];
let selectedIds = new Set();
let sending = false;
let moving = false;
let moveMode = null;
let projects = [];
let confirmingNotebookDelete = false;
let deletingNotebook = false;
let windowConnection;
const drafts = new Map();

function notebookName(value) {
  return value.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || value;
}

function renderScopeOptions(select, values, placeholder = false) {
  const options = placeholder ? ["", ...values] : values;
  const installed = [...select.options].map(option => option.value);
  if (installed.length === options.length && installed.every((value, index) => value === options[index])) return;
  const names = values.map(notebookName);
  const previous = select.value;
  select.replaceChildren();
  for (const value of options) {
    const option = document.createElement("option");
    option.value = value;
    const name = notebookName(value);
    option.textContent = !value ? "Choose project" :
      names.indexOf(name) !== names.lastIndexOf(name) ? name + " — " + value : name;
    option.title = value;
    select.append(option);
  }
  select.value = options.includes(previous) ? previous : options[0] || "";
}

function renderMovePanel() {
  const destinations = projects.filter(project => project !== scope);
  renderScopeOptions(moveDestination, destinations, true);
  movePanel.hidden = !moveMode;
  moveButton.disabled = !selectedIds.size || !destinations.length || sending || moving;
  moveAllButton.disabled = !notes.length || !destinations.length || sending || moving;
  moveDestination.disabled = moving;
  document.getElementById("cancel-move").disabled = moving;
  const hasNotes = moveMode === "all" ? notes.length > 0 : selectedIds.size > 0;
  confirmMove.disabled = !hasNotes || moving || sending || !destinations.includes(moveDestination.value);
}

function renderProjects() {
  const options = [...new Set([scope, ...projects])].sort((a, b) => a.localeCompare(b));
  renderScopeOptions(projectPicker, options);
  projectPicker.value = scope;
  projectPicker.title = scope;
  projectPicker.disabled = deletingNotebook || moving;
  deleteNotebook.disabled = deletingNotebook || moving || !projects.includes(scope);
  notebookConfirm.hidden = !confirmingNotebookDelete;
  document.getElementById("notebook-delete-name").textContent = scope;
  renderMovePanel();
}

function switchScope(next) {
  if (!next || next === scope) return;
  drafts.set(scope, input.value);
  scope = next;
  input.value = drafts.get(next) || "";
  notes = [];
  handoffs = [];
  selectedIds.clear();
  confirmingDeleteId = null;
  confirmingNotebookDelete = false;
  moveMode = null;
  filter = "pending";
  const url = new URL(location.href);
  url.searchParams.set("scope", scope);
  history.replaceState(null, "", url);
  render();
  renderProjects();
  startObserving();
  void refresh();
}

function updateSelection() {
  const count = selectedIds.size;
  sendButton.disabled = !count || sending || moving;
  sendButton.textContent = count ? "Send to agent (" + count + ")" : "Send to agent";
  selectedCount.textContent = count ? count + " selected" : "Select notes";
  if (!count && moveMode === "selected") moveMode = null;
  renderMovePanel();
}

async function request(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: {
      "x-human-review-token": token,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function render() {
  const viewedScope = scope;
  const pending = notes.filter(note => note.status === "pending");
  document.getElementById("count").textContent = String(pending.length);
  for (const item of filters) {
    const active = item.dataset.filter === filter;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  }

  const knownIds = new Set(notes.map(note => note.id));
  selectedIds = new Set([...selectedIds].filter(id => knownIds.has(id)));
  updateSelection();
  const visible = notes.filter(note => filter === "all" || note.status === filter);
  list.replaceChildren();
  document.getElementById("empty").hidden = visible.length !== 0;
  for (const note of [...visible].reverse()) {
    const row = document.createElement("li");
    row.className = "note";
    const choice = document.createElement("input");
    choice.type = "checkbox";
    choice.className = "note-choice";
    choice.checked = selectedIds.has(note.id);
    choice.setAttribute("aria-label", "Select note: " + note.text.slice(0, 70));
    row.classList.toggle("is-selected", choice.checked);
    choice.addEventListener("change", () => {
      if (choice.checked) selectedIds.add(note.id);
      else selectedIds.delete(note.id);
      row.classList.toggle("is-selected", choice.checked);
      updateSelection();
    });
    const body = document.createElement("div");
    body.className = "note-main";
    const text = document.createElement("p");
    text.className = "note-text";
    text.textContent = note.text;
    const byline = document.createElement("small");
    byline.textContent = `${note.author === "agent" ? "Agent" : "You"} · ${new Date(note.createdAt).toLocaleString()}`;
    body.append(text, byline);
    const latest = [...handoffs].reverse().find(handoff => handoff.notes.some(item => item.id === note.id));
    if (latest) {
      const delivery = document.createElement("small");
      delivery.className = "delivery-status";
      delivery.textContent = latest.status === "acknowledged" ? "Agent received" : "Awaiting agent";
      body.append(delivery);
    }
    const actions = document.createElement("div");
    actions.className = "note-actions";
    const notePath = `/api/notepad/${encodeURIComponent(note.id)}?scope=${encodeURIComponent(scope)}`;

    if (confirmingDeleteId === note.id) {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "status";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => {
        confirmingDeleteId = null;
        render();
      });
      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "status delete confirm";
      confirm.textContent = "Delete now";
      confirm.setAttribute("aria-label", `Confirm delete: ${note.text.slice(0, 70)}`);
      confirm.addEventListener("click", async () => {
        confirm.disabled = true;
        try {
          const result = await request("DELETE", notePath);
          if (scope !== viewedScope) return;
          notes = notes.filter(item => item.id !== result.deletedId);
          confirmingDeleteId = null;
          render();
          message.textContent = "Note deleted";
        } catch (error) {
          confirm.disabled = false;
          message.textContent = error.message;
        }
      });
      actions.append(cancel, confirm);
    } else {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "status";
      const isDone = note.status === "done";
      button.textContent = isDone ? "Reopen" : "Done";
      button.setAttribute("aria-label", `${isDone ? "Reopen" : "Mark done"}: ${note.text.slice(0, 70)}`);
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const result = await request("PATCH", notePath, {
            status: isDone ? "pending" : "done",
          });
          if (scope !== viewedScope) return;
          notes = notes.map(item => item.id === note.id ? result.note : item);
          render();
          message.textContent = "Saved";
        } catch (error) {
          button.disabled = false;
          message.textContent = error.message;
        }
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "status delete";
      remove.textContent = "Delete";
      remove.setAttribute("aria-label", `Delete: ${note.text.slice(0, 70)}`);
      remove.addEventListener("click", () => {
        confirmingDeleteId = note.id;
        render();
      });
      actions.append(button, remove);
    }
    row.append(choice, body, actions);
    list.append(row);
  }
}

async function refresh() {
  if (updating) return;
  updating = true;
  const viewedScope = scope;
  try {
    const [result, available] = await Promise.all([
      request("GET", endpoint()),
      request("GET", "/api/notepad/scopes"),
    ]);
    if (scope !== viewedScope) return;
    notes = result.notes;
    handoffs = result.handoffs || [];
    projects = available.scopes || [];
    render();
    renderProjects();
    message.textContent = "Saved locally";
  } catch (error) {
    if (scope === viewedScope) message.textContent = error.message;
  } finally {
    updating = false;
    if (scope !== viewedScope) void refresh();
  }
}

sendButton.addEventListener("click", async () => {
  if (!selectedIds.size || sending || moving) return;
  const viewedScope = scope;
  sending = true;
  updateSelection();
  try {
    const result = await request("POST", "/api/notepad/send?scope=" + encodeURIComponent(viewedScope), {
      noteIds: [...selectedIds],
    });
    if (scope !== viewedScope) return;
    handoffs.push(result.handoff);
    selectedIds.clear();
    render();
    message.textContent = "Sent to agent — awaiting receipt";
  } catch (error) {
    message.textContent = error.message;
  } finally {
    sending = false;
    updateSelection();
  }
});

function openMovePanel(mode) {
  moveMode = mode;
  renderMovePanel();
  moveDestination.focus();
}

moveButton.addEventListener("click", () => {
  if (!moveButton.disabled) openMovePanel("selected");
});
moveAllButton.addEventListener("click", () => {
  if (!moveAllButton.disabled) openMovePanel("all");
});

moveDestination.addEventListener("change", renderMovePanel);

document.getElementById("cancel-move").addEventListener("click", () => {
  moveMode = null;
  renderMovePanel();
  moveButton.focus();
});

confirmMove.addEventListener("click", async () => {
  const destination = moveDestination.value;
  if (moving || sending || confirmMove.disabled || destination === scope) return;
  const origin = scope;
  const payload = moveMode === "all"
    ? { destination, all: true }
    : { destination, noteIds: [...selectedIds] };
  moving = true;
  updateSelection();
  renderProjects();
  try {
    const result = await request("POST", "/api/notepad/move?scope=" + encodeURIComponent(origin), payload);
    if (scope !== origin) return;
    const movedIds = new Set(result.moved.map(note => note.id));
    notes = notes.filter(note => !movedIds.has(note.id));
    selectedIds.clear();
    moveMode = null;
    render();
    await refresh();
    message.textContent = result.moved.length + " note" + (result.moved.length === 1 ? "" : "s") +
      " moved to " + notebookName(destination);
  } catch (error) {
    if (scope === origin) message.textContent = error.message;
  } finally {
    moving = false;
    updateSelection();
    renderProjects();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const viewedScope = scope;
  const text = input.value.trim();
  if (!text) return;
  addButton.disabled = true;
  try {
    const result = await request("POST", endpoint(), { text, author: "user" });
    if (scope !== viewedScope) return;
    notes.push(result.note);
    input.value = "";
    filter = "pending";
    render();
    message.textContent = "Saved";
    input.focus();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    addButton.disabled = false;
  }
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});
for (const item of filters) item.addEventListener("click", () => {
  filter = item.dataset.filter;
  render();
});

projectPicker.addEventListener("change", () => switchScope(projectPicker.value));

deleteNotebook.addEventListener("click", () => {
  confirmingNotebookDelete = true;
  renderProjects();
  confirmNotebookDeletion.focus();
});

document.getElementById("cancel-delete-notebook").addEventListener("click", () => {
  confirmingNotebookDelete = false;
  renderProjects();
  deleteNotebook.focus();
});

confirmNotebookDeletion.addEventListener("click", async () => {
  if (!confirmingNotebookDelete || deletingNotebook) return;
  const removedScope = scope;
  deletingNotebook = true;
  renderProjects();
  try {
    await request("DELETE", "/api/notepad/scope?scope=" + encodeURIComponent(removedScope));
    drafts.delete(removedScope);
    input.value = "";
    projects = projects.filter(item => item !== removedScope);
    confirmingNotebookDelete = false;
    notes = [];
    handoffs = [];
    selectedIds.clear();
    confirmingDeleteId = null;
    const next = projects[0];
    if (next) switchScope(next);
    else {
      input.value = "";
      render();
      renderProjects();
      void refresh();
    }
    message.textContent = "Project notebook deleted";
  } catch (error) {
    message.textContent = error.message;
  } finally {
    deletingNotebook = false;
    renderProjects();
  }
});

document.getElementById("popout").addEventListener("click", () => {
  const windowName = "human-review-notepad:" + encodeURIComponent(scope);
  const popup = window.open(location.href, windowName, "popup,width=440,height=740,resizable=yes");
  if (!popup) message.textContent = "Allow popups to open the compact window.";
});

/**
 * Register this live browser window with the shared server. An agent's next
 * "notes open" requests focus through this connection instead of opening a
 * duplicate. The connection closes when the window closes.
 */
async function observeWindow(viewedScope, signal) {
  while (!signal.aborted) {
    try {
      const response = await fetch("/api/notepad/window/connect?scope=" + encodeURIComponent(viewedScope), {
        headers: { "x-human-review-token": token },
        cache: "no-store",
        signal,
      });
      if (!response.ok || !response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let index;
        while ((index = pending.indexOf("\n")) !== -1) {
          const line = pending.slice(0, index).trim();
          pending = pending.slice(index + 1);
          if (!signal.aborted && line && JSON.parse(line).event === "focus") window.focus();
        }
      }
    } catch (error) {
      if (signal.aborted) return;
    }
    if (!signal.aborted) await new Promise(resolve => setTimeout(resolve, 600));
  }
}

function startObserving() {
  if (typeof ReadableStream === "undefined" || typeof TextDecoder === "undefined") return;
  windowConnection?.abort();
  windowConnection = new AbortController();
  void observeWindow(scope, windowConnection.signal);
}

window.addEventListener("pagehide", () => windowConnection?.abort(), { once: true });
startObserving();
refresh();
setInterval(() => {
  if (!document.hidden) refresh();
}, 2500);
