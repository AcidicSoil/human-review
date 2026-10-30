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
  let outlineQuery = "";
  const sources = () => Array.isArray(state.resourceSources) ? state.resourceSources : [];
  const supports = (kind) => kind === "plugins"
    ? state.catalog.some((category) => (category.plugins || []).length > 0)
    : sources().some((source) => source.kind === kind);
  const defaultMode = supports("plugins") ? "plugins" : supports("skills") ? "skills" : supports("skill-set") ? "skill-set" : "none";
  let resourceMode = (state.inspectorView?.mode === "none" || supports(state.inspectorView?.mode)) ? state.inspectorView.mode : defaultMode;
  let sourceId = state.inspectorView?.sourceId || sources().find((source) => source.kind === resourceMode)?.id || "";
  const collapsedOutlineNodes = new Set();
  const collapsedOutlinePhases = new Set();
  const collapsedResourceGroups = new Set();
  // Catalog entries stay collapsed until requested, including large inventories.
  const collapsedPluginRefs = new Set(state.catalog.flatMap((category) => (category.plugins || []).map((plugin) => plugin.ref)));
  let draggedActionId = null;
  let draggedSnapIn = null;

  const announce = (message) => {
    const live = document.getElementById("hr-loa-live");
    if (live) live.textContent = message;
  };
  const syncBootstrap = () => { bootstrapNode.textContent = safeJson(state); };
  const snapshot = () => ({ loa: state.loa, catalog: state.catalog,
    ...(state.resourceSources === undefined ? {} : { resourceSources: state.resourceSources }) });
  const bump = () => { syncBootstrap(); window.__hrReviewHost?.changed(snapshot()); };
  const actionIndex = (id) => state.loa.actions.findIndex((action) => action.id === id);
  const componentMap = () => {
    const map = new Map();
    for (const category of state.catalog) for (const plugin of category.plugins || []) {
      map.set(plugin.ref, { kind: "plugin", ref: plugin.ref, displayName: plugin.displayName });
      for (const skill of plugin.skills || []) {
        map.set(skill.ref, { kind: "skill", ref: skill.ref, pluginRef: plugin.ref, displayName: skill.displayName });
      }
    }
    for (const source of sources()) {
      const entries = source.kind === "skills" ? source.skills : (source.groups || []).flatMap((group) => group.skills || []);
      for (const skill of entries || []) {
        if (!map.has(skill.ref)) map.set(skill.ref, { ...skill, kind: "skill" });
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
    if (resourceMode !== "none" && !supports(resourceMode)) resourceMode = supports("plugins") ? "plugins" : supports("skills") ? "skills" : supports("skill-set") ? "skill-set" : "none";
    const choices = [
      ["plugins", "Plugins"], ["skills", "Skills"], ["skill-set", "Skill sets"], ["none", "None"],
    ];
    const selector = "<label class=\"hr-loa-resource-label\" for=\"hr-loa-resource-mode\">Resource type</label>" +
      "<select id=\"hr-loa-resource-mode\" class=\"hr-loa-search\">" +
      choices.filter(([kind]) => kind === "none" || supports(kind))
        .map(([kind, label]) => "<option value=\"" + kind + "\"" + (resourceMode === kind ? " selected" : "") + ">" + label + "</option>").join("") + "</select>";
    const available = sources().filter((source) => source.kind === resourceMode);
    if (resourceMode !== "plugins" && resourceMode !== "none" && !available.some((source) => source.id === sourceId)) sourceId = available[0]?.id || "";
    const sourceSelector = available.length ? "<label class=\"hr-loa-resource-label\" for=\"hr-loa-source-select\">" +
      (resourceMode === "skill-set" ? "Skill set" : "Skill source") + "</label>" +
      "<select id=\"hr-loa-source-select\" class=\"hr-loa-search\">" +
      available.map((source) => "<option value=\"" + esc(source.id) + "\"" + (source.id === sourceId ? " selected" : "") + ">" + esc(source.displayName) + "</option>").join("") + "</select>" : "";
    let body = "";
    const query = railQuery.trim().toLowerCase();
    if (resourceMode === "plugins") {
      body = state.catalog.map((category, categoryIndex) => {
        const plugins = (category.plugins || []).map((plugin, pluginIndex) => {
          const pluginText = [category.category, plugin.displayName, plugin.ref].join(" ").toLowerCase();
          const skills = (plugin.skills || []).filter((skill) => !query || pluginText.includes(query) ||
            [skill.displayName, skill.ref].join(" ").toLowerCase().includes(query));
          if (query && !pluginText.includes(query) && !skills.length) return "";
          const groupId = "hr-loa-plugin-" + categoryIndex + "-" + pluginIndex;
          const expanded = Boolean(skills.length) && (Boolean(query) || !collapsedPluginRefs.has(plugin.ref));
          const list = skills.length ? "<ul id=\"" + groupId + "\" class=\"hr-loa-skills\" data-plugin-skills=\"" + esc(plugin.ref) + "\"" + (expanded ? "" : " hidden") + ">" +
            skills.map((skill) => componentButton(skill)).join("") + "</ul>" : "";
          return "<article class=\"hr-loa-plugin\" data-plugin-ref=\"" + esc(plugin.ref) + "\"><button type=\"button\" class=\"hr-loa-plugin-toggle\" data-plugin-toggle=\"" + esc(plugin.ref) + "\" aria-expanded=\"" + expanded + "\" aria-controls=\"" + groupId + "\"" + (skills.length ? "" : " disabled") + "><span class=\"hr-loa-plugin-meta\"><span class=\"hr-loa-plugin-name\">" + esc(plugin.displayName) + "</span><small>" + esc(plugin.ref) + "</small></span><span class=\"hr-loa-plugin-chevron\" aria-hidden=\"true\">" + (expanded ? "▾" : "▸") + "</span></button>" + list + "</article>";
        }).join("");
        return plugins ? "<section class=\"hr-loa-category\"><h3 class=\"hr-loa-category-name\">" + esc(category.category) + "</h3>" + plugins + "</section>" : "";
      }).join("");
    } else if (resourceMode === "none") {
      body = "<p class=\"hr-loa-empty\">No resource inspector selected. Actions and existing attachments remain available.</p>";
    } else {
      const source = available.find((item) => item.id === sourceId);
      const groups = source?.kind === "skill-set" ? source.groups : source ? [{ id: source.id, displayName: source.displayName, skills: source.skills }] : [];
      body = groups.map((group, index) => {
        const matched = (group.skills || []).filter((skill) => !query || [skill.ref, skill.displayName, group.displayName].join(" ").toLowerCase().includes(query));
        if (query && !matched.length) return "";
        const key = source.id + ":" + group.id;
        const open = Boolean(query) || !collapsedResourceGroups.has(key);
        const listId = "hr-loa-source-group-" + index;
        return "<section class=\"hr-loa-plugin\"><button class=\"hr-loa-plugin-toggle\" type=\"button\" data-resource-group-toggle=\"" + esc(key) + "\" aria-expanded=\"" + open + "\" aria-controls=\"" + listId + "\"><span class=\"hr-loa-plugin-name\">" + esc(group.displayName) + "</span><span aria-hidden=\"true\">" + (open ? "▾" : "▸") + "</span></button>" +
          "<ul id=\"" + listId + "\" class=\"hr-loa-skills\"" + (open ? "" : " hidden") + ">" +
          matched.map((skill) => componentButton(skill)).join("") + "</ul></section>";
      }).join("");
    }
    const count = resourceMode === "plugins" ? state.catalog.reduce((sum, category) => sum + (category.plugins || []).reduce((n, plugin) => n + (plugin.skills || []).length, 0), 0)
      : resourceMode === "none" ? 0 : (available.find((source) => source.id === sourceId)?.kind === "skills"
        ? available.find((source) => source.id === sourceId)?.skills?.length || 0
        : available.find((source) => source.id === sourceId)?.groups?.reduce((n, group) => n + group.skills.length, 0) || 0);
    rail.innerHTML = "<div class=\"hr-loa-pane-heading\"><div><span class=\"hr-loa-eyebrow\">INSPECTOR</span><h2>Resources</h2></div><span class=\"hr-loa-pane-count\">" + count + "</span></div>" +
      selector + sourceSelector +
      (resourceMode === "none" ? "" : "<label class=\"hr-loa-resource-label\" for=\"hr-loa-search\">Find resources</label><input id=\"hr-loa-search\" type=\"search\" class=\"hr-loa-search\" placeholder=\"Search resources…\" value=\"" + esc(railQuery) + "\">") +
      (body || "<p class=\"hr-loa-empty\">No matching resources.</p>");
    if (restoreSelection) {
      const input = document.getElementById("hr-loa-search");
      input?.focus();
      input?.setSelectionRange(railQuery.length, railQuery.length);
    }
  };
  const componentButton = (component) => "<li><button type=\"button\" class=\"hr-loa-component\" draggable=\"true\" data-drag-ref=\"" + esc(component.ref) + "\" data-add-ref=\"" + esc(component.ref) + "\"><span>" + esc(component.displayName) + "</span><small>" + esc(component.ref) + "</small><b aria-hidden=\"true\">+</b></button></li>";

  const renderOutline = (restoreSelection = false) => {
    const outline = document.getElementById("hr-loa-outline");
    if (!outline) return;
    const query = outlineQuery.trim().toLowerCase();
    const byId = new Map(state.loa.actions.map((action) => [action.id, action]));
    const children = new Map();
    const roots = [];
    for (const action of state.loa.actions) {
      if (action.parentId && byId.has(action.parentId)) {
        if (!children.has(action.parentId)) children.set(action.parentId, []);
        children.get(action.parentId).push(action);
      } else roots.push(action);
    }
    const phases = new Map();
    for (const action of roots) {
      const phase = action.phase || "Actions";
      if (!phases.has(phase)) phases.set(phase, []);
      phases.get(phase).push(action);
    }
    const matches = (action) => !query || [action.id, action.content].join(" ").toLowerCase().includes(query);
    const hasMatch = (action) => matches(action) || (children.get(action.id) || []).some(hasMatch);
    const renderNode = (action, index, depth = 0, phaseMatches = false) => {
      if (!phaseMatches && !hasMatch(action)) return "";
      const sub = children.get(action.id) || [];
      const opened = Boolean(query) || !collapsedOutlineNodes.has(action.id);
      const hasChildren = sub.some((child) => phaseMatches || hasMatch(child));
      const current = action.id === selectedActionId;
      return "<div class=\"hr-loa-tree-node\" data-outline-node=\"" + esc(action.id) + "\" data-depth=\"" + depth + "\"><div class=\"hr-loa-tree-row\">" +
        (hasChildren ? "<button type=\"button\" class=\"hr-loa-tree-toggle\" data-outline-toggle=\"" + esc(action.id) + "\" aria-label=\"" + (opened ? "Collapse" : "Expand") + " children of " + esc(action.id) + "\" aria-expanded=\"" + opened + "\">" + (opened ? "▾" : "▸") + "</button>" : "<span class=\"hr-loa-tree-indent\" aria-hidden=\"true\"></span>") +
        "<button type=\"button\" role=\"treeitem\" class=\"hr-loa-outline-item\" data-outline-action=\"" + esc(action.id) + "\" aria-level=\"" + (depth + 2) + "\" aria-current=\"" + (current ? "step" : "false") + "\"><span class=\"hr-loa-outline-index\">" + String(index + 1).padStart(2, "0") + "</span><span class=\"hr-loa-outline-summary\"><span>" + esc(action.content || "Untitled action") + "</span><small>" + esc(action.id) + "</small></span>" + ((action.snapIns || []).length ? "<span class=\"hr-loa-outline-pins\">" + action.snapIns.length + "</span>" : "") + "</button></div>" +
        (hasChildren && opened ? "<div role=\"group\" data-outline-children=\"" + esc(action.id) + "\" class=\"hr-loa-tree-children\">" + sub.map((child) => renderNode(child, state.loa.actions.indexOf(child), depth + 1, phaseMatches)).join("") + "</div>" : "") + "</div>";
    };
    const countSubtree = (action) => 1 + (children.get(action.id) || []).reduce((total, child) => total + countSubtree(child), 0);
    const matchingPhases = [...phases.entries()].filter(([phase, entries]) => !query || phase.toLowerCase().includes(query) || entries.some(hasMatch));
    const groups = matchingPhases.map(([phase, entries]) => {
      const opened = Boolean(query) || !collapsedOutlinePhases.has(phase);
      const phaseMatches = Boolean(query) && phase.toLowerCase().includes(query);
      return "<section class=\"hr-loa-tree-phase\"><button type=\"button\" role=\"treeitem\" class=\"hr-loa-tree-phase-toggle\" data-outline-phase=\"" + esc(phase) + "\" aria-expanded=\"" + opened + "\"><span aria-hidden=\"true\">" + (opened ? "▾" : "▸") + "</span><span>" + esc(phase) + "</span><small>" + entries.reduce((total, entry) => total + countSubtree(entry), 0) + "</small></button>" +
        "<div role=\"group\" class=\"hr-loa-tree-phase-children\"" + (opened ? "" : " hidden") + ">" + entries.map((entry) => renderNode(entry, state.loa.actions.indexOf(entry), 0, phaseMatches)).join("") + "</div></section>";
    }).join("");
    outline.innerHTML = "<div class=\"hr-loa-pane-heading\"><div><span class=\"hr-loa-eyebrow\">NAVIGATE</span><h2>Action tree</h2></div><span class=\"hr-loa-pane-count\">" + state.loa.actions.length + "</span></div>" +
      "<label class=\"hr-loa-sr-only\" for=\"hr-loa-action-search\">Find actions</label><input id=\"hr-loa-action-search\" type=\"search\" class=\"hr-loa-search\" autocomplete=\"off\" placeholder=\"Find actions…\" value=\"" + esc(outlineQuery) + "\">" +
      "<p class=\"hr-loa-outline-hint\">" + (query ? state.loa.actions.filter(matches).length : state.loa.actions.length) + " of " + state.loa.actions.length + " actions</p>" +
      "<nav class=\"hr-loa-outline-list\" role=\"tree\" aria-label=\"Action tree\">" +
      (groups || "<p class=\"hr-loa-empty\">No matching actions.</p>") + "</nav>";
    if (restoreSelection) {
      const search = document.getElementById("hr-loa-action-search");
      search?.focus();
      search?.setSelectionRange(outlineQuery.length, outlineQuery.length);
    }
  };
  const renderActions = () => {
    const host = document.getElementById("hr-loa-actions");
    if (!host) return;
    const components = componentMap();
    const cards = state.loa.actions.map((action, index) => {
      const selected = action.id === selectedActionId ? "true" : "false";
      const expanded = selected === "true";
      const editing = action.id === editingActionId;
      const content = editing
        ? "<label class=\"hr-loa-edit-label\">Action content<textarea class=\"hr-loa-edit\" data-edit-input>" + esc(action.content) + "</textarea></label><div class=\"hr-loa-edit-actions\"><button data-edit-save>Save</button><button data-edit-cancel>Cancel</button></div>"
        : "<div class=\"hr-loa-action-content\">" + esc(action.content) + "</div>";
      const snaps = (action.snapIns || []).map((snapIn) => {
        const ref = refOf(snapIn);
        const item = components.get(ref);
        const label = snapIn?.displayName || item?.displayName || ref;
        const unavailable = !item;
        return "<li class=\"hr-loa-snap-in" + (unavailable ? " is-unavailable" : "") + "\" data-ref=\"" + esc(ref) + "\"><span>" + esc(label) + (unavailable ? " · unavailable" : "") + "</span><button data-snap-in-remove=\"" + esc(ref) + "\" aria-label=\"Remove " + esc(label) + "\">×</button></li>";
      }).join("");
      return "<article class=\"hr-loa-action\" role=\"option\" tabindex=\"0\" draggable=\"" + (!editing) + "\" aria-selected=\"" + selected + "\" data-expanded=\"" + expanded + "\" data-action-id=\"" + esc(action.id) + "\"><div class=\"hr-loa-action-head\"><span class=\"hr-loa-action-index\">" + (index + 1) + "</span><code>" + esc(action.id) + "</code><div class=\"hr-loa-action-controls\"><button data-action-move-up aria-label=\"Move action up\" " + (index === 0 ? "disabled" : "") + ">↑</button><button data-action-move-down aria-label=\"Move action down\" " + (index === state.loa.actions.length - 1 ? "disabled" : "") + ">↓</button><button data-action-edit>Edit</button>" + (window.__hrReviewHost?.connected ? "<button data-action-comment>Comment</button>" : "") + "<button data-action-remove>Remove</button></div></div>" + content + "<ul class=\"hr-loa-snap-ins\">" + snaps + "</ul></article>";
    }).join("");
    host.innerHTML = "<div class=\"hr-loa-actions-title\"><div><span class=\"hr-loa-eyebrow\">WORKBENCH</span><h2>Review actions <span class=\"hr-loa-count\">" + state.loa.actions.length + "</span></h2></div><button type=\"button\" id=\"hr-loa-add-action\">+ New action</button></div>" + "<p class=\"hr-loa-workbench-hint\">Select an action to edit, reorder, comment, or attach skills. Drag cards to reorder.</p>" + "<div class=\"hr-loa-action-list\" role=\"listbox\" aria-label=\"Review actions\">" + (cards || "<p class=\"hr-loa-empty\">No actions yet. Add one to begin.</p>") + "</div>";
    renderOutline();
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
    const clean = JSON.stringify(snapshot(), null, 2) + "\n";
    const name = artifactName().replace(/(?:\.loa)?(?:\.review)?\.html$/i, "") + ".loa.json";
    saveBlob(clean, name, "application/json;charset=utf-8");
    announce("LOA JSON downloaded.");
  };

  root.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    const card = event.target.closest("[data-action-id]");
    if (target?.dataset.outlinePhase !== undefined) {
      const phase = target.dataset.outlinePhase;
      if (collapsedOutlinePhases.has(phase)) collapsedOutlinePhases.delete(phase);
      else collapsedOutlinePhases.add(phase);
      renderOutline();
    } else if (target?.dataset.outlineToggle !== undefined) {
      const id = target.dataset.outlineToggle;
      if (collapsedOutlineNodes.has(id)) collapsedOutlineNodes.delete(id);
      else collapsedOutlineNodes.add(id);
      renderOutline();
    } else if (target?.dataset.resourceGroupToggle !== undefined) {
      const key = target.dataset.resourceGroupToggle;
      if (collapsedResourceGroups.has(key)) collapsedResourceGroups.delete(key);
      else collapsedResourceGroups.add(key);
      renderRail();
    } else if (target?.dataset.outlineAction) {
      selectedActionId = target.dataset.outlineAction;
      editingActionId = null;
      renderActions();
      focusAction(selectedActionId);
    } else if (target?.dataset.pluginToggle) {
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
    } else if (target?.dataset.actionComment !== undefined) {
      event.stopPropagation();
      const action = state.loa.actions.find((entry) => entry.id === card?.dataset.actionId);
      if (action) window.__hrReviewHost?.comment({ mode: "loa", actionId: action.id }, action.content.slice(0, 240));
    } else if (target?.dataset.actionRemove !== undefined) {
      event.stopPropagation();
      const id = card?.dataset.actionId;
      const removed = state.loa.actions.find((action) => action.id === id);
      const remaining = state.loa.actions.filter((action) => action.id !== id).map((action) => {
        if (action.parentId !== id) return action;
        const next = { ...action };
        if (removed.parentId) next.parentId = removed.parentId;
        else {
          delete next.parentId;
          if (!next.phase && removed.phase) next.phase = removed.phase;
        }
        return next;
      });
      setActions(remaining);
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
      outlineQuery = "";
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
  root.addEventListener("change", (event) => {
    if (event.target.id === "hr-loa-resource-mode") {
      resourceMode = event.target.value;
      sourceId = sources().find((source) => source.kind === resourceMode)?.id || "";
      railQuery = "";
      state.inspectorView = { mode: resourceMode, sourceId };
      renderRail();
      syncBootstrap();
    } else if (event.target.id === "hr-loa-source-select") {
      sourceId = event.target.value;
      railQuery = "";
      state.inspectorView = { mode: resourceMode, sourceId };
      renderRail();
      syncBootstrap();
    }
  });
  root.addEventListener("input", (event) => {
    if (event.target.id === "hr-loa-action-search") {
      outlineQuery = event.target.value;
      renderOutline(true);
    } else if (event.target.id === "hr-loa-search") {
      railQuery = event.target.value;
      renderRail(true);
    }
  });
  root.addEventListener("keydown", (event) => {
    const treeItem = event.target.closest("[data-outline-action]");
    if (treeItem && event.target === treeItem) {
      const id = treeItem.dataset.outlineAction;
      const children = [...document.querySelectorAll("[data-outline-children]")].find((node) => node.dataset.outlineChildren === id);
      const parentGroup = treeItem.closest("[data-outline-children]");
      const nodes = [...document.querySelectorAll("[data-outline-action]")].filter((node) => !node.closest("[hidden]"));
      const index = nodes.indexOf(treeItem);
      let focusId = null;
      if (event.key === "ArrowRight") {
        if (collapsedOutlineNodes.has(id)) {
          collapsedOutlineNodes.delete(id);
          focusId = id;
          renderOutline();
        } else if (children) {
          focusId = children.querySelector("[data-outline-action]")?.dataset.outlineAction;
        }
      } else if (event.key === "ArrowLeft") {
        if (children && !collapsedOutlineNodes.has(id)) {
          collapsedOutlineNodes.add(id);
          focusId = id;
          renderOutline();
        } else if (parentGroup) {
          focusId = parentGroup.dataset.outlineChildren;
        }
      } else if (event.key === "ArrowDown") focusId = nodes[index + 1]?.dataset.outlineAction;
      else if (event.key === "ArrowUp") focusId = nodes[index - 1]?.dataset.outlineAction;
      else if (event.key === "Home") focusId = nodes[0]?.dataset.outlineAction;
      else if (event.key === "End") focusId = nodes[nodes.length - 1]?.dataset.outlineAction;
      else if (event.key === "Enter" || event.key === " ") {
        selectedActionId = id;
        renderActions();
        focusAction(id);
        event.preventDefault();
        return;
      }
      if (focusId) {
        event.preventDefault();
        [...document.querySelectorAll("[data-outline-action]")].find((node) => node.dataset.outlineAction === focusId)?.focus();
      }
      return;
    }
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

  const toolbar = document.createElement("header");
  toolbar.className = "hr-loa-toolbar";
  toolbar.innerHTML = "<div class=\"hr-loa-brand\"><span class=\"hr-loa-brand-mark\" aria-hidden=\"true\">L</span><div class=\"hr-loa-brand-copy\"><span class=\"hr-loa-eyebrow\">HUMAN REVIEW / STRUCTURED ACTIONS</span><h1 id=\"hr-loa-document-title\"></h1></div></div><div class=\"hr-loa-header-actions\"><span class=\"hr-loa-session-pill\">Offline-ready</span><button id=\"hr-loa-save-html\" type=\"button\">Save reviewed HTML</button><button id=\"hr-loa-save-json\" type=\"button\">Save clean LOA JSON</button></div>";
  toolbar.querySelector("#hr-loa-document-title").textContent = state.loa.title || "List of actions";
  const live = document.createElement("div");
  live.id = "hr-loa-live";
  live.className = "hr-loa-live";
  live.setAttribute("aria-live", "polite");
  const layout = document.createElement("div");
  layout.className = "hr-loa-layout";
  layout.innerHTML = "<aside id=\"hr-loa-outline\" class=\"hr-loa-outline\" aria-label=\"Actions\"></aside><main id=\"hr-loa-actions\" class=\"hr-loa-actions\"></main><aside id=\"hr-loa-rail\" class=\"hr-loa-rail\" aria-label=\"Skill catalog\"></aside>";
  const shell = document.createElement("div"); shell.className = "hr-loa-shell"; shell.append(toolbar, live, layout);
  root.replaceChildren(shell);
  renderRail();
  renderActions();
  window.__hrReviewHost?.register({
    mode: "loa",
    restore(document) {
      state = { ...state, loa: clone(document.loa), catalog: clone(document.catalog),
        ...(document.resourceSources === undefined ? {} : { resourceSources: clone(document.resourceSources) }) };
      selectedActionId = state.loa.actions[0]?.id || null;
      editingActionId = null;
      syncBootstrap();
      renderRail(); renderActions();
    },
    activate(anchor) { if (anchor?.mode === "loa") focusAction(anchor.actionId); },
    onConnect() {
      const pill = document.querySelector(".hr-loa-session-pill");
      if (pill) pill.textContent = "Live review session";
      renderActions();
    },
  });
})();`;
