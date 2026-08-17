(() => {
  const app = document.getElementById("hr-app");
  const stateNode = document.getElementById("hr-bootstrap");
  if (!app || !stateNode) return;

  const bootstrap = JSON.parse(stateNode.textContent || "{}");
  let signature = "";
  let observer = null;
  let activeId = "";

  const reviewUiSelector = [
    ".hr-section-head",
    ".hr-thread",
    ".hr-comment-compose",
    ".hr-discussion-trigger",
    ".hr-fallback-discussions",
  ].join(",");

  function artifactBase() {
    const artifact = String(bootstrap.artifactName || "planning.review.html")
      .replace(/\.review(?:ed)?\.html$/i, "")
      .replace(/\.html$/i, "");
    return artifact || "planning";
  }

  function download(content, filename, type) {
    const blob = new Blob([content], { type });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  function inlineMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    if (node.matches?.("[data-slate-zero-width]")) return "";

    const tag = node.tagName;
    const children = [...node.childNodes].map(inlineMarkdown).join("");
    if (tag === "BR") return "\n";
    if (tag === "STRONG" || tag === "B") return children ? `**${children}**` : "";
    if (tag === "EM" || tag === "I") return children ? `*${children}*` : "";
    if (tag === "U") return children ? `<u>${children}</u>` : "";
    if (tag === "CODE") return children ? `\`${children.replace(/`/g, "\\`")}\`` : "";
    if (tag === "A") {
      const href = node.getAttribute("href") || "";
      return href ? `[${children}](${href})` : children;
    }
    if (tag === "IMG") {
      const alt = node.getAttribute("alt") || "";
      const src = node.getAttribute("src") || "";
      return src ? `![${alt}](${src})` : "";
    }
    return children;
  }

  function tableMarkdown(table) {
    const rows = [...table.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr")];
    if (!rows.length) return "";
    const matrix = rows.map((row) => [...row.children].map((cell) => inlineMarkdown(cell).replace(/\|/g, "\\|").trim()));
    const width = Math.max(...matrix.map((row) => row.length));
    const normalized = matrix.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill("")]);
    const header = normalized[0];
    return [
      `| ${header.join(" | ")} |`,
      `| ${header.map(() => "---").join(" | ")} |`,
      ...normalized.slice(1).map((row) => `| ${row.join(" | ")} |`),
    ].join("\n");
  }

  function listMarkdown(list, depth = 0) {
    const ordered = list.tagName === "OL";
    const items = [...list.children].filter((child) => child.tagName === "LI");
    return items.map((item, index) => {
      const nested = [];
      const primary = [];
      for (const child of [...item.childNodes]) {
        if (child.nodeType === Node.ELEMENT_NODE && (child.tagName === "UL" || child.tagName === "OL")) {
          nested.push(listMarkdown(child, depth + 1));
        } else {
          primary.push(blockMarkdown(child, depth));
        }
      }
      const body = primary.join(" ").replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
      const prefix = ordered ? `${index + 1}. ` : "- ";
      const line = `${"  ".repeat(depth)}${prefix}${body}`.trimEnd();
      return nested.length ? `${line}\n${nested.join("\n")}` : line;
    }).join("\n");
  }

  function blockMarkdown(node, depth = 0) {
    if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue || "").trim();
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    if (node.matches?.(reviewUiSelector)) return "";

    const tag = node.tagName;
    if (/^H[1-6]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${inlineMarkdown(node).trim()}`;
    if (tag === "P") return inlineMarkdown(node).trim();
    if (tag === "PRE") return `\`\`\`\n${node.textContent || ""}\n\`\`\``;
    if (tag === "BLOCKQUOTE") {
      const body = [...node.childNodes].map((child) => blockMarkdown(child, depth)).filter(Boolean).join("\n\n");
      return body.split("\n").map((line) => `> ${line}`).join("\n");
    }
    if (tag === "UL" || tag === "OL") return listMarkdown(node, depth);
    if (tag === "TABLE") return tableMarkdown(node);
    if (tag === "HR") return "---";
    if (["A", "STRONG", "B", "EM", "I", "U", "CODE", "IMG", "SPAN"].includes(tag)) return inlineMarkdown(node).trim();

    const blockChildren = [...node.children].some((child) => /^(H[1-6]|P|PRE|BLOCKQUOTE|UL|OL|TABLE|HR|DIV|SECTION)$/.test(child.tagName));
    if (!blockChildren) return inlineMarkdown(node).trim();
    return [...node.childNodes].map((child) => blockMarkdown(child, depth)).filter(Boolean).join("\n\n");
  }

  function prdMarkdown() {
    const sections = [...document.querySelectorAll(".hr-section[data-review-section]")];
    const parts = sections.map((section) => {
      const fallbackContent = section.querySelector(".hr-fallback-content");
      if (fallbackContent) return blockMarkdown(fallbackContent).trim();
      const clone = section.cloneNode(true);
      clone.querySelectorAll(reviewUiSelector).forEach((node) => node.remove());
      return blockMarkdown(clone).trim();
    }).filter(Boolean);
    return `${parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
  }

  function savePrd() {
    download(prdMarkdown(), `${artifactBase()}.prd.md`, "text/markdown;charset=utf-8");
  }

  function sections() {
    return [...document.querySelectorAll(".hr-section[data-review-section]")].map((section, index) => ({
      id: section.dataset.reviewSection || `section-${index + 1}`,
      label: section.dataset.container || section.querySelector("h1,h2,h3,h4,h5,h6")?.textContent?.trim() || `Section ${index + 1}`,
      element: section,
    }));
  }

  function setActive(id) {
    activeId = id;
    document.querySelectorAll(".hr-nav-btn[data-review-target]").forEach((button) => {
      button.dataset.active = String(button.dataset.reviewTarget === id);
      if (button.dataset.reviewTarget === id) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
  }

  function observe(items) {
    observer?.disconnect();
    if (!("IntersectionObserver" in window)) return;
    observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => Math.abs(a.boundingClientRect.top - 110) - Math.abs(b.boundingClientRect.top - 110));
      if (visible[0]?.target?.dataset?.reviewSection) setActive(visible[0].target.dataset.reviewSection);
    }, { rootMargin: "-86px 0px -68% 0px", threshold: [0, 0.01, 0.5] });
    items.forEach((item) => observer.observe(item.element));
  }

  function renderSidebar() {
    const items = sections();
    if (!items.length) return;
    const nextSignature = items.map(({ id, label }) => `${id}:${label}`).join("|");
    if (nextSignature === signature && document.getElementById("hr-document-nav")) return;
    signature = nextSignature;

    document.getElementById("hr-document-nav")?.remove();
    const sidebar = document.createElement("aside");
    sidebar.id = "hr-document-nav";
    sidebar.className = "hr-sidebar";
    sidebar.setAttribute("aria-label", "Planning document navigation");

    const title = document.createElement("div");
    title.className = "hr-sidebar-title";
    title.textContent = "Sections";
    sidebar.append(title);

    const nav = document.createElement("nav");
    nav.className = "hr-nav";
    items.forEach(({ id, label, element }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hr-nav-btn";
      button.dataset.reviewTarget = id;
      button.dataset.active = String((activeId || items[0].id) === id);
      button.textContent = label;
      button.onclick = () => {
        setActive(id);
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      };
      nav.append(button);
    });
    sidebar.append(nav);

    const footer = document.createElement("div");
    footer.className = "hr-sidebar-footer";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "hr-btn hr-save-prd";
    save.textContent = "Save PRD";
    save.onclick = savePrd;
    footer.append(save);
    sidebar.append(footer);

    document.body.insertBefore(sidebar, app);
    document.body.classList.add("hr-sidebar-mounted");
    setActive(activeId || items[0].id);
    observe(items);
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      renderSidebar();
    });
  };

  new MutationObserver(schedule).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-review-section", "data-container"] });
  schedule();
})();
