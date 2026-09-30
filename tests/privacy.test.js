"use strict";
// Privacy Mode (js/data/privacy.js). Two halves: the rules (what counts as an amount, when the
// screen is hidden) and the CHECKLIST: source-level guards that fail when a new place is added that
// could show or export real amounts without going through Privacy Mode. The full page sweep is in
// e2e/privacy.e2e.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const P = require("../js/data/privacy.js");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ── the rules ──
test("every way the app writes an amount is masked", () => {
  const cases = {
    "₱1,234": "₱•••",
    "₱0": "₱•••",
    "₱ 1,234": "₱•••",
    "−₱500": "₱•••",           // the app's minus sign
    "-₱500": "₱•••",
    "+₱6,000": "₱•••",
    "₱1.5k": "₱•••",
    "₱2M": "₱•••",
    "₱1,234.50": "₱•••",
    "PHP 12,000": "₱•••",
    "+PHP 500": "₱•••",
    "-PHP 500": "₱•••",
    "12,000 PHP": "₱•••",
    "Bankroll ₱43,000 · buy-in ₱2,000": "Bankroll ₱••• · buy-in ₱•••",
    "for ₱500 tonight": "for ₱••• tonight",           // the space before the amount stays
    "won ₱1,000, then lost ₱200.": "won ₱•••, then lost ₱•••.",   // commas and full stops after an amount stay
    "₱1,000-₱2,000": "₱•••₱•••",
    "(₱3,300)": "(₱•••)",
  };
  Object.keys(cases).forEach((input) => assert.equal(P.maskText(input), cases[input], input));
});

test("things that are not amounts are left alone", () => {
  ["5 buy-ins", "22bb", "ITM 33%", "ROI +12.5%", "2026-09-29", "Table 4, seat 7", "Bankroll (₱)", "Buy-in (₱) — PKO", "1,000 chips", "10 min", "₱", "PHP", "Position 12 of 245", "MAY 5"]
    .forEach((text) => assert.equal(P.maskText(text), text, text));
  assert.equal(P.maskText(""), "");
  assert.equal(P.maskText(null), null);
  assert.equal(P.maskText(undefined), undefined);
  assert.equal(P.maskText(42), 42, "non-strings pass through");
});

test("masking twice changes nothing more (the page watcher relies on this)", () => {
  const once = P.maskText("+₱6,000 and PHP 12,000 and −₱1.5k");
  assert.equal(P.maskText(once), once);
  assert.equal(P.hasMoney(once), false, "a masked string has no amount left");
  assert.equal(P.hasMoney("₱1"), true);
  assert.equal(P.hasMoney("no money here 1,000"), false);
});

test("when the screen is hidden: the switch, or the session rule", () => {
  const off = { manual: false, auto: false };
  assert.equal(P.isHidden(off, false, false), false);
  assert.equal(P.isHidden(off, true, false), false, "auto is off, a session changes nothing");
  assert.equal(P.isHidden({ manual: true, auto: false }, false, false), true);
  assert.equal(P.isHidden({ manual: false, auto: true }, false, false), false, "auto only applies during a session");
  assert.equal(P.isHidden({ manual: false, auto: true }, true, false), true);
  assert.equal(P.isHidden({ manual: false, auto: true }, true, true), false, "the player revealed it for this session");
  assert.equal(P.isHidden({ manual: true, auto: true }, true, true), true, "the switch always wins");
  assert.deepEqual(P.normalizeSettings(null), off);
  assert.deepEqual(P.normalizeSettings({ manual: "yes", auto: 1 }), off, "only real booleans count");
});

test("the eye button: hides, reveals, and a mid-session reveal lasts until the session ends", () => {
  let a = P.afterToggle({ manual: false, auto: false }, false, false);
  assert.deepEqual(a, { settings: { manual: true, auto: false }, override: false });
  a = P.afterToggle(a.settings, false, a.override);          // reveal again
  assert.deepEqual(a, { settings: { manual: false, auto: false }, override: false });
  // hidden only because a session is running: clicking reveals, and stays revealed
  const session = P.afterToggle({ manual: false, auto: true }, true, false);
  assert.deepEqual(session, { settings: { manual: false, auto: true }, override: true });
  assert.equal(P.isHidden(session.settings, true, session.override), false);
  // clicking again hides for real (manual)
  const again = P.afterToggle(session.settings, true, session.override);
  assert.deepEqual(again, { settings: { manual: true, auto: true }, override: false });
  assert.equal(P.isHidden(again.settings, true, again.override), true);
});

test("the export warning names the file and says the amounts are real", () => {
  const w = P.exportWarning("CSV file");
  assert.match(w, /Privacy Mode is on/);
  assert.match(w, /CSV file/);
  assert.match(w, /real amounts/);
  assert.equal(P.hasMoney(w), false, "the warning itself contains no amount for the pop-up masker to mangle");
});

// ── the checklist ──
const featureFiles = fs.readdirSync(path.join(ROOT, "js/features")).filter((f) => f.endsWith(".js")).map((f) => "js/features/" + f);

