"use strict";
// Drift guard: the Cloud Function proxy rejects any model or max_tokens it
// doesn't allow, and the browser only finds out at request time. Fail here first.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const serverSrc = read("functions/index.js");

const allowed = new Set([...serverSrc.match(/ALLOWED_MODELS\s*=\s*new Set\(\[([^\]]*)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
const ceiling = Number(serverSrc.match(/MAX_TOKENS_CEILING\s*=\s*(\d+)/)[1]);
const featureFiles = fs.readdirSync(path.join(root, "js/features")).filter((f) => f.endsWith(".js")).map((f) => "js/features/" + f);

test("every Anthropic model the client references is allowed by the proxy", () => {
  const used = new Map();
  featureFiles.concat(["js/data/ai-proxy.js"]).forEach((file) => {
    for (const m of read(file).matchAll(/claude-[a-z0-9.-]+/g)) {
      if (!used.has(m[0])) used.set(m[0], file);
    }
  });
  assert.ok(used.size >= 2, "found the client's Claude model ids");
  for (const [model, file] of used) {
    assert.ok(allowed.has(model), `${file} sends ${model}, but functions/index.js ALLOWED_MODELS only has: ${[...allowed].join(", ")}`);
  }
});

test("no client max_tokens exceeds the proxy ceiling", () => {
  let found = 0;
  featureFiles.forEach((file) => {
    for (const m of read(file).matchAll(/max_tokens:\s*(\d+)/g)) {
      found++;
      assert.ok(Number(m[1]) <= ceiling, `${file} asks for max_tokens ${m[1]} > proxy ceiling ${ceiling}`);
    }
  });
  assert.ok(found >= 3, "found the client's max_tokens settings");
});

test("the proxy allowlist has no model nobody uses (stale entries)", () => {
  const clientText = featureFiles.map(read).join("\n");
  allowed.forEach((model) => assert.ok(clientText.includes(model), `ALLOWED_MODELS lists ${model} but no client code sends it`));
});

// ── calendar update cooldown ──
function loadCalendar() {
  const sandbox = {
    window: {}, document: {getElementById: () => null}, localStorage: {getItem: () => null, setItem() {}},
    console, alert() {}, confirm: () => true, MONTH_SHORT_UPPER: [],
  };
  vm.createContext(sandbox);
  vm.runInContext(read("js/features/calendar.js"), sandbox);
  return sandbox;
}

test("calendar update: no warning when never run, old, or the clock went backwards", () => {
  const c = loadCalendar();
  const now = Date.now(), h = 3600000;
  assert.equal(c.calUpdateCooldownMessage(0, now), "");
  assert.equal(c.calUpdateCooldownMessage(null, now), "");
  assert.equal(c.calUpdateCooldownMessage(now - 13 * h, now), "");
  assert.equal(c.calUpdateCooldownMessage(now + 5 * h, now), "", "a timestamp in the future is ignored");
});

test("calendar update: warns (and says how long ago) when run recently", () => {
  const c = loadCalendar();
  const now = Date.now();
  assert.match(c.calUpdateCooldownMessage(now - 20000, now), /ran 1 minute ago/);
  assert.match(c.calUpdateCooldownMessage(now - 25 * 60000, now), /ran 25 minutes ago/);
  assert.match(c.calUpdateCooldownMessage(now - 3 * 3600000, now), /ran 3 hours ago/);
  assert.match(c.calUpdateCooldownMessage(String(now - 60 * 60000), now), /ran 1 hour ago/, "accepts the stored string form");
  assert.match(c.calUpdateCooldownMessage(now - 3600000, now), /Run it again anyway\?/);
});
