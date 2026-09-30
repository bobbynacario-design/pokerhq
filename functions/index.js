"use strict";

// PokerHQ Cloud Functions — two independent pieces on the shared pokerhq-a67e4
// project:
//
// 1. pokerhqEventReminders — scheduled daily at 08:00 Asia/Manila. Reads the
//    owner's tournaments and reminder settings straight from Firestore (Admin
//    SDK, bypasses security rules), finds playable events starting within the
//    lead window that haven't been emailed yet, and sends one digest email via
//    Resend. Dedupe state lives in a state doc.
//
// 2. pokerhqAiCall — callable proxy so the Anthropic API key never has to live
//    in the browser. Owner-only (checks the signed-in Firebase Auth email,
//    mirroring the Firestore rules' isBobGoogleAccount check); forwards the
//    client's Messages API request body to Anthropic using a server-held
//    secret and returns the response. The client falls back to this only when
//    no local BYOK key is stored — see js/data/ai-proxy.js.
//
// 2b. pokerhqOpenAiCall — the same idea for OpenAI: forwards the calendar
//    update's Responses request and voice-capture transcription using a
//    server-held OPENAI_API_KEY secret, so neither needs a key pasted on every
//    device. Requests are checked against strict allowlists (openai-proxy.js).
//
// 2c. pokerhqPush + pokerhqPushAlerts — phone notifications (Web Push / VAPID).
//    pokerhqPush is the owner-only callable the app uses to enable a device
//    (returns the public key, stores the subscription, sends a test). The VAPID
//    keypair is generated on first use and kept in pokerhq-server/vapid — a
//    collection the client rules deny — so there is nothing to configure.
//    pokerhqPushAlerts runs every 15 minutes: "starting soon" for events marked
//    planning, plus a morning summary of today's events. Logic: push.js.
//
// 3. pokerhqWeeklyBackup — scheduled Sundays 03:00 Asia/Manila. Snapshots all
//    of the owner's app documents into one JSON file in Cloud Storage
//    (pokerhq-backups/weekly/), in the same format as the app's JSON BACKUP
//    button so it can be loaded with RESTORE JSON. Keeps the newest 8 distinct
//    versions; skips an empty profile and a week identical to the last backup.
//    Pure logic lives in backup.js (unit-tested).
//
// Deployed as its own codebase ("pokerhq") and always with explicitly named
// targets, e.g.
//   firebase deploy --only functions:pokerhq:pokerhqEventReminders,functions:pokerhq:pokerhqAiCall,functions:pokerhq:pokerhqWeeklyBackup
// so it can never delete other apps' functions on this shared project.

const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");
const backup = require("./backup");
const openaiProxy = require("./openai-proxy");
const webpush = require("web-push");
const push = require("./push");

initializeApp();
const db = getFirestore();

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
// Falls back to Resend's shared onboarding@resend.dev sender (weak deliverability,
// can be rate-limited/cut off) until a domain is verified at resend.com/domains.
// Once verified, override by adding a line to functions/.env (Functions v2 loads
// it automatically at deploy time; not committed):
//   RESEND_FROM_ADDRESS=PokerHQ <reminders@yourdomain.com>
const RESEND_FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || "PokerHQ <onboarding@resend.dev>";

const PROFILE = "pokerhq-bob";
const APP_URL = "https://bobbynacario-design.github.io/pokerhq/";

// Date helpers live in events.js (shared with the push alerts, unit-tested).
const {parseStart, manilaYMD, ymdToUTC} = require("./events");

