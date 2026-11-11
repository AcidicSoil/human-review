import assert from "node:assert/strict";
import test from "node:test";
import { browserCommand } from "../src/browser-open.js";

test("uses configured browser before desktop URL association", () => {
  assert.deepEqual(browserCommand("http://127.0.0.1:3000", { BROWSER: "wslview" }, "linux"), {
    command: "wslview",
    args: ["http://127.0.0.1:3000"],
  });
  assert.deepEqual(browserCommand("/tmp/review.html", { BROWSER: "firefox" }, "linux"), {
    command: "firefox",
    args: ["/tmp/review.html"],
  });
});

test("falls back to native platform opener without a configured browser", () => {
  assert.deepEqual(browserCommand("https://example.com", {}, "linux"), {
    command: "xdg-open",
    args: ["https://example.com"],
  });
  assert.deepEqual(browserCommand("https://example.com", {}, "darwin"), {
    command: "open",
    args: ["https://example.com"],
  });
  assert.deepEqual(browserCommand("https://example.com", {}, "win32"), {
    command: "cmd",
    args: ["/c", "start", "", "https://example.com"],
  });
});
