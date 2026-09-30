"use strict";
// Privacy Mode, end to end. The CHECKLIST for "no spot missed": with Privacy Mode on, walk every
// page, pop-up form, the chart and its tooltip, toasts and native pop-up boxes, and fail if any
// peso amount is still readable. Also: everything comes back exactly when it is turned off, new
// amounts drawn while it is on are hidden too, the session rule, exports ask first, and it survives
// a reload.
const assert = require("assert").strict;
const { boot, freezeMotion, OWNER } = require("./lib.js");

const PAGES = [
  ["home", () => { switchGroup("home"); refreshDashboard(); }],
  ["play/sessions", () => switchGroup("play", "sessions")],
  ["play/calculator", () => switchGroup("play", "calculator")],
  ["play/calculator-icm", () => calcSwitchMode("icmcalc")],
  ["treasury", () => switchGroup("wallet", "wallet")],
  ["plan/calendar-month", () => { switchGroup("plan", "calendar"); setView("month"); renderCalendar(); }],
  ["plan/calendar-list", () => { setView("list"); renderCalendarList(); }],
  ["plan/satellites", () => switchGroup("plan", "satellite")],
  ["review/sessions", () => switchGroup("review", "sessions")],
  ["review/hands", () => switchGroup("review", "hands")],
  ["review/opponents", () => switchGroup("review", "opponents")],
  ["review/heatmap", () => switchGroup("review", "heatmap")],
  ["improve/strategy", () => switchGroup("improve", "strategy")],
  ["help", () => switchGroup("help")],
];
const MODALS = ["modal-tourney", "modal-hand", "modal-opponent", "modal-satellite", "modal-voice", "modal-readiness"];

// Every text node and readable attribute anywhere in the document that still holds an amount.
const LEAKS = () => {
  const hasMoney = window.PokerHQPrivacy.hasMoney;
  const found = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const p = n.parentElement;
    if (p && /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/.test(p.tagName)) continue;
    if (hasMoney(n.nodeValue)) found.push("text: " + n.nodeValue.trim().slice(0, 60) + "  in <" + (p ? p.tagName.toLowerCase() + (p.id ? "#" + p.id : "") + (p.className && typeof p.className === "string" ? "." + p.className.split(" ")[0] : "") : "?") + ">");
  }
  document.querySelectorAll("[title],[aria-label],[placeholder],[alt]").forEach((el) => {
    ["title", "aria-label", "placeholder", "alt"].forEach((a) => { const v = el.getAttribute(a); if (v && hasMoney(v)) found.push(a + ": " + v.slice(0, 60) + " on <" + el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + ">"); });
  });
  // boxes that hold a saved amount must be unreadable when not being typed in
  document.querySelectorAll("[data-money]").forEach((el) => {
    const cs = getComputedStyle(el);
    if (document.activeElement !== el && cs.webkitTextFillColor !== "rgba(0, 0, 0, 0)" && cs.color !== "rgba(0, 0, 0, 0)" && (el.value || "").trim() !== "") found.push("box readable: #" + el.id + " = " + el.value);
  });
  return found;
};