// App docs are stored as { value: JSON.stringify(data), updated }.
async function readValue(key, fallback) {
  const snap = await db.collection(PROFILE).doc(key).get();
  if (!snap.exists) return fallback;
  try {
    return JSON.parse(snap.data().value);
  } catch (e) {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function peso(n) {
  const v = Math.round(Number(n) || 0);
  return "₱" + v.toLocaleString("en-PH");
}

function buildEmail(due) {
  const FONT = "font-family:Arial,Helvetica,sans-serif;";
  const rows = due.map((d) => {
    const t = d.t;
    const when = d.daysUntil === 0 ? "Today" : d.daysUntil === 1 ? "Tomorrow" : "In " + d.daysUntil + " days";
    const tag = t.status === "target" ? "TARGET" : "STRETCH";
    const tagColor = t.status === "target" ? "#1a7a40" : "#a07820";
    const meta = [t.venue, t.buyin ? peso(t.buyin) : "", t.gtd ? "GTD " + t.gtd : ""].filter(Boolean).map(escapeHtml).join(" · ");
    return (
      `<tr><td style="padding:14px 0;border-bottom:1px solid #eee;">` +
      `<div style="${FONT}font-size:12px;color:#a07820;font-weight:700;">${escapeHtml(when)} · ${tag}</div>` +
      `<div style="${FONT}font-size:16px;color:#14110a;font-weight:700;margin:2px 0;">${escapeHtml(t.name || "Tournament")}</div>` +
      `<div style="${FONT}font-size:13px;color:#555;">${meta}</div>` +
      `<span style="display:none;color:${tagColor}">.</span>` +
      `</td></tr>`
    );
  }).join("");

  const subject = "PokerHQ — " + due.length + " tournament" + (due.length > 1 ? "s" : "") + " coming up";
  const html =
    `<table role="presentation" width="100%" bgcolor="#f6f4ee" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px;">` +
    `<table role="presentation" width="560" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">` +
    `<tr><td style="background:#14110a;padding:22px 28px;">` +
    `<span style="font-family:Arial,sans-serif;font-size:20px;font-weight:800;color:#c9a84c;">♠ PokerHQ</span>` +
    `<span style="font-family:Arial,sans-serif;font-size:12px;color:rgba(255,255,255,.6);margin-left:8px;">Tournament reminders</span>` +
    `</td></tr>` +
    `<tr><td style="padding:24px 28px 8px;">` +
    `<h1 style="font-family:Arial,sans-serif;font-size:20px;color:#14110a;margin:0 0 4px;">Upcoming on your slate</h1>` +
    `<p style="font-family:Arial,sans-serif;font-size:14px;color:#555;margin:0;">Target and stretch events starting soon. Plan your satellites accordingly.</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">${rows}</table>` +
    `</td></tr>` +
    `<tr><td style="padding:8px 28px 28px;" align="center">` +
    `<a href="${APP_URL}" style="font-family:Arial,sans-serif;display:inline-block;background:#c9a84c;color:#14110a;font-weight:700;font-size:14px;text-decoration:none;padding:11px 22px;border-radius:8px;">Open PokerHQ</a>` +
    `</td></tr>` +
    `<tr><td style="padding:0 28px 24px;"><p style="font-family:Arial,sans-serif;font-size:11px;color:#9a917c;margin:0;">Sent by PokerHQ because event reminders are on. Turn them off on the Calendar tab.</p></td></tr>` +
    `</table></td></tr></table>`;
  return {subject, html};
}

async function sendViaResend(apiKey, from, to, subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {"Authorization": "Bearer " + apiKey, "Content-Type": "application/json"},
    body: JSON.stringify({from, to: [to], subject, html}),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error("Resend " + res.status + ": " + body.slice(0, 300));
  }
  return res.json();
}

exports.pokerhqEventReminders = onSchedule(
  {
    schedule: "every day 08:00",
    timeZone: "Asia/Manila",
    region: "asia-southeast1",
    secrets: [RESEND_API_KEY],
  },
  async () => {
    const settings = await readValue("reminderSettings", null);
    if (!settings || settings.enabled !== true || !settings.email) {
      logger.info("Reminders off or no recipient; nothing to do.");
      return;
    }
    const leadDays = Math.max(0, Math.min(14, parseInt(settings.leadDays, 10) || 1));
    const tourneys = await readValue("tourneys", []) || [];

    const stateSnap = await db.collection(PROFILE).doc("reminderState").get();
    const sent = (stateSnap.exists && stateSnap.data().sent) || {};

    const todayYMD = manilaYMD(new Date());
    const due = [];
    tourneys.forEach((t) => {
      if (!t || t.status === "skip") return;
      const start = parseStart(t);
      if (!start) return;
      const eventYMD = manilaYMD(start);
      const daysUntil = Math.round((ymdToUTC(eventYMD) - ymdToUTC(todayYMD)) / 86400000);
      if (daysUntil < 0 || daysUntil > leadDays) return;
      const key = String(t.id || t.name) + "|" + eventYMD;
      if (sent[key]) return;
      due.push({t, key, daysUntil, eventYMD});
    });

    if (!due.length) {
      logger.info("No new due events.");
      return;
    }
    due.sort((a, b) => a.daysUntil - b.daysUntil);

    const {subject, html} = buildEmail(due);
    await sendViaResend(RESEND_API_KEY.value(), RESEND_FROM_ADDRESS, settings.email, subject, html);

    const cutoff = Date.now() - 60 * 86400000;
    const pruned = {};
    Object.keys(sent).forEach((k) => {
      if (sent[k] > cutoff) pruned[k] = sent[k];
    });
    due.forEach((d) => {
      pruned[d.key] = Date.now();
    });
    await db.collection(PROFILE).doc("reminderState").set({sent: pruned, updated: Date.now()});
    logger.info("Sent reminder for " + due.length + " event(s) to " + settings.email);
  },
);

// ─────────────────────────────────────────────────────────────────────────
// pokerhqAiCall — owner-only Anthropic Messages API proxy.
// ─────────────────────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const OWNER_EMAIL = "bobbynacario@gmail.com";
// Kept in sync with the models the client's Anthropic features send
// (strategy.js: claude-opus-4-8; hands.js/review.js: claude-sonnet-4-6). The
// calendar update no longer goes through here — it calls OpenAI directly.
// tests/ai-config.test.js fails if a client model or max_tokens would be
// rejected by this proxy, so update both together.
const ALLOWED_MODELS = new Set(["claude-opus-4-8", "claude-sonnet-4-6"]);
const MAX_TOKENS_CEILING = 20000;

// Signed-in owner with a verified email — the same rule the Firestore rules use.
function assertOwner(request) {
  const token = request.auth && request.auth.token;
  const email = token && token.email ? String(token.email).toLowerCase() : "";
  if (!token || email !== OWNER_EMAIL || token.email_verified !== true) {
    throw new HttpsError("permission-denied", "Not authorized for PokerHQ AI access.");
  }
}

exports.pokerhqAiCall = onCall(
  {
    region: "asia-southeast1",
    secrets: [ANTHROPIC_API_KEY],
    // Web-search research can run well past the 60s callable default.
    timeoutSeconds: 300,
  },
  async (request) => {
    assertOwner(request);

    const body = request.data;
    if (!body || typeof body !== "object" || !Array.isArray(body.messages)) {
      throw new HttpsError("invalid-argument", "Malformed Anthropic request body.");
    }
    if (!ALLOWED_MODELS.has(body.model)) {
      throw new HttpsError("invalid-argument", "Model not permitted through this proxy: " + body.model);
    }
    if (typeof body.max_tokens !== "number" || body.max_tokens <= 0 || body.max_tokens > MAX_TOKENS_CEILING) {
      throw new HttpsError("invalid-argument", "max_tokens out of range.");
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY.value(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new HttpsError("internal", (data && data.error && data.error.message) || ("Anthropic API error " + res.status));
    }
    return data;
  },
);

// ─────────────────────────────────────────────────────────────────────────
// pokerhqOpenAiCall — owner-only OpenAI proxy (Responses API + transcription).
// ─────────────────────────────────────────────────────────────────────────

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

async function readOpenAi(res) {
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (!res.ok) {
    const mapped = openaiProxy.mapOpenAiError(res.status, data && data.error && data.error.message);
    throw new HttpsError(mapped.code, mapped.message);
  }
  return data;
}

exports.pokerhqOpenAiCall = onCall(
  {
    region: "asia-southeast1",
    secrets: [OPENAI_API_KEY],
    // A web-search response can take over a minute; the callable default is 60s.
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (request) => {
    assertOwner(request);
    const data = request.data;
    const kind = data && typeof data === "object" ? data.kind : undefined;
    const auth = {"Authorization": "Bearer " + OPENAI_API_KEY.value()};
    const signal = AbortSignal.timeout(280000);

    if (kind === "responses") {
      const check = openaiProxy.validateResponsesRequest(data.body);
      if (!check.ok) throw new HttpsError("invalid-argument", check.message);
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {...auth, "Content-Type": "application/json"},
        body: JSON.stringify(data.body),
        signal,
      });
      return readOpenAi(res);
    }

    if (kind === "transcribe") {
      const check = openaiProxy.validateTranscribeRequest(data);
      if (!check.ok) throw new HttpsError("invalid-argument", check.message);
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: auth,   // fetch sets the multipart boundary itself
        body: openaiProxy.buildTranscriptionForm(data, check.model),
        signal,
      });
      return readOpenAi(res);
    }

    if (kind === "ping") {
      // Validates the server-held key without spending anything.
      const res = await fetch("https://api.openai.com/v1/models", {headers: auth, signal});
      await readOpenAi(res);
      return {ok: true};
    }

    throw new HttpsError("invalid-argument", "Unknown OpenAI request kind.");
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Phone notifications — pokerhqPush (callable) + pokerhqPushAlerts (scheduled).
// ─────────────────────────────────────────────────────────────────────────

// Server-only data (denied to browsers by the default-deny Firestore rules):
//   pokerhq-server/vapid     {publicKey, privateKey, created}
//   pokerhq-server/pushSubs  {subscriptions: {<endpoint hash>: {endpoint, keys, device, created, updated}}}
//   pokerhq-server/pushState {startSent: {<event|day>: ts}, digestSent: "YYYY-MM-DD"}
const SERVER_COLLECTION = "pokerhq-server";
const vapidRef = () => db.collection(SERVER_COLLECTION).doc("vapid");
const pushSubsRef = () => db.collection(SERVER_COLLECTION).doc("pushSubs");
const pushStateRef = () => db.collection(SERVER_COLLECTION).doc("pushState");

function validVapid(d) {
  return !!d && typeof d.publicKey === "string" && typeof d.privateKey === "string" && d.publicKey.length > 20;
}

// Generate the keypair once. create() fails if two first calls race; the loser
// just reads what the winner wrote, so every device gets the same key.
async function ensureVapid() {
  const snap = await vapidRef().get();
  if (snap.exists && validVapid(snap.data())) return snap.data();
  const keys = webpush.generateVAPIDKeys();
  try {
    await vapidRef().create({publicKey: keys.publicKey, privateKey: keys.privateKey, created: Date.now()});
    return keys;
  } catch (err) {
    const again = await vapidRef().get();
    if (again.exists && validVapid(again.data())) return again.data();
    throw err;
  }
}

async function readSubscriptions() {
  const snap = await pushSubsRef().get();
  return (snap.exists && snap.data().subscriptions) || {};
}

// Send one payload to every stored device (or just `onlyId`). Devices the push
// service reports as gone (404/410) are removed. Returns counts.
async function sendToDevices(payload, opts) {
  const o = opts || {};
  const vapid = await ensureVapid();
  const subs = await readSubscriptions();
  const ids = Object.keys(subs).filter((id) => !o.onlyId || id === o.onlyId);
  const result = {total: ids.length, sent: 0, failed: 0, removed: 0};
  await Promise.all(ids.map(async (id) => {
    try {
      await webpush.sendNotification(
        {endpoint: subs[id].endpoint, keys: subs[id].keys},
        JSON.stringify(payload),
        {
          vapidDetails: {subject: "mailto:" + OWNER_EMAIL, publicKey: vapid.publicKey, privateKey: vapid.privateKey},
          TTL: o.ttl || 3600,
          urgency: o.urgency || "normal",
        },
      );
      result.sent++;
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        await pushSubsRef().update({["subscriptions." + id]: FieldValue.delete()}).catch(() => {});
        result.removed++;
      } else {
        result.failed++;
        logger.warn("Push to " + (subs[id].device || id) + " failed: " + ((err && (err.statusCode || err.message)) || err));
      }
    }
  }));
  return result;
}

