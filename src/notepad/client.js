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
const reportPanel = document.getElementById("report-panel");
const reportForm = document.getElementById("report-form");
const reportDestination = document.getElementById("report-destination");
const reportProjects = document.getElementById("report-projects");
const reportPicker = document.getElementById("report-project-picker");
const filters = [...document.querySelectorAll("[data-filter]")];
const viewButtons = [...document.querySelectorAll("[data-view]")];
const capture = document.getElementById("capture");
const filterBar = document.querySelector(".filters");
const sendRow = document.querySelector(".send-row");
const empty = document.getElementById("empty");

let notes = [];
let reports = [];
let view = "notes";
let filter = "pending";
let updating = false;
let confirmingDeleteId = null;
let editingNoteId = null;
let editingDraft = "";
let savingEdit = false;
let handoffs = [];
let selectedIds = new Set();
let sending = false;
let moving = false;
let moveMode = null;
let reportingNoteId = null;
let reporting = false;
let activeReportProject = -1;
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

function closeReportChoices() {
  reportProjects.hidden = true;
  reportDestination.setAttribute("aria-expanded", "false");
  reportDestination.removeAttribute("aria-activedescendant");
  activeReportProject = -1;
}

function setActiveReportProject(index) {
  const options = [...reportProjects.querySelectorAll(".project-option")];
  activeReportProject = Math.max(-1, Math.min(index, options.length - 1));
  options.forEach((option, position) => {
    option.setAttribute("aria-selected", String(position === activeReportProject));
  });
  if (activeReportProject < 0) reportDestination.removeAttribute("aria-activedescendant");
  else reportDestination.setAttribute("aria-activedescendant", options[activeReportProject].id);
}

function renderReportChoices() {
  const query = reportDestination.value.toLowerCase().trim();
  const matches = projects.filter(project =>
    project !== scope && project.toLowerCase().includes(query))
    .sort((a, b) => notebookName(a).localeCompare(notebookName(b)) || a.localeCompare(b))
    .slice(0, 30);
  const options = matches.map((project, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.id = "report-project-option-" + index;
    option.className = "project-option";
    option.setAttribute("role", "option");
    const name = document.createElement("strong");
    name.textContent = notebookName(project);
    const directory = document.createElement("small");
    directory.textContent = project;
    option.append(name, directory);
    option.addEventListener("click", () => {
      reportDestination.value = project;
      reportDestination.focus();
      closeReportChoices();
    });
    return option;
  });
  reportProjects.replaceChildren(...options);
  if (!options.length) reportProjects.textContent = "No matching notebooks — enter an existing directory path.";
  setActiveReportProject(-1);
}

function renderMovePanel() {
  const destinations = projects.filter(project => project !== scope);
  renderScopeOptions(moveDestination, destinations, true);
  movePanel.hidden = !moveMode || view === "inbox";
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
  if (!reportProjects.hidden) renderReportChoices();
}

function switchScope(next, nextFilter = "pending", nextView = "notes") {
  if (!next || next === scope) return;
  drafts.set(scope, input.value);
  scope = next;
  input.value = drafts.get(next) || "";
  notes = [];
  reports = [];
  handoffs = [];
  selectedIds.clear();
  confirmingDeleteId = null;
  editingNoteId = null;
  editingDraft = "";
  confirmingNotebookDelete = false;
  moveMode = null;
  reportingNoteId = null;
  reportPanel.hidden = true;
  closeReportChoices();
  reportForm.reset();
  filter = nextFilter;
  view = nextView;
  list.scrollTop = 0;
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

function renderInlineEditor(note, text, actions, notePath, viewedScope) {
  const editor = document.createElement("textarea");
  editor.className = "note-edit-input";
  editor.setAttribute("aria-label", "Edit note");
  editor.maxLength = 4000;
  editor.rows = 4;
  editor.value = editingDraft;
  editor.disabled = savingEdit;

  const save = document.createElement("button");
  save.type = "button";
  save.className = "status edit-save";
  save.textContent = "Save";
  save.disabled = savingEdit || !editingDraft.trim();

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "status edit-cancel";
  cancel.textContent = "Cancel";
  cancel.disabled = savingEdit;
  cancel.addEventListener("click", () => {
    editingNoteId = null;
    editingDraft = "";
    render();
  });

  editor.addEventListener("input", () => {
    editingDraft = editor.value;
    save.disabled = !editingDraft.trim();
  });
  editor.addEventListener("keydown", event => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save.click();
    }
    if (event.key === "Escape") cancel.click();
  });

  save.addEventListener("click", async () => {
    if (savingEdit || !editingDraft.trim()) return;
    savingEdit = true;
    save.disabled = true;
    cancel.disabled = true;
    editor.disabled = true;
    try {
      const result = await request("PATCH", notePath, { text: editingDraft });
      if (scope !== viewedScope) return;
      notes = notes.map(item => item.id === note.id ? result.note : item);
      editingNoteId = null;
      editingDraft = "";
      render();
      message.textContent = "Note updated";
    } catch (error) {
      if (scope === viewedScope) message.textContent = error.message;
    } finally {
      savingEdit = false;
      if (scope === viewedScope && editingNoteId === note.id) {
        save.disabled = !editingDraft.trim();
        cancel.disabled = false;
        editor.disabled = false;
      }
    }
  });

  text.replaceWith(editor);
  actions.append(save, cancel);
}

