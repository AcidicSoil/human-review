const SDK_TAG_RE = /\s*<script[^>]*\bdata-eh-sdk\b[^>]*><\/script>/gi;

/**
 * Add the one script tag edit-html injects. Everything else about the artifact
 * is left byte-identical, so the saved file renders the same standalone.
 */
export function injectSdk(html, key) {
  const clean = stripSdk(html);
  const tag = `<script data-eh-sdk type="module" src="/sdk.js?key=${encodeURIComponent(key)}"></script>`;
  if (/<\/body\s*>/i.test(clean)) {
    return clean.replace(/<\/body\s*>/i, `${tag}\n</body>`);
  }
  if (/<\/html\s*>/i.test(clean)) {
    return clean.replace(/<\/html\s*>/i, `${tag}\n</html>`);
  }
  return `${clean}\n${tag}\n`;
}

/** Remove any injected tag, so a file saved with one never keeps it. */
export function stripSdk(html) {
  return String(html).replace(SDK_TAG_RE, "");
}

export function hasSdk(html) {
  SDK_TAG_RE.lastIndex = 0;
  return SDK_TAG_RE.test(String(html));
}
