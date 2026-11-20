const assert = require("assert").strict;
const { boot, out } = require("./lib.js");
(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1200, height: 1000 } });
  const ok = (m) => console.log("ok  " + m);

  // no local key; signed in (boot signs in). Stub the server function.
  await page.evaluate(() => {
    localStorage.removeItem("pokerhq_openai_key");
    window.__proxyCalls = [];
    window.pokerhqOpenAiCall = async (payload) => {
      window.__proxyCalls.push(payload);
      if (payload.kind === "ping") return { data: { ok: true } };
      if (payload.kind === "transcribe") return { data: { text: "Raised pocket kings, villain shoved" } };
      if (payload.kind === "responses") {
        const n = window.__proxyCalls.filter((p) => p.kind === "responses").length;
        const dates = calendarResearchWindow();
        const index = "https://www.pokerstarslivemanila.com/tournaments/";
        const schedule = index + "current-schedule/";
        if (payload.body.text.format.schema.properties.schedules) return { data: {status: "completed",
          output: [{type: "web_search_call", status: "completed", action: {type: "open_page", url: index}},
            {type: "web_search_call", status: "completed", action: {type: "search", sources: [{type: "url", url: schedule}]}}],
          output_text: JSON.stringify({asOf: dates.from, schedules: [{name: "Current schedule", url: schedule, from: dates.from, to: dates.from}], skipped: []})} };
        const linked = payload.body.input.includes("LINKED SCHEDULE TASK");
        const url = linked ? schedule : "https://example.com/e" + n;
        const output = [{ type: "web_search_call", status: "completed", action: linked ? {type: "open_page", url} : { type: "search", sources: [{ type: "url", url }] } }];
        return { data: { status: "completed", output, output_text: JSON.stringify({ asOf: dates.from, skipped: [], events: [{ date: dates.from, time: "19:00", name: "Proxy Test Event " + n, venue: "Metro Card Club", buyin: 3000, gtd: "", structure: "Freezeout", category: "side", seatGuaranteed: false, region: "ph", accessible: true, notes: "n", source: "s", url }] }) } };
      }
      throw new Error("unexpected " + payload.kind);
    };
    window.__authUidBackup = window.__pokerhqAuthUid;
  });

  // settings show keyless status, and Test Connection uses the ping
  await page.evaluate(() => { switchGroup("improve", "strategy"); renderAiSettings(); });
  assert.match(await page.textContent("#ai-openai-status"), /keyless access through your signed-in account/);
  assert.match(await page.textContent("#ai-key-status"), /keyless access/);
  await page.evaluate(() => testOpenAIKey());
  await page.waitForFunction(() => /Keyless access works/.test(document.getElementById("ai-openai-test-result").textContent));
  assert.equal(await page.evaluate(() => window.__proxyCalls[0].kind), "ping");
  ok("settings say 'keyless'; Test Connection pings the server function");

  // Nine venue/region tasks plus a discovered schedule through the same proxy.
  await page.evaluate(() => { localStorage.removeItem("pokerhq_cal_update_ts"); window.tourneys.length = 0; window.__proxyCalls.length = 0; switchGroup("plan", "calendar"); });
  await page.evaluate(() => runCalendarUpdate());
  await page.waitForFunction(() => /Added \d+ event/.test(document.getElementById("cal-update-status").textContent), null, { timeout: 20000 });
  const calls = await page.evaluate(() => window.__proxyCalls.map((c) => c.kind));
  assert.equal(calls.length, 10, "8 Manila rooms + regional + linked schedule");
  assert.ok(calls.every((k) => k === "responses"));
  const first = await page.evaluate(() => window.__proxyCalls[0].body);
  assert.equal(first.model, "gpt-5.6-terra");
  assert.deepEqual(first.tools, [{ type: "web_search" }]);
  assert.equal(first.tool_choice, "required");
  assert.deepEqual(first.include, ["web_search_call.action.sources"]);
  const added = await page.evaluate(() => tourneys.filter((t) => /Proxy Test Event/.test(t.name)).length);
  assert.equal(added, 9);
  assert.equal(await page.evaluate(() => tourneys.find((t) => /Proxy Test Event/.test(t.name)).time), "19:00");
  assert.equal(await page.locator('#calendar-list a[href^="https://example.com/e"]').count(), 8);
  assert.equal(await page.locator('#calendar-list a[href="https://www.pokerstarslivemanila.com/tournaments/current-schedule/"]').count(), 1);
  assert.equal(await page.locator('#cal-update-details').isVisible(), false);
  assert.match(await page.textContent("#calendar-list"), /19:00 Manila time/);
  ok("calendar update with no key: index followed, linked schedule opened, 9 events added");

  // A fresh search must reconcile existing records, keep personal fields, and
  // reject a fabricated source even when the rest of the event is well formed.
  const originalId = await page.evaluate(() => {
    const t = tourneys.find((t) => t.name === "Proxy Test Event 1");
    t.planning = true; t.notes = "My travel plan";
    const original = window.pokerhqOpenAiCall;
    window.pokerhqOpenAiCall = async (payload) => {
      const result = await original(payload);
      if (payload.kind === "responses" && !payload.body.text.format.schema.properties.schedules) {
        const parsed = JSON.parse(result.data.output_text);
        parsed.events[0].buyin = 5000;
        parsed.events[0].time = "20:30";
        parsed.events[0].gtd = "PHP 200,000";
        parsed.events.push({...parsed.events[0], name: "Fabricated source", url: "https://not-retrieved.example/event"});
        result.data.output_text = JSON.stringify(parsed);
      }
      return result;
    };
    window.__proxyCalls.length = 0;
    localStorage.removeItem("pokerhq_cal_update_ts");
    return t.id;
  });
  await page.evaluate(() => runCalendarUpdate());
  assert.match(await page.textContent("#cal-update-status"), /Added 0 event\(s\) · Updated 9 event\(s\)/);
  assert.match(await page.textContent("#cal-update-status"), /Skipped 9/);
  await page.click('#cal-update-details summary');
  assert.equal(await page.locator('#cal-update-skips li').count(), 9);
  assert.match(await page.textContent('#cal-update-skips'), /Fabricated source.*source not found in search results/);
  assert.equal(await page.locator('#cal-update-skips a').first().getAttribute('rel'), 'noopener noreferrer');
  await page.locator('#cal-update-details').screenshot({path: out('event-search-skips-desktop.png')});
  await page.setViewportSize({width: 390, height: 844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator('#cal-update-details').screenshot({path: out('event-search-skips-phone.png')});
  await page.setViewportSize({width: 1200, height: 1000});
  const changed = await page.evaluate((id) => ({...tourneys.find((t) => t.id === id), count: tourneys.length}), originalId);
  assert.equal(changed.count, 9);
  assert.equal(changed.planning, true);
  assert.equal(changed.notes, "My travel plan");
  assert.equal(changed.buyin, 5000);
  assert.equal(changed.time, "20:30");
  assert.equal(changed.gtd, "PHP 200,000");
  await page.click('#undo-toast .toast-btn');
  const restored = await page.evaluate((id) => tourneys.find((t) => t.id === id), originalId);
  assert.equal(restored.buyin, 3000);
  assert.equal(restored.time, "19:00");
  assert.equal(restored.planning, true);
  assert.equal(restored.notes, "My travel plan");
  ok("rerun: 9 details updated without duplicates, unsearched URLs rejected, personal fields preserved through Undo");

  // it still works from a Cloud Function error: message is shown, button re-enabled
  await page.evaluate(() => {
    localStorage.removeItem("pokerhq_cal_update_ts");
    window.pokerhqOpenAiCall = async () => { const e = new Error("The server's OpenAI key was rejected (401) — update the OPENAI_API_KEY secret"); e.code = "functions/failed-precondition"; throw e; };
  });
  await page.evaluate(() => runCalendarUpdate());
  await page.waitForFunction(() => /✗/.test(document.getElementById("cal-update-status").textContent), null, { timeout: 20000 });
  assert.match(await page.textContent("#cal-update-status"), /OPENAI_API_KEY secret/);
  assert.equal(await page.evaluate(() => document.getElementById("cal-update-btn").disabled), false);
  assert.match(await page.textContent('#cal-update-skips'), /Search failed.*OPENAI_API_KEY secret/);
  ok("a server-side failure is shown plainly and the button recovers");

  await page.evaluate(() => {
    showCalendarSearchDetails([
      calendarSkip({name: '<img src=x onerror="window.__skipInjected=true">', url: 'javascript:alert(1)'}, 'Missing buy-in'),
      calendarSkip({name: 'Final — ₱200K GTD', date: '2026-11-20', url: 'https://example.com/schedule'}, 'Source review: Continuation; no new entry', 'PokerStars LIVE Manila')
    ]);
    document.getElementById('cal-update-details').open = true;
    PokerHQPrivacy.setManual(true);
  });
  assert.equal(await page.locator('#cal-update-skips img').count(), 0);
  assert.equal(await page.locator('#cal-update-skips a').count(), 1, 'unsafe URLs have no link');
  assert.equal(await page.evaluate(() => !!window.__skipInjected), false);
  await page.waitForFunction(() => !document.getElementById('cal-update-skips').textContent.includes('₱200K'));
  await page.evaluate(() => { PokerHQPrivacy.setManual(false); toggleTheme(); });
  await page.locator('#cal-update-details').screenshot({path: out('event-search-skips-light.png')});
  await page.evaluate(() => toggleTheme());
  ok('skip details render as text, reject unsafe links and respect Privacy Mode');

  // voice: gating no longer demands a browser key, and transcription goes via the proxy
  await page.evaluate(() => {
    window.pokerhqOpenAiCall = async (payload) => { window.__proxyCalls.push(payload); return { data: { text: "Raised pocket kings, villain shoved" } }; };
    window.__proxyCalls.length = 0;
    switchGroup("play", "hands"); openModal("modal-voice");
  });
  await page.evaluate(() => toggleVoiceRecording());
  const gateMsg = await page.textContent("#voice-error");
  assert.ok(!/Add your OpenAI key|Sign in with the owner/.test(gateMsg), "not blocked for lack of a key: " + gateMsg);
  await page.evaluate(async () => {
    window._voiceMediaRecorder = { mimeType: "audio/webm;codecs=opus" };
    window._voiceChunks = [new Blob([new Uint8Array(2000).fill(9)], { type: "audio/webm;codecs=opus" })];
    await transcribeVoiceRecording();
  });
  assert.match(await page.inputValue("#voice-transcript"), /pocket kings/);
  const sent = await page.evaluate(() => window.__proxyCalls[0]);
  assert.equal(sent.kind, "transcribe");
  assert.equal(sent.mime, "audio/webm;codecs=opus");
  assert.equal(sent.model, "gpt-4o-mini-transcribe");
  assert.ok(sent.audioBase64.length > 2000);
  assert.match(await page.textContent("#voice-record-status, .voice-status, #voice-status").catch(() => ""), /|Transcribed/);
  ok("voice: no key needed; recording uploaded as base64 (" + sent.audioBase64.length + " chars) and transcript filled in");

  // signed out + no key → the old guidance
  await page.evaluate(() => { window.__pokerhqAuthUid = null; document.getElementById("voice-error").style.display = "none"; });
  await page.evaluate(() => toggleVoiceRecording());
  assert.match(await page.textContent("#voice-error"), /Sign in with the owner account, or add your OpenAI key/);
  await page.evaluate(() => { window.__pokerhqAuthUid = window.__authUidBackup; });
  ok("signed out with no key: clear instructions");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
  console.log("\nALL KEYLESS OPENAI CHECKS PASSED");
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
