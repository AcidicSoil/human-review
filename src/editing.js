import { UI_ATTR } from "./serialize.js";

/**
 * Editing helpers plus the lightweight in-page block toolbar.
 *
 * The pure helpers stay reusable in Node tests. Browser-only toolbar setup is
 * guarded at the bottom of the module, so importing this file outside a DOM
 * has no side effects.
 */

export const REVIEW_ACTIONS = Object.freeze(["revise", "expand", "touch-up", "remove", "verify"]);

const REVIEW_ACTION_LABELS = Object.freeze({
  revise: "Revise",
  expand: "Expand",
  "touch-up": "Touch up",
  remove: "Remove",
  verify: "Verify",
});

/** Normalize a stored comma-separated review action list into canonical order. */
export function normalizeReviewActions(raw) {
  const requested = new Set(
    String(raw || "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => REVIEW_ACTIONS.includes(value))
  );
  if (requested.has("remove")) return ["remove"];
  return REVIEW_ACTIONS.filter((action) => action !== "remove" && requested.has(action));
}

/**
 * Toggle one planning action. Remove is exclusive because deleting a section
 * makes rewrite/expansion directives for that same section meaningless.
 */
export function toggleReviewAction(raw, action) {
  if (!REVIEW_ACTIONS.includes(action)) return normalizeReviewActions(raw);
  const current = new Set(normalizeReviewActions(raw));

  if (action === "remove") return current.has("remove") ? [] : ["remove"];

  current.delete("remove");
  if (current.has(action)) current.delete(action);
  else current.add(action);
  return REVIEW_ACTIONS.filter((item) => item !== "remove" && current.has(item));
}

export function reviewActionLabel(action) {
  return REVIEW_ACTION_LABELS[action] || action;
}

/**
 * The list command for a marker typed at the start of a line, or null.
 * `lead` is everything between the start of the block and the caret, so a
 * marker typed mid-sentence never converts.
 */
export function listCommandFor(lead) {
  const marker = String(lead || "").replace(/\u00a0/g, " ").trim();
  if (/^[-*]$/.test(marker)) return "insertUnorderedList";
  if (/^\d{1,3}[.)]$/.test(marker)) return "insertOrderedList";
  return null;
}

/**
 * Style properties a fresh list needs when the page's CSS reset hides it.
 * Tailwind preflight and similar resets set `list-style: none` and zero the
 * indent, so a just-created list looks like nothing happened. Returns only
 * the properties that are actually broken, so styled pages stay untouched.
 */
export function listStyleFixup(tagName, computed) {
  const patch = {};
  if (computed.listStyleType === "none") {
    patch.listStyleType = /^ol$/i.test(tagName) ? "decimal" : "disc";
  }
  const inset = (parseFloat(computed.paddingLeft) || 0) + (parseFloat(computed.marginLeft) || 0);
  if (inset < 16) patch.paddingLeft = "1.5em";
  return patch;
}

/**
 * Style a fresh link needs when the page can't distinguish it from prose.
 * Reset stylesheets (`a { color: inherit; text-decoration: inherit }`) make a
 * just-created link invisible; underline it only when neither color nor
 * decoration sets it apart.
 */
export function linkStyleFixup(anchorComputed, parentComputed) {
  const decorated = String(anchorComputed.textDecorationLine || "").includes("underline");
  const recolored = !!parentComputed && anchorComputed.color !== parentComputed.color;
  return decorated || recolored ? {} : { textDecoration: "underline" };
}

/**
 * A typed link, made openable and safe. Bare domains get https://, in-page
 * and relative references pass through, and anything with an executable or
 * unknown scheme (javascript:, data:, …) is rejected outright.
 */