function showMarkdown(element, html, raw) {
  if (!html) {
    element.textContent = raw;
  } else if (typeof element.setHTML === "function") {
    element.setHTML(html);
  } else {
    // The API sanitizes this HTML with an allowlist before returning it.
    element.innerHTML = html;
  }
}

function createBadge(kind, label, project) {
  const badge = document.createElement("span");
  badge.className = "note-badge badge-" + kind;
  badge.textContent = label;
  badge.title = project;
  return badge;
}

function renderReportLinks(note, body) {
  const projectLink = (label, destination, destinationView = "notes") => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "status " + (label === "View source" ? "view-source" : "view-report");
    button.textContent = label;
    button.addEventListener("click", () => switchScope(destination, "all", destinationView));
    body.append(button);
  };
  if (note.bugReport) {
    const details = document.createElement("div");
    details.className = "bug-details";
    for (const [key, title] of [
      ["expected", "Expected"],
      ["actual", "Observed"],
      ["steps", "Reproduce"],
    ]) {
      const label = document.createElement("strong");
      label.textContent = title;
      const value = document.createElement("div");
      value.className = "note-markdown";
      showMarkdown(value, note.bugReportHtml?.[key], note.bugReport[key]);
      details.append(label, value);
    }
    body.append(details);
    projectLink("View source", note.bugReport.sourceScope);
  }
  for (const link of note.reportedTo || []) {
    const status = document.createElement("div");
    status.className = "report-status";
    const kind = link.status === "done" ? "done" :
      link.status === "deleted" ? "removed" : "pending";
    const label = link.status === "done" ? "Fix available — verify" :
      link.status === "deleted" ? "Report removed" : "Pending";
    status.append(createBadge(kind, label + " · " + notebookName(link.scope), link.scope));
    body.append(status);
    projectLink("View report", link.scope, link.inInbox ? "inbox" : "notes");
  }
}

function createCopyButton(kind, value) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "note-copy note-copy-" + kind;
  const isId = kind === "id";
  button.textContent = isId ? "⧉ ID" : "⧉ Ref";
  button.title = isId ? "Copy full note ID" : "Copy project-scoped note reference";
  button.setAttribute("aria-label", isId ? "Copy full note ID" : "Copy project-scoped reference");
  button.addEventListener("click", async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      message.textContent = isId ? "Note ID copied" : "Note reference copied";
    } catch {
      message.textContent = "Could not copy — check clipboard permissions";
    }
  });
  return button;
}

function createStatusButton(note, notePath, viewedScope, inInbox) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "status";
  const isDone = note.status === "done";
  const title = isDone ? "Reopen" : note.bugReport ? "Mark fix available" : "Done";
  button.textContent = title;
  button.classList.toggle("fix-available", !!note.bugReport && !isDone);
  button.setAttribute("aria-label", title + ": " + note.text.slice(0, 70));
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const result = await request("PATCH", notePath, {
        status: isDone ? "pending" : "done",
      });
      if (scope !== viewedScope) return;
      const bucket = inInbox ? reports : notes;
      const updated = bucket.map(item => item.id === note.id ? result.note : item);
      if (inInbox) reports = updated;
      else notes = updated;
      render();
      message.textContent = "Saved";
    } catch (error) {
      button.disabled = false;
      message.textContent = error.message;
    }
  });
  return button;
}

