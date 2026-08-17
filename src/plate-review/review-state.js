export const REVIEW_ACTIONS = Object.freeze(["revise", "expand", "touch-up", "remove", "verify"]);

export function normalizeReviewActions(value) {
  const requested = new Set(
    (Array.isArray(value) ? value : String(value || "").split(","))
      .map((item) => String(item).trim())
      .filter((item) => REVIEW_ACTIONS.includes(item))
  );
  if (requested.has("remove")) return ["remove"];
  return REVIEW_ACTIONS.filter((action) => action !== "remove" && requested.has(action));
}

export function toggleReviewAction(value, action) {
  const current = new Set(normalizeReviewActions(value));
  if (!REVIEW_ACTIONS.includes(action)) return [...current];
  if (action === "remove") return current.has("remove") ? [] : ["remove"];
  current.delete("remove");
  if (current.has(action)) current.delete(action);
  else current.add(action);
  return REVIEW_ACTIONS.filter((item) => item !== "remove" && current.has(item));
}

export function reviveDiscussions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((discussion) => ({
    ...discussion,
    createdAt: new Date(discussion.createdAt || Date.now()),
    comments: Array.isArray(discussion.comments)
      ? discussion.comments.map((comment) => ({
          ...comment,
          createdAt: new Date(comment.createdAt || Date.now()),
          ...(comment.updatedAt ? { updatedAt: new Date(comment.updatedAt) } : {}),
        }))
      : [],
  }));
}

export function serializableDiscussions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((discussion) => ({
    ...discussion,
    createdAt: new Date(discussion.createdAt || Date.now()).toISOString(),
    comments: Array.isArray(discussion.comments)
      ? discussion.comments.map((comment) => ({
          ...comment,
          createdAt: new Date(comment.createdAt || Date.now()).toISOString(),
          ...(comment.updatedAt ? { updatedAt: new Date(comment.updatedAt).toISOString() } : {}),
        }))
      : [],
  }));
}

export function slugifyReviewId(value, fallback = "section") {
  const slug = String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || fallback;
}
