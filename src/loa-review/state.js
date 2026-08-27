const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function assertState(state) {
  if (!isRecord(state) || !isRecord(state.loa) || !Array.isArray(state.loa.actions)) {
    throw new TypeError("LOA state must contain loa.actions.");
  }
  return state;
}

function snapInRef(snapIn) {
  return isRecord(snapIn) ? snapIn.ref : snapIn;
}

function copySnapIn(snapIn) {
  return isRecord(snapIn) ? { ...snapIn } : snapIn;
}

function copyAction(action) {
  return { ...action, snapIns: Array.isArray(action.snapIns) ? action.snapIns.map(copySnapIn) : [] };
}

function withActions(state, actions) {
  return { ...state, loa: { ...state.loa, actions } };
}

function actionIndex(state, actionId) {
  return state.loa.actions.findIndex((action) => action.id === actionId);
}

function catalogRefs(catalog) {
  const refs = new Set();
  for (const category of Array.isArray(catalog) ? catalog : []) {
    for (const plugin of Array.isArray(category?.plugins) ? category.plugins : []) {
      if (typeof plugin.ref === "string") refs.add(plugin.ref);
      for (const skill of Array.isArray(plugin.skills) ? plugin.skills : []) {
        if (typeof skill.ref === "string") refs.add(skill.ref);
      }
    }
  }
  return refs;
}

function normalizeSnapIn(snapIn) {
  if (!isRecord(snapIn)) throw new TypeError("snap-in must be an object.");
  if (snapIn.kind !== "plugin" && snapIn.kind !== "skill") throw new TypeError("snap-in kind must be plugin or skill.");
  if (typeof snapIn.ref !== "string" || !snapIn.ref.trim()) throw new TypeError("snap-in must have a non-empty ref.");
  return { ...snapIn };
}

function normalizeSnapIns(snapIns, actionId) {
  const normalized = snapIns.map(normalizeSnapIn);
  const refs = new Set();
  for (const snapIn of normalized) {
    const ref = snapInRef(snapIn);
    if (refs.has(ref)) throw new TypeError(`Duplicate snap-in ref on action ${actionId}: ${ref}.`);
    refs.add(ref);
  }
  return normalized;
}

export function addAction(state, action) {
  assertState(state);
  if (!isRecord(action) || typeof action.id !== "string" || !action.id.trim()) {
    throw new TypeError("action.id must be a non-empty string.");
  }
  if (state.loa.actions.some((item) => item.id === action.id)) {
    throw new TypeError(`Duplicate action ID: ${action.id}.`);
  }
  const next = { ...action, snapIns: Array.isArray(action.snapIns) ? normalizeSnapIns(action.snapIns, action.id) : [] };
  return withActions(state, [...state.loa.actions.map(copyAction), next]);
}

export function removeAction(state, actionId) {
  assertState(state);
  if (actionIndex(state, actionId) < 0) return state;
  return withActions(state, state.loa.actions.filter((action) => action.id !== actionId).map(copyAction));
}

export function editAction(state, actionId, changes = {}) {
  assertState(state);
  const index = actionIndex(state, actionId);
  if (index < 0 || !isRecord(changes)) return state;
  const current = state.loa.actions[index];
  const nextId = changes.id === undefined ? current.id : changes.id;
  if (typeof nextId !== "string" || !nextId.trim()) throw new TypeError("action.id must be a non-empty string.");
  if (nextId !== current.id && state.loa.actions.some((action) => action.id === nextId)) {
    throw new TypeError(`Duplicate action ID: ${nextId}.`);
  }
  if (changes.snapIns !== undefined && !Array.isArray(changes.snapIns)) throw new TypeError("action.snapIns must be an array.");
  const next = { ...current, ...changes, id: nextId };
  next.snapIns = changes.snapIns === undefined ? (current.snapIns || []).map(copySnapIn) : normalizeSnapIns(changes.snapIns, nextId);
  return withActions(state, state.loa.actions.map((action, itemIndex) => itemIndex === index ? next : copyAction(action)));
}

export function reorderActions(state, actionId, targetIndex) {
  assertState(state);
  if (!Number.isInteger(targetIndex)) throw new TypeError("targetIndex must be an integer.");
  const fromIndex = actionIndex(state, actionId);
  if (fromIndex < 0) return state;
  const actions = state.loa.actions.map(copyAction);
  const [moved] = actions.splice(fromIndex, 1);
  actions.splice(Math.max(0, Math.min(targetIndex, actions.length)), 0, moved);
  return withActions(state, actions);
}

export function moveAction(state, actionId, direction) {
  assertState(state);
  const index = actionIndex(state, actionId);
  if (index < 0) return state;
  if (direction === "up") return reorderActions(state, actionId, index - 1);
  if (direction === "down") return reorderActions(state, actionId, index + 1);
  throw new TypeError("direction must be up or down.");
}

export function addSnapIn(state, actionId, snapIn) {
  assertState(state);
  const index = actionIndex(state, actionId);
  if (index < 0) return state;
  const normalized = normalizeSnapIn(snapIn);
  const action = state.loa.actions[index];
  if (action.snapIns.some((item) => snapInRef(item) === snapInRef(normalized))) return state;
  const next = { ...copyAction(action), snapIns: [...action.snapIns.map(copySnapIn), normalized] };
  return withActions(state, state.loa.actions.map((item, itemIndex) => itemIndex === index ? next : copyAction(item)));
}

export function removeSnapIn(state, actionId, ref) {
  assertState(state);
  const index = actionIndex(state, actionId);
  if (index < 0) return state;
  const snapIns = state.loa.actions[index].snapIns.filter((item) => snapInRef(item) !== ref).map(copySnapIn);
  if (snapIns.length === state.loa.actions[index].snapIns.length) return state;
  const next = { ...copyAction(state.loa.actions[index]), snapIns };
  return withActions(state, state.loa.actions.map((item, itemIndex) => itemIndex === index ? next : copyAction(item)));
}

export function markUnavailableSnapIns(state) {
  assertState(state);
  const refs = catalogRefs(state.catalog);
  return withActions(state, state.loa.actions.map((action) => ({
    ...action,
    snapIns: action.snapIns.map((snapIn) => {
      const ref = snapInRef(snapIn);
      if (refs.has(ref)) {
        if (!isRecord(snapIn) || snapIn.unavailable === undefined) return copySnapIn(snapIn);
        const { unavailable: _unavailable, ...available } = snapIn;
        return available;
      }
      return isRecord(snapIn) ? { ...snapIn, unavailable: true } : { ref, unavailable: true };
    }),
  })));
}

function cloneCatalog(catalog) {
  return Array.isArray(catalog) ? catalog.map((category) => ({
    ...category,
    plugins: Array.isArray(category.plugins) ? category.plugins.map((plugin) => ({
      ...plugin,
      skills: Array.isArray(plugin.skills) ? plugin.skills.map((skill) => ({ ...skill })) : [],
    })) : [],
  })) : catalog;
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
    .replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
    .replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
}

export function serializeLoaBootstrap(state, metadata = {}) {
  assertState(state);
  const { version: _version, loa: _loa, catalog: _catalog, ...stateMetadata } = state;
  const { version: _metadataVersion, loa: _metadataLoa, catalog: _metadataCatalog, ...safeMetadata } = isRecord(metadata) ? metadata : {};
  return safeJson({
    version: 1,
    loa: { ...state.loa, actions: state.loa.actions.map(copyAction) },
    catalog: cloneCatalog(state.catalog),
    ...stateMetadata,
    ...safeMetadata,
  });
}

export const serializeBootstrap = serializeLoaBootstrap;
