/** Embedded, offline-safe handshake for native structured editors. No server credentials enter the iframe. */
export const REVIEW_HOST_SOURCE = String.raw`(() => {
  if (window.__hrReviewHost) return;
  let adapter = null;
  let nonce = null;
  const bridge = {
    get connected() { return !!nonce; },
    register(value) {
      adapter = value;
      if (window.parent !== window) window.parent.postMessage({ type: "hr:ready", mode: adapter.mode }, "*");
    },
    changed(document) {
      if (nonce && adapter) window.parent.postMessage({ type: "hr:change", mode: adapter.mode, nonce, document }, "*");
    },
    comment(anchor, quote) {
      if (nonce && adapter) window.parent.postMessage({ type: "hr:comment", mode: adapter.mode, nonce, anchor, quote }, "*");
    },
  };
  window.__hrReviewHost = bridge;
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || !adapter || event.data?.type !== "hr:restore" || event.data.mode !== adapter.mode) return;
    if (typeof event.data.nonce !== "string" || !event.data.nonce) return;
    nonce = event.data.nonce;
    if (event.data.structured?.document) adapter.restore(event.data.structured.document);
    adapter.onConnect?.();
  });
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || !adapter || !nonce || event.data?.type !== "hr:activate") return;
    if (event.data.nonce !== nonce) return;
    adapter.activate?.(event.data.anchor);
  });
})();`;
