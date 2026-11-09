const scope = new URL(location.href).searchParams.get("scope") || "";
const token = document.body.dataset.token;
const endpoint = `/api/notepad?scope=${encodeURIComponent(scope)}`;

const list = document.getElementById("notes");
const input = document.getElementById("note-text");
const form = document.getElementById("capture");
const message = document.getElementById("message");
const addButton = document.getElementById("add");
const filters = [...document.querySelectorAll("[data-filter]")];

const segments = scope.replace(/[\\/]+$/, "").split(/[\\/]/);
document.getElementById("workspace").textContent = segments.at(-1) || scope;

let notes = [];
let filter = "pending";
let updating = false;

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

  const visible = notes.filter(note => filter === "all" || note.status === filter);
  list.replaceChildren();
  document.getElementById("empty").hidden = visible.length !== 0;
  for (const note of [...visible].reverse()) {
    const row = document.createElement("li");
    row.className = "note";
    const body = document.createElement("div");
    body.className = "note-main";
    const text = document.createElement("p");
    text.className = "note-text";
    text.textContent = note.text;
    const byline = document.createElement("small");
    byline.textContent = `${note.author === "agent" ? "Agent" : "You"} · ${new Date(note.createdAt).toLocaleString()}`;
    body.append(text, byline);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "status";
    const isDone = note.status === "done";
    button.textContent = isDone ? "Reopen" : "Done";
    button.setAttribute("aria-label", `${isDone ? "Reopen" : "Mark done"}: ${note.text.slice(0, 70)}`);
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const result = await request("PATCH", `/api/notepad/${encodeURIComponent(note.id)}?scope=${encodeURIComponent(scope)}`, {
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
    row.append(body, button);
    list.append(row);
  }
}

async function refresh() {
  if (updating) return;
  updating = true;
  try {
    const result = await request("GET", endpoint);
    notes = result.notes;
    render();
    message.textContent = "Saved locally";
  } catch (error) {
    message.textContent = error.message;
  } finally {
    updating = false;
  }
}

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
  const windowName = "human-review-notepad";
  const popup = window.open(location.href, windowName, "popup,width=440,height=740,resizable=yes");
  if (!popup) message.textContent = "Allow popups to open the compact window.";
});

refresh();
setInterval(() => {
  if (!document.hidden) refresh();
}, 2500);
