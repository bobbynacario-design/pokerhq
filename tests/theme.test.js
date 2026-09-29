"use strict";
// Guards the light theme's readability. White text is written as var(--wa-NN)
// (and --ink, --amber, ...) so the light theme can swap it for dark ink; this
// fails if a hard-coded white/pale text colour sneaks back in, or a colour token
// is defined for the dark theme only.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const css = read("styles/app.css");
const sources = ["index.html"]
  .concat(fs.readdirSync(path.join(ROOT, "js/features")).filter((f) => f.endsWith(".js")).map((f) => "js/features/" + f))
  .concat(["js/data/sync.js"]);

function block(selectorStart) {
  const start = css.indexOf(selectorStart);
  assert.ok(start >= 0, selectorStart + " block exists");
  return css.slice(start, css.indexOf("\n}", start));
}
const rootBlock = block(":root{");
const lightBlock = block("body.light {");
const defined = (blk) => new Set([...blk.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
const darkTokens = defined(rootBlock), lightTokens = defined(lightBlock);

test("every colour token the dark theme defines for text has a light-theme value", () => {
  const needs = [...darkTokens].filter((t) => /^--(wa-\d+|ink|amber|rose|mint|vio-\d+|heat-[a-z]+|chip-bg)$/.test(t));
  assert.ok(needs.length > 30, "found the text-tone tokens");
  const missing = needs.filter((t) => !lightTokens.has(t));
  assert.deepEqual(missing, [], "tokens with no body.light value");
});

test("every var(--wa-NN) / tone token used anywhere is defined", () => {
  const all = css + sources.map(read).join("\n");
  const used = new Set([...all.matchAll(/var\((--(?:wa-\d+|ink|amber|rose|mint|vio-\d+|heat-[a-z]+|chip-bg))\)/g)].map((m) => m[1]));
  const undefinedTokens = [...used].filter((t) => !darkTokens.has(t) || !lightTokens.has(t));
  assert.deepEqual(undefinedTokens, []);
});

test("no hard-coded white text colour outside always-dark surfaces", () => {
  const offenders = [];
  const white = /(?<![-\w])color\s*:\s*(rgba\(\s*255\s*,\s*255\s*,\s*255\s*,|#fff(?![0-9a-fA-F])|white\b)/;
  css.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("body.light") || t.startsWith(".help-doc")) return;      // light overrides / the help page's own palette
    if (/^(html,body\{|\.rating-btn\.selected|\.btn-primary-lg)/.test(t)) return; // white on a saturated fill
    if (white.test(line)) offenders.push("app.css:" + (i + 1) + " " + t.slice(0, 80));
  });
  sources.forEach((f) => read(f).split("\n").forEach((line, i) => {
    if (line.includes('id="timer-start-btn"')) return;                            // white on the green START button
    if (white.test(line)) offenders.push(f + ":" + (i + 1) + " " + line.trim().slice(0, 80));
  }));
  assert.deepEqual(offenders, [], "use var(--wa-NN) / var(--ink) instead so the light theme can recolour it");
});

test("light-theme text is never fainter than 60% ink", () => {
  const offenders = [];
  css.split("\n").forEach((line, i) => {
    if (!line.trim().startsWith("body.light")) return;
    for (const m of line.matchAll(/(?<![-\w])(?:color|fill)\s*:\s*rgba\(\s*(?:0|26)\s*,\s*(?:0|26)\s*,\s*(?:0|26)\s*,\s*(\d*\.?\d+)\s*\)/g)) {
      if (Number(m[1]) < 0.6) offenders.push("app.css:" + (i + 1) + " alpha " + m[1]);
    }
  });
  assert.deepEqual(offenders, []);
});

test("the light tone steps keep their order, and never get fainter than 60%", () => {
  const steps = [...lightBlock.matchAll(/--wa-(\d+)\s*:\s*rgba\(26,26,26,(\.\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(steps.length > 20);
  steps.sort((a, b) => a[0] - b[0]);
  steps.forEach(([, alpha], i) => {
    assert.ok(alpha >= 0.6, "alpha " + alpha);
    if (i) assert.ok(alpha >= steps[i - 1][1], "a brighter dark-theme step must not become fainter in the light theme");
  });
});
