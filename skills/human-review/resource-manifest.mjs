const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const string = (value, where) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${where} must be nonempty.`);
  return value;
};
const unique = (items, key, where) => {
  const values = new Set();
  for (const item of items) {
    if (values.has(item[key])) throw new TypeError(`Duplicate ${where}: ${item[key]}`);
    values.add(item[key]);
  }
};

export const CAPABILITY_KINDS = Object.freeze(["skill", "agent", "command", "rule", "mcp", "hook"]);
export const SNAP_IN_KINDS = Object.freeze(["plugin", ...CAPABILITY_KINDS]);
export const RESOURCE_FORMAT = "human-review.resources/v1";

export function validateResourceManifest(manifest) {
  if (!isObject(manifest) || manifest.format !== RESOURCE_FORMAT) {
    throw new TypeError(`resourceManifest.format must be ${RESOURCE_FORMAT}.`);
  }
  for (const key of ["sources", "capabilities"]) {
    if (!Array.isArray(manifest[key])) throw new TypeError(`resourceManifest.${key} must be an array.`);
  }
  const capabilities = manifest.capabilities.map((entry, i) => {
    const where = `resourceManifest.capabilities[${i}]`;
    if (!isObject(entry)) throw new TypeError(`${where} must be an object.`);
    const ref = string(entry.ref, `${where}.ref`);
    string(entry.displayName, `${where}.displayName`);
    if (!CAPABILITY_KINDS.includes(entry.kind)) throw new TypeError(`${where}.kind is unsupported.`);
    if (entry.invocation !== undefined && !["user", "model", "both"].includes(entry.invocation)) throw new TypeError(`${where}.invocation is unsupported.`);
    if (entry.availability !== undefined && !["available", "unavailable", "unknown"].includes(entry.availability)) throw new TypeError(`${where}.availability is unsupported.`);
    return { ...entry, ref };
  });
  unique(capabilities, "ref", "capability ref");
  const refs = new Set(capabilities.map((entry) => entry.ref));
  const requireRef = (ref, where) => {
    string(ref, where);
    if (!refs.has(ref)) throw new TypeError(`Unknown capability ref at ${where}: ${ref}`);
    return ref;
  };
  const sources = manifest.sources.map((entry, i) => {
    const where = `resourceManifest.sources[${i}]`;
    if (!isObject(entry)) throw new TypeError(`${where} must be an object.`);
    string(entry.id, `${where}.id`);
    string(entry.displayName, `${where}.displayName`);
    if (!["plugin", "library", "repository", "package"].includes(entry.kind)) {
      throw new TypeError(`${where}.kind is unsupported.`);
    }
    if (!Array.isArray(entry.refs)) throw new TypeError(`${where}.refs must be an array.`);
    const members = entry.refs.map((ref, j) => requireRef(ref, `${where}.refs[${j}]`));
    if (new Set(members).size !== members.length) throw new TypeError(`Duplicate resource member at ${where}`);
    return { ...entry };
  });
  unique(sources, "id", "source id");
  const relationships = manifest.relationships ?? [];
  if (!Array.isArray(relationships)) throw new TypeError("resourceManifest.relationships must be an array.");
  relationships.forEach((relation, index) => {
    const where = `resourceManifest.relationships[${index}]`;
    if (!isObject(relation) || !["requires", "invokes", "precedes"].includes(relation.type)) {
      throw new TypeError(`${where}.type is unsupported.`);
    }
    requireRef(relation.from, `${where}.from`);
    requireRef(relation.to, `${where}.to`);
  });
  const workflows = manifest.workflows ?? [];
  if (!Array.isArray(workflows)) throw new TypeError("resourceManifest.workflows must be an array.");
  const checked = workflows.map((workflow, i) => {
    const where = `resourceManifest.workflows[${i}]`;
    if (!isObject(workflow)) throw new TypeError(`${where} must be an object.`);
    string(workflow.id, `${where}.id`);
    string(workflow.displayName, `${where}.displayName`);
    if (!Array.isArray(workflow.steps)) throw new TypeError(`${where}.steps must be an array.`);
    const steps = workflow.steps.map((step, j) => {
      const at = `${where}.steps[${j}]`;
      if (!isObject(step)) throw new TypeError(`${at} must be an object.`);
      requireRef(step.ref, `${at}.ref`);
      if (step.after !== undefined && !Array.isArray(step.after)) throw new TypeError(`${at}.after must be an array.`);
      return step;
    });
    unique(steps, "ref", "workflow step");
    const stepIds = new Set(steps.map((step) => step.ref));
    const edges = new Map(steps.map((step) => [step.ref, (step.after ?? []).map((ref) => {
      requireRef(ref, `${where}.after`);
      if (!stepIds.has(ref)) throw new TypeError(`Unknown workflow step: ${ref}`);
      return ref;
    })]));
    const visited = new Set(), active = new Set();
    const visit = (ref) => {
      if (active.has(ref)) throw new TypeError(`Workflow cycle: ${workflow.id}`);
      if (visited.has(ref)) return;
      active.add(ref);
      edges.get(ref).forEach(visit);
      active.delete(ref);
      visited.add(ref);
    };
    edges.forEach((_, ref) => visit(ref));
    return { ...workflow };
  });
  unique(checked, "id", "workflow id");
  return {
    ...manifest,
    sources,
    capabilities,
    ...(manifest.relationships === undefined ? {} : { relationships }),
    ...(manifest.workflows === undefined ? {} : { workflows: checked }),
  };
}
