import path from "node:path";
import { marked } from "marked";

export const isMarkdown = (file) => /\.(md|markdown)$/i.test(file);

/**
 * Readable defaults for rendered Markdown. This HTML is a viewing surface
 * only — it is never written back to disk, so the styling can be opinionated.
 */
const STYLE = `
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #fdfcfa; color: #1b1a16;
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 72ch; margin: 0 auto; padding: 48px 28px 96px; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.6em 0 .5em; }
  h1 { font-size: 2em; margin-top: .4em; }
  h2 { font-size: 1.45em; border-bottom: 1px solid #eceae3; padding-bottom: .25em; }
  h3 { font-size: 1.15em; }
  p, ul, ol { margin: .75em 0; }
  li { margin: .3em 0; }
  a { color: #295fcc; }
  code {
    background: #f2f0ea; border-radius: 4px; padding: .12em .35em;
    font: .88em/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  pre { background: #f2f0ea; border-radius: 8px; padding: 14px 16px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 1em 0; padding: .1em 1em; border-left: 3px solid #d8d5cb; color: #6b6862; }
  table { border-collapse: collapse; margin: 1em 0; width: 100%; }
  th, td { border: 1px solid #e4e2db; padding: 7px 11px; text-align: left; }
  th { background: #f7f5f0; }
  img { max-width: 100%; height: auto; }
  hr { border: none; border-top: 1px solid #eceae3; margin: 2.2em 0; }
`;

/**
 * Markdown is a document format: raw HTML passes through for layout, but
 * script has no legitimate use in a reviewed document, so it never executes.
 */
function stripActiveContent(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "");
}

/** Render a Markdown file into a standalone review page. */
export function renderMarkdownPage(mdText, file) {
  const body = stripActiveContent(marked.parse(mdText, { gfm: true, async: false }));
  const title = path.basename(file);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</title>
<style>${STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>
`;
}
