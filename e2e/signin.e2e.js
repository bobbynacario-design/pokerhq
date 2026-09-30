"use strict";
// The sign-in gate: what shows while the app checks, when nobody is signed in and
// when the owner signs in, and that the Google button is always on the first screen
// (on a phone it used to sit below a long story panel, out of sight).
const assert = require("assert").strict;
const { boot, freezeMotion, OWNER } = require("./lib.js");

const SIZES = [
  ["your app window", 1533, 610], ["desktop", 1440, 900], ["laptop", 1366, 768], ["small laptop", 1280, 720],
  ["tablet", 820, 1180], ["tablet landscape", 1024, 768],
  ["iPhone", 390, 844], ["iPhone SE", 375, 667], ["small phone", 320, 568], ["phone landscape", 812, 375],
];

(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1280, height: 800 }, signedIn: false });
  const ok = (m) => console.log("ok  " + m);
  await freezeMotion(page);
  const overlayShown = () => page.evaluate(() => !document.getElementById("login-overlay").classList.contains("hidden"));
  const shown = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== "none"; }, sel);

  // 1. before Firebase answers: the gate is up and says it is checking
  assert.equal(await overlayShown(), true);
  assert.equal(await shown("#login-status"), true);
  assert.match(await page.textContent("#login-status"), /Checking sign-in/);
  assert.equal(await shown("#login-google-btn"), false, "no button while still checking");
  ok("the gate shows 'Checking sign-in...' first, with no button yet");

  // 2. nobody signed in: the button appears
  await page.evaluate(() => window.__authCallback(null));
  await page.waitForTimeout(100);
  assert.equal(await overlayShown(), true);
  assert.equal(await shown("#login-google-btn"), true);
  assert.equal(await shown("#login-status"), false);
  ok("signed out: the Continue with Google button shows and the checking line goes");

  // 3. the button really asks for a Google sign-in
  await page.click("#login-google-btn");
  await page.waitForTimeout(100);
  assert.match(await page.textContent("#login-status"), /Opening Google sign-in/);
  ok("clicking Continue with Google starts the sign-in (real handler, not just a stub)");

  // keyboard: Enter on the focused button does the same
  await page.evaluate(() => window.__authCallback(null));
  await page.waitForTimeout(100);
  await page.focus("#login-google-btn");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  assert.match(await page.textContent("#login-status"), /Opening Google sign-in/);
  ok("Enter on the focused button starts the sign-in too");

  // 4. the button is on the first screen at every size, also with an error message above it
  await page.evaluate(() => window.__authCallback(null));
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const e = document.getElementById("login-error");
    e.textContent = "bobbynacario.longname@example.com doesn't have access to PokerHQ data. Sign in with the owner account.";
    e.style.display = "";
  });
  for (const withError of [false, true]) {
    await page.evaluate((show) => { document.getElementById("login-error").style.display = show ? "" : "none"; }, withError);
    for (const [name, w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(60);
      const r = await page.evaluate(() => {
        const b = document.getElementById("login-google-btn").getBoundingClientRect();
        const ov = document.getElementById("login-overlay");
        return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), vw: innerWidth, vh: innerHeight, sideways: ov.scrollWidth - ov.clientWidth };
      });
      const label = name + " " + w + "x" + h + (withError ? " (with error)" : "");
      assert.ok(r.top >= 0 && r.bottom <= r.vh, label + ": Continue with Google is below the fold (bottom " + r.bottom + " of " + r.vh + ")");
      assert.ok(r.left >= 0 && r.right <= r.vw, label + ": button runs off the side");
      assert.ok(r.sideways <= 0, label + ": the gate scrolls sideways by " + r.sideways + "px");
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  ok("the button is fully on the first screen, without scrolling, at " + SIZES.length + " sizes (with and without an error line)");

  // 5. light mode still shows the button and the error line (their colours are measured in light-contrast)
  await page.evaluate(() => { document.body.classList.add("light"); document.getElementById("login-error").style.display = ""; });
  assert.equal(await shown("#login-google-btn"), true);
  assert.equal(await shown("#login-error"), true);
  await page.evaluate(() => document.body.classList.remove("light"));
  ok("light mode keeps the button and the error line visible");

  // 6. the owner signs in: the whole gate goes away and the app is usable
  await page.evaluate((u) => window.__authCallback(u), OWNER);
  await page.waitForTimeout(400);
  assert.equal(await overlayShown(), false);
  const gateBox = await page.evaluate(() => { const r = document.getElementById("login-overlay"); const cs = getComputedStyle(r); return { display: cs.display, vis: cs.visibility, op: cs.opacity, pe: cs.pointerEvents }; });
  assert.ok(gateBox.display === "none" || gateBox.vis === "hidden" || gateBox.op === "0" || gateBox.pe === "none", "the hidden gate must not cover the app: " + JSON.stringify(gateBox));
  assert.equal(await page.evaluate(() => { const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return !!el && !el.closest("#login-overlay"); }), true, "the app, not the gate, is under the pointer");
  ok("signing in as the owner removes the gate and the app is under the pointer");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
