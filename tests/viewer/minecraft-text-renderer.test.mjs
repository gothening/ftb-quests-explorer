import test from "node:test";
import assert from "node:assert/strict";
import {
  renderMinecraftText
} from "../../src/viewer/minecraft-text-renderer.js";

test("renders legacy colors and formatting without leaving raw section codes", () => {
  const html = renderMinecraftText({
    resolvedText: {
      raw: "&6gold&r &lbold",
      plainText: "gold bold"
    }
  });
  assert.equal(html.includes("&6"), false);
  assert.equal(html.includes("font-weight:700"), true);
  assert.equal(html.includes("color:#FFAA00"), true);
});

test("renders hex colors", () => {
  const html = renderMinecraftText({
    resolvedText: {
      raw: "&#12AB34hex",
      plainText: "hex"
    }
  });
  assert.equal(html.includes("#12AB34"), true);
});

test("renders JSON text and click events", () => {
  const html = renderMinecraftText({
    resolvedText: {
      json: [{ text: "page", color: "green", clickEvent: { action: "change_page", value: "ABC" } }],
      plainText: "page"
    }
  });
  assert.equal(html.includes("data-click-action=\"change_page\""), true);
  assert.equal(html.includes("page"), true);
});

test("renders missing translation key explicitly", () => {
  const html = renderMinecraftText({
    translationKey: "quest.MISSING.title",
    missing: true,
    resolvedText: {
      raw: "",
      plainText: ""
    }
  });
  assert.equal(html.includes("[Missing translation]"), true);
  assert.equal(html.includes("quest.MISSING.title"), true);
});
