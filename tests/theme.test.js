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

// ── the sign-in page ──
test("the sign-in error and the Google button have light-theme rules", () => {
  // the error text is a pale salmon for the dark card; on the light card it needs a darker red
  assert.match(css, /body\.light \.login-error\{[^}]*color:var\(--rose\)/);
  // the button is white, so on the white light-theme card it needs an outline to be visible
  assert.match(css, /body\.light \.btn-google\{[^}]*box-shadow:inset 0 0 0 1px/);
});

test("on tablets and phones the sign-in card is placed before the story, so the button is on the first screen", () => {
  const start = css.indexOf("@media(max-width:900px){.login-wrap");
  assert.ok(start >= 0, "the 900px sign-in rules exist");
  const rule = css.slice(start, css.indexOf("\n", start));
  assert.match(rule, /\.login-story\{display:contents\}/);
  assert.match(rule, /\.login-brand\{order:1/);
  assert.match(rule, /\.login-card\{order:2/);
  assert.match(rule, /\.login-story>\*\{order:3\}/);
  // and the story must still come first in the page itself (desktop reads left to right)
  const html = read("index.html");
  assert.ok(html.indexOf('class="login-story"') < html.indexOf('class="login-card"'));
});

// ── the page backdrop ──
test("the shaded backdrop works: html has no background of its own, body paints it, and the glow layers sit behind everything", () => {
  const rule = (sel) => { const i = css.indexOf("\n" + sel + "{"); assert.ok(i >= 0, sel + " rule exists"); return css.slice(i, css.indexOf("}", i)); };
  // if <html> had a background, the body's background (and so the glow layers above it) would be hidden
  assert.doesNotMatch(rule("html,body"), /background/);
  assert.match(rule("body"), /background:var\(--bg\)/);
  const layers = rule("body::before,body::after");
  assert.match(layers, /position:fixed/);
  assert.match(layers, /z-index:-1/);
  assert.match(layers, /pointer-events:none/);
  // both themes have their own glow
  assert.match(css, /\nbody\.light::before\{/);
  assert.match(css, /\nbody\.light::after\{/);
});

test("the dark tone scale only gets brighter as the step number goes up", () => {
  const steps = [...rootBlock.matchAll(/--wa-(\d+)\s*:\s*rgba\(255,255,255,(\.?\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]).sort((a, b) => a[0] - b[0]);
  assert.ok(steps.length > 20);
  steps.forEach(([n, alpha], i) => { if (i) assert.ok(alpha >= steps[i - 1][1], "--wa-" + n + " (" + alpha + ") is dimmer than the step below it"); });
});

test("the installed-app / browser colours match the page background", () => {
  const bg = /--bg:(#[0-9a-fA-F]{6})/.exec(rootBlock)[1].toLowerCase();
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(String(manifest.theme_color).toLowerCase(), bg);
  assert.equal(String(manifest.background_color).toLowerCase(), bg);
  const meta = /<meta name="theme-color" content="([^"]*)">/.exec(read("index.html"));
  assert.ok(meta, "theme-color meta exists");
  assert.equal(meta[1].toLowerCase(), bg, "theme-color must be a real hex colour (a URL-escaped # is ignored by browsers)");
});

// ── calendar entries ──
test("calendar bars: dark-theme text is the main text colour, and the light theme keeps its own colours", () => {
  // every light-theme rule whose selector list mentions the given bar class
  const lightRules = (cls) => css.split("\n").filter((l) => l.startsWith("body.light") && l.split("{")[0].split(",").some((sel) => sel.trim() === "body.light .cal-event-bar." + cls));
  for (const cls of ["target", "stretch", "main-event-bar", "side-event-bar", "sat-event-bar"]) {
    const dark = new RegExp("\\n\\.cal-event-bar\\." + cls + "\\{[^}]*color:var\\(--ink\\)").test(css);
    assert.ok(dark, cls + " text should be var(--ink), not a tint of its own fill");
    const rules = lightRules(cls).join("\n");
    assert.match(rules, /color:#/, cls + " has a light-theme text colour");
    assert.match(rules, /background:rgba/, cls + " keeps its light-theme fill");
  }
});

test("calendar bars are set in the sans font at a weight that is really loaded, and a long name never widens a column", () => {
  const rule = css.match(/\n\.cal-event-bar\{([^}]*)\}/);
  assert.ok(rule, "found the .cal-event-bar rule");
  const props = rule[1];
  // DM Mono is only loaded at 400/500 and DM Sans at 300/400/500: anything heavier is a browser-faked bold that smudges at small sizes.
  assert.match(props, /font-family:var\(--sans\)/, "bar text uses the sans font, not 10px monospace");
  const weight = Number((props.match(/font-weight:(\d+)/) || [])[1]);
  assert.ok(weight >= 400 && weight <= 500, "bar font-weight " + weight + " must be a loaded weight (400-500)");
  const size = parseFloat((props.match(/font-size:([\d.]+)px/) || [])[1]);
  assert.ok(size >= 12, "bar text is at least 12px on desktop (was 10px), got " + size);
  const fonts = read("index.html").match(/fonts\.googleapis\.com\/css2\?[^"]*/)[0];
  assert.match(fonts, /DM\+Sans:wght@[\d;]*500/, "DM Sans 500 is loaded");
  // equal columns whatever the names inside are
  assert.match(css, /\.cal-days\{[^}]*repeat\(7,minmax\(0,1fr\)\)/, "the calendar grid uses minmax(0,1fr) columns");
  // the name is cut by CSS to the real width of the cell, not by a fixed character count
  const cal = read("js/features/calendar.js");
  assert.doesNotMatch(cal, /r\.t\.name\.substring\(0, *\d+\)/, "month bars must not hard-cut the name to a fixed length");
});
