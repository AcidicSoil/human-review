(() => {
  const stateNode = document.getElementById("hr-bootstrap");
  const bootstrap = JSON.parse(stateNode?.textContent || "{}");
  const app = document.getElementById("hr-app");
  const discussions = Array.isArray(bootstrap.discussions) ? bootstrap.discussions : [];
  const ACTIONS = ["revise", "expand", "touch-up", "remove", "verify"];
  const LABELS = { revise: "Revise", expand: "Expand", "touch-up": "Touch up", remove: "Remove", verify: "Verify" };

  const safeJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  const slug = (value, fallback) => String(value || fallback).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fallback;

  function sourceSections() {
    const doc = new DOMParser().parseFromString(`<main id="source">${bootstrap.sourceHtml || ""}</main>`, "text/html");
    const root = doc.getElementById("source");
    const explicit = [...root.querySelectorAll("[data-review-section]")].filter((node) => !node.parentElement?.closest("[data-review-section]"));
    if (explicit.length) return explicit.map((node, index) => ({
      id: node.getAttribute("data-review-section") || node.id || `section-${index + 1}`,
      label: node.getAttribute("data-container") || node.querySelector("h1,h2,h3")?.textContent?.trim() || `Section ${index + 1}`,
      actions: String(node.getAttribute("data-review-actions") || "").split(",").filter(Boolean),
      html: node.innerHTML,
    }));

    const groups = [];
    let current = null;
    for (const node of [...root.childNodes]) {
      if (node.nodeType === Node.ELEMENT_NODE && /^(H1|H2)$/.test(node.tagName)) {
        const label = node.textContent.trim();
        current = { id: slug(label, `section-${groups.length + 1}`), label, actions: [], nodes: [] };
        groups.push(current);
      }
      if (!current) {
        current = { id: "overview", label: "Overview", actions: [], nodes: [] };
        groups.push(current);
      }
      current.nodes.push(node.cloneNode(true));
    }
    return groups.map((group) => {
      const holder = doc.createElement("div");
      group.nodes.forEach((node) => holder.appendChild(node));
      return { ...group, html: holder.innerHTML };
    });
  }

  function toggleAction(section, action, button) {
    let actions = String(section.dataset.reviewActions || "").split(",").filter(Boolean);
    if (action === "remove") actions = actions.includes("remove") ? [] : ["remove"];
    else {
      actions = actions.filter((item) => item !== "remove");
      actions = actions.includes(action) ? actions.filter((item) => item !== action) : [...actions, action];
    }
    section.dataset.reviewActions = actions.join(",");
    section.querySelectorAll("[data-review-action]").forEach((item) => item.dataset.active = String(actions.includes(item.dataset.reviewAction)));
    button.blur();
  }

  function addDiscussion(section, text) {
    const content = text.trim();
    if (!content) return;
    discussions.push({
      id: `discussion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      documentContent: section.querySelector(".hr-fallback-content")?.innerText || section.dataset.container || "",
      reviewSection: section.dataset.reviewSection,
      isResolved: false,
      createdAt: new Date().toISOString(),
      comments: [{ contentRich: [{ type: "p", children: [{ text: content }] }], createdAt: new Date().toISOString(), userId: "reviewer" }],
    });
    renderThreads(section);
  }

  function renderThreads(section) {
    const host = section.querySelector(".hr-fallback-discussions");
    host.textContent = "";
    for (const thread of discussions.filter((item) => item.reviewSection === section.dataset.reviewSection && !item.isResolved)) {
      const card = document.createElement("div");
      card.className = "hr-thread";
      const head = document.createElement("div");
      head.className = "hr-thread-head";
      head.innerHTML = `<strong>Discussion</strong><span>${thread.comments.length}</span><span class="spacer"></span>`;
      const resolve = document.createElement("button");
      resolve.className = "hr-btn";
      resolve.textContent = "Resolve";
      resolve.onclick = () => { thread.isResolved = true; renderThreads(section); };
      head.append(resolve);
      card.append(head);
      for (const comment of thread.comments) {
        const body = document.createElement("div");
        body.className = "hr-comment-body";
        body.textContent = comment.contentRich?.map((node) => node.children?.map((leaf) => leaf.text || "").join("") || "").join("\n") || "";
        card.append(body);
      }
      host.append(card);
    }
  }

  function saveReviewedHtml() {
    const sections = [...document.querySelectorAll(".hr-section[data-review-section]")];
    const holder = document.createElement("main");
    for (const section of sections) {
      const output = document.createElement("section");
      output.dataset.reviewSection = section.dataset.reviewSection;
      output.dataset.container = section.dataset.container;
      if (section.dataset.reviewActions) output.dataset.reviewActions = section.dataset.reviewActions;
      output.innerHTML = section.querySelector(".hr-fallback-content")?.innerHTML || "";
      holder.append(output);
    }
    const next = {
      ...bootstrap,
      version: 1,
      editor: "embedded-dom",
      sourceHtml: holder.innerHTML,
      document: null,
      discussions,
      savedAt: new Date().toISOString(),
    };
    const clone = document.documentElement.cloneNode(true);
    clone.querySelector("#hr-app")?.replaceChildren();
    const cloneState = clone.querySelector("#hr-bootstrap");
    if (cloneState) cloneState.textContent = safeJson(next);
    const blob = new Blob([`<!doctype html>\n${clone.outerHTML}\n`], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = String(bootstrap.artifactName || "planning.review.html").replace(/\.review(?:ed)?\.html$/i, "") + ".reviewed.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const shell = document.createElement("div");
  shell.className = "hr-shell";
  const toolbar = document.createElement("div");
  toolbar.className = "hr-topbar";
  toolbar.innerHTML = `<span class="hr-title">Planning review</span><button class="hr-btn" data-cmd="bold">Bold</button><button class="hr-btn" data-cmd="italic">Italic</button><button class="hr-btn" data-cmd="underline">Underline</button><span class="spacer"></span>`;
  toolbar.querySelectorAll("[data-cmd]").forEach((button) => button.onclick = () => document.execCommand(button.dataset.cmd));
  const save = document.createElement("button");
  save.className = "hr-btn";
  save.textContent = "Save reviewed HTML";
  save.onclick = saveReviewedHtml;
  toolbar.append(save);
  shell.append(toolbar);

  const editor = document.createElement("div");
  editor.className = "hr-editor";
  for (const item of sourceSections()) {
    const section = document.createElement("section");
    section.className = "hr-section";
    section.dataset.reviewSection = item.id;
    section.dataset.container = item.label;
    section.dataset.reviewActions = item.actions.join(",");
    const head = document.createElement("div");
    head.className = "hr-section-head";
    const name = document.createElement("span");
    name.className = "hr-section-name";
    name.textContent = item.label;
    head.append(name);
    for (const action of ACTIONS) {
      const button = document.createElement("button");
      button.className = "hr-btn hr-action";
      button.dataset.reviewAction = action;
      button.dataset.active = String(item.actions.includes(action));
      button.textContent = LABELS[action];
      button.onclick = () => toggleAction(section, action, button);
      head.append(button);
    }
    section.append(head);
    const content = document.createElement("div");
    content.className = "hr-fallback-content";
    content.contentEditable = "true";
    content.innerHTML = item.html;
    section.append(content);
    const composer = document.createElement("div");
    composer.className = "hr-comment-compose";
    const textarea = document.createElement("textarea");
    textarea.placeholder = "Comment on this section…";
    const add = document.createElement("button");
    add.className = "hr-btn";
    add.textContent = "Add comment";
    add.onclick = () => { addDiscussion(section, textarea.value); textarea.value = ""; };
    composer.append(textarea, add);
    section.append(composer);
    const threads = document.createElement("div");
    threads.className = "hr-fallback-discussions";
    section.append(threads);
    editor.append(section);
    renderThreads(section);
  }
  shell.append(editor);
  app.replaceChildren(shell);
})();