function createNoteCard(note, viewedScope, inInbox) {
  const row = document.createElement("li");
  row.className = "note";
  row.classList.toggle("inbox-report", inInbox);
  if (!inInbox) {
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
    row.append(choice);
  }

  const body = document.createElement("div");
  body.className = "note-main";
  if (note.bugReport) {
    const header = document.createElement("div");
    header.className = "report-head";
    const sourceScope = note.bugReport.sourceScope;
    header.append(
      createBadge("source", "From " + notebookName(sourceScope), sourceScope),
      createBadge(note.status === "done" ? "done" : "pending",
        (note.status === "done" ? "Fix available" : "Pending") + " · " +
        notebookName(viewedScope), viewedScope),
    );
    body.append(header);
  }

  const text = document.createElement("div");
  text.className = "note-text note-markdown";
  showMarkdown(text, note.html, note.text);
  const byline = document.createElement("small");
  byline.textContent = `${note.author === "agent" ? "Agent" : "You"} · ${new Date(note.createdAt).toLocaleString()}`;
  const metadata = document.createElement("div");
  metadata.className = "note-meta";
  const identifiers = document.createElement("div");
  identifiers.className = "note-identifiers";
  const shortId = document.createElement("span");
  shortId.className = "note-short-id";
  shortId.textContent = "#" + note.id.slice(0, 8);
  shortId.title = note.id;
  identifiers.append(shortId,
    createCopyButton("id", note.id),
    createCopyButton("reference", `Human Review note: ${note.id}\nProject: ${viewedScope}`));
  metadata.append(byline, identifiers);
  body.append(text, metadata);
  renderReportLinks(note, body);

  if (!inInbox) {
    const latest = [...handoffs].reverse().find(handoff =>
      handoff.notes.some(item => item.id === note.id));
    if (latest) {
      const delivery = document.createElement("small");
      delivery.className = "delivery-status";
      delivery.textContent = latest.status === "acknowledged" ? "Agent received" : "Awaiting agent";
      body.append(delivery);
    }
  }

  const actions = document.createElement("div");
  actions.className = "note-actions";
  const notePath = `/api/notepad/${encodeURIComponent(note.id)}?scope=${encodeURIComponent(viewedScope)}`;

  if (inInbox) {
    actions.append(createStatusButton(note, notePath, viewedScope, true));
    const promote = document.createElement("button");
    promote.type = "button";
    promote.className = "primary promote-report";
    promote.textContent = "Move to Notes";
    promote.addEventListener("click", async () => {
      promote.disabled = true;
      try {
        const path = `/api/notepad/reports/${encodeURIComponent(note.id)}/promote?scope=${encodeURIComponent(viewedScope)}`;
        const result = await request("POST", path);
        if (scope !== viewedScope) return;
        reports = reports.filter(item => item.id !== note.id);
        notes.push(result.note);
        view = "notes";
        filter = "all";
        render();
        message.textContent = "Report moved to Notes";
      } catch (error) {
        promote.disabled = false;
        message.textContent = error.message;
      }
    });
    actions.append(promote);
  } else if (editingNoteId === note.id) {
    renderInlineEditor(note, text, actions, notePath, viewedScope);
  } else if (confirmingDeleteId === note.id) {
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
    actions.append(createStatusButton(note, notePath, viewedScope, false));
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "status edit-note";
    edit.textContent = "Edit";
    edit.disabled = editingNoteId !== null;
    edit.setAttribute("aria-label", "Edit: " + note.text.slice(0, 70));
    edit.addEventListener("click", () => {
      editingNoteId = note.id;
      editingDraft = note.text;
      confirmingDeleteId = null;
      render();
      list.querySelector(".note-edit-input")?.focus();
    });
    actions.append(edit);
    if (!note.bugReport) {
      const report = document.createElement("button");
      report.type = "button";
      report.className = "status report-note";
      report.textContent = "Report issue";
      report.setAttribute("aria-label", "Report issue: " + note.text.slice(0, 70));
      report.addEventListener("click", () => {
        reportingNoteId = note.id;
        closeReportChoices();
        reportForm.reset();
        document.getElementById("report-note-title").textContent = note.text;
        reportPanel.hidden = false;
        reportDestination.focus();
      });
      actions.append(report);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "status delete";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete: ${note.text.slice(0, 70)}`);
    remove.addEventListener("click", () => {
      confirmingDeleteId = note.id;
      render();
    });
    actions.append(remove);
  }
  row.append(body, actions);
  return row;
}

function render() {
  const inbox = view === "inbox";
  document.getElementById("count").textContent =
    String(notes.filter(note => note.status === "pending").length);
  document.getElementById("inbox-count").textContent = String(reports.length);
  for (const button of viewButtons) {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  capture.hidden = inbox;
  filterBar.hidden = inbox;
  sendRow.hidden = inbox;
  reportPanel.hidden = inbox || !reportingNoteId;
  list.setAttribute("aria-label", inbox ? "Incoming issue reports" : "Saved notes list");
  for (const item of filters) {
    const active = item.dataset.filter === filter;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  }
  const knownIds = new Set(notes.map(note => note.id));
  selectedIds = new Set([...selectedIds].filter(id => knownIds.has(id)));
  updateSelection();
  const visible = inbox ? reports : notes.filter(note => filter === "all" || note.status === filter);
  const scrollPosition = list.scrollTop;
  list.replaceChildren(...[...visible].reverse().map(note => createNoteCard(note, scope, inbox)));
  empty.hidden = visible.length !== 0;
  empty.textContent = inbox ? "No incoming issue reports." : "No notes yet.";
  list.scrollTop = scrollPosition;
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
    reports = result.reports || [];
    handoffs = result.handoffs || [];
    projects = available.scopes || [];
    if (editingNoteId && !notes.some(note => note.id === editingNoteId)) {
      editingNoteId = null;
      editingDraft = "";
    }
    if (!editingNoteId) render();
    renderProjects();
    if (!editingNoteId) message.textContent = "Saved locally";
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

reportDestination.addEventListener("focus", () => {
  reportProjects.hidden = false;
  reportDestination.setAttribute("aria-expanded", "true");
  renderReportChoices();
});
reportDestination.addEventListener("input", () => {
  reportProjects.hidden = false;
  reportDestination.setAttribute("aria-expanded", "true");
  renderReportChoices();
});
reportDestination.addEventListener("keydown", event => {
  if (event.key === "Escape") closeReportChoices();
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (reportProjects.hidden) reportDestination.dispatchEvent(new Event("focus"));
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const count = reportProjects.querySelectorAll(".project-option").length;
    setActiveReportProject(activeReportProject < 0 && direction < 0
      ? count - 1 : activeReportProject + direction);
  }
  if (event.key === "Enter" && !reportProjects.hidden && activeReportProject >= 0) {
    event.preventDefault();
    reportProjects.querySelectorAll(".project-option")[activeReportProject].click();
  }
});
reportPicker.addEventListener("focusout", event => {
  if (!reportPicker.contains(event.relatedTarget)) closeReportChoices();
});

document.getElementById("cancel-report").addEventListener("click", () => {
  if (reporting) return;
  reportingNoteId = null;
  closeReportChoices();
  reportPanel.hidden = true;
  reportForm.reset();
});

reportForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (reporting || !reportingNoteId) return;
  const origin = scope;
  const noteId = reportingNoteId;
  const destination = reportDestination.value.trim();
  const details = {
    noteId, destination,
    expected: document.getElementById("report-expected").value,
    actual: document.getElementById("report-actual").value,
    steps: document.getElementById("report-steps").value,
  };
  reporting = true;
  document.getElementById("send-report").disabled = true;
  document.getElementById("cancel-report").disabled = true;
  try {
    const { report } = await request("POST",
      "/api/notepad/report?scope=" + encodeURIComponent(origin), details);
    if (scope !== origin) return;
    notes = notes.map(note => note.id === noteId ? {
      ...note,
      reportedTo: [...(note.reportedTo || []).filter(link =>
        link.scope !== destination || link.noteId !== report.id),
      { scope: destination, noteId: report.id, status: report.status }],
    } : note);
    reportingNoteId = null;
    closeReportChoices();
    reportPanel.hidden = true;
    reportForm.reset();
    render();
    await refresh();
    message.textContent = "Reported to " + notebookName(destination);
  } catch (error) {
    if (scope === origin) message.textContent = error.message;
  } finally {
    reporting = false;
    document.getElementById("send-report").disabled = false;
    document.getElementById("cancel-report").disabled = false;
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
  list.scrollTop = 0;
  render();
});
for (const button of viewButtons) button.addEventListener("click", () => {
  if (view === button.dataset.view) return;
  view = button.dataset.view;
  if (view === "inbox") {
    reportingNoteId = null;
    closeReportChoices();
    reportForm.reset();
  }
  list.scrollTop = 0;
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
    reports = [];
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
          if (!signal.aborted && line) {
            const event = JSON.parse(line);
            if (event.event === "focus") {
              if (event.scope && event.scope !== scope) switchScope(event.scope);
              window.focus();
            }
          }
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