exports.pokerhqPush = onCall(
  {region: "asia-southeast1"},
  async (request) => {
    assertOwner(request);
    const data = request.data && typeof request.data === "object" ? request.data : {};
    const action = data.action;

    if (action === "config") {
      const vapid = await ensureVapid();
      return {publicKey: vapid.publicKey};
    }

    if (action === "subscribe") {
      if (!push.isValidSubscription(data.subscription)) throw new HttpsError("invalid-argument", "That is not a valid push subscription.");
      await ensureVapid();
      const subs = await readSubscriptions();
      const {subscriptions, dropped} = push.upsertSubscription(subs, data.subscription, data.device, Date.now());
      const id = push.subscriptionId(data.subscription.endpoint);
      const update = {["subscriptions." + id]: subscriptions[id]};
      dropped.forEach((old) => { update["subscriptions." + old] = FieldValue.delete(); });
      // set(merge) creates the doc the first time; update() alone would fail on a missing doc.
      if (!Object.keys(subs).length) await pushSubsRef().set({subscriptions: {[id]: subscriptions[id]}}, {merge: true});
      else await pushSubsRef().update(update);
      return {ok: true, id, devices: Object.keys(subscriptions).length};
    }

    if (action === "unsubscribe") {
      const endpoint = data.endpoint;
      if (typeof endpoint !== "string" || !endpoint) throw new HttpsError("invalid-argument", "endpoint is required.");
      const id = push.subscriptionId(endpoint);
      const subs = await readSubscriptions();
      if (subs[id]) await pushSubsRef().update({["subscriptions." + id]: FieldValue.delete()});
      return {ok: true, devices: Math.max(0, Object.keys(subs).length - (subs[id] ? 1 : 0))};
    }

    if (action === "status") {
      const subs = await readSubscriptions();
      const id = typeof data.endpoint === "string" && data.endpoint ? push.subscriptionId(data.endpoint) : "";
      return {subscribed: !!(id && subs[id]), devices: Object.keys(subs).length};
    }

    if (action === "test") {
      const id = typeof data.endpoint === "string" && data.endpoint ? push.subscriptionId(data.endpoint) : undefined;
      const subs = await readSubscriptions();
      if (!Object.keys(subs).length) throw new HttpsError("failed-precondition", "No device is subscribed yet — enable notifications first.");
      const result = await sendToDevices({
        title: "PokerHQ notifications are on",
        body: "You'll get a heads-up before events you're planning to play.",
        tag: "pokerhq-test",
        url: push.APP_URL,
        kind: "test",
      }, {onlyId: id, ttl: 300});
      return result;
    }

    throw new HttpsError("invalid-argument", "Unknown push action.");
  },
);

