/** Detect a generated structured editor. Ordinary HTML always stays on the DOM path. */
export function detectReviewMode(html) {
  const source = String(html);
  if (/<meta\s+name="human-review-editor"\s+content="loa"\s*\/?\s*>/i.test(source) &&
      /<script\s+id="hr-loa-bootstrap"\s+type="application\/json">/i.test(source)) return "loa";
  if (/<meta\s+name="human-review-editor"\s+content="(?:plate|embedded-dom)"\s*\/?\s*>/i.test(source) &&
      /<script\s+id="hr-bootstrap"\s+type="application\/json">/i.test(source)) return "planning";
  return "dom";
}
