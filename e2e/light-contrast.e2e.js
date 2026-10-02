"use strict";
// Light-mode text contrast: every visible piece of text must reach WCAG AA (4.5:1,
// 3:1 for large text) against what is really behind it, on desktop and on a phone,
// across every page, the pop-up forms, the toast and the sign-in gate. A new
// colour that is too faint in light mode fails here. (Dark mode is a moodier
// palette with deliberately faint labels, so it is reported by the audit tool, not enforced.)
const assert = require("assert").strict;
const { boot, freezeMotion } = require("./lib.js");

const MEASURE = () => {
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, bot) => { const a = top.a + bot.a * (1 - top.a); if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }; return { r: (top.r * top.a + bot.r * bot.a * (1 - top.a)) / a, g: (top.g * top.a + bot.g * bot.a * (1 - top.a)) / a, b: (top.b * top.a + bot.b * bot.a * (1 - top.a)) / a, a }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const bodyBg = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const bgOf = (el) => {
    // returns an array of candidate opaque backgrounds (gradient stops -> several)
    let layers = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const bi = cs.backgroundImage;
      let stops = null;
      if (bi && bi !== "none" && /gradient/.test(bi)) { stops = (bi.match(/rgba?\([^)]*\)/g) || []).map(parse).filter(Boolean); }
      const bc = parse(cs.backgroundColor);
      layers.push({ stops, bc });
      if ((bc && bc.a >= 0.999 && !stops) ) break;
      if (stops && stops.length && stops.every((s) => s.a >= 0.999)) break;
    }
    // composite from the bottom up, expanding gradient stops into alternatives
    let alts = [over({ r: 0, g: 0, b: 0, a: 0 }, bodyBg)];
    alts = [bodyBg];
    for (let i = layers.length - 1; i >= 0; i--) {
      const L = layers[i];
      if (L.bc && L.bc.a > 0) alts = alts.map((b) => over(L.bc, b));
      if (L.stops && L.stops.length) { const n = []; alts.forEach((b) => L.stops.forEach((s) => n.push(over(s, b)))); alts = n; }
    }
    return alts;
  };
  const visible = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const opacityOf = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  const sig = (el) => {
    const page = el.closest(".page, .modal-overlay, .modal, [role=dialog]");
    const pid = page ? (page.id || page.className.split(" ")[0]) : "shell";
    let s = el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "");
    const st = el.getAttribute("style");
    if (st) { const m = st.match(/color:\s*[^;]+/); if (m) s += " [" + m[0] + "]"; }
    const par = el.parentElement;
    if (par && (!el.className)) s = (par.tagName.toLowerCase() + (par.className && typeof par.className === "string" ? "." + par.className.trim().split(/\s+/).slice(0, 2).join(".") : "")) + " > " + s;
    return pid + " :: " + s;
  };
  const out = new Map();
  const all = document.querySelectorAll("body *");
  all.forEach((el) => {
    if (["SCRIPT", "STYLE", "SVG", "PATH", "CANVAS", "OPTION", "OPTGROUP", "NOSCRIPT"].includes(el.tagName)) return;
    // own text
    let text = "";
    el.childNodes.forEach((n) => { if (n.nodeType === 3) text += n.nodeValue; });
    text = text.replace(/\s+/g, " ").trim();
    const isField = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    if (isField) {
      if (el.type === "checkbox" || el.type === "radio" || el.type === "hidden" || el.type === "range" || el.type === "file") return;
      text = (el.value || el.placeholder || "").toString().trim() || "(field)";
    }
    if (!text || !/[\p{L}\p{N}]/u.test(text)) return;
    if (el.disabled) return;
    if (!visible(el)) return;
    const cs = getComputedStyle(el);
    let fg = parse(cs.color); if (!fg) return;
    if (isField && !el.value && el.placeholder) { const ph = parse(getComputedStyle(el, "::placeholder").color); if (ph) fg = ph; text = "(placeholder) " + el.placeholder; }
    const op = opacityOf(el);
    const bgs = bgOf(el);
    let worst = 99, worstBg = null;
    bgs.forEach((bg) => {
      const f = { r: fg.r, g: fg.g, b: fg.b, a: fg.a * op };
      const eff = over(f, bg);
      const r = ratio(eff, bg);
      if (r < worst) { worst = r; worstBg = bg; }
    });
    const fs = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = fs >= 24 || (fs >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (worst >= need) return;
    const key = sig(el);
    const rec = out.get(key) || { key, count: 0, min: 99, sample: "", fg: "", bg: "", size: fs, need };
    rec.count++;
    if (worst < rec.min) { rec.min = worst; rec.sample = text.slice(0, 50); rec.fg = cs.color + (op < 1 ? " op" + op.toFixed(2) : ""); rec.bg = worstBg ? "rgb(" + [worstBg.r, worstBg.g, worstBg.b].map(Math.round).join(",") + ")" : ""; }
    out.set(key, rec);
  });
  return [...out.values()];
};

