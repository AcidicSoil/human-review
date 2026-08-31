export const LOA_CLIENT_SOURCE = String.raw`(() => {
  const bootstrapNode = document.getElementById("hr-loa-bootstrap");
  const root = document.getElementById("hr-loa-app");
  if (!bootstrapNode || !root) return;

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const refOf = (snapIn) => typeof snapIn === "string" ? snapIn : snapIn?.ref;
  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
  const safeJson = (value) => JSON.stringify(value)
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
    .replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
    .replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");

  let state;
  try { state = clone(JSON.parse(bootstrapNode.textContent || "{}")); } catch { return; }
  if (!state.loa || !Array.isArray(state.loa.actions)) return;
  state = { ...state, catalog: Array.isArray(state.catalog) ? state.catalog : [], loa: { ...state.loa, actions: state.loa.actions.map((action) => ({ ...action, snapIns: Array.isArray(action.snapIns) ? action.snapIns : [] })) } };
  let selectedActionId = state.loa.actions[0]?.id || null;
  let editingActionId = null;
  let railQuery = "";
  const collapsedPluginRefs = new Set();
  let draggedActionId = null;
  let draggedSnapIn = null;

  const announce = (message) => {
    const live = document.getElementById("hr-loa-live");
    if (live) live.textContent = message;
  };
  const syncBootstrap = () => { bootstrapNode.textContent = safeJson(state); };
  const bump = () => syncBootstrap();
  const actionIndex = (id) => state.loa.actions.findIndex((action) => action.id === id);
  const componentMap = () => {
    const map = new Map();
    for (const category of state.catalog) for (const plugin of category.plugins || []) {
      map.set(plugin.ref, { kind: "plugin", ref: plugin.ref, displayName: plugin.displayName });
      for (const skill of plugin.skills || []) {
        map.set(skill.ref, { kind: "skill", ref: skill.ref, pluginRef: plugin.ref, displayName: skill.displayName });
      }
    }
    return map;
  };
  const focusAction = (id) => {
    const match = [...document.querySelectorAll("[data-action-id]")].find((node) => node.dataset.actionId === id);
    match?.focus();
  };
  const setActions = (actions, focusId = null) => {
    state = { ...state, loa: { ...state.loa, actions } };
    if (selectedActionId && !actions.some((action) => action.id === selectedActionId)) {
      selectedActionId = actions[0]?.id || null;
    }
    bump();
    renderActions();
    if (focusId) focusAction(focusId);
  };
  const addSnap = (actionId, snapIn) => {
    const index = actionIndex(actionId);
    if (index < 0 || !snapIn?.ref) return;
    const action = state.loa.actions[index];
    if ((action.snapIns || []).some((item) => refOf(item) === snapIn.ref)) {
      announce("That component is already attached to this action.");
      return;
    }
    const actions = state.loa.actions.map((item, itemIndex) => itemIndex === index
      ? { ...item, snapIns: [...(item.snapIns || []), clone(snapIn)] } : item);
    setActions(actions, actionId);
    announce("Component added.");
  };
  const moveAction = (id, delta) => {
    const index = actionIndex(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= state.loa.actions.length) return;
    const actions = [...state.loa.actions];
    const [moved] = actions.splice(index, 1);
    actions.splice(target, 0, moved);
    setActions(actions, id);
    announce("Action moved " + (delta < 0 ? "up" : "down") + ".");
  };
  const reorderAction = (id, targetIndex) => {
    const from = actionIndex(id);
    if (from < 0) return;
    const actions = [...state.loa.actions];
    const [moved] = actions.splice(from, 1);
    actions.splice(Math.max(0, Math.min(targetIndex, actions.length)), 0, moved);
    setActions(actions, id);
    announce("Action reordered.");
  };

  const renderRail = (restoreSelection = false) => {
    const rail = document.getElementById("hr-loa-rail");
    if (!rail) return;
    const query = railQuery.trim().toLowerCase();
    const categories = state.catalog.map((category, categoryIndex) => {
      const plugins = (category.plugins || []).map((plugin, pluginIndex) => {
        const pluginText = [category.category, plugin.displayName, plugin.ref].join(" ").toLowerCase();
        const skills = (plugin.skills || []).filter((skill) => !query || pluginText.includes(query) ||
          [skill.displayName, skill.ref].join(" ").toLowerCase().includes(query));
        if (query && !pluginText.includes(query) && !skills.length) return "";
        const groupId = "hr-loa-plugin-" + categoryIndex + "-" + pluginIndex;
        const expanded = Boolean(skills.length) && (Boolean(query) || !collapsedPluginRefs.has(plugin.ref));
        const skillHtml = skills.map((skill) => componentButton(skill)).join("");
        const list = skillHtml
          ? "<ul id=\"" + groupId + "\" class=\"hr-loa-skills\" data-plugin-skills=\"" + esc(plugin.ref) + "\"" + (expanded ? "" : " hidden") + ">" + skillHtml + "</ul>"
          : "";
        const disabled = skillHtml ? "" : " disabled";
        return "<article class=\"hr-loa-plugin\" data-plugin-ref=\"" + esc(plugin.ref) + "\"><button type=\"button\" class=\"hr-loa-plugin-toggle\" data-plugin-toggle=\"" + esc(plugin.ref) + "\" aria-expanded=\"" + expanded + "\" aria-controls=\"" + groupId + "\"" + disabled + "><span class=\"hr-loa-plugin-meta\"><span class=\"hr-loa-plugin-name\">" + esc(plugin.displayName) + "</span><small>" + esc(plugin.ref) + "</small></span><span class=\"hr-loa-plugin-chevron\" aria-hidden=\"true\">" + (expanded ? "▾" : "▸") + "</span></button>" + list + "</article>";
      }).join("");
      return plugins ? "<section class=\"hr-loa-category\"><h3 class=\"hr-loa-category-name\">" + esc(category.category) + "</h3>" + plugins + "</section>" : "";
    }).join("");
    rail.innerHTML = "<h2>Components</h2><input id=\"hr-loa-search\" class=\"hr-loa-search\" type=\"search\" value=\"" + esc(railQuery) + "\" placeholder=\"Search plugins and skills\" aria-label=\"Search plugins and skills\">" + (categories || "<p class=\"hr-loa-empty\">No matching components.</p>");
    if (restoreSelection) {
      const search = document.getElementById("hr-loa-search");
      search?.focus();
      search?.setSelectionRange(railQuery.length, railQuery.length);
    }
  };
  const componentButton = (component) => "<li><button type=\"button\" class=\"hr-loa-component\" draggable=\"true\" data-drag-ref=\"" + esc(component.ref) + "\" data-add-ref=\"" + esc(component.ref) + "\"><span>" + esc(component.displayName) + "</span><small>" + esc(component.ref) + "</small><b aria-hidden=\"true\">+</b></button></li>";

  const renderActions = () => {
    const host = document.getElementById("hr-loa-actions");
    if (!host) return;
    const cards = state.loa.actions.map((action, index) => {
      const selected = action.id === selectedActionId ? "true" : "false";
      const editing = action.id === editingActionId;
      const content = editing
        ? "<label class=\"hr-loa-edit-label\">Action content<textarea class=\"hr-loa-edit\" data-edit-input>" + esc(action.content) + "</textarea></label><div class=\"hr-loa-edit-actions\"><button data-edit-save>Save</button><button data-edit-cancel>Cancel</button></div>"
        : "<div class=\"hr-loa-action-content\">" + esc(action.content) + "</div>";
      const snaps = (action.snapIns || []).map((snapIn) => {
        const ref = refOf(snapIn);
        const item = componentMap().get(ref);
        const label = snapIn?.displayName || item?.displayName || ref;
        const unavailable = !item;
        return "<li class=\"hr-loa-snap-in" + (unavailable ? " is-unavailable" : "") + "\" data-ref=\"" + esc(ref) + "\"><span>" + esc(label) + (unavailable ? " · unavailable" : "") + "</span><button data-snap-in-remove=\"" + esc(ref) + "\" aria-label=\"Remove " + esc(label) + "\">×</button></li>";
      }).join("");
      return "<article class=\"hr-loa-action\" role=\"option\" tabindex=\"0\" draggable=\"" + (!editing) + "\" aria-selected=\"" + selected + "\" data-action-id=\"" + esc(action.id) + "\"><div class=\"hr-loa-action-head\"><span class=\"hr-loa-action-index\">" + (index + 1) + "</span><code>" + esc(action.id) + "</code><div class=\"hr-loa-action-controls\"><button data-action-move-up aria-label=\"Move action up\" " + (index === 0 ? "disabled" : "") + ">↑</button><button data-action-move-down aria-label=\"Move action down\" " + (index === state.loa.actions.length - 1 ? "disabled" : "") + ">↓</button><button data-action-edit>Edit</button><button data-action-remove>Remove</button></div></div>" + content + "<ul class=\"hr-loa-snap-ins\">" + snaps + "</ul></article>";
    }).join("");
    host.innerHTML = "<div class=\"hr-loa-actions-title\"><h2>List of actions</h2><button id=\"hr-loa-add-action\">+ Add action</button></div>" + (cards || "<p class=\"hr-loa-empty\">No actions yet. Add one to begin.</p>");
  };

  const saveBlob = (content, name, type) => {
    const blob = new Blob([content], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  const artifactName = () => String(state.artifactName || "loa.review.html");
  const saveReviewedHtml = () => {
    syncBootstrap();
    const copy = document.documentElement.cloneNode(true);
    const node = copy.querySelector("#hr-loa-bootstrap");
    if (node) node.textContent = safeJson(state);
    const name = artifactName().replace(/\.loa\.review\.html$/i, "") + ".loa.reviewed.html";
    saveBlob("<!doctype html>\n" + copy.outerHTML + "\n", name, "text/html;charset=utf-8");
    announce("Reviewed HTML downloaded.");
  };
  const saveLoaJson = () => {
    const clean = JSON.stringify({ loa: state.loa, catalog: state.catalog }, null, 2) + "\n";
    const name = artifactName().replace(/(?:\.loa)?(?:\.review)?\.html$/i, "") + ".loa.json";
    saveBlob(clean, name, "application/json;charset=utf-8");
    announce("LOA JSON downloaded.");
  };

  root.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    const card = event.target.closest("[data-action-id]");
    if (target?.dataset.pluginToggle) {
      event.preventDefault();
      const ref = target.dataset.pluginToggle;
      if (collapsedPluginRefs.has(ref)) collapsedPluginRefs.delete(ref);
      else collapsedPluginRefs.add(ref);
      renderRail();
      announce((collapsedPluginRefs.has(ref) ? "Collapsed " : "Expanded ") + (target.querySelector(".hr-loa-plugin-name")?.textContent || "plugin") + ".");
    } else if (target?.dataset.addRef) {
      event.preventDefault();
      addSnapInFromRef(target.dataset.addRef);
    } else if (target?.dataset.actionMoveUp !== undefined) {
      event.stopPropagation();
      moveAction(card?.dataset.actionId, -1);
    } else if (target?.dataset.actionMoveDown !== undefined) {
      event.stopPropagation();
      moveAction(card?.dataset.actionId, 1);
    } else if (target?.dataset.actionEdit !== undefined) {
      event.stopPropagation();
      editingActionId = card?.dataset.actionId || null;
      renderActions();
      document.querySelector("[data-edit-input]")?.focus();
    } else if (target?.dataset.editSave !== undefined) {
      event.stopPropagation();
      const value = card?.querySelector("[data-edit-input]")?.value;
      if (card && typeof value === "string") {
        setActions(state.loa.actions.map((action) => action.id === card.dataset.actionId ? { ...action, content: value } : action), card.dataset.actionId);
      }
      editingActionId = null;
      renderActions();
      announce("Action saved.");
    } else if (target?.dataset.editCancel !== undefined) {
      event.stopPropagation();
      editingActionId = null;
      renderActions();
    } else if (target?.dataset.actionRemove !== undefined) {
      event.stopPropagation();
      const id = card?.dataset.actionId;
      setActions(state.loa.actions.filter((action) => action.id !== id));
      announce("Action removed.");
    } else if (target?.dataset.snapInRemove) {
      event.stopPropagation();
      const ref = target.dataset.snapInRemove;
      setActions(state.loa.actions.map((action) => action.id === card.dataset.actionId
        ? { ...action, snapIns: action.snapIns.filter((snapIn) => refOf(snapIn) !== ref) } : action), card.dataset.actionId);
      announce("Component removed.");
    } else if (target?.id === "hr-loa-add-action") {
      const ids = new Set(state.loa.actions.map((action) => action.id));
      let number = state.loa.actions.length + 1;
      while (ids.has("action-" + number)) number += 1;
      const id = "action-" + number;
      selectedActionId = id;
      editingActionId = id;
      setActions([...state.loa.actions, { id, content: "", snapIns: [] }], id);
      renderActions();
      document.querySelector("[data-edit-input]")?.focus();
      announce("Action added.");
    } else if (target?.id === "hr-loa-save-html") {
      saveReviewedHtml();
    } else if (target?.id === "hr-loa-save-json") {
      saveLoaJson();
    } else if (card && !target && !event.target.closest("input,textarea,select")) {
      selectedActionId = card.dataset.actionId;
      renderActions();
    }
  });
  root.addEventListener("input", (event) => {
    if (event.target.id === "hr-loa-search") {
      railQuery = event.target.value;
      renderRail(true);
    }
  });
  root.addEventListener("keydown", (event) => {
    const card = event.target.closest("[data-action-id]");
    if (!card || event.target !== card) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectedActionId = card.dataset.actionId;
      renderActions();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveAction(card.dataset.actionId, -1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveAction(card.dataset.actionId, 1);
    }
  });
  root.addEventListener("dragstart", (event) => {
    const component = event.target.closest("[data-drag-ref]");
    const card = event.target.closest("[data-action-id]");
    if (component && !card) {
      draggedSnapIn = component.dataset.dragRef;
      event.dataTransfer?.setData("text/plain", "component:" + draggedSnapIn);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
      return;
    }
    if (card && !event.target.closest("button,textarea,input")) {
      draggedActionId = card.dataset.actionId;
      event.dataTransfer?.setData("text/plain", "action:" + draggedActionId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    }
  });
  const clearDropIndicators = () => root.querySelectorAll(".is-drop-target, .is-drop-before, .is-drop-after").forEach((node) => { node.classList.remove("is-drop-target", "is-drop-before", "is-drop-after"); delete node.dataset.dropPlacement; });
  root.addEventListener("dragover", (event) => {
    const card = event.target.closest("[data-action-id]");
    if (!card || (!draggedSnapIn && !draggedActionId)) return;
    event.preventDefault(); clearDropIndicators(); card.classList.add("is-drop-target");
    if (!draggedActionId) return;
    const rect = card.getBoundingClientRect();
    const after = event.clientY > rect.top + (card.offsetHeight || rect.height) / 2;
    card.dataset.dropPlacement = after ? "after" : "before";
    card.classList.add(after ? "is-drop-after" : "is-drop-before");
  });
  root.addEventListener("dragleave", (event) => { if (!root.contains(event.relatedTarget)) clearDropIndicators(); });
  root.addEventListener("drop", (event) => {
    const card = event.target.closest("[data-action-id]");
    if (!card) return;
    event.preventDefault();
    const placement = card.dataset.dropPlacement;
    if (draggedSnapIn) addSnapInFromRef(draggedSnapIn, card.dataset.actionId);
    else if (draggedActionId) { const target = actionIndex(card.dataset.actionId) + (placement === "after" ? 1 : 0); const from = actionIndex(draggedActionId); reorderAction(draggedActionId, from < target ? target - 1 : target); }
    draggedSnapIn = null; draggedActionId = null; clearDropIndicators();
  });
  root.addEventListener("dragend", () => { draggedSnapIn = null; draggedActionId = null; clearDropIndicators(); });

  function addSnapInFromRef(ref, actionId = selectedActionId) {
    const component = componentMap().get(ref);
    if (component) addSnap(actionId, component);
  }

  const toolbar = document.createElement("div");
  toolbar.className = "hr-loa-toolbar";
  toolbar.innerHTML = "<span>LOA review</span><span class=\"hr-loa-spacer\"></span><button id=\"hr-loa-save-html\">Save reviewed HTML</button><button id=\"hr-loa-save-json\">Save clean LOA JSON</button>";
  const live = document.createElement("div");
  live.id = "hr-loa-live";
  live.className = "hr-loa-live";
  live.setAttribute("aria-live", "polite");
  const layout = document.createElement("div");
  layout.className = "hr-loa-layout";
  layout.innerHTML = "<aside id=\"hr-loa-rail\" class=\"hr-loa-rail\"></aside><main id=\"hr-loa-actions\" class=\"hr-loa-actions\"></main>";
  const shell = document.createElement("div"); shell.className = "hr-loa-shell"; shell.append(toolbar, live, layout);
  root.replaceChildren(shell);
  renderRail();
  renderActions();
})();`;
