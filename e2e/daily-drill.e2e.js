const assert = require("assert").strict;
const { boot, out } = require("./lib.js");
const S = require("./lib.js").OUT;
(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1400, height: 1000 } });
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
  const ok = (m) => console.log("ok  " + m);
  const text = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.trim().replace(/\s+/g, " ") : null; }, sel);
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("pokerhq_drill_v1") || "{}"));
  const title = () => text("#tg-drill .tg-drill-title");
  const today = await page.evaluate(() => todayLocal());

  await page.evaluate(() => {
    localStorage.removeItem("pokerhq_drill_v1");
    window.bankroll.amount = 40000; window.bankroll.rule = 10;
    window.sessions.length = 0; window.hands.length = 0; window.tourneys.length = 0;
    syncGlobalAliases(); switchGroup("home"); refreshDashboard();
  });

  // 1. it sits in the Go widget's left column, under the verdict
  assert.ok(await page.isVisible("#tg-drill"));
  const place = await page.evaluate(() => { const d = document.getElementById("tg-drill"); return { inVerdict: !!d.closest(".tg-verdict"), after: d.previousElementSibling && d.previousElementSibling.className }; });
  assert.ok(place.inVerdict && /tg-verdict-head/.test(place.after));
  assert.match(await text("#tg-drill .tg-drill-kicker"), /^Today's drill · [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} · /);
  assert.ok((await title()).length > 8);
  assert.match(await text("#tg-drill .tg-drill-why"), /^(From today's rotation|Because|You asked)/);
  assert.equal(await page.locator("#tg-drill .tg-dots .tg-dot").count(), 7);
  ok("shows in the Go widget under the verdict: date, theme, title, why, 7 week dots");

  // 2. light / deep
  const lightStep = await text("#tg-drill .tg-drill-step");
  await page.click("#tg-drill .tg-chip:has-text('GO DEEPER')");
  const deepStep = await text("#tg-drill .tg-drill-step");
  assert.notEqual(lightStep, deepStep);
  assert.equal((await state()).level, "deep");
  assert.equal(await page.getAttribute("#tg-drill .tg-chip:has-text('GO DEEPER')", "aria-pressed"), "true");
  await page.click("#tg-drill .tg-chip:has-text('KEEP IT LIGHT')");
  assert.equal(await text("#tg-drill .tg-drill-step"), lightStep);
  ok("light / deep switch the step text and are remembered");

  // 3. clicking in the drill never triggers the verdict's jump-to-calendar
  await page.evaluate(() => {
    window.tourneys.push({ id: 801, date: todayLocal(), name: "Test Event", venue: "Okada", buyin: 2000, status: "target", planning: true });
    syncGlobalAliases(); refreshDashboard();
  });
  assert.match(await text(".tg-verdict-label"), /GO/);
  assert.ok(await page.evaluate(() => document.querySelector(".tg-verdict-head").classList.contains("tg-tappable")));
  await page.click("#tg-drill .tg-chip:has-text('GO DEEPER')");
  await page.click("#tg-drill .tg-chip:has-text('KEEP IT LIGHT')");
  assert.ok(await page.evaluate(() => document.getElementById("page-dashboard").classList.contains("active")), "still on HOME");
  await page.click(".tg-verdict-head");
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(() => document.getElementById("page-calendar").classList.contains("active")), "the verdict itself still jumps to the event");
  ok("the drill is inside the verdict column but its buttons don't trigger the verdict's tap");
  await page.evaluate(() => { switchGroup("home"); refreshDashboard(); });

  // 4. context: a pinned event today -> pre-game drills; the pure helper sees it
  const ctx1 = await page.evaluate(() => JSON.stringify(drillContext()));
  assert.equal(JSON.parse(ctx1).eventSoon, true);
  assert.equal(JSON.parse(ctx1).noHands, true);
  await page.evaluate((t) => {
    window.sessions.push({ id: 1, date: t, name: "x", total: 4000, prize: 0, pnl: -4000, result: "bust" });
    window.sessions.push({ id: 2, date: "2026-01-02", name: "y", total: 4000, prize: 0, pnl: -4000, result: "bust" });
    window.sessions.push({ id: 3, date: "2026-01-03", name: "y", total: 4000, prize: 0, pnl: -4000, result: "bust" });
    window.bankroll.amount = 20000;
  }, today);
  const ctx2 = JSON.parse(await page.evaluate(() => JSON.stringify(drillContext())));
  assert.equal(ctx2.recentLoss, true, "a losing session today");
  assert.equal(ctx2.lowShots, true, "20,000 / 4,000 avg buy-in = 5 shots");
  await page.evaluate(() => { window.bankroll.amount = 90000; });
  assert.equal(JSON.parse(await page.evaluate(() => JSON.stringify(drillContext()))).lowShots, false);
  await page.evaluate(() => { window.tourneys[0].planning = false; });
  assert.equal(JSON.parse(await page.evaluate(() => JSON.stringify(drillContext()))).eventSoon, false, "unpinned events don't count");
  await page.evaluate(() => { window.sessions.length = 0; window.tourneys.length = 0; syncGlobalAliases(); refreshDashboard(); });
  ok("context: pinned event today, a rough session, thin bankroll and no hands are all noticed (unpinned events aren't)");

  // 5. I did it -> done state, dot, persisted, and survives a full card re-render
  const t1 = await title();
  await page.click("#tg-drill button:has-text('I DID IT')");
  assert.match(await text("#tg-drill .tg-drill-done"), /Done for today/);
  assert.equal(await page.locator("#tg-drill .tg-dots .tg-dot.done").count(), 1);
  assert.ok(await page.evaluate(() => document.querySelector("#tg-drill .tg-dots .tg-dot.done").classList.contains("today")));
  assert.equal((await state()).log[today].id !== undefined, true);
  assert.match(await text("#tg-drill .tg-drill-week-msg"), /1 drill this week/);
  await page.evaluate(() => renderTodayGlance());
  assert.equal(await title(), t1, "same drill after the card re-renders");
  assert.match(await text("#tg-drill .tg-drill-done"), /Done for today/);
  ok("I did it: done state, today's dot fills, saved, and it survives a re-render");

  // 6. undo, and "another one anyway"
  await page.click("#tg-drill button:has-text('UNDO')");
  assert.equal(await page.locator("#tg-drill .tg-dots .tg-dot.done").count(), 0);
  await page.click("#tg-drill button:has-text('I DID IT')");
  await page.click("#tg-drill button:has-text('ANOTHER ONE ANYWAY')");
  assert.notEqual(await title(), t1);
  assert.ok(await page.isVisible("#tg-drill button:has-text('I DID IT')"), "a fresh drill can be done too");
  assert.equal(await page.locator("#tg-drill .tg-dots .tg-dot.done").count(), 1, "the day still counts");
  ok("undo works; 'another one anyway' offers a new drill while the day stays done");

  // 6b. the 10-minute version counts for more: gold diamond dot, its own message, and it sticks
  assert.equal(await page.locator("#tg-drill .tg-dots .tg-dot.deep").count(), 0, "no deep day yet");
  await page.click("#tg-drill .tg-chip:has-text('GO DEEPER')");
  assert.match(await text("#tg-drill .tg-drill-deephint"), /earns a gold diamond/);
  await page.click("#tg-drill button:has-text('I DID IT')");
  assert.equal(await page.locator("#tg-drill .tg-dots .tg-dot.deep").count(), 1);
  assert.ok(await page.evaluate(() => document.querySelector("#tg-drill .tg-dots .tg-dot.deep").classList.contains("today")));
  assert.match(await text("#tg-drill .tg-drill-done"), /Deep drill done/);
  assert.match(await text("#tg-drill .tg-drill-week-msg"), /1 deep/);
  assert.match(await page.getAttribute("#tg-drill .tg-dots .tg-dot.deep", "title"), /done, deep \(10 min\)/);
  assert.equal(await page.locator("#tg-drill .tg-drill-deephint").count(), 0, "the hint goes away once it's done");
  assert.equal((await state()).log[today].deep, true);
  // a quick one afterwards doesn't take the diamond away
  await page.click("#tg-drill button:has-text('ANOTHER ONE ANYWAY')");
  await page.click("#tg-drill .tg-chip:has-text('KEEP IT LIGHT')");
  await page.click("#tg-drill button:has-text('I DID IT')");
  assert.equal(await page.locator("#tg-drill .tg-dots .tg-dot.deep").count(), 1);
  assert.match(await text("#tg-drill .tg-drill-done"), /Deep drill done/, "still a deep day");
  assert.ok(await page.isVisible("#tg-drill .tg-legend"), "legend explains the dots");
  ok("deep drills: gold diamond dot, own message and hint, counted in the week line, kept when a quick one follows");
  await page.click("#tg-drill button:has-text('ANOTHER ONE ANYWAY')");

  // 7. try another walks through different drills
  const seen = new Set();
  for (let i = 0; i < 6; i++) { seen.add(await title()); await page.click("#tg-drill button:has-text('TRY ANOTHER')"); }
  assert.ok(seen.size >= 6, "6 different drills, got " + seen.size);
  ok("try another shows a different drill each time");

  // 8. save + revisit
  const saveTitle = await title();
  await page.click("#tg-drill button:has-text('☆ SAVE')");
  assert.equal((await state()).saved.length, 1);
  assert.ok(await page.isVisible("#tg-drill button:has-text('★ SAVED')"));
  await page.click("#tg-drill button:has-text('TRY ANOTHER')");
  assert.notEqual(await title(), saveTitle);
  await page.click("#tg-drill button:has-text('SAVED · 1')");
  assert.equal(await title(), saveTitle);
  assert.match(await text("#tg-drill .tg-drill-why"), /saved drills/);
  await page.click("#tg-drill button:has-text('BACK TO TODAY')");
  assert.notEqual(await title(), saveTitle);
  ok("save / saved list / back to today's pick");

  // 9. helpful / more / not today
  const nt = await title();
  await page.click("#tg-drill .tg-chip:has-text('NOT TODAY')");
  assert.notEqual(await title(), nt, "moves on");
  assert.ok((await state()).hidden[(await state()).hidden && Object.keys((await state()).hidden)[0]]);
  assert.match(await text("#tg-drill .tg-drill-fb span"), /Skipping that one/);
  await page.click("#tg-drill .tg-chip:has-text('MORE LIKE THIS')");
  assert.match(await text("#tg-drill .tg-drill-fb span"), /More like this/);
  assert.ok(Object.values((await state()).bias).some((v) => v >= 1.5));
  ok("feedback: 'not today' hides and moves on; 'more like this' biases the theme; each acknowledged");

  // 10. mood
  await page.selectOption("#tg-drill .tg-drill-select", "steady");
  assert.equal((await state()).mood, "steady");
  assert.match(await text("#tg-drill .tg-drill-kicker"), /Mental game$/);
  assert.match(await text("#tg-drill .tg-drill-why"), /You asked for: steady my head/);
  await page.selectOption("#tg-drill .tg-drill-select", "protect");
  assert.match(await text("#tg-drill .tg-drill-kicker"), /Bankroll$/);
  await page.selectOption("#tg-drill .tg-drill-select", "surprise");
  ok("'What do you need today?' narrows the theme");

  // 11. a drill's button opens the right tool
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("pokerhq_drill_v1")); s.saved = ["pre-pushfold", "icm-bubble", "post-odds", "live-table"]; window.drillState = s; localStorage.setItem("pokerhq_drill_v1", JSON.stringify(s)); renderTodayGlance(); });
  const goCases = { "pre-pushfold": ["OPEN ADVISOR", () => document.getElementById("calc-panel-icm").classList.contains("active") && document.getElementById("page-calculator").classList.contains("active")],
    "icm-bubble": ["OPEN ICM CALCULATOR", () => document.getElementById("calc-panel-icmcalc").classList.contains("active")],
    "post-odds": ["OPEN HANDS", () => document.getElementById("page-hands").classList.contains("active")],
    "live-table": ["OPEN OPPONENTS", () => document.getElementById("page-opponents").classList.contains("active")] };
  for (const [id, [label, check]] of Object.entries(goCases)) {
    await page.evaluate(() => { switchGroup("home"); renderTodayGlance(); });
    assert.ok(await page.locator("#tg-drill button:has-text('BACK TO TODAY')").count() || await page.locator("#tg-drill button:has-text('SAVED · 4')").count(), "returning from a tool keeps the card where you left it");
    await page.evaluate(() => drillBack());
    await page.click("#tg-drill button:has-text('SAVED · 4')");
    for (let i = 0; i < 4 && !(await page.locator("#tg-drill button:has-text('" + label + "')").count()); i++) await page.click("#tg-drill button:has-text('NEXT SAVED')");
    await page.click("#tg-drill button:has-text('" + label + "')");
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(check), id + " -> " + label);
  }
  await page.evaluate(() => { switchGroup("home"); renderTodayGlance(); });
  ok("drill buttons open the Advisor, ICM Calculator, Hands and Opponents pages");

  // 12. tuck away / show
  await page.click("#tg-drill button:has-text('TUCK AWAY')");
  assert.equal((await state()).tucked, today);
  assert.ok(!(await page.isVisible("#tg-drill .tg-drill-title")));
  assert.match(await text("#tg-drill"), /tucked away/);
  await page.evaluate(() => renderTodayGlance());
  assert.match(await text("#tg-drill"), /tucked away/, "stays tucked through re-renders");
  await page.click("#tg-drill button:has-text('SHOW')");
  assert.ok(await page.isVisible("#tg-drill .tg-drill-title"));
  ok("tuck away / show (for the day)");

  // 13. keys: N / D / T on HOME; ignored while typing or in another page
  const before = await title();
  await page.keyboard.press("n");
  assert.notEqual(await title(), before);
  await page.keyboard.press("d");
  assert.match(await text("#tg-drill .tg-drill-done"), /[Dd]one/);
  await page.keyboard.press("t");
  assert.match(await text("#tg-drill"), /tucked away/);
  await page.keyboard.press("t");
  await page.evaluate(() => { const i = document.createElement("input"); i.id = "tmp-in"; document.body.appendChild(i); i.focus(); });
  const t2 = await title();
  await page.keyboard.type("nnd");
  assert.equal(await title(), t2, "typing in a field doesn't fire the shortcuts");
  await page.evaluate(() => { document.getElementById("tmp-in").remove(); switchGroup("play", "sessions"); });
  await page.keyboard.press("n");
  assert.equal((await state()).skips[today] >= 1, true);
  const skipsNow = (await state()).skips[today];
  await page.keyboard.press("n");
  assert.equal((await state()).skips[today], skipsNow, "no effect away from HOME");
  await page.evaluate(() => { switchGroup("home"); });
  ok("N / D / T work on HOME only, never while typing");

  // 14. layout: fills the column, no overflow, phone ok
  await page.evaluate((t) => { const D = PokerHQDrills; let st = D.normalizeState({}); st = D.markDone(st, D.addDays(t, -1), "rev-hand", "light"); st = D.markDone(st, D.addDays(t, -8), "pre-open", "deep"); st = D.markDone(st, t, "men-tilt", "deep"); localStorage.setItem("pokerhq_drill_v1", JSON.stringify(st)); }, today);
  await page.evaluate(() => { window.tourneys.push({ id: 802, date: todayLocal(), name: "Tuesday 75K GTD", venue: "Okada", buyin: 1100, status: "target" }); syncGlobalAliases(); switchGroup("home"); refreshDashboard(); });
  const box = await page.evaluate(() => { const c = document.querySelector(".tg-card").getBoundingClientRect(), v = document.querySelector(".tg-verdict").getBoundingClientRect(), d = document.getElementById("tg-drill").getBoundingClientRect(); return { cardH: c.height, verdictW: v.width, drillW: d.width, drillH: d.height, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  assert.ok(box.drillW > 250 && box.drillW <= box.verdictW, JSON.stringify(box));
  assert.ok(box.overflow <= 0);
  await page.screenshot({ path: S + "/drill-desktop-dark.png", clip: { x: 0, y: 60, width: 1400, height: 760 } });
  await page.evaluate(() => document.body.classList.add("light"));
  await page.screenshot({ path: S + "/drill-desktop-light.png", clip: { x: 0, y: 60, width: 1400, height: 760 } });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(ov <= 1, "no sideways scroll on a phone (" + ov + ")");
  await page.screenshot({ path: S + "/drill-phone-light.png", fullPage: false });
  await page.evaluate(() => document.body.classList.remove("light"));
  await page.screenshot({ path: S + "/drill-phone-dark.png", fullPage: false });
  ok("fits its column on desktop and phone, no sideways scroll");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