const PAGES = [
  ["home", () => { switchGroup("home"); refreshDashboard(); }],
  ["play/sessions", () => switchGroup("play", "sessions")],
  ["play/calculator", () => switchGroup("play", "calculator")],
  ["play/calculator-icm", () => calcSwitchMode("icmcalc")],
  ["treasury", () => switchGroup("wallet", "wallet")],
  ["plan/calendar-month", () => { calYear = 2026; calMonth = 3; switchGroup("plan", "calendar"); setView("month"); renderCalendar(); }],
  ["plan/calendar-month-nov", () => { calYear = 2026; calMonth = 4; renderCalendar(); }],
  ["plan/calendar-list", () => { setView("list"); renderCalendarList(); }],
  ["plan/satellites", () => switchGroup("plan", "satellite")],
  ["review/sessions", () => switchGroup("review", "sessions")],
  ["review/hands", () => switchGroup("review", "hands")],
  ["review/opponents", () => switchGroup("review", "opponents")],
  ["review/heatmap", () => switchGroup("review", "heatmap")],
  ["review/inbox", () => switchGroup("review", "inbox")],
  ["improve/strategy", () => switchGroup("improve", "strategy")],
  ["help", () => switchGroup("help")],
];
const MODALS = ["modal-tourney", "modal-hand", "modal-opponent", "modal-satellite", "modal-voice", "modal-readiness"];

