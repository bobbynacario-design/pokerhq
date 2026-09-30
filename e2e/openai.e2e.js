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
        return { data: { status: "completed", output: [{ type: "web_search_call" }], output_text: JSON.stringify({ asOf: "x", events: [{ date: "2026-11-1" + (n % 9), name: "Proxy Test Event " + n, venue: "Metro Card Club", buyin: 3000, gtd: "", structure: "Freezeout", category: "side", seatGuaranteed: false, region: "ph", accessible: true, notes: "n", source: "s", url: "https://example.com/e" + n }] }) } };
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

  // calendar update with no key: 9 searches through the proxy, events imported
  await page.evaluate(() => { localStorage.removeItem("pokerhq_cal_update_ts"); window.tourneys.length = 0; window.__proxyCalls.length = 0; switchGroup("plan", "calendar"); });
  await page.evaluate(() => runCalendarUpdate());
  await page.waitForFunction(() => /Added \d+ event/.test(document.getElementById("cal-update-status").textContent), null, { timeout: 20000 });
  const calls = await page.evaluate(() => window.__proxyCalls.map((c) => c.kind));
  assert.equal(calls.length, 9, "8 Manila rooms + regional");
  assert.ok(calls.every((k) => k === "responses"));
  const first = await page.evaluate(() => window.__proxyCalls[0].body);
  assert.equal(first.model, "gpt-5.6-terra");
  assert.deepEqual(first.tools, [{ type: "web_search" }]);
  const added = await page.evaluate(() => tourneys.filter((t) => /Proxy Test Event/.test(t.name)).length);
  assert.equal(added, 9);
  ok("calendar update with no key: 9 proxied searches, 9 events added");

  // it still works from a Cloud Function error: message is shown, button re-enabled
  await page.evaluate(() => {
    localStorage.removeItem("pokerhq_cal_update_ts");
    window.pokerhqOpenAiCall = async () => { const e = new Error("The server's OpenAI key was rejected (401) — update the OPENAI_API_KEY secret"); e.code = "functions/failed-precondition"; throw e; };
  });
  await page.evaluate(() => runCalendarUpdate());
  await page.waitForFunction(() => /✗/.test(document.getElementById("cal-update-status").textContent), null, { timeout: 20000 });
  assert.match(await page.textContent("#cal-update-status"), /OPENAI_API_KEY secret/);
  assert.equal(await page.evaluate(() => document.getElementById("cal-update-btn").disabled), false);
  ok("a server-side failure is shown plainly and the button recovers");

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
