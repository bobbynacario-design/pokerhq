const assert = require("assert").strict;
const { boot, out } = require("./lib.js");
(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1200, height: 1000 } });
  const ok = (m) => console.log("ok  " + m);

  // 1. calendar event → session keeps its format
  await page.evaluate(() => {
    window.sessions.length = 0;
    window.tourneys.length = 0;
    window.tourneys.push({ id: 501, date: "2026-10-04", name: "Metro Sunday PKO", venue: "Metro Card Club", buyin: 3300, structure: "Bounty / PKO", status: "target" });
    window.tourneys.push({ id: 502, date: "2026-10-05", name: "AI Import Turbo", venue: "Okada", buyin: 2200, structure: "Super Turbo", status: "target" });
    syncGlobalAliases();
    startSessionFromTourney(501);
  });
  await page.waitForTimeout(400);
  assert.equal(await page.inputValue("#s-structure"), "Bounty / PKO");
  assert.equal(await page.inputValue("#s-name"), "Metro Sunday PKO");
  const draft = await page.evaluate(() => _activeSessionDraft.structure);
  assert.equal(draft, "Bounty / PKO", "kept in the in-progress draft");
  ok("starting from a calendar event fills the Format (Bounty / PKO)");

  // 2. draft survives a reload of the form; saving stores it
  await page.evaluate(() => { document.getElementById("s-structure").value = ""; hydrateSessionFormFromDraft(true); });
  assert.equal(await page.inputValue("#s-structure"), "Bounty / PKO", "hydrates from the draft");
  await page.evaluate(() => { document.getElementById("s-prize").value = "0"; document.getElementById("s-bounty").value = "1200"; addSession(); });
  let s = await page.evaluate(() => ({ structure: sessions[0].structure, name: sessions[0].name }));
  assert.deepEqual(s, { structure: "Bounty / PKO", name: "Metro Sunday PKO" });
  ok("the draft carries the format through to the saved session");

  // 3. loose wording is normalised; the form clears
  assert.equal(await page.inputValue("#s-structure"), "", "form cleared after saving");
  await page.evaluate(() => { startSessionFromTourney(502); });
  await page.waitForTimeout(400);
  assert.equal(await page.inputValue("#s-structure"), "Turbo");
  ok("AI-style 'Super Turbo' lands on Turbo");

  // 4. edit round trip
  await page.evaluate(() => { document.getElementById("s-buyin").value = "2200"; addSession(); });
  const id = await page.evaluate(() => sessions.find((x) => x.name === "AI Import Turbo").id);
  await page.evaluate((i) => { switchGroup("play", "sessions"); editSession(i); }, id);
  assert.equal(await page.inputValue("#s-structure"), "Turbo");
  await page.selectOption("#s-structure", "Freezeout");
  await page.evaluate(() => addSession());
  assert.equal(await page.evaluate((i) => sessions.find((x) => x.id === i).structure, id), "Freezeout");
  ok("editing shows and updates the format");

  // 5. old sessions (no structure) don't break anything and show as Not recorded
  await page.evaluate(() => { sessions.push({ id: 900, name: "Old", date: "2025-01-01", total: 1000, prize: 0, pnl: -1000, result: "bust", venue: "X", position: 9, field: 40 }); syncGlobalAliases(); switchGroup("home"); refreshDashboard(); });
  const rows = await page.$$eval("#format-breakdown tbody tr", (trs) => trs.map((t) => t.children[0].textContent.replace(" *", "") + ":" + t.children[1].textContent));
  assert.deepEqual(rows, ["Bounty / PKO:1", "Freezeout:1", "Not recorded:1"]);
  ok("table: " + rows.join(", ") + " (unrecorded last)");

  // 6. no formats at all → helpful hint, not a lonely 'Not recorded' row
  await page.evaluate(() => { window.sessions = [{ id: 1, name: "a", date: "2025-01-01", total: 1000, prize: 0, pnl: -1000, result: "bust", venue: "X", position: 9, field: 40 }]; syncGlobalAliases(); refreshDashboard(); });
  assert.match(await page.textContent("#format-breakdown"), /Pick a Format/);
  ok("only unrecorded sessions: shows a hint to pick a Format");

  // 7. CSV has Format as the LAST column (existing spreadsheets keep their columns)
  await page.evaluate(() => { window.sessions = [{ id: 1, name: "a", date: "2026-01-01", total: 1000, prize: 0, bounties: 0, pnl: -1000, result: "bust", venue: "X", structure: "Turbo", position: 9, field: 40, hours: 2 }]; syncGlobalAliases(); });
  const csv = await page.evaluate(() => { let cap = ""; const O = window.Blob; window.Blob = function (p) { cap = p.join(""); return new O(p); }; const oc = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {}; exportCSV(); window.Blob = O; HTMLAnchorElement.prototype.click = oc; return cap; });
  const [head, first] = csv.split("\n");
  assert.ok(head.endsWith(",Fasting,Format"), head);
  assert.ok(first.endsWith(",Turbo"), first);
  ok("CSV: Format added as the last column");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
  console.log("\nALL GAME-FORMAT CHECKS PASSED");
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