async function audit(viewport) {
  const { page, close } = await boot({ viewport, demo: true, expandDetails: true });
  await freezeMotion(page);
  await page.evaluate(() => document.body.classList.add("light"));
  const problems = [];
  const scan = async (label, prep, arg) => {
    if (prep) await page.evaluate(prep, arg);
    await page.waitForTimeout(150);
    (await page.evaluate(MEASURE)).forEach((r) => problems.push(Object.assign({ page: label }, r)));
  };
  for (const [label, prep] of PAGES) await scan(label, prep);
  await scan('compact playing these', () => { switchGroup('plan','calendar');tourneys.push({id:9876,date:'2099-10-03',name:'Pinned tournament',venue:'Okada Manila',buyin:3000,planning:true});renderPlannedEvents();document.getElementById('planned-details').open=true; });
  await scan('slate whole-plan budget', () => { switchGroup('plan','calendar');renderSlateLocationFilter();document.getElementById('slate-location').value='okada';document.getElementById('slate-budget').value=18500;document.getElementById('slate-limits').open=true;renderSlateOptimizer(); });
  await scan('personal planning and pick explanations', () => { document.getElementById('slate-personalize').open=true;document.querySelectorAll('.slate-why').forEach(function(el){el.open=true;}); });
  await scan('calendar merge preview', () => { var a=tourneys[0];tourneys.push(Object.assign({},a,{id:9999,name:a.name+' ',planning:true,notes:'Extra source detail'}));openCalendarCleanup();previewCalendarMerge(a.id,9999); });
  await scan('calendar batch actions and group preview', () => { openCalendarCleanup();document.querySelector('#cleanup-body .cleanup-pairs').open=true; });
  await scan('calendar batch confirmation', () => { previewCalendarBatch();document.querySelector('#cleanup-body .cleanup-pairs').open=true; });
  await scan('practice drill and progress', () => { closeModal('modal-calendar-cleanup');openPracticeFromHand(hands[0].id);savePracticeDraft(); });
  await scan('blind clock and BB', () => { replaceActiveSessionDraft({date:todayLocal(),name:'Live controls'});setLiveClockField('bigBlind',400);setLiveClockField('chips',20000);switchGroup('play','sessions');renderActiveSessionSurface(); });
  await scan('re-entry guard and budget review', () => { replaceActiveSessionDraft({date:todayLocal(),name:'Guard controls',buyin:3000,reentryGuard:{cap:4000,protect:1500}});switchGroup('play','sessions');updateBulletCount(1);document.querySelector('#play-active-session-wrap .reentry-settings').open=true; });
  await scan('guided demo tour', () => { switchGroup('home');startDemoTour(); });
  await page.evaluate(() => closeDemoTour());
  for (const id of MODALS) await scan("modal:" + id, (i) => { document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open")); openModal(i); }, id);
  await scan("modal:session-detail", () => { document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open")); switchGroup("review", "sessions"); viewSessionDetail(sessions[0].id, true); });
  // live hand markers: the running-session card with its big buttons, Hand History with tag chips and the
  // "needs details" filter on, and the finish form with its marker note (the demo data has two marked hands)
  await scan("play/active-session+markers", () => {
    ensureActiveSessionDraft({ date: todayLocal(), name: "Contrast check", venue: "Okada Manila" });
    [["bigpot", 61], ["icm", 62], ["unsure", 63]].forEach(([kind, id]) => { hands.unshift(PokerHQMarkers.buildMarker({ kind, now: id, elapsedMs: 754000, stack: "24", level: "L12", sessionLabel: "Contrast check", pendingSessionKey: _activeSessionDraft.key, existingIds: [] })); });
    switchGroup("play", "sessions"); renderActiveSessionSurface();
  });
  await scan("review/hands+markers", () => { switchGroup("review", "hands"); setHandTagFilter("unfinished"); });
  await scan("modal:hand (marker)", () => { document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open")); editHand(7007); });
  // trips & true ROI: the section with a warning showing (remove the satellites so the seat session has none), and the pop-ups with their error and preview lines
  await scan("treasury/trips+warning", () => { satellites.length = 0; switchGroup("wallet"); renderTrips(); });
  await scan("modal:trip (error)", () => { document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open")); openNewTripModal(); const e = document.getElementById("trip-error"); e.textContent = "The last day is before the first day."; e.style.display = ""; });
  await scan("modal:trip cost (error, preview, rate)", () => { document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open")); openNewTripCostModal(8802); document.getElementById("cost-currency").value = "USD"; fillCostRate(); document.getElementById("cost-amount").value = "420"; document.getElementById("cost-rate").value = "58.4"; updateCostPreview(); const e = document.getElementById("cost-error"); e.textContent = "Enter the exchange rate: how many pesos one USD is worth."; e.style.display = ""; });
  // event poster import: the picking step with an error showing, and the confirm step with a blocked card
  // (missing date, foreign price with no rate), a duplicate, an unsure field and a warning
  await scan("modal:poster (pick, error)", () => { document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open")); switchGroup("plan", "calendar"); openPosterImport(); posterError("That file is not a picture."); });
  await scan("modal:poster (confirm)", () => {
    const t = todayLocal(); const add = (n) => { const d = new Date(t + "T12:00:00"); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
    tourneys.push({ id: 424243, date: add(13), name: "Weekend Special", venue: "Metro Card Club", buyin: 3300, status: "target", type: "side" }); syncGlobalAliases();
    const ev = (o) => Object.assign({ name: "Event", date: add(10), endDate: "", time: "14:00", venue: "Okada Manila", buyin: 5500, currency: "PHP", gtd: "", structure: "Regular", category: "side", notes: "", uncertain: [] }, o);
    tourneys.push({ id: 424245, date: add(15), name: "Metro 1M", venue: "Metro Card Club", buyin: 5500, status: "target", type: "main" }); syncGlobalAliases();
    _poster.drafts = PokerHQPoster.buildDrafts([ev({ name: "Metro 1M", venue: "Metro Card Club", date: add(15), printedDates: "Thu–Sun, last day Sunday" }), ev({ name: "Poster Main Event", gtd: "₱1,000,000", uncertain: ["time"] }), ev({ name: "APT High Roller", currency: "USD", buyin: 500, date: add(12) }), ev({ name: "Mystery Event", date: "", uncertain: ["date"] }), ev({ name: "Weekend Special", date: add(13), venue: "Metro Card Club", buyin: 3300 }), ev({ name: "Old Finale", date: add(-60) })], posterDraftContext());
    _poster.notes = "Ignored the cash game list.";
    posterShowStage("confirm"); renderPosterDrafts();
  });
  // the calendar list when an event is from another year: its date box carries the year
  await scan("calendar list (event from another year)", () => { document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open")); tourneys.push({ id: 424244, date: (new Date().getFullYear() - 1) + "-10-12", day: "12", month: "OCT", name: "Last year's main", venue: "Okada Manila", buyin: 5500, status: "target", type: "main" }); switchGroup("plan", "calendar"); setView("list"); renderCalendar(); if (!document.querySelector(".event-date-year")) throw new Error("the year tag did not render"); });
  await scan("toast", () => { document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open")); switchGroup("home"); showUndoToast("Removed a tournament", function () {}, 60000); const b = document.getElementById("update-banner"); if (b) b.style.display = "flex"; });
  await close();
  return problems;
}

async function auditSignIn(viewport) {
  const { page, close } = await boot({ viewport, signedIn: false });
  await freezeMotion(page);
  await page.evaluate(() => document.body.classList.add("light"));
  const problems = [];
  const scan = async (label, prep) => {
    if (prep) await page.evaluate(prep);
    await page.waitForTimeout(100);
    (await page.evaluate(MEASURE)).forEach((r) => problems.push(Object.assign({ page: label }, r)));
  };
  await scan("sign-in: checking");
  await scan("sign-in: signed out", () => window.__authCallback(null));
  await scan("sign-in: with an error", () => { const e = document.getElementById("login-error"); e.textContent = "someone@example.com doesn't have access to PokerHQ data. Sign in with the owner account."; e.style.display = ""; });
  await close();
  return problems;
}

const describe = (p) => p.min.toFixed(2) + ":1 (needs " + p.need + ") on " + p.page + " — " + p.key + " — \"" + p.sample + "\" — text " + p.fg + " on " + p.bg;

(async () => {
  const ok = (m) => console.log("ok  " + m);
  for (const [name, viewport] of [["desktop", { width: 1280, height: 1000 }], ["phone", { width: 390, height: 844 }]]) {
    const found = await audit(viewport);
    assert.equal(found.length, 0, "light mode, " + name + ": " + found.length + " low-contrast text type(s):\n  " + found.slice(0, 15).map(describe).join("\n  "));
    ok("light mode, " + name + ": every page, pop-up and the toast pass 4.5:1 text contrast");
    const gate = await auditSignIn(viewport);
    assert.equal(gate.length, 0, "sign-in page, light mode, " + name + ":\n  " + gate.slice(0, 15).map(describe).join("\n  "));
    ok("light mode, " + name + ": the sign-in page passes too (checking, signed out, error)");
  }
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
