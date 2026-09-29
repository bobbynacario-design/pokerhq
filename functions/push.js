"use strict";

// Pure logic for phone notifications (Web Push) — which events are due, what the
// message says, and how device subscriptions are stored. No Firebase / web-push
// imports so it is unit-tested in tests/push.test.js; index.js does the I/O.

const crypto = require("crypto");
const E = require("./events");

const APP_URL = "https://bobbynacario-design.github.io/pokerhq/";
const LEAD_CHOICES = [30, 60, 120];
const DEFAULT_LEAD_MINUTES = 60;
const MAX_DEVICES = 10;
const DIGEST_FROM_HOUR = 8;    // Manila: the morning summary goes out from 08:00…
const DIGEST_UNTIL_HOUR = 12;  // …and is skipped if the first run of the day is after noon
const SENT_KEEP_DAYS = 14;

// Settings live in the synced reminderSettings object. Both alert types are on
// by default so enabling notifications on a device just works.
function pushPrefs(settings) {
  const s = settings && typeof settings === "object" ? settings : {};
  const lead = Number(s.pushLeadMinutes);
  return {
    startAlerts: s.pushStartAlerts !== false,
    morning: s.pushMorning !== false,
    leadMinutes: LEAD_CHOICES.includes(lead) ? lead : DEFAULT_LEAD_MINUTES,
  };
}

// ── device subscriptions ────────────────────────────────────────────────────
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

// A PushSubscription.toJSON() from the browser: an https endpoint plus the two keys.
function isValidSubscription(sub) {
  if (!sub || typeof sub !== "object") return false;
  if (typeof sub.endpoint !== "string" || sub.endpoint.length > 1500) return false;
  let url;
  try {
    url = new URL(sub.endpoint);
  } catch (e) {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const keys = sub.keys;
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return false;
  return B64URL.test(keys.p256dh) && B64URL.test(keys.auth) && keys.p256dh.length <= 200 && keys.auth.length <= 100;
}

// Firestore field names can't contain dots/slashes, so key devices by a hash of the endpoint.
function subscriptionId(endpoint) {
  return crypto.createHash("sha256").update(String(endpoint)).digest("hex").slice(0, 24);
}

function cleanDeviceLabel(label) {
  return String(label || "").replace(/[^\w .()+-]/g, "").trim().slice(0, 60) || "Device";
}

// Returns {subscriptions, dropped}: the new map with `sub` stored (replacing the
// same device), evicting the oldest devices beyond MAX_DEVICES.
function upsertSubscription(subs, sub, device, now) {
  const next = Object.assign({}, subs || {});
  const id = subscriptionId(sub.endpoint);
  next[id] = {
    endpoint: sub.endpoint,
    keys: {p256dh: sub.keys.p256dh, auth: sub.keys.auth},
    device: cleanDeviceLabel(device),
    created: (next[id] && next[id].created) || now,
    updated: now,
  };
  const dropped = [];
  const ids = Object.keys(next);
  if (ids.length > MAX_DEVICES) {
    ids.sort((a, b) => (next[a].created || 0) - (next[b].created || 0));
    ids.slice(0, ids.length - MAX_DEVICES).forEach((old) => {
      if (old !== id) { delete next[old]; dropped.push(old); }
    });
  }
  return {subscriptions: next, dropped};
}

// ── what to send ────────────────────────────────────────────────────────────
function peso(n) {
  const v = Math.round(Number(n) || 0);
  return v ? "₱" + v.toLocaleString("en-PH") : "";
}

// "19:00" → "7:00 PM"
function timeLabel(t) {
  const hm = E.eventTimeOf(t);
  if (!hm) return "";
  const [h, m] = hm.split(":").map(Number);
  return ((h % 12) || 12) + ":" + (m < 10 ? "0" : "") + m + (h < 12 ? " AM" : " PM");
}

function eventKey(t, ymd) {
  return String((t && (t.id !== undefined ? t.id : t.name)) || "") + "|" + ymd;
}

// Events you marked "planning" that start within the next `leadMinutes` and
// haven't been alerted yet. `sent` is {key: timestamp}.
function selectStartingSoon(opts) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const lead = opts.leadMinutes || DEFAULT_LEAD_MINUTES;
  const sent = opts.sent || {};
  const out = [];
  (opts.tourneys || []).forEach((t) => {
    if (!t || t.planning !== true) return;
    const start = E.eventStartInstant(t);
    if (!start) return;
    const diff = start.getTime() - now.getTime();
    if (diff <= 0) return;
    const minutes = Math.max(1, Math.round(diff / 60000));
    if (minutes > lead) return;
    const key = eventKey(t, E.manilaYMD(start));
    if (sent[key]) return;
    out.push({event: t, key, minutes, start});
  });
  out.sort((a, b) => a.start - b.start);
  return out;
}

// Today's playable events, once per Manila day, in the morning window.
function selectDigest(opts) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const hour = E.manilaHour(now);
  if (hour < DIGEST_FROM_HOUR || hour >= DIGEST_UNTIL_HOUR) return null;
  const today = E.manilaYMD(now);
  if (opts.sentDigest === today) return null;
  const events = (opts.tourneys || []).filter((t) => {
    if (!t || t.status === "skip") return false;
    const start = E.parseStart(t);
    return !!start && E.manilaYMD(start) === today;
  });
  if (!events.length) return null;
  events.sort((a, b) => {
    if (!!b.planning !== !!a.planning) return b.planning ? 1 : -1;   // planning first
    const ta = E.eventTimeOf(a) || "99:99", tb = E.eventTimeOf(b) || "99:99";
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
  return {ymd: today, events};
}

function buildStartingSoonPayload(event, minutes) {
  const when = minutes < 60 ? minutes + " min" : (Math.round((minutes / 60) * 10) / 10) + " h";
  const body = [timeLabel(event), event.venue, peso(event.buyin), event.gtd ? "GTD " + event.gtd : ""].filter(Boolean).join(" · ");
  return {
    title: (event.name || "Tournament") + " starts in " + when,
    body: body || "Time to get ready.",
    tag: "start-" + String(event.id !== undefined ? event.id : event.name),
    url: APP_URL,
    kind: "start",
  };
}

function buildDigestPayload(events, ymd) {
  const line = (t) => {
    const bits = [timeLabel(t), peso(t.buyin)].filter(Boolean).join(" · ");
    return (t.name || "Tournament") + (bits ? " (" + bits + ")" : "");
  };
  const shown = events.slice(0, 3).map(line);
  if (events.length > 3) shown.push("+" + (events.length - 3) + " more");
  return {
    title: events.length === 1 ? "1 tournament today" : events.length + " tournaments today",
    body: shown.join("\n"),
    tag: "digest-" + ymd,
    url: APP_URL,
    kind: "digest",
  };
}

// Drop sent-markers older than SENT_KEEP_DAYS so the state doc stays small.
function pruneSent(sent, nowMs) {
  const cutoff = nowMs - SENT_KEEP_DAYS * 86400000;
  const out = {};
  Object.keys(sent || {}).forEach((k) => {
    if (sent[k] > cutoff) out[k] = sent[k];
  });
  return out;
}

module.exports = {
  APP_URL,
  LEAD_CHOICES,
  DEFAULT_LEAD_MINUTES,
  MAX_DEVICES,
  pushPrefs,
  isValidSubscription,
  subscriptionId,
  cleanDeviceLabel,
  upsertSubscription,
  timeLabel,
  selectStartingSoon,
  selectDigest,
  buildStartingSoonPayload,
  buildDigestPayload,
  pruneSent,
};