// [file, enclosing function name, the line that made a file]
function fileMakers() {
  const found = [];
  featureFiles.forEach((file) => {
    const text = read(file);
    const re = /new Blob\(|\bdoc\.save\(|\.save\('PokerHQ_/g;
    let m;
    while ((m = re.exec(text))) {
      const start = Math.max(text.lastIndexOf("\nfunction ", m.index), text.lastIndexOf("\nasync function ", m.index));
      const name = (text.slice(start + 1, start + 90).match(/^(?:async\s+)?function\s+(\w+)/) || [])[1] || "?";
      const nextPlain = text.indexOf("\nfunction ", m.index), nextAsync = text.indexOf("\nasync function ", m.index);
      const end = [nextPlain, nextAsync].filter((i) => i !== -1).sort((x, y) => x - y)[0];
      found.push({ file, name, body: text.slice(start, end === undefined ? text.length : end) });
    }
  });
  return found;
}

test("CHECKLIST exports: every function that makes a file asks Privacy Mode first, unless it is on the short allow list", () => {
  const allowed = {
    downloadBackupPayload: "the JSON backup and the pre-restore copy must always be complete",
    transcribeVoiceRecording: "the voice recorder's audio blob (sent for transcription), not an export",
  };
  const makers = fileMakers();
  assert.ok(makers.length >= 6, "found the export functions (" + makers.map((m) => m.name).join(", ") + ")");
  const names = new Set(makers.map((m) => m.name));
  ["exportCSV", "exportPDF", "exportMonthlyCSV", "exportStakingCSV", "exportBackerPackageReportPDF", "exportCalendarICS"]
    .forEach((n) => assert.ok(names.has(n), "the checklist knows about " + n));
  const missing = makers.filter((m) => !allowed[m.name] && !/confirmExport\(/.test(m.body)).map((m) => m.file + " " + m.name);
  assert.deepEqual(missing, [], "these make a file without asking Privacy Mode (add PokerHQPrivacy.confirmExport, or put them on the allow list with a reason)");
});

test("CHECKLIST inputs: every box that holds a saved amount is marked data-money (so it is blurred)", () => {
  const html = read("index.html");
  const scratch = new Set(["calc-pool", "icm-payouts"]);   // typed by hand into a what-if calculator: not saved amounts
  const controls = [];
  const re = /<label[^>]*>([^<]*(?:₱|PHP)[^<]*)<\/label>\s*(<(?:input|select|textarea)\b[^>]*>)/g;
  let m;
  while ((m = re.exec(html))) controls.push({ label: m[1].trim(), tag: m[2], id: (m[2].match(/\bid="([^"]+)"/) || [])[1] });
  assert.ok(controls.length >= 12, "found the labelled money boxes (" + controls.length + ")");
  const unmarked = controls.filter((c) => !scratch.has(c.id) && !/\bdata-money\b/.test(c.tag)).map((c) => c.id + " (" + c.label + ")");
  assert.deepEqual(unmarked, [], "money boxes without data-money");
  // staking terms are private too, though their labels carry no peso sign
  ["s-player-share", "s-markup", "s-backer-count", "s-backers", "br-input", "wallet-amount", "t-buyin", "t-gtd"].forEach((id) => {
    const tag = (html.match(new RegExp("<(?:input|textarea)\\b[^>]*\\bid=\"" + id + "\"[^>]*>")) || [])[0];
    assert.ok(tag, id + " exists");
    assert.match(tag, /\bdata-money\b/, id + " is marked data-money");
  });
});

test("CHECKLIST charts: nothing is drawn on a canvas, where text cannot be masked", () => {
  const all = ["index.html"].concat(featureFiles).map((f) => [f, read(f)]);
  const canvasUse = all.filter(([, text]) => /getContext\(|\.fillText\(|<canvas\b/.test(text)).map(([f]) => f);
  assert.deepEqual(canvasUse, [], "canvas drawing is invisible to Privacy Mode's page watcher: draw charts as SVG text, or mask the labels in code");
});

test("CHECKLIST phone alerts and email: every server message that names a buy-in has a way to leave it out", () => {
  const push = read("functions/push.js");
  assert.match(push, /hideAmounts/, "push.js has the hideAmounts option");
  const pesoCalls = (push.match(/\bpeso\(/g) || []).length - 1;                 // minus the definition
  const guarded = (push.match(/hide \? "" : peso\(/g) || []).length;
  assert.ok(pesoCalls >= 2, "found the buy-in uses in the payload builders");
  assert.equal(guarded, pesoCalls, "every peso( call in a payload sits behind the hide check");
  const index = read("functions/index.js");
  assert.match(index, /buildDigestPayload\([^)]*hideAmounts/);
  assert.match(index, /buildStartingSoonPayload\([^)]*hideAmounts/);
});

test("the page is wired up: script loaded early, offline copy cached, header eye, Home card, session hook", () => {
  const html = read("index.html");
  assert.match(html, /<script src="\.\/js\/data\/privacy\.js\?v=[\w]+"><\/script>/);
  assert.ok(html.indexOf("js/data/privacy.js") < html.indexOf("js/features/library.js"), "loaded before the features that call it");
  assert.match(read("sw.js"), /\.\/js\/data\/privacy\.js/);
  assert.match(html, /id="privacy-toggle"[^>]*PokerHQPrivacy\.toggle\(\)|PokerHQPrivacy\.toggle\(\)[^>]*id="privacy-toggle"/);
  assert.match(html, /id="privacy-auto"/);
  assert.match(html, /id="push-hide-amounts"/);
  assert.match(read("js/features/active-session.js"), /PokerHQPrivacy\.setSessionActive\(/);
  const css = read("styles/app.css");
  assert.match(css, /body\.privacy-on \[data-money\]/);
});
