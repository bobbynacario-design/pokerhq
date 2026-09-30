"use strict";
// Event Poster Import: choose a photo, Claude (mocked here) reads it, you confirm each event, and only
// then does anything reach the calendar. The real picture handling runs (decode, shrink, JPEG); only the
// AI call is replaced, so we can also check exactly what would be sent.
const assert = require("assert").strict;
const { boot, freezeMotion } = require("./lib.js");

(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1280, height: 1000 } });
  const ok = (m) => console.log("ok  " + m);
  await freezeMotion(page);
  const settle = (ms = 150) => page.waitForTimeout(ms);
  const text = async (sel) => (await page.textContent(sel)).replace(/\s+/g, " ").trim();
  await page.evaluate(() => { window.tourneys.length = 0; window.trips.length = 0; window.bankroll = { amount: 100000, rule: 5 }; syncGlobalAliases(); });

  // dates relative to today, so the test never goes stale
  const dates = await page.evaluate(() => { const t = todayLocal(); const add = (n) => { const d = new Date(t + "T12:00:00"); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }; return { today: t, d10: add(10), d11: add(11), d12: add(12), d13: add(13), old: add(-60) }; });
  const fixture = {
    events: [
      { name: "Poster Main Event", date: dates.d10, endDate: "", time: "14:00", venue: "Okada Manila", buyin: 5500, currency: "PHP", gtd: "₱1,000,000", structure: "Regular", category: "main", notes: "Late reg 2 levels", uncertain: [] },
      { name: "Turbo Tuesday", date: dates.d11, endDate: "", time: "19:00", venue: "Okada Manila", buyin: 2200, currency: "PHP", gtd: "", structure: "Turbo", category: "side", notes: "", uncertain: ["time"] },
      { name: "APT High Roller", date: dates.d12, endDate: "", time: "", venue: "Okada Manila", buyin: 500, currency: "USD", gtd: "$50K", structure: "Regular", category: "side", notes: "", uncertain: [] },
      { name: "Mystery Event", date: "", endDate: "", time: "", venue: "Okada Manila", buyin: 3000, currency: "PHP", gtd: "", structure: "Regular", category: "side", notes: "", uncertain: ["date"] },
      { name: "Weekend Special", date: dates.d13, endDate: "", time: "12:00", venue: "Metro Card Club", buyin: 3300, currency: "PHP", gtd: "", structure: "Regular", category: "side", notes: "", uncertain: [] },
      { name: "Last Year's Finale", date: dates.old, endDate: "", time: "", venue: "Okada Manila", buyin: 1000, currency: "PHP", gtd: "", structure: "Regular", category: "side", notes: "", uncertain: [] },
      { name: "Main Event Satellite", date: dates.d10, endDate: "", time: "11:00", venue: "Okada Manila", buyin: 1100, currency: "PHP", gtd: "", structure: "Regular", category: "satellite", notes: "", uncertain: [] },
    ],
    posterNotes: "Ignored the cash game list.",
  };
  // one event is already on the calendar
  await page.evaluate((d) => { tourneys.push({ id: 424242, date: d, name: "Weekend Special", venue: "Metro Card Club", buyin: 3300, status: "target", type: "side" }); syncGlobalAliases(); }, dates.d13);

  // the AI call is replaced; everything before and after it is the real code
  await page.evaluate((fx) => {
    window.__sent = [];
    window.__aiMode = "ok";
    window.__aiFixture = fx;
    window.callAnthropicMessages = async (body) => {
      window.__sent.push(JSON.parse(JSON.stringify(body)));
      if (window.__aiMode === "hang") return new Promise(() => {});
      if (window.__aiMode === "401") return { ok: false, status: 401, json: async () => ({ error: { message: "bad key" } }) };
      if (window.__aiMode === "500") return { ok: false, status: 500, json: async () => ({ error: { message: "overloaded" } }) };
      if (window.__aiMode === "throw") throw new Error("network down");
      const out = window.__aiMode === "garbage" ? "I cannot read this image, sorry." : window.__aiMode === "empty" ? JSON.stringify({ events: [], posterNotes: "" }) : JSON.stringify(window.__aiFixture);
      return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: out }] }) };
    };
  }, fixture);
  // a big test photo made in the page (3000 x 2000), handed to the file box as a real file
  const photo = await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 3000; c.height = 2000;
    const g = c.getContext("2d"); g.fillStyle = "#123"; g.fillRect(0, 0, 3000, 2000); g.fillStyle = "#fc0"; g.font = "bold 200px sans-serif"; g.fillText("POKER SERIES", 200, 600);
    for (let i = 0; i < 4000; i++) { g.fillStyle = "hsl(" + (i * 7 % 360) + ",70%,50%)"; g.fillRect((i * 37) % 3000, (i * 91) % 2000, 20, 20); }   // noise, so the file is not tiny
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const bytes = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const photoBuffer = Buffer.from(photo, "base64");

  // 1. the button, the pop-up, and nothing to read until a photo is chosen
  await page.evaluate(() => switchGroup("plan", "calendar"));
  await settle();
  assert.equal(await page.isVisible("#cal-poster-btn"), true);
  await page.click("#cal-poster-btn");
  await page.waitForSelector("#modal-poster.open");
  assert.equal(await page.isDisabled("#poster-read-btn"), true);
  assert.match(await text("#poster-file-name"), /No photo chosen yet/);
  assert.match(await text("#poster-stage-pick"), /The photo is sent to Claude to be read. PokerHQ doesn't keep it./);
  ok("IMPORT POSTER opens the pop-up; READ POSTER stays off until a photo is chosen; it says the photo isn't kept");

  // 2. a file that is not a picture is refused
  await page.setInputFiles("#poster-file", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  assert.match(await text("#poster-error"), /not a picture/);
  assert.equal(await page.isDisabled("#poster-read-btn"), true);
  ok("a file that isn't a picture is refused");

  // 3. choose the photo: a preview appears
  await page.setInputFiles("#poster-file", { name: "poster.png", mimeType: "image/png", buffer: photoBuffer });
  await page.waitForFunction(() => document.getElementById("poster-preview").style.display !== "none");
  assert.equal(await page.isDisabled("#poster-read-btn"), false);
  assert.match(await text("#poster-file-name"), /poster\.png/);
  assert.equal(await page.isVisible("#poster-error"), false);
  ok("choosing a photo shows a preview and enables READ POSTER");

  // 4. reading: what is actually sent to Claude
  await page.fill("#poster-hint", "Okada Manila, October series");
  await page.click("#poster-read-btn");
  await page.waitForSelector("#poster-stage-confirm", { state: "visible" });
  const sent = await page.evaluate(() => window.__sent);
  assert.equal(sent.length, 1);
  const req = sent[0];
  assert.equal(req.model, "claude-sonnet-4-6");
  assert.equal(req.max_tokens, 6000);
  assert.equal(req.output_config.format.type, "json_schema");
  const [img, prompt] = req.messages[0].content;
  assert.equal(img.type, "image");
  assert.equal(img.source.type, "base64");
  assert.equal(img.source.media_type, "image/jpeg", "re-encoded as a JPEG");
  const dims = await page.evaluate((b64) => new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.src = "data:image/jpeg;base64," + b64; }), img.source.data);
  assert.ok(Math.max(...dims) <= 1568 && Math.max(...dims) >= 1500, "shrunk from 3000x2000 to " + dims.join("x"));
  assert.ok(Math.abs(dims[0] / dims[1] - 1.5) < 0.02, "proportions kept");
  const decodedBytes = Math.floor(img.source.data.length * 3 / 4);
  assert.ok(decodedBytes < 4 * 1024 * 1024 && decodedBytes > 5000, "a sensible size: " + decodedBytes);
  assert.equal(prompt.type, "text");
  assert.ok(prompt.text.includes("Today's date is " + dates.today));
  assert.ok(prompt.text.includes("Extra context from the player: Okada Manila, October series"));
  assert.match(prompt.text, /Answer with JSON matching the schema and nothing else/);
  ok("Claude gets one JPEG (3000x2000 shrunk to " + dims.join("x") + ", " + Math.round(decodedBytes / 1024) + " KB), today's date, the player's hint and a JSON-only instruction");

  // 5. the confirmation screen
  assert.equal(await page.locator(".poster-card").count(), 7);
  assert.match(await text("#poster-summary"), /Found 7 events\. 2 need a fix before they can be added, 1 already on your calendar, 2 to double-check\./);
  assert.match(await text("#poster-notes"), /Ignored the cash game list\./);
  const state = await page.$$eval(".poster-card", (cs) => cs.map((c) => ({ name: c.querySelector('[data-field="name"] input').value, on: c.querySelector(".poster-include input").checked, disabled: c.querySelector(".poster-include input").disabled, dup: c.classList.contains("dup"), blocked: c.classList.contains("blocked") })));
  const byName = Object.fromEntries(state.map((s) => [s.name, s]));
  assert.equal(byName["Poster Main Event"].on, true);
  assert.equal(byName["Turbo Tuesday"].on, true, "unsure of the time only: still ticked, with a warning");
  assert.deepEqual([byName["APT High Roller"].on, byName["APT High Roller"].disabled], [false, true], "USD with no rate is blocked");
  assert.deepEqual([byName["Mystery Event"].on, byName["Mystery Event"].disabled], [false, true], "no date is blocked");
  assert.deepEqual([byName["Weekend Special"].on, byName["Weekend Special"].dup], [false, true], "already on the calendar: not ticked");
  assert.equal(byName["Last Year's Finale"].on, true);
  assert.match(await text('.poster-card:has([data-field="name"] input[value="Weekend Special"]) .poster-badge'), /Already on your calendar: Weekend Special/);
  assert.match(await text('.poster-card:has([data-field="name"] input[value="Last Year\'s Finale"]) .poster-issues'), /more than a month ago/);
  assert.match(await text('.poster-card:has([data-field="name"] input[value="Turbo Tuesday"]) .poster-issues'), /wasn't sure of the start time/);
  assert.equal(await page.isDisabled("#poster-add-btn"), false);
  assert.match(await text("#poster-add-btn"), /ADD 4 TO CALENDAR/);
  ok("7 events: 4 ticked and ready, the USD one and the dateless one blocked, the duplicate unticked and badged, warnings shown");

  // 6. fix what is blocked: an exchange rate, a date
  const usd = page.locator('.poster-card:has([data-field="name"] input[value="APT High Roller"])');
  await usd.locator('[data-field="rate"] input').fill("58.4");
  assert.equal(await text('.poster-card:has([data-field="name"] input[value="APT High Roller"]) .poster-peso'), "= ₱29,200");
  assert.equal(await usd.locator(".poster-include input").isDisabled(), false, "a rate unblocks it");
  await usd.locator(".poster-include input").check();
  const mystery = page.locator('.poster-card:has([data-field="name"] input[value="Mystery Event"])');
  await mystery.locator('[data-field="date"] input').fill(dates.d12);
  assert.equal(await mystery.locator(".poster-include input").isDisabled(), false);
  await mystery.locator(".poster-include input").check();
  await mystery.locator('[data-field="name"] input').fill("Mystery Event (fixed)");
  assert.equal(await mystery.locator('[data-field="name"] input').evaluate((el) => document.activeElement === el), true, "typing in a card doesn't lose the cursor");
  assert.match(await text("#poster-add-btn"), /ADD 6 TO CALENDAR/);
  assert.match(await text("#poster-summary"), /Found 7 events\. 1 already on your calendar/);
  // a foreign amount changes its peso preview as you type, and going back to pesos drops the rate box
  await usd.locator('[data-field="buyin"] input').fill("600");
  assert.equal(await text('.poster-card:has([data-field="name"] input[value="APT High Roller"]) .poster-peso'), "= ₱35,040");
  await usd.locator("select").first().selectOption("PHP");
  assert.equal(await usd.locator('[data-field="rate"]').count(), 0);
  await usd.locator("select").first().selectOption("USD");
  assert.equal(await usd.locator('[data-field="rate"] input').inputValue(), "58.4", "the rate you typed is kept");
  await usd.locator('[data-field="buyin"] input').fill("500");
  ok("fixing the rate and the date unblocks them; typing keeps the cursor; the peso preview follows the amount and currency");

  // also tick the duplicate: the calendar's own duplicate check will still refuse it, and we say so
  await page.locator('.poster-card:has([data-field="name"] input[value="Weekend Special"]) .poster-include input').check();
  assert.match(await text("#poster-add-btn"), /ADD 7 TO CALENDAR/);

  // 7. add: exactly what was confirmed reaches the calendar, in the calendar's own shape
  const before = await page.evaluate(() => tourneys.length);
  await page.click("#poster-add-btn");
  await settle(200);
  assert.equal(await page.evaluate(() => document.getElementById("modal-poster").classList.contains("open")), false);
  const after = await page.evaluate(() => ({ n: tourneys.length, poster: tourneys.filter((t) => t.source === "Poster photo").map((t) => ({ name: t.name, date: t.date, time: t.time, venue: t.venue, buyin: t.buyin, gtd: t.gtd, structure: t.structure, type: t.type, category: t.category, sat: t.sat, notes: t.notes, status: t.status, day: t.day, month: t.month, url: t.url })) }));
  assert.equal(after.n - before, 6, "6 added; the duplicate was skipped");
  const P = Object.fromEntries(after.poster.map((t) => [t.name, t]));
  assert.deepEqual(P["Poster Main Event"], { name: "Poster Main Event", date: dates.d10, time: "14:00", venue: "Okada Manila", buyin: 5500, gtd: "₱1,000,000", structure: "Regular", type: "main", category: "main", sat: false, notes: "Late reg 2 levels", status: "target", day: String(Number(dates.d10.slice(8))), month: ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][Number(dates.d10.slice(5, 7)) - 1], url: "" });
  assert.equal(P["APT High Roller"].buyin, 29200, "USD 500 at 58.4, in pesos");
  assert.equal(P["APT High Roller"].notes, "Poster price: USD 500");
  assert.equal(P["Main Event Satellite"].sat, true);
  assert.equal(P["Main Event Satellite"].structure, "Satellite / Qualifier");
  assert.equal(P["Turbo Tuesday"].structure, "Turbo");
  assert.ok(P["Mystery Event (fixed)"], "the edited name and date were used");
  assert.equal(P["Mystery Event (fixed)"].date, dates.d12);
  assert.match(await text("#undo-toast-label"), /^Added 6 events from the poster \(1 already there\)/);
  const mo = await page.evaluate(() => [calYear, calMonth]);
  assert.deepEqual(mo, [Number(dates.d10.slice(0, 4)), Number(dates.d10.slice(5, 7)) - 1], "the calendar jumped to the month of the first upcoming new event (not last year's finale)");
  const cloud = await page.evaluate(() => { for (const [p, v] of globalThis.__cloud.docs) if (p.endsWith("/tourneys")) return JSON.parse(v.value).filter((t) => t.source === "Poster photo").length; return null; });
  assert.equal(cloud, 6, "saved to the cloud copy");
  ok("6 events added in the calendar's own shape (ISO date, start time, pesos, satellite tagged, USD price kept in the notes); the duplicate was skipped and said so");

  // 8. UNDO removes exactly those and nothing else
  await page.click("#undo-toast .toast-btn");
  await settle();
  assert.equal(await page.evaluate(() => tourneys.length), before);
  assert.equal(await page.evaluate(() => tourneys.some((t) => t.id === 424242)), true, "the event that was already there is untouched");
  ok("UNDO takes out the poster events and leaves the rest of the calendar alone");

  // 9. things that go wrong say so plainly and leave you where you were
  const tryRead = async (mode) => {
    await page.evaluate((m) => { window.__aiMode = m; }, mode);
    await page.click("#cal-poster-btn");
    await page.setInputFiles("#poster-file", { name: "poster.png", mimeType: "image/png", buffer: photoBuffer });
    await page.waitForFunction(() => !document.getElementById("poster-read-btn").disabled);
    await page.click("#poster-read-btn");
    await page.waitForSelector("#poster-stage-pick", { state: "visible" });
    const err = await text("#poster-error");
    await page.evaluate(() => closePosterImport());
    return err;
  };
  assert.match(await tryRead("401"), /Claude rejected the API key \(401\)/);
  assert.match(await tryRead("500"), /Claude could not read the poster: overloaded/);
  assert.match(await tryRead("garbage"), /No tournaments were found on that poster/);
  assert.match(await tryRead("empty"), /No tournaments were found on that poster/);
  assert.match(await tryRead("throw"), /network down/);
  assert.equal(await page.evaluate(() => tourneys.length), before, "nothing was added by any of them");
  ok("a rejected key, a server error, an unreadable answer, no events and a network failure each show a clear message and add nothing");

  // an image the browser cannot decode
  await page.evaluate(() => { window.__aiMode = "ok"; });
  await page.click("#cal-poster-btn");
  await page.setInputFiles("#poster-file", { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("this is not an image") });
  await page.waitForFunction(() => !document.getElementById("poster-read-btn").disabled);
  await page.click("#poster-read-btn");
  await page.waitForSelector("#poster-stage-pick", { state: "visible" });
  assert.match(await text("#poster-error"), /Could not open that picture/);
  assert.equal(await page.evaluate(() => window.__sent.length), 1 + 5, "nothing was sent for a picture that could not be opened");
  await page.evaluate(() => closePosterImport());
  ok("a picture that can't be opened is reported and nothing is sent");

  // 10. cancel while it is reading: a late answer is ignored
  await page.evaluate(() => { window.__aiMode = "ok"; const real = window.callAnthropicMessages; window.__release = null; window.callAnthropicMessages = (b) => new Promise((resolve) => { window.__release = () => resolve(real(b)); }); });
  await page.click("#cal-poster-btn");
  await page.setInputFiles("#poster-file", { name: "poster.png", mimeType: "image/png", buffer: photoBuffer });
  await page.waitForFunction(() => !document.getElementById("poster-read-btn").disabled);
  await page.click("#poster-read-btn");
  await page.waitForSelector("#poster-stage-reading", { state: "visible" });
  await page.waitForFunction(() => typeof window.__release === "function");
  await page.click("#poster-stage-reading >> text=CANCEL");
  await page.evaluate(() => window.__release());
  await settle(300);
  assert.equal(await page.evaluate(() => document.getElementById("modal-poster").classList.contains("open")), false, "still closed after the late answer");
  assert.equal(await page.evaluate(() => tourneys.length), before);
  ok("cancelling while Claude is reading closes it, and the late answer is ignored");

  // 11. no Claude access: says how to get it, READ stays off
  await page.evaluate(() => { window.__savedUid = window.__pokerhqAuthUid; window.__pokerhqAuthUid = ""; });
  await page.click("#cal-poster-btn");
  assert.match(await text("#poster-error"), /needs Claude\. Add your Anthropic API key in AI Assistant/);
  await page.setInputFiles("#poster-file", { name: "poster.png", mimeType: "image/png", buffer: photoBuffer });
  assert.equal(await page.isDisabled("#poster-read-btn"), true);
  await page.evaluate(() => { closePosterImport(); window.__pokerhqAuthUid = window.__savedUid; });
  ok("without Claude access it says how to set it up and READ POSTER stays off");

  // 12. Privacy Mode: the confirm screen shows no readable amounts
  await page.evaluate(() => { window.__aiMode = "ok"; window.callAnthropicMessages = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: JSON.stringify(window.__aiFixture) }] }) }); PokerHQPrivacy.setManual(true); });
  await page.click("#cal-poster-btn");
  await page.setInputFiles("#poster-file", { name: "poster.png", mimeType: "image/png", buffer: photoBuffer });
  await page.waitForFunction(() => !document.getElementById("poster-read-btn").disabled);
  await page.click("#poster-read-btn");
  await page.waitForSelector("#poster-stage-confirm", { state: "visible" });
  await page.locator('.poster-card:has([data-field="name"] input[value="APT High Roller"]) [data-field="rate"] input').fill("58.4");
  const leaks = await page.evaluate(() => {
    const found = [];
    const w = document.createTreeWalker(document.getElementById("modal-poster"), NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (PokerHQPrivacy.hasMoney(n.nodeValue)) found.push(n.nodeValue.trim());
    document.querySelectorAll("#modal-poster [data-money]").forEach((el) => { if (el.value && getComputedStyle(el).webkitTextFillColor !== "rgba(0, 0, 0, 0)") found.push("box readable: " + el.value); });
    return found;
  });
  assert.deepEqual(leaks, [], "amounts readable on the confirm screen with Privacy Mode on");
  await page.evaluate(() => { PokerHQPrivacy.setManual(false); closePosterImport(); });
  ok("with Privacy Mode on, the confirm screen's buy-in boxes are blurred and the peso preview is masked");

  // 13. phone layout
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click("#cal-poster-btn");
  await page.setInputFiles("#poster-file", { name: "poster.png", mimeType: "image/png", buffer: photoBuffer });
  await page.waitForFunction(() => !document.getElementById("poster-read-btn").disabled);
  await page.click("#poster-read-btn");
  await page.waitForSelector("#poster-stage-confirm", { state: "visible" });
  const phone = await page.evaluate(() => { const modal = document.querySelector("#modal-poster .modal"); const r = modal.getBoundingClientRect(); return { overflow: document.documentElement.scrollWidth - innerWidth, modalRight: Math.round(r.right), inner: modal.scrollWidth - modal.clientWidth, cards: [...document.querySelectorAll(".poster-card")].map((c) => Math.round(c.getBoundingClientRect().right)) }; });
  assert.ok(phone.overflow <= 0 && phone.modalRight <= 390 && phone.inner <= 0 && phone.cards.every((r) => r <= 390), JSON.stringify(phone));
  await page.evaluate(() => closePosterImport());
  ok("phone: the pop-up and its cards fit, no sideways scroll");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