export function normalizeHref(raw) {
  const href = String(raw || "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!href) return "";
  let candidate = href;
  if (!/^(https?:|mailto:|tel:|#|\/|\.)/i.test(href)) {
    const head = href.split(/[/?#]/)[0];
    if (/^([\w-]+\.)+[\w-]+(:\d+)?$/.test(head) || /^localhost(:\d+)?$/i.test(head)) {
      candidate = `https://${href}`;
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      return "";
    }
  }
  try {
    const parsed = new URL(candidate, "https://relative.invalid");
    if (!/^(https?:|mailto:|tel:)$/i.test(parsed.protocol)) return "";
  } catch {
    return "";
  }
  return candidate;
}

// ------------------------------------------------------- inline block editor

const BLOCK_DISPLAY = /^(block|flex|grid|list-item|table|flow-root)$/;

function isReviewUi(node) {
  const element = node && node.nodeType === 1 ? node : node && node.parentElement;
  return !!(element && element.closest && element.closest(`[${UI_ATTR}]`));
}

function editableBlockFor(node) {
  let element = node && node.nodeType === 1 ? node : node && node.parentElement;
  if (!element || element === document.body || isReviewUi(element)) return null;

  const authored = element.closest("[data-review-section],[data-container],[data-block]");
  if (authored) return authored;

  while (element && element !== document.body && !BLOCK_DISPLAY.test(getComputedStyle(element).display)) {
    element = element.parentElement;
  }
  if (!element || element === document.body) return null;
  if (!element.textContent.trim() && !element.querySelector("img,svg,canvas,video,figure,hr")) return null;
  return element;
}

function reviewSectionFor(block) {
  if (!block) return null;
  if (block.matches("[data-review-section]")) return block;
  return block.closest("[data-review-section]");
}

function dispatchEditEvent(element, type) {
  element.dispatchEvent(new Event(type, { bubbles: true }));
}

function focusBlock(block) {
  if (!block || !block.isConnected) return;
  document.body.focus({ preventScroll: true });
  const selection = document.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(block);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function mountInlineBlockEditor() {
  if (!document.body || document.querySelector(`[${UI_ATTR}][data-eh-block-editor]`)) return;

  const host = document.createElement("div");
  host.setAttribute(UI_ATTR, "");
  host.setAttribute("data-eh-block-editor", "");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .toolbar {
        position: fixed;
        z-index: 2147483647;
        display: none;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px;
        max-width: min(560px, calc(100vw - 16px));
        padding: 4px;
        border: 1px solid #e4e2db;
        border-radius: 8px;
        background: #fff;
        color: #1b1a16;
        box-shadow: 0 3px 14px rgba(27, 26, 22, .14);
        font: 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: auto;
      }
      button {
        border: 0;
        border-radius: 5px;
        background: transparent;
        color: #6b6862;
        padding: 5px 7px;
        font: inherit;
        cursor: pointer;
      }
      button:hover, button:focus-visible { background: #f1efe9; color: #1b1a16; outline: none; }
      button.primary { background: #1b1a16; color: #fff; }
      button.primary:hover, button.primary:focus-visible { background: #35322c; color: #fff; }
      button[aria-pressed="true"] { background: #ebe8df; color: #1b1a16; }
      button[data-action="remove"][aria-pressed="true"] { background: #f7e6e2; color: #9d3025; }
      .divider { width: 1px; align-self: stretch; background: #e4e2db; margin: 1px 2px; }
      .actions { display: flex; flex-wrap: wrap; gap: 2px; }
      .outline {
        position: fixed;
        z-index: 2147483645;
        display: none;
        border: 2px solid rgba(27, 26, 22, .72);
        border-radius: 4px;
        pointer-events: none;
      }
    </style>
    <div id="outline" class="outline"></div>
    <div id="toolbar" class="toolbar" role="toolbar" aria-label="Block editor">
      <button id="edit" class="primary" type="button">Edit</button>
      <span id="divider" class="divider" hidden></span>
      <div id="actions" class="actions" hidden></div>
    </div>
  `;
  document.documentElement.appendChild(host);

  const toolbar = shadow.getElementById("toolbar");
  const outline = shadow.getElementById("outline");
  const editButton = shadow.getElementById("edit");
  const divider = shadow.getElementById("divider");
  const actions = shadow.getElementById("actions");

  for (const action of REVIEW_ACTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    button.textContent = reviewActionLabel(action);
    button.setAttribute("aria-pressed", "false");
    actions.appendChild(button);
  }

  let hoverBlock = null;
  let editingBlock = null;
  let positionQueued = false;

  const activeBlock = () => editingBlock || hoverBlock;

  const syncActionButtons = (block) => {
    const section = reviewSectionFor(block);
    const visible = !!section;
    divider.hidden = !visible;
    actions.hidden = !visible;
    if (!visible) return;
    const selected = new Set(normalizeReviewActions(section.getAttribute("data-review-actions")));
    for (const button of actions.querySelectorAll("button[data-action]")) {
      button.setAttribute("aria-pressed", selected.has(button.dataset.action) ? "true" : "false");
    }
  };

  const position = () => {
    positionQueued = false;
    const block = activeBlock();
    if (!block || !block.isConnected) {
      toolbar.style.display = "none";
      outline.style.display = "none";
      return;
    }
    const rect = block.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      toolbar.style.display = "none";
      outline.style.display = "none";
      return;
    }

    toolbar.style.display = "flex";
    syncActionButtons(block);
    const width = toolbar.getBoundingClientRect().width;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const above = rect.top - toolbar.getBoundingClientRect().height - 6;
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${Math.max(8, above)}px`;

    outline.style.display = editingBlock ? "block" : "none";
    if (editingBlock) {
      outline.style.left = `${rect.left - 2}px`;
      outline.style.top = `${rect.top - 2}px`;
      outline.style.width = `${rect.width + 4}px`;
      outline.style.height = `${rect.height + 4}px`;
    }
  };

  const queuePosition = () => {
    if (positionQueued) return;
    positionQueued = true;
    requestAnimationFrame(position);
  };

  const finishEditing = () => {
    editingBlock = null;
    editButton.textContent = "Edit";
    outline.style.display = "none";
    queuePosition();
  };

  editButton.addEventListener("click", () => {
    if (editingBlock) {
      finishEditing();
      return;
    }
    const block = hoverBlock;
    if (!block) return;
    editingBlock = block;
    editButton.textContent = "Done";
    focusBlock(block);
    queuePosition();
  });

  actions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    const block = activeBlock();
    const section = reviewSectionFor(block);
    if (!button || !section) return;

    const selection = document.getSelection();
    if (selection) selection.removeAllRanges();
    dispatchEditEvent(section, "beforeinput");
    const next = toggleReviewAction(section.getAttribute("data-review-actions"), button.dataset.action);
    if (next.length) section.setAttribute("data-review-actions", next.join(","));
    else section.removeAttribute("data-review-actions");
    dispatchEditEvent(section, "input");
    syncActionButtons(section);
    queuePosition();
  });

  document.addEventListener("mouseover", (event) => {
    if (isReviewUi(event.target) || editingBlock) return;
    const block = editableBlockFor(event.target);
    if (block === hoverBlock) return;
    hoverBlock = block;
    editButton.textContent = "Edit";
    queuePosition();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && editingBlock) finishEditing();
  }, true);

  document.addEventListener("scroll", queuePosition, true);
  window.addEventListener("resize", queuePosition);
}

if (typeof document !== "undefined") {
  const start = () => queueMicrotask(mountInlineBlockEditor);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
