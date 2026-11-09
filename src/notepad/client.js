const scope = new URL(location.href).searchParams.get("scope") || "";
const token = document.body.dataset.token;
const endpoint = `/api/notepad?scope=${encodeURIComponent(scope)}`;

const list = document.getElementById("notes");
const input = document.getElementById("note-text");
const form = document.getElementById("capture");
const message = document.getElementById("message");
const addButton = document.getElementById("add");
const sendButton = document.getElementById("send-to-agent");
const selectedCount = document.getElementById("selected-count");
const filters = [...document.querySelectorAll("[data-filter]")];

const segments = scope.replace(/[\\/]+$/, "").split(/[\\/]/);
document.getElementById("workspace").textContent = segments.at(-1) || scope;

let notes = [];
let filter = "pending";
let updating = false;
let confirmingDeleteId = null;
let handoffs = [];
let selectedIds = new Set();
let sending = false;

function updateSelection() {
  const count = selectedIds.size;
  sendButton.disabled = !count || sending;
  sendButton.textContent = count ? "Send to agent (" + count + ")" : "Send to agent";
  selectedCount.textContent = count ? count + " selected" : "Select notes to share";
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
  try {
    const result = await request("GET", endpoint);
    notes = result.notes;
    handoffs = result.handoffs || [];
    render();
    message.textContent = "Saved locally";
  } catch (error) {
    message.textContent = error.message;
  } finally {
    updating = false;
  }
}

sendButton.addEventListener("click", async () => {
  if (!selectedIds.size || sending) return;
  sending = true;
  updateSelection();
  try {
    const result = await request("POST", "/api/notepad/send?scope=" + encodeURIComponent(scope), {
      noteIds: [...selectedIds],
    });
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addButton.disabled = true;
  try {
    const result = await request("POST", endpoint, { text, author: "user" });
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
async function observeWindow(signal) {
  while (!signal.aborted) {
    try {
      const response = await fetch("/api/notepad/window/connect?scope=" + encodeURIComponent(scope), {
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
          if (line && JSON.parse(line).event === "focus") window.focus();
        }
      }
    } catch (error) {
      if (signal.aborted) return;
    }
    if (!signal.aborted) await new Promise(resolve => setTimeout(resolve, 600));
  }
}

if (typeof ReadableStream !== "undefined" && typeof TextDecoder !== "undefined") {
  const connection = new AbortController();
  window.addEventListener("pagehide", () => connection.abort(), { once: true });
  void observeWindow(connection.signal);
}

refresh();
setInterval(() => {
  if (!document.hidden) refresh();
}, 2500);