(async () => {
  const { page, dialogs, realErrors, close } = await boot({ viewport: { width: 1280, height: 1000 }, demo: true });
  const ok = (m) => console.log("ok  " + m);
  await freezeMotion(page);
  const closeModals = () => page.evaluate(() => document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open")));
  const leaks = () => page.evaluate(LEAKS);
  const settle = (ms = 120) => page.waitForTimeout(ms);

  // give the amount-holding boxes real values so the sweep can prove they are hidden
  await page.evaluate(() => {
    window.bankroll = { amount: 43210, rule: 5 }; window.wallet = { balance: 7777 }; syncGlobalAliases();
    ["s-buyin", "s-rebuy", "s-prize", "s-bounty", "wallet-amount", "t-buyin", "sat-buyin"].forEach((id, i) => { const el = document.getElementById(id); if (el) el.value = String(1500 + i * 500); });
    if (typeof loadBankrollForm === "function") loadBankrollForm();
  });

  // 0. control: the sweep really finds amounts when Privacy Mode is off (so a pass below means something)
  await page.evaluate(() => { switchGroup("home"); refreshDashboard(); });
  await settle();
  const before = await leaks();
  assert.ok(before.length > 5, "with Privacy Mode off the sweep should see plenty of amounts, saw " + before.length);
  const homeText = await page.evaluate(() => document.getElementById("page-dashboard").innerText);
  ok("control: with Privacy Mode off the sweep sees " + before.length + " amounts");

  // 1. turn it on with the header eye
  await page.click("#privacy-toggle");
  await settle();
  assert.equal(await page.evaluate(() => document.body.classList.contains("privacy-on")), true);
  assert.equal(await page.getAttribute("#privacy-toggle", "aria-pressed"), "true");
  assert.match(await page.getAttribute("#privacy-toggle", "title"), /ON/);
  ok("the header eye turns it on (button pressed, page marked)");

  // 2. every page, then every pop-up form
  const problems = [];
  for (const [label, prep] of PAGES) {
    await page.evaluate(prep);
    await settle();
    (await leaks()).forEach((l) => problems.push(label + " → " + l));
  }
  for (const id of MODALS) {
    await page.evaluate((i) => { document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open")); openModal(i); }, id);
    await settle(80);
    (await leaks()).forEach((l) => problems.push("modal " + id + " → " + l));
  }
  await page.evaluate(() => { document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open")); switchGroup("review", "sessions"); viewSessionDetail(sessions[0].id, true); });
  await settle();
  (await leaks()).forEach((l) => problems.push("session detail → " + l));
  await closeModals();
  assert.deepEqual(problems, [], "amounts still readable with Privacy Mode on:\n  " + problems.slice(0, 20).join("\n  "));
  ok("swept " + PAGES.length + " pages, " + (MODALS.length + 1) + " pop-ups: no amount, tooltip or label left readable");

  // 3. the chart: axis labels and the hover tooltip
  await page.evaluate(() => { switchGroup("home"); refreshDashboard(); renderBankrollChart && renderBankrollChart(); });
  await settle();
  const chart = await page.evaluate(() => { const w = document.getElementById("bankroll-chart"); return { has: !!(w && w.querySelector("svg")), labels: w ? [...w.querySelectorAll(".bk-axis-label")].map((t) => t.textContent) : [] }; });
  if (chart.has) {
    assert.ok(chart.labels.some((t) => t.includes("₱•••")), "the y-axis shows masked amounts: " + chart.labels);
    const box = await page.locator("#bankroll-chart svg").boundingBox();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await settle(60);
    const tip = await page.textContent("#bk-tooltip");
    assert.ok(!(await page.evaluate((t) => window.PokerHQPrivacy.hasMoney(t), tip)), "tooltip shows an amount: " + tip);
    ok("the bankroll chart: axis labels and the hover tooltip are masked");
  } else {
    ok("(no bankroll chart with this data)");
  }

  // 4. native pop-up boxes are masked too
  dialogs.length = 0;
  await page.evaluate(() => { alert("Bankroll is ₱43,210 after −₱1,500"); });
  assert.equal(dialogs[0].message, "Bankroll is ₱••• after ₱•••");
  ok("alert / confirm text is masked before it reaches the pop-up box");

  // 5. new amounts drawn while it is on are hidden the moment they appear (a session logged now)
  await page.evaluate(() => { clearDemoMode && clearDemoMode(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.sessions.length = 0; window.bankroll.amount = 20000; switchGroup("play", "sessions"); });
  await page.fill("#s-name", "Privacy live entry");
  await page.fill("#s-buyin", "3000");
  await page.fill("#s-rebuy", "");
  await page.fill("#s-bounty", "");
  await page.fill("#s-prize", "9000");
  // typing into an amount box is readable while you are in it
  await page.focus("#s-prize");
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("s-prize")).webkitTextFillColor !== "rgba(0, 0, 0, 0)"), true, "a box you are typing in is readable");
  await page.click("#session-submit-btn");
  await page.waitForFunction(() => sessions.length === 1);
  await page.waitForTimeout(400);
  await closeModals();
  await page.evaluate(() => switchGroup("review", "sessions"));
  await settle();
  const live = await leaks();
  assert.deepEqual(live, [], "a session logged with Privacy Mode on shows amounts: " + live.join(" | "));
  const row = await page.textContent("#session-tbody");
  assert.match(row, /Privacy live entry/);
  assert.match(row, /₱•••/);
  assert.equal(await page.evaluate(() => sessions[0].pnl), 6000, "the saved data is the real number, only the screen is masked");
  assert.equal(await page.evaluate(() => bankroll.amount), 26000);
  ok("a session logged while hidden: the table, toast and detail show ₱•••, the saved P&L is still the real +6,000");

  // 6. turning it off puts every amount back exactly
  await page.click("#privacy-toggle");
  await settle();
  assert.equal(await page.evaluate(() => document.body.classList.contains("privacy-on")), false);
  const rowOff = await page.textContent("#session-tbody");
  assert.match(rowOff, /₱9,000/, "the prize is back: " + rowOff.slice(0, 200));
  assert.match(rowOff, /₱6,000/, "and the P&L");
  assert.equal(await page.evaluate(() => window.PokerHQPrivacy.maskText.length >= 0 && document.querySelectorAll("[title*='•••'], [aria-label*='•••']").length), 0, "no masked tooltips left behind");
  ok("turned off: real amounts are back on screen, none left masked");

  // 7. the restore is exact for the whole page, not just one table
  await page.evaluate(() => { window.bankroll = { amount: 43210, rule: 5 }; loadDemoMode(); switchGroup("home"); refreshDashboard(); });
  await settle(300);
  const snapshot = () => page.evaluate(() => [...document.querySelectorAll(".page")].map((p) => p.id + ": " + p.textContent.replace(/\s+/g, " ").trim()).join("\n"));
  const plain = await snapshot();
  await page.click("#privacy-toggle"); await settle(300);
  assert.notEqual(await snapshot(), plain, "hiding changes the page");
  await page.click("#privacy-toggle"); await settle(300);
  assert.equal(await snapshot(), plain, "showing again restores every page's text exactly");
  ok("hide then show again: the text of every page is identical to before");

  // 8. the session rule: hide automatically while a session runs, reveal on purpose, back after it ends
  await page.evaluate(() => clearDemoMode && clearDemoMode());
  await page.waitForTimeout(300);
  await page.evaluate(() => { switchGroup("home"); });
  await page.check("#privacy-auto");
  assert.equal(await page.evaluate(() => PokerHQPrivacy.isHidden()), false, "no session yet, nothing hidden");
  await page.evaluate(() => { switchGroup("play", "sessions"); document.getElementById("s-name").value = "Auto hide session"; document.getElementById("s-buyin").value = "2000"; });
  await page.evaluate(() => switchGroup("home"));
  await page.click("#timer-start-btn");
  await page.getByRole("button", { name: "SKIP", exact: true }).click();
  await settle();
  assert.equal(await page.evaluate(() => PokerHQPrivacy.isHidden()), true, "the session started, amounts are hidden");
  assert.match(await page.textContent("#privacy-status"), /while your session runs/);
  await page.click("#privacy-toggle"); await settle();
  assert.equal(await page.evaluate(() => PokerHQPrivacy.isHidden()), false, "the eye reveals them for this session");
  assert.match(await page.textContent("#privacy-status"), /rest of this session/);
  await page.evaluate(() => renderActiveSessionSurface());     // a re-render must not re-hide it
  assert.equal(await page.evaluate(() => PokerHQPrivacy.isHidden()), false);
  await page.click("#timer-stop-btn");
  await page.evaluate(() => endActiveSession());
  await settle();
  assert.equal(await page.evaluate(() => PokerHQPrivacy.isHidden()), false, "the session ended: back to showing");
  await page.evaluate(() => { switchGroup("play", "sessions"); document.getElementById("s-name").value = "Second"; switchGroup("home"); });
  await page.click("#timer-start-btn");
  await page.getByRole("button", { name: "SKIP", exact: true }).click();
  await settle();
  assert.equal(await page.evaluate(() => PokerHQPrivacy.isHidden()), true, "the next session hides again (the reveal lasted only one session)");
  await page.evaluate(() => { stopTimer(); endActiveSession(); });
  await settle();
  assert.equal(await page.evaluate(() => PokerHQPrivacy.isHidden()), false);
  ok("hide-while-a-session-runs: hides on start, you can reveal it, comes back next session, gone when it ends");

  // 9. exports ask first while hidden, and never while showing
  await page.evaluate(() => { window.__demo = false; window.sessions = [{ id: 1, name: "a", date: "2026-01-04", total: 1000, prize: 3000, bounties: 0, pnl: 2000, hours: 4, result: "itm", venue: "Metro", position: 5, field: 50 }]; syncGlobalAliases(); });
  const cancelNext = () => { page.removeAllListeners("dialog"); page.once("dialog", (d) => { dialogs.push({ type: d.type(), message: d.message() }); d.dismiss(); }); };
  const downloads = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  // showing: exports go straight through, no question
  dialogs.length = 0;
  page.on("dialog", (d) => { dialogs.push({ type: d.type(), message: d.message() }); d.accept(); });
  await page.evaluate(() => exportCSV()); await settle(200);
  assert.equal(dialogs.filter((d) => d.type === "confirm").length, 0, "no question while amounts are showing");
  assert.equal(downloads.length, 1);
  // hidden: it asks, and cancelling stops the download
  await page.click("#privacy-toggle"); await settle();
  page.removeAllListeners("dialog");
  page.once("dialog", (d) => { dialogs.push({ type: d.type(), message: d.message() }); d.dismiss(); });
  dialogs.length = 0;
  await page.evaluate(() => exportCSV()); await settle(200);
  const ask = dialogs.find((d) => d.type === "confirm");
  assert.ok(ask && /Privacy Mode is on/.test(ask.message) && /real amounts/.test(ask.message), JSON.stringify(dialogs));
  assert.equal(downloads.length, 1, "Cancel: nothing was downloaded");
  page.on("dialog", (d) => { dialogs.push({ type: d.type(), message: d.message() }); d.accept(); });
  await page.evaluate(() => exportCSV()); await settle(300);
  assert.equal(downloads.length, 2, "OK: the file downloads");
  // the JSON backup is never blocked or masked
  dialogs.length = 0;
  const backup = await page.evaluate(() => { const b = getBackupSnapshot(); return { pnl: b.data.sessions[0].pnl, bankroll: b.data.bankroll.amount }; });
  assert.equal(backup.pnl, 2000);
  await page.evaluate(() => exportBackupJSON()); await settle(200);
  assert.equal(dialogs.filter((d) => d.type === "confirm").length, 0, "the backup does not ask");
  assert.equal(downloads.length, 3, "and it downloads");
  ok("exports: no question while showing; while hidden CSV asks and Cancel stops it; the JSON backup is complete and never asks");
  await page.click("#privacy-toggle"); await settle();

  // 10. it survives a reload (setting is kept on this device), and is on before the first amount is drawn
  await page.click("#privacy-toggle"); await settle();
  await page.reload();
  await page.waitForFunction(() => typeof window.__authCallback === "function");
  assert.equal(await page.evaluate(() => document.body.classList.contains("privacy-on")), true, "hidden from the very first frame after a reload");
  await page.evaluate((u) => window.__authCallback(u), OWNER);
  await settle(600);
  await page.evaluate(() => { const o = document.getElementById("onboarding-overlay"); if (o) o.style.display = "none"; loadDemoMode(); switchGroup("home"); refreshDashboard(); });
  await settle(300);
  const afterReload = await leaks();
  assert.deepEqual(afterReload, [], "after a reload amounts are still hidden: " + afterReload.join(" | "));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("pokerhq_privacy_v1")).manual), true);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("pokerhq_privacy_v1")).auto), true);
  ok("reload: Privacy Mode is still on, hidden before any amount is drawn, and the 'hide during session' choice is kept");

  // 11. speed: hiding a big calendar list stays quick
  await page.evaluate(() => { window.tourneys.length = 0; for (let i = 0; i < 900; i++) window.tourneys.push({ id: i + 1, date: "2026-10-" + String(1 + (i % 28)).padStart(2, "0"), name: "Event " + i, venue: "Okada Manila", buyin: 1000 + i, gtd: "₱" + (i * 1000), status: "target", type: "side" }); syncGlobalAliases(); switchGroup("plan", "calendar"); setView("list"); });
  const ms = await page.evaluate(() => { const t = performance.now(); renderCalendarList(); return new Promise((r) => setTimeout(() => r(performance.now() - t), 0)); });
  assert.ok(ms < 1500, "rendering 900 events with Privacy Mode on took " + Math.round(ms) + "ms");
  assert.deepEqual(await leaks(), []);
  ok("900 calendar events drawn while hidden in " + Math.round(ms) + " ms, none readable");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