exports.pokerhqPushAlerts = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "Asia/Manila",
    region: "asia-southeast1",
  },
  async () => {
    const subs = await readSubscriptions();
    if (!Object.keys(subs).length) return;
    const settings = await readValue("reminderSettings", {});
    const prefs = push.pushPrefs(settings);
    if (!prefs.startAlerts && !prefs.morning) return;

    const tourneys = (await readValue("tourneys", [])) || [];
    const stateSnap = await pushStateRef().get();
    const state = stateSnap.exists ? stateSnap.data() : {};
    const startSent = state.startSent || {};
    const now = new Date();
    let digestSent = state.digestSent || "";
    let changed = false;

    // A marker is only recorded once something actually reached a device (or
    // there was nobody to reach), so a failed send is retried on the next run.
    const delivered = (r) => r.sent > 0 || r.total === 0;

    if (prefs.morning) {
      const digest = push.selectDigest({tourneys, now, sentDigest: digestSent});
      if (digest) {
        const r = await sendToDevices(push.buildDigestPayload(digest.events, digest.ymd, {hideAmounts: prefs.hideAmounts}), {ttl: 4 * 3600});
        if (delivered(r)) { digestSent = digest.ymd; changed = true; }
        logger.info("Morning digest: " + JSON.stringify(r));
      }
    }

    if (prefs.startAlerts) {
      const due = push.selectStartingSoon({tourneys, now, leadMinutes: prefs.leadMinutes, sent: startSent});
      for (const item of due) {
        const r = await sendToDevices(push.buildStartingSoonPayload(item.event, item.minutes, {hideAmounts: prefs.hideAmounts}), {urgency: "high", ttl: 1800});
        if (delivered(r)) { startSent[item.key] = now.getTime(); changed = true; }
        logger.info("Starting-soon alert for " + item.key + ": " + JSON.stringify(r));
      }
    }

    if (changed) {
      await pushStateRef().set({startSent: push.pruneSent(startSent, now.getTime()), digestSent, updated: now.getTime()});
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// pokerhqWeeklyBackup — server-side safety copy of the owner's data.
// ─────────────────────────────────────────────────────────────────────────

// Default Firebase Storage bucket for the project. Backups live under the
// pokerhq-backups/ prefix so they never mix with other apps' files. Keep that
// prefix private in the project's Storage rules (the Admin SDK ignores rules).
const BACKUP_BUCKET = process.env.POKERHQ_BACKUP_BUCKET || "pokerhq-a67e4.firebasestorage.app";

exports.pokerhqWeeklyBackup = onSchedule(
  {
    schedule: "every sunday 03:00",
    timeZone: "Asia/Manila",
    region: "asia-southeast1",
    timeoutSeconds: 300,
  },
  async () => {
    const keys = backup.BACKUP_KEYS;
    const snaps = await db.getAll(...keys.map((key) => db.collection(PROFILE).doc(key)));
    const docsByKey = {};
    snaps.forEach((snap, i) => {
      docsByKey[keys[i]] = snap.exists ? snap.data() : undefined;
    });
    const data = backup.buildBackupData(docsByKey);

    if (backup.isEmptyBackupData(data)) {
      // Never rotate good copies out for an empty snapshot.
      logger.warn("Profile is empty — skipping backup so existing copies are kept.");
      return;
    }

    const bucket = getStorage().bucket(BACKUP_BUCKET);
    const [files] = await bucket.getFiles({prefix: backup.BACKUP_PREFIX});
    const newestName = backup.sortBackupNames(files.map((f) => f.name))[0];
    const newest = files.find((f) => f.name === newestName);
    const hash = backup.hashBackupData(data);
    const newestHash = newest && newest.metadata && newest.metadata.metadata && newest.metadata.metadata.dataHash;
    if (newestHash === hash) {
      logger.info("Data unchanged since " + newestName + "; no new backup written.");
      return;
    }

    const now = new Date();
    const name = backup.backupFileName(now);
    const payload = backup.buildBackupPayload(data, {
      now,
      profile: {id: "legacy-default", firestorePath: PROFILE},
    });
    await bucket.file(name).save(JSON.stringify(payload), {
      contentType: "application/json",
      resumable: false,
      metadata: {metadata: {dataHash: hash, source: "pokerhqWeeklyBackup"}},
    });
    logger.info("Wrote backup " + name + " (" + JSON.stringify(payload).length + " bytes).");

    const allNames = Array.from(new Set(files.map((f) => f.name).concat(name)));
    const stale = backup.selectBackupsToDelete(allNames, backup.DEFAULT_KEEP);
    await Promise.all(stale.map((n) => bucket.file(n).delete().catch((err) => {
      logger.warn("Could not delete old backup " + n + ": " + err.message);
    })));
    if (stale.length) logger.info("Pruned " + stale.length + " old backup(s).");
  },
);
