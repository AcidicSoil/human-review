import test from "node:test";
import assert from "node:assert/strict";
import { navigationHref } from "../src/click-target.js";

function target({ link = null, control = null } = {}) {
  return {
    closest(selector) {
      if (selector === "a[href]") return link && { getAttribute: () => link };
      if (selector === "[data-href]") return control && { getAttribute: () => control };
      return null;
    },
  };
}

test("navigationHref prefers a real link", () => {
  assert.equal(navigationHref(target({ link: "/os/lesson", control: "/ignored" })), "/os/lesson");
});

test("navigationHref supports framework buttons with data-href", () => {
  assert.equal(navigationHref(target({ control: "/os/quickstart" })), "/os/quickstart");
});

test("navigationHref ignores ordinary controls", () => {
  assert.equal(navigationHref(target()), "");
});
