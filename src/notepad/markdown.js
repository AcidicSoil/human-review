import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const MARKDOWN_OPTIONS = {
  allowedTags: sanitizeHtml.defaults.allowedTags,
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    code: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: (_tag, attributes) => ({
      tagName: "a",
      attribs: { ...attributes, target: "_blank", rel: "noopener noreferrer" },
    }),
  },
};

/** Render user-authored Markdown without passing executable HTML to the HUD. */
export function renderMarkdown(text) {
  return sanitizeHtml(marked.parse(text, { gfm: true, breaks: true }), MARKDOWN_OPTIONS);
}

export function presentNote(note) {
  return {
    ...note,
    html: renderMarkdown(note.text),
    ...(note.bugReport ? {
      bugReportHtml: Object.fromEntries(
        ["expected", "actual", "steps"].map(key => [key, renderMarkdown(note.bugReport[key])]),
      ),
    } : {}),
  };
}
