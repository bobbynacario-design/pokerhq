"use strict";
// Nothing you enter may vanish. Add a session, a hand, a villain and a tournament,
// then (a) reload the page and (b) sign in on a brand-new device that only has the
// cloud copy: everything must still be there, once, with no duplicates.
const assert = require("assert").strict;
const { boot, OWNER } = require("./lib.js");

(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1280, height: 1000 } });
  const ok = (m) => console.log("ok  " + m);
  const settle = () => page.waitForTimeout(700);
  const closeModals = () => page.evaluate(() => document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open")));
  const signInAgain = async () => {
    await page.waitForFunction(() => typeof window.__authCallback === "function");
    await page.evaluate((u) => window.__authCallback(u), OWNER);
    await settle();
    await page.evaluate(() => { const o = document.getElementById("onboarding-overlay"); if (o) o.style.display = "none"; });
  };
  const snapshot = () => page.evaluate(() => ({
    sessions: sessions.map((s) => s.name), hands: hands.map((h) => h.title), opponents: opponents.map((o) => o.name),
    tourneys: tourneys.map((t) => t.name), bankroll: bankroll.amount,
  }));
  const expected = { sessions: ["Reload test session"], hands: ["Reload test hand"], opponents: ["Reload test villain"], tourneys: ["Reload test tourney"], bankroll: 43000 };

  // 1. enter one of everything through the real forms
  await page.evaluate(() => { window.bankroll.amount = 40000; save("bankroll", bankroll); window.sessions.length = 0; window.hands.length = 0; window.opponents.length = 0; window.tourneys.length = 0; switchGroup("play", "sessions"); });
  await page.fill("#s-name", "Reload test session");
  await page.fill("#s-venue", "Solaire");
  await page.fill("#s-buyin", "2000");
  await page.fill("#s-prize", "5000");
  await page.click("#session-submit-btn");
  await page.waitForFunction(() => sessions.length === 1);
  await page.waitForTimeout(300);
  await closeModals();

  await page.evaluate(() => openNewHandModal());
  await page.fill("#h-title", "Reload test hand");
  await page.fill("#h-desc", "Some hand");
  await page.locator("#modal-hand").getByRole("button", { name: /^SAVE HAND/ }).click();
  await page.waitForFunction(() => hands.length === 1);

  await page.evaluate(() => openNewOpponentModal());
  await page.fill("#opp-name", "Reload test villain");
  await page.fill("#opp-notes", "Bluffs rivers");
  await page.locator("#modal-opponent").getByRole("button", { name: /^SAVE/ }).click();
  await page.waitForFunction(() => opponents.length === 1);

  await page.evaluate(() => { switchGroup("plan", "calendar"); openNewTourneyModal(); });
  await page.fill("#t-name", "Reload test tourney");
  await page.fill("#t-date", "2026-10-10");
  await page.fill("#t-buyin", "5000");
  await page.locator("#modal-tourney").getByRole("button", { name: /^ADD/ }).click();
  await page.waitForFunction(() => tourneys.length === 1);
  await settle();
  assert.deepEqual(await snapshot(), expected);
  ok("a session, a hand, a villain and a tournament saved through the real forms (bankroll ₱43,000)");

  // 2. the saves reached the cloud copy, not just this browser
  const cloud = await page.evaluate(() => [...globalThis.__cloud.docs.entries()]);
  const cloudKeys = cloud.map(([p]) => p.split("/").pop());
  for (const k of ["sessions", "hands", "opponents", "tourneys", "bankroll"]) assert.ok(cloudKeys.includes(k), "cloud has " + k + " (has: " + cloudKeys.join(",") + ")");
  ok("all of it was also written to the cloud copy");

  // carry the cloud copy across page loads (a real Firestore outlives the page; the fake does not)
  const carryCloud = (entries) => page.addInitScript((e) => {
    globalThis.__cloud = { docs: new Map(e), listeners: new Map(), stats: { transactions: 0, txWrites: 0, sets: 0, gets: 0 }, failNext: null };
  }, entries);

  // 3. reload on the same device
  await carryCloud(cloud);
  await page.reload();
  await signInAgain();
  assert.deepEqual(await snapshot(), expected);
  ok("reload on the same device: everything is still there, once");

  // 4. a brand-new device: no local data at all, only the cloud copy
  await page.evaluate(() => localStorage.clear());
  await carryCloud(cloud);
  await page.reload();
  await signInAgain();
  assert.deepEqual(await snapshot(), expected);
  ok("a new device with no local data loads everything from the cloud, once");

  // 5. it shows in the UI, not just in memory
  await page.evaluate(() => switchGroup("review", "sessions"));
  assert.match(await page.textContent("#session-tbody"), /Reload test session/);
  await page.evaluate(() => switchGroup("review", "opponents"));
  assert.match(await page.textContent("#page-opponents"), /Reload test villain/);
  ok("the saved session and villain appear on their pages after the reload");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
