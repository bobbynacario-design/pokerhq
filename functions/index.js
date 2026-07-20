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
// Deployed as its own codebase ("pokerhq") and always with explicitly named
// targets, e.g.
//   firebase deploy --only functions:pokerhqEventReminders,functions:pokerhqAiCall
// so it can never delete other apps' functions on this shared project.

const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");

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

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};
const MONTH_ABBR = {JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11};

// A Date at ~noon Manila on the given calendar day, so day-granular comparisons
// via the Asia/Manila locale are stable regardless of the runner's clock.
function utcNoonManila(y, monthIndex, day) {
  return new Date(Date.UTC(y, monthIndex, day, 4, 0, 0));
}

// Mirrors the app's parseTourneyDateRange (start date only), plus ISO yyyy-mm-dd
// for manually-added events.
function parseStart(t) {
  const s = String((t && t.date) || "");
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return utcNoonManila(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/(\w+)\s+(\d{1,2})\s*[-–]\s*(?:(\w+)\s+)?(\d{1,2}),?\s*(\d{4})/i);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo !== undefined) return utcNoonManila(+m[5], mo, +m[2]);
  }
  m = s.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/i);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo !== undefined) return utcNoonManila(+m[3], mo, +m[2]);
  }
  if (t && t.day && t.month) {
    const mo = MONTH_ABBR[String(t.month).toUpperCase()];
    if (mo !== undefined) return utcNoonManila(new Date().getFullYear(), mo, parseInt(t.day, 10));
  }
  return null;
}

function manilaYMD(d) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function ymdToUTC(ymd) {
  const parts = ymd.split("-").map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

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
// Kept in sync with the models the four client AI features actually send
// (calendar.js/strategy.js: claude-opus-4-8; hands.js/review.js: claude-sonnet-4-6).
// Update alongside any client-side model change.
const ALLOWED_MODELS = new Set(["claude-opus-4-8", "claude-sonnet-4-6"]);
const MAX_TOKENS_CEILING = 20000;

exports.pokerhqAiCall = onCall(
  {
    region: "asia-southeast1",
    secrets: [ANTHROPIC_API_KEY],
  },
  async (request) => {
    const token = request.auth && request.auth.token;
    const email = token && token.email ? String(token.email).toLowerCase() : "";
    if (!token || email !== OWNER_EMAIL || token.email_verified !== true) {
      throw new HttpsError("permission-denied", "Not authorized for PokerHQ AI access.");
    }

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
