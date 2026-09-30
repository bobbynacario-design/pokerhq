"use strict";
// Trips & True ROI: create a trip, add costs in pesos and other currencies, watch poker ROI and true
// ROI part ways, and check that a seat won in a satellite is counted once, not twice.
const assert = require("assert").strict;
const { boot, freezeMotion, OWNER } = require("./lib.js");

(async () => {
  const { page, dialogs, realErrors, close } = await boot({ viewport: { width: 1280, height: 1000 } });
  const ok = (m) => console.log("ok  " + m);
  await freezeMotion(page);
  const settle = (ms = 150) => page.waitForTimeout(ms);
  const closeModals = () => page.evaluate(() => document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open")));
  const treasury = async () => { await page.evaluate(() => switchGroup("wallet")); await settle(); };
  const card = (name) => page.locator('.trip-card:has(.trip-name:text-is("' + name + '"))');
  const text = async (loc) => (await loc.textContent()).replace(/\s+/g, " ").trim();
  const logSession = async (f) => {
    await page.evaluate(() => switchGroup("play", "sessions"));
    await page.fill("#s-date", f.date);
    await page.fill("#s-name", f.name);
    await page.fill("#s-buyin", String(f.buyin));
    await page.fill("#s-rebuy", "");
    await page.fill("#s-prize", String(f.prize || 0));
    await page.fill("#s-bounty", "");
    if (f.trip !== undefined) await page.selectOption("#s-trip", f.trip);
    if (f.seat) await page.check("#s-satseat");
    await page.click("#session-submit-btn");
    await page.waitForFunction((n) => sessions.some((s) => s.name === n), f.name);
    await page.waitForTimeout(300);
    await closeModals();
  };
  await page.evaluate(() => { window.sessions.length = 0; window.satellites.length = 0; window.bankroll.amount = 100000; save("bankroll", bankroll); });

  // 0. nothing yet
  await treasury();
  assert.match(await text(page.locator("#trips-list")), /No trips yet/);
  assert.equal(await page.locator("#trips-overall .trip-card").count(), 0);
  ok("with no trips the section explains what to do");

  // 1. a new trip: the form checks its input
  await page.click("#trips-section >> text=+ NEW TRIP");
  await page.waitForSelector("#modal-trip.open");
  await page.locator("#modal-trip").getByRole("button", { name: /^SAVE TRIP/ }).click();
  assert.equal(await text(page.locator("#trip-error")), "Give the trip a name.");
  await page.fill("#trip-name", "APT Taipei 2026");
  await page.fill("#trip-start", "2026-04-30");
  await page.fill("#trip-end", "2026-04-20");
  await page.locator("#modal-trip").getByRole("button", { name: /^SAVE TRIP/ }).click();
  assert.equal(await text(page.locator("#trip-error")), "The last day is before the first day.");
  await page.fill("#trip-start", "2026-04-20");
  await page.fill("#trip-end", "2026-04-30");
  await page.fill("#trip-notes", "Flights on miles");
  await page.locator("#modal-trip").getByRole("button", { name: /^SAVE TRIP/ }).click();
  await page.waitForFunction(() => trips.length === 1);
  assert.equal(await page.evaluate(() => document.getElementById("modal-trip").classList.contains("open")), false);
  const c1 = await text(card("APT Taipei 2026"));
  assert.match(c1, /Apr 20 – Apr 30, 2026 · 0 sessions/);
  assert.match(c1, /Flights on miles/);
  assert.match(c1, /No costs yet/);
  ok("a trip is created; the form asks for a name and refuses a last day before the first");

  // 2. costs: pesos, then a foreign currency with a live preview and a rate that must be entered
  const addCost = async (f) => {
    await card("APT Taipei 2026").getByRole("button", { name: "+ ADD COST" }).click();
    await page.waitForSelector("#modal-trip-cost.open");
    await page.fill("#cost-date", f.date || "2026-04-21");
    await page.selectOption("#cost-category", f.category);
    await page.fill("#cost-desc", f.desc || "");
    await page.selectOption("#cost-currency", f.currency || "PHP");
    await page.fill("#cost-amount", String(f.amount));
    if (f.rate !== undefined) await page.fill("#cost-rate", String(f.rate));
    return f;
  };
  const saveCost = () => page.locator("#modal-trip-cost").getByRole("button", { name: /^SAVE COST/ }).click();
  await addCost({ category: "hotel", desc: "9 nights", amount: 6000 });
  assert.equal(await page.isVisible("#cost-rate-wrap"), false, "pesos need no rate");
  await saveCost();
  await addCost({ category: "flight", desc: "MNL-TPE", amount: 4000 });
  await saveCost();
  await addCost({ category: "food", desc: "Street food", currency: "USD", amount: 100 });
  assert.equal(await page.isVisible("#cost-rate-wrap"), true);
  assert.match(await text(page.locator("#cost-rate-label")), /Pesos per 1 USD/);
  assert.equal(await text(page.locator("#cost-preview")), "Enter the exchange rate to count this cost.");
  await saveCost();
  assert.equal(await text(page.locator("#cost-error")), "Enter the exchange rate: how many pesos one USD is worth.");
  await page.fill("#cost-rate", "58");
  assert.equal(await text(page.locator("#cost-preview")), "= ₱5,800");
  await saveCost();
  await page.waitForFunction(() => tripExpenses.length === 3);
  const costs = await page.evaluate(() => tripExpenses.map((e) => ({ c: e.category, a: e.amount, cur: e.currency, r: e.rate })).sort((x, y) => x.c.localeCompare(y.c)));
  assert.deepEqual(costs, [{ c: "flight", a: 4000, cur: "PHP", r: undefined }, { c: "food", a: 100, cur: "USD", r: 58 }, { c: "hotel", a: 6000, cur: "PHP", r: undefined }]);
  const rows = await page.$$eval(".trip-card .trip-cost", (r) => r.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
  assert.ok(rows.some((r) => /Street food.*USD 100 × 58 = ₱5,800/.test(r)), rows.join(" | "));
  assert.ok(rows.some((r) => /9 nights.*₱6,000/.test(r)));
  ok("costs in pesos and in USD (rate required, live '= ₱5,800' preview) are saved and listed");

  // the rate you used becomes the trip's default for that currency
  await card("APT Taipei 2026").getByRole("button", { name: "+ ADD COST" }).click();
  await page.waitForSelector("#modal-trip-cost.open");
  await page.selectOption("#cost-currency", "USD");
  assert.equal(await page.inputValue("#cost-rate"), "58", "pre-filled with the last USD rate for this trip");
  await page.selectOption("#cost-currency", "TWD");
  assert.equal(await page.inputValue("#cost-rate"), "", "no TWD rate yet");
  await closeModals();
  ok("the next USD cost starts from the rate you used before");

  // 3. sessions inside the dates join the trip by themselves: poker ROI vs true ROI
  await logSession({ date: "2026-04-25", name: "Taipei Main Day 1", buyin: 10000, prize: 30000 });
  await logSession({ date: "2026-04-26", name: "Taipei Side Event", buyin: 10000, prize: 0 });
  await logSession({ date: "2026-05-10", name: "Back home", buyin: 3000, prize: 0 });
  await treasury();
  const trip = await text(card("APT Taipei 2026"));
  assert.match(trip, /Apr 20 – Apr 30, 2026 · 2 sessions/);
  assert.match(trip, /Poker ROI\s*\+50\.0%/);
  assert.match(trip, /True ROI\s*−16\.2%/);
  assert.match(trip, /Won\s*₱30,000/);
  assert.match(trip, /Buy-ins paid\s*₱20,000/);
  assert.match(trip, /Satellites\s*₱0/);
  assert.match(trip, /Trip costs\s*₱15,800/);
  assert.match(trip, /Net after everything\s*−₱5,800/);
  assert.match(trip, /Hotel ₱6,000/);
  assert.match(trip, /Food ₱5,800/);
  const loose = await text(page.locator(".trip-card.loose"));
  assert.match(loose, /1 session outside every trip/);
  const overall = await text(page.locator("#trips-overall"));
  assert.match(overall, /All your play\s*3 sessions/);
  assert.match(overall, /Trip costs\s*₱15,800/);
  ok("2 sessions join the trip by date: poker ROI +50.0% becomes true ROI −16.2% once ₱15,800 of costs are counted; the 3rd session sits under 'Not on a trip'");

  // 4. satellites: a seat won in a satellite is counted once
  await page.evaluate(() => switchGroup("plan", "satellite"));
  for (const [i, when] of [["1", "2026-03-14"], ["2", "2026-03-20"], ["3", "2026-03-28"]]) {
    await page.evaluate(() => openNewSatelliteModal());
    await page.fill("#sat-date", when);
    await page.fill("#sat-name", "Daily Satellite #" + i);
    await page.fill("#sat-buyin", "1100");
    await page.selectOption("#sat-result", i === "3" ? "won" : "lost");
    await page.selectOption("#sat-trip", String(await page.evaluate(() => trips[0].id)));
    await page.locator("#modal-satellite").getByRole("button", { name: /^(SAVE|LOG|ADD)/ }).first().click();
    await page.waitForFunction((n) => satellites.length === n, Number(i));
  }
  assert.deepEqual(await page.evaluate(() => satellites.map((s) => s.tripId === trips[0].id)), [true, true, true], "each satellite was chosen for the trip although it was played weeks before it");
  await logSession({ date: "2026-04-27", name: "Taipei Main Event (seat)", buyin: 6500, prize: 20000, seat: true });
  await treasury();
  const withSeat = await text(card("APT Taipei 2026"));
  assert.match(withSeat, /3 sessions · 3 satellites/);
  assert.match(withSeat, /Buy-ins paid\s*₱20,000/, "the seat session's ₱6,500 is not counted as cash");
  assert.match(withSeat, /Satellites\s*₱3,300/, "the three satellites are");
  assert.match(withSeat, /Trip costs\s*₱15,800/);
  assert.match(withSeat, /Won\s*₱50,000/);
  assert.match(withSeat, /Net after everything\s*₱10,900/, "50,000 - 20,000 - 3,300 - 15,800");
  assert.doesNotMatch(withSeat, /may be counted twice|in both your satellites/);
  ok("a satellite seat: the ₱6,500 buy-in is not cash, the three ₱1,100 satellites are; nothing counted twice (net ₱10,900)");

  // the mistake the checkbox prevents: editing the session so it is NOT a satellite seat counts the buy-in on top
  const sid = await page.evaluate(() => sessions.find((s) => s.name === "Taipei Main Event (seat)").id);
  await page.evaluate((id) => editSession(id), sid);
  assert.equal(await page.isChecked("#s-satseat"), true, "editing loads the checkbox");
  await page.uncheck("#s-satseat");
  await page.click("#session-submit-btn");
  await page.waitForFunction(() => !sessions.find((s) => s.name === "Taipei Main Event (seat)").seatViaSatellite);
  await page.waitForTimeout(300); await closeModals(); await treasury();
  assert.match(await text(card("APT Taipei 2026")), /Buy-ins paid\s*₱26,500/, "the seat session counted as cash again");
  await page.evaluate((id) => editSession(id), sid);
  await page.check("#s-satseat");
  await page.click("#session-submit-btn");
  await page.waitForFunction(() => sessions.find((s) => s.name === "Taipei Main Event (seat)").seatViaSatellite === true);
  await page.waitForTimeout(300); await closeModals(); await treasury();
  assert.match(await text(card("APT Taipei 2026")), /Buy-ins paid\s*₱20,000/);
  ok("un-ticking the seat box counts the ₱6,500 as cash again (₱26,500); ticking it puts it back (₱20,000)");

  // 5. a warning when a seat session has no satellites, and when a satellite is logged twice
  await page.evaluate(() => { satellites.length = 0; save("satellites", satellites); renderTrips(); });
  assert.match(await text(card("APT Taipei 2026")), /1 session is marked as a satellite seat, but no satellites are counted here/);
  await page.evaluate(() => { satellites.unshift({ id: 4242, date: "2026-04-27", name: "Taipei Main Event (seat)", buyin: 6500, result: "won", tripId: trips[0].id }); save("satellites", satellites); sessions.find((s) => s.name === "Taipei Side Event").total = 10000; renderTrips(); });
  await page.evaluate(() => { sessions.push({ id: 5151, date: "2026-04-27", name: "Taipei Main Event (seat)", total: 6500, prize: 0 }); renderTrips(); });
  assert.match(await text(card("APT Taipei 2026")), /"Taipei Main Event \(seat\)" on 2026-04-27 is in both your satellites and your sessions/);
  await page.evaluate(() => { sessions.pop(); satellites.length = 0; renderTrips(); });
  ok("warnings: a seat with no satellites counted, and a satellite that is also a session");

  // 6. choosing a trip by hand: 'Not on a trip' keeps a session out, a chosen trip pulls one in from outside the dates
  await page.evaluate(() => { satellites.length = 0; });
  await logSession({ date: "2026-04-28", name: "Kept off the trip", buyin: 2000, prize: 0, trip: "none" });
  await logSession({ date: "2026-06-01", name: "Pulled onto the trip", buyin: 1500, prize: 0, trip: String(await page.evaluate(() => trips[0].id)) });
  await treasury();
  const names = await page.evaluate(() => { const T = PokerHQTrueRoi; return sessions.filter((s) => T.tripFor(s, trips)).map((s) => s.name).sort(); });
  assert.ok(names.includes("Pulled onto the trip") && !names.includes("Kept off the trip"), names.join(", "));
  ok("a session can be kept off a trip, or pulled onto one, regardless of its date");

  // 7. edit and delete a cost (with undo)
  await page.locator('.trip-card:has(.trip-name:text-is("APT Taipei 2026")) .trip-cost:has-text("9 nights") button[title="Edit cost"]').click();
  await page.waitForSelector("#modal-trip-cost.open");
  assert.equal(await page.inputValue("#cost-amount"), "6000");
  await page.fill("#cost-amount", "7000");
  await saveCost();
  await page.waitForFunction(() => tripExpenses.find((e) => e.description === "9 nights").amount === 7000);
  assert.match(await text(card("APT Taipei 2026")), /Hotel ₱7,000/);
  await page.locator('.trip-card:has(.trip-name:text-is("APT Taipei 2026")) .trip-cost:has-text("MNL-TPE") button[title="Delete cost"]').click();
  await page.waitForFunction(() => tripExpenses.length === 2);
  assert.match(await text(page.locator("#undo-toast-label")), /^Cost deleted: MNL-TPE/);
  await page.click("#undo-toast .toast-btn");
  await page.waitForFunction(() => tripExpenses.length === 3);
  ok("editing a cost updates the trip; deleting one can be undone");

  // 8. deleting a trip takes its costs, undo brings both back
  await page.locator('.trip-card:has(.trip-name:text-is("APT Taipei 2026")) button[title="Delete trip"]').click();
  await page.waitForFunction(() => trips.length === 0);
  assert.equal(await page.evaluate(() => tripExpenses.length), 0);
  assert.ok(dialogs.some((d) => d.type === "confirm" && /Delete "APT Taipei 2026" and its 3 costs\?/.test(d.message)), "asks first because costs go with it");
  await page.click("#undo-toast .toast-btn");
  await page.waitForFunction(() => trips.length === 1 && tripExpenses.length === 3);
  ok("deleting a trip asks first, removes its costs, and UNDO restores the trip and every cost");

  // 9. everything is saved to the cloud and survives a reload; a backup carries it
  const cloud = await page.evaluate(() => [...globalThis.__cloud.docs.entries()]);
  const keys = cloud.map(([p]) => p.split("/").pop());
  assert.ok(keys.includes("trips") && keys.includes("tripExpenses"), keys.join(","));
  const backup = await page.evaluate(() => getBackupSnapshot());
  assert.equal(backup.data.trips.length, 1);
  assert.equal(backup.data.tripExpenses.length, 3);
  await page.addInitScript((e) => { globalThis.__cloud = { docs: new Map(e), listeners: new Map(), stats: { transactions: 0, txWrites: 0, sets: 0, gets: 0 }, failNext: null }; }, cloud);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => typeof window.__authCallback === "function");
  await page.evaluate((u) => window.__authCallback(u), OWNER);
  await settle(800);
  await page.evaluate(() => { const o = document.getElementById("onboarding-overlay"); if (o) o.style.display = "none"; });
  assert.deepEqual(await page.evaluate(() => [trips.length, tripExpenses.length]), [1, 3], "a new device loads the trip and its costs from the cloud");
  await treasury();
  assert.match(await text(card("APT Taipei 2026")), /True ROI/);
  // restoring an OLD backup (made before trips existed) leaves the trip lists empty rather than failing
  const old = JSON.parse(JSON.stringify(backup)); delete old.data.trips; delete old.data.tripExpenses;
  const parsed = await page.evaluate((b) => PokerHQBackup.parse(b), old);
  assert.equal(parsed.ok, true);
  assert.deepEqual([parsed.data.trips, parsed.data.tripExpenses], [[], []]);
  ok("saved to the cloud, loaded on a new device, in the JSON backup; an older backup without trips restores fine");

  // 10. phone layout
  await page.setViewportSize({ width: 390, height: 844 });
  await treasury();
  const phone = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, cards: [...document.querySelectorAll(".trip-card")].map((c) => Math.round(c.getBoundingClientRect().right)) }));
  assert.ok(phone.overflow <= 0 && phone.cards.every((r) => r <= 390), JSON.stringify(phone));
  ok("phone: trip cards fit, no sideways scroll");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
