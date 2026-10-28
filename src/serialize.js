/**
 * Document serialization, shared by the in-page SDK and Node tests.
 *
 * Everything human-review adds to a live page — the overlay, highlight marks, the
 * injected style/script, contenteditable — must vanish on the way back to disk,
 * so the saved file renders exactly as it does standalone.
 */

export const UI_ATTR = "data-eh-ui";
export const MARK_ATTR = "data-eh-mark";

/** Keep a hydrated app editable even if its framework removes the attribute. */
export function keepBodyEditable(body) {
  const enforce = () => {
    if (body.getAttribute("contenteditable") !== "true") {
      body.setAttribute("contenteditable", "true");
    }
  };
  enforce();
  const Observer = body.ownerDocument.defaultView.MutationObserver;
  const observer = new Observer(enforce);
  observer.observe(body, { attributes: true, attributeFilter: ["contenteditable"] });
  return observer;
}

/** Reflect current native form values into a detached DOM clone, including root controls. */
export function reflectFormControls(source, clone) {
  // cloneNode() copies the initial HTML attributes, not the user's live form
  // state. Reflect editable control values into the saved document.
  const relevant = (node) => node.matches?.("select, textarea, input");
  const liveControls = [...(relevant(source) ? [source] : []),
                        ...source.querySelectorAll("select, textarea, input")];
  const savedControls = [...(relevant(clone) ? [clone] : []),
                         ...clone.querySelectorAll("select, textarea, input")];
  liveControls.forEach((live, index) => {
    const saved = savedControls[index];
    if (!saved) return;
    const tag = live.tagName.toLowerCase();
    if (tag === "select") {
      const sourceOptions = [...live.options];
      const targetOptions = [...saved.options];
      sourceOptions.forEach((option, i) => {
        if (option.selected) targetOptions[i].setAttribute("selected", "");
        else targetOptions[i].removeAttribute("selected");
      });
    } else if (tag === "textarea") {
      saved.textContent = live.value;
    } else {
      const type = (live.getAttribute("type") || "text").toLowerCase();
      if (type === "checkbox" || type === "radio") {
        if (live.checked) saved.setAttribute("checked", "");
        else saved.removeAttribute("checked");
      } else if (!["file", "password", "hidden", "submit", "reset", "button", "image"].includes(type)) {
        saved.setAttribute("value", live.value);
      }
    }
  });
}

/** Serialize a document to the HTML that should live on disk. */
export function serializeDocument(doc) {
  const clone = doc.documentElement.cloneNode(true);
  reflectFormControls(doc.documentElement, clone);
  clone.querySelectorAll(`[${UI_ATTR}]`).forEach((n) => n.remove());
  clone.querySelectorAll("script[data-eh-sdk], style[data-eh-sdk]").forEach((n) => n.remove());
  clone.querySelectorAll(`mark[${MARK_ATTR}]`).forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  });
  clone.querySelectorAll("[data-eh-el]").forEach((n) => n.removeAttribute("data-eh-el"));
  const body = clone.querySelector("body");
  if (body) {
    body.removeAttribute("contenteditable");
    body.removeAttribute("spellcheck");
  }
  clone.normalize();
  const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>\n` : "";
  return `${doctype}${clone.outerHTML}\n`;
}
