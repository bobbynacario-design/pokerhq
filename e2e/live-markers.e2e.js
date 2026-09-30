"use strict";
// One-tap live hand markers, the way they are used at the table: six big buttons on the active
// session, the time and stack stamped on each tap, finish later from Hand History, tags that
// filter and double as leak tags, and the markers end up on the finished session.
const assert = require("assert").strict;
const { boot, freezeMotion } = require("./lib.js");

(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1280, height: 1000 } });
  const ok = (m) => console.log("ok  " + m);
  await freezeMotion(page);
  const closeModals = () => page.evaluate(() => document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open")));
  const play = (sel) => "#play-active-session-wrap " + sel;
  const markers = () => page.evaluate(() => hands.filter((h) => h.marker).map((h) => ({ id: h.id, title: h.title, tags: h.tags, needs: h.needsDetails, marker: h.marker, key: h.pendingSessionKey, sessionId: h.sessionId, result: h.result })));
  await page.evaluate(() => { window.sessions.length = 0; window.hands.length = 0; window.bankroll.amount = 30000; switchGroup("play", "sessions"); });

  // 0. no session running: no buttons to tap by accident
  assert.equal(await page.locator(".live-markers").count(), 0);
  ok("with no session running there are no marker buttons");

  // 1. start a session (timer on) and find the six buttons in order
  await page.fill("#s-name", "Marker night");
  await page.fill("#s-venue", "Okada Manila");
  await page.fill("#s-buyin", "3000");
  await page.evaluate(() => switchGroup("home"));
  await page.click("#timer-start-btn");
  await page.getByRole("button", { name: "SKIP", exact: true }).click();
  await page.evaluate(() => switchGroup("play", "sessions"));
  await page.waitForSelector(play(".live-markers"));
  const labels = await page.$$eval(play(".lm-btn .lm-label"), (els) => els.map((e) => e.textContent));
  assert.deepEqual(labels, ["Big pot", "ICM spot", "Opponent read", "Uncertain decision", "Tilt", "Review later"]);
  const sizes = await page.$$eval(play(".lm-btn"), (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  sizes.forEach(([w, h]) => assert.ok(w >= 100 && h >= 60, "a big tap target, got " + w + "x" + h));
  ok("six big buttons in order: " + labels.join(" · ") + " (each " + sizes[0].join("x") + "px)");

  // 2. the optional stack and level: typing keeps focus (the card must not redraw under the keyboard)
  await page.click(play('[data-lm="stack"]'));
  await page.keyboard.type("24");
  await page.click(play('[data-lm="level"]'));
  await page.keyboard.type("L12 800/1600");
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-lm")), "level", "still typing in the level box");
  assert.equal(await page.evaluate(() => _activeSessionDraft.liveStack + "|" + _activeSessionDraft.liveLevel), "24|L12 800/1600");
  // the other copy of the card (Home) shows the same text
  await page.evaluate(() => switchGroup("home"));
  assert.equal(await page.inputValue("#dashboard-active-session-wrap " + '[data-lm="stack"]'), "24");
  await page.evaluate(() => switchGroup("play", "sessions"));
  ok("stack and level are typed without the card redrawing, saved with the session, and shown on Home too");

  // 3. one tap: the record, with time in, stack and level; a toast; held against the running session
  await page.waitForTimeout(2100);
  await page.click(play('.lm-btn[data-kind="bigpot"]'));
  let ms = await markers();
  assert.equal(ms.length, 1);
  const m1 = ms[0];
  assert.equal(m1.title, "Big pot");
  assert.deepEqual(m1.tags, ["bigpot"]);
  assert.equal(m1.needs, true);
  assert.equal(m1.marker.stack, "24bb");
  assert.equal(m1.marker.level, "L12 800/1600");
  assert.ok(m1.marker.elapsedMs >= 2000 && m1.marker.elapsedMs < 20000, "elapsed session time: " + m1.marker.elapsedMs);
  assert.equal(m1.sessionId, 0);
  assert.equal(m1.key, await page.evaluate(() => _activeSessionDraft.key), "held against the running session");
  assert.equal(m1.result, "");
  const toast = await page.textContent("#undo-toast-label");
  assert.match(toast, /^Marked: Big pot · 0:0\d in · 24bb · L12/);
  assert.equal(await page.locator("#undo-toast.show").count(), 1);
  ok("one tap = a Big pot marker: " + JSON.stringify(m1.marker) + ", toast \"" + toast + "\"");

  // 4. a slip of the thumb (same button twice, fast) counts once; a different button is another hand
  await page.click(play('.lm-btn[data-kind="tilt"]'));
  await page.click(play('.lm-btn[data-kind="tilt"]'));
  assert.equal((await markers()).length, 2, "the double tap on Tilt made one marker");
  await page.waitForTimeout(1600);
  await page.click(play('.lm-btn[data-kind="tilt"]'));
  assert.equal((await markers()).length, 3, "the same button after a pause is a new marker");
  for (const kind of ["icm", "read", "unsure", "later"]) await page.click(play('.lm-btn[data-kind="' + kind + '"]'));
  ms = await markers();
  assert.equal(ms.length, 7);
  assert.deepEqual([...new Set(ms.map((x) => x.marker.kind))].sort(), ["bigpot", "icm", "later", "read", "tilt", "unsure"]);
  assert.equal(new Set(ms.map((x) => x.id)).size, 7, "no two markers share an id");
  ok("double tap = one marker; a pause makes a second; all six kinds recorded, 7 markers, unique ids");

  // 5. undo takes the last one back
  await page.click("#undo-toast button, #undo-toast .undo-btn, #undo-toast [onclick*='undoLastDelete']");
  await page.waitForFunction(() => hands.filter((h) => h.marker).length === 6);
  assert.equal((await markers()).some((x) => x.marker.kind === "later"), false);
  ok("UNDO on the toast removes the marker just made");

  // 6. the card lists the last few markers with a way to finish them
  const recent = await page.$$eval(play(".lm-recent-row"), (rows) => rows.map((r) => r.textContent.replace(/\s+/g, " ").trim()));
  assert.equal(recent.length, 3);
  assert.match(recent[0], /Uncertain decision · \d+:\d\d in · 24bb · L12/);
  assert.ok(recent.every((t) => /FINISH/.test(t)));
  ok("the card lists the last 3 markers, newest first, each with FINISH");

  // 7. Hand History: chips, the "needs details" flag, the filter bar
  await page.evaluate(() => { switchGroup("review", "hands"); renderHands(); });
  await page.waitForSelector(".hand-card.unfinished");
  assert.equal(await page.locator(".hand-card").count(), 6);
  assert.equal(await page.locator(".hand-card.unfinished").count(), 6);
  const bar = await page.$$eval("#hand-tag-bar .lm-filter", (bs) => bs.map((b) => b.textContent.replace(/\s+/g, " ").trim()));
  assert.deepEqual(bar, ["All 6", "Needs details 6", "💰 Big pot 1", "⚖️ ICM spot 1", "👁 Opponent read 1", "🤔 Uncertain decision 1", "🔥 Tilt 2"]);
  const firstCard = (await page.textContent(".hand-card")).replace(/\s+/g, " ");
  assert.match(firstCard, /needs details/);
  assert.match(firstCard, /FINISH/);
  assert.match(firstCard, /NOT SURE YET/);
  await page.click('#hand-tag-bar .lm-filter:has-text("Tilt")');
  assert.equal(await page.locator(".hand-card").count(), 2);
  assert.match(await page.textContent("#hand-count"), /^2 hands/);
  await page.click('#hand-tag-bar .lm-filter:has-text("Tilt")');     // click again: back to all
  assert.equal(await page.locator(".hand-card").count(), 6);
  ok("Hand History: tag chips, 'needs details', NOT SURE YET, counts per tag; clicking a tag filters and clicking again clears");

  // 8. finish later: FINISH opens the hand with the marker note, tags and title; saving finishes it
  await page.click('#hand-tag-bar .lm-filter:has-text("Big pot")');
  await page.click(".hand-card .sec-action.primary");
  await page.waitForSelector("#modal-hand.open");
  assert.match(await page.textContent("#h-marker-note"), /Marked: Big pot · \d+:\d\d in · 24bb · L12 800\/1600\. Add what happened/);
  assert.equal(await page.inputValue("#h-title"), "Big pot");
  assert.equal(await page.inputValue("#h-result"), "");
  assert.deepEqual(await page.$$eval("#h-tags .lm-chip.on", (c) => c.map((x) => x.textContent.trim())), ["💰 Big pot"]);
  await page.fill("#h-title", "AA vs KK, all-in preflop");
  await page.fill("#h-desc", "Shoved 24bb over a min-raise, got called.");
  await page.selectOption("#h-result", "won");
  await page.click('#h-tags .lm-chip:has-text("Uncertain")');       // an extra tag while finishing
  await page.locator("#modal-hand").getByRole("button", { name: /^SAVE HAND/ }).click();
  await page.waitForFunction(() => hands.filter((h) => h.marker && h.needsDetails === false).length === 1);
  const done = (await markers()).find((x) => x.marker.kind === "bigpot");
  assert.equal(done.needs, false);
  assert.deepEqual(done.tags, ["bigpot", "unsure"]);
  assert.equal(done.title, "AA vs KK, all-in preflop");
  assert.equal(done.result, "won");
  assert.equal(done.marker.stack, "24bb", "time and stack survive finishing");
  await page.click('#hand-tag-bar .lm-filter:has-text("Big pot")');    // clear the filter
  const barAfter = await page.$$eval("#hand-tag-bar .lm-filter", (bs) => bs.map((b) => b.textContent.replace(/\s+/g, " ").trim()));
  assert.ok(barAfter.includes("Needs details 5"), "one fewer needs details: " + barAfter);
  assert.ok(barAfter.some((t) => /Uncertain decision 2/.test(t)), "the extra tag is counted: " + barAfter);
  assert.equal(await page.locator(".hand-card.unfinished").count(), 5);
  ok("FINISH: the form opens with the marker note and tags; saving clears 'needs details' and keeps the time, stack and both tags");

  // 9. an ordinary hand can carry tags too, and 'unfinished' only ever means markers
  await page.evaluate(() => openNewHandModal());
  assert.equal(await page.locator("#h-tags .lm-chip.on").count(), 0);
  assert.equal(await page.isVisible("#h-marker-note"), false);
  await page.fill("#h-title", "Tilted call");
  await page.click('#h-tags .lm-chip:has-text("Tilt")');
  await page.locator("#modal-hand").getByRole("button", { name: /^SAVE HAND/ }).click();
  await page.waitForFunction(() => hands.some((h) => h.title === "Tilted call"));
  const plain = await page.evaluate(() => hands.find((h) => h.title === "Tilted call"));
  assert.deepEqual(plain.tags, ["tilt"]);
  assert.ok(!plain.needsDetails && !plain.marker);
  ok("a hand logged by hand can be tagged too (tags are the leak tags); it is never 'needs details'");

  // 10. log the session: the markers attach to it, the detail lists them with their tags and times
  await page.evaluate(() => switchGroup("play", "sessions"));
  await page.fill("#s-position", "30");
  await page.fill("#s-prize", "0");
  await page.click("#session-submit-btn");
  await page.waitForFunction(() => sessions.length === 1);
  await page.waitForTimeout(300);
  const sid = await page.evaluate(() => sessions[0].id);
  assert.equal(await page.evaluate((id) => hands.filter((h) => h.marker && h.sessionId === id && !h.pendingSessionKey).length, sid), 6);
  const detail = (await page.textContent("#sd-body")).replace(/\s+/g, " ");
  assert.match(detail, /Logged Hands \(6\)/, "the 6 markers; the hand logged by hand in step 9 was not linked to this session");
  assert.match(detail, /💰 Big pot/);
  assert.match(detail, /⏱ Big pot · \d+:\d\d in · 24bb/);
  assert.match(detail, /needs details/);
  await closeModals();
  ok("logging the session attaches all markers to it; the session detail shows their tags, times and 'needs details'");

  // 11. no timer running: still one tap, stamped with the clock time instead
  await page.evaluate(() => { hands.length = 0; ensureActiveSessionDraft({ date: todayLocal(), name: "No timer" }); switchGroup("play", "sessions"); });
  await page.click(play('.lm-btn[data-kind="read"]'));
  const noTimer = (await markers())[0];
  assert.ok(!("elapsedMs" in noTimer.marker), "no session clock to read");
  assert.match(await page.textContent("#undo-toast-label"), /^Marked: Opponent read · \d{1,2}:\d\d/);
  ok("without a timer a marker still records, and shows the clock time instead of time-in");

  // 12. survives a backup and restore
  const backup = await page.evaluate(() => getBackupSnapshot());
  assert.equal(backup.data.hands[0].marker.kind, "read");
  const restored = await page.evaluate((b) => PokerHQBackup.parse(JSON.parse(JSON.stringify(b))), backup);
  assert.equal(restored.ok, true);
  assert.deepEqual(restored.data.hands[0], backup.data.hands[0]);
  ok("markers are in the JSON backup and come back unchanged");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");

  // 13. on a phone: two columns, big buttons, nothing runs off the side
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { switchGroup("play", "sessions"); renderActiveSessionSurface(); });
  await page.waitForSelector(play(".live-markers"));
  const phone = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("#play-active-session-wrap .lm-btn")].map((b) => b.getBoundingClientRect());
    const cols = new Set(btns.map((r) => Math.round(r.left))).size;
    return { cols, minH: Math.min(...btns.map((r) => r.height)), minW: Math.min(...btns.map((r) => r.width)), overflow: document.documentElement.scrollWidth - innerWidth, right: Math.max(...btns.map((r) => r.right)) };
  });
  assert.equal(phone.cols, 2, "two columns on a phone");
  assert.ok(phone.minH >= 60 && phone.minW >= 100, "big enough to hit with a thumb: " + phone.minW + "x" + phone.minH);
  assert.ok(phone.overflow <= 0 && phone.right <= 390, "nothing runs off the side");
  ok("phone: 2 columns of big buttons (" + Math.round(phone.minW) + "x" + Math.round(phone.minH) + "px), no sideways scroll");

  await close();
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
