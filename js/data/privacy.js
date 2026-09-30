"use strict";

// Privacy Mode: hides money on screen (bankroll, wallet, buy-ins, prizes, P&L,
// staking) for when someone can see your screen. Loaded as a classic script
// (window.PokerHQPrivacy) and importable from Node for tests/privacy.test.js.
//
// How it works, and why nothing is missed: the app writes every amount as text with
// a peso sign (₱1,234, −₱500, +₱6,000, ₱1.5k) or "PHP 1,234" in the staking report.
// Rather than patching each of the ~60 places that print one, this watches the whole
// page and swaps any such amount for "₱•••" while Privacy Mode is on (text, charts
// drawn as SVG text, tooltips, aria labels, pop-up messages), and restores the real
// text when it is turned off. Form boxes that hold a saved amount carry data-money
// and are blurred. tests/privacy.test.js and e2e/privacy.e2e.js are the checklist.
//
// Not covered on purpose: the JSON backup (a backup must be complete), and files you
// export (CSV, PDF), which ask first instead: see confirmExport.
(function (root) {
  var STORAGE_KEY = "pokerhq_privacy_v1";
  var MASK = "₱•••";

  // ₱1,234  ₱ 1,234  −₱500  +₱6,000  ₱1.5k  ₱2M  PHP 1,234  +PHP 500  -PHP 500  1,234 PHP
  // A sign only counts when it touches the amount, so "for ₱500" keeps its space.
  var MONEY_SOURCE = "(?:[+\\-\\u2212\\u2013]\\s?)?(?:\\u20B1|PHP\\s?)\\s?\\d(?:[\\d,]*\\d)?(?:\\.\\d+)?(?:[kKmM]\\b)?" +
    "|\\b\\d(?:[\\d,]*\\d)?(?:\\.\\d+)?\\s?PHP\\b";

  function maskText(text) {
    if (typeof text !== "string" || !text) return text;
    return text.replace(new RegExp(MONEY_SOURCE, "g"), MASK);
  }
  function hasMoney(text) {
    return typeof text === "string" && new RegExp(MONEY_SOURCE).test(text);
  }

  // Settings live on this device only (a display preference, not data): {manual, auto}.
  //   manual: the header eye is switched on
  //   auto:   also hide while a session is running
  function normalizeSettings(raw) {
    var s = raw && typeof raw === "object" ? raw : {};
    return { manual: s.manual === true, auto: s.auto === true };
  }

  // What the screen should do right now. `override` is the player revealing amounts
  // mid-session on purpose; it lasts until that session ends.
  function isHidden(settings, sessionActive, override) {
    var s = normalizeSettings(settings);
    return s.manual || (s.auto && !!sessionActive && !override);
  }

  // The eye button's next state: what it changes when clicked while `hidden`.
  function afterToggle(settings, sessionActive, override) {
    var s = normalizeSettings(settings);
    var hidden = isHidden(s, sessionActive, override);
    if (hidden) {
      // reveal: drop the manual switch; if only the session rule was hiding, override it until the session ends
      return { settings: { manual: false, auto: s.auto }, override: s.auto && !!sessionActive };
    }
    return { settings: { manual: true, auto: s.auto }, override: false };
  }

  // Files that leave the app carry real amounts. With Privacy Mode on, ask first.
  function exportWarning(what) {
    return "Privacy Mode is on, but this " + what + " will contain your real amounts.\n\nExport it anyway?";
  }

  var api = {
    MASK: MASK,
    STORAGE_KEY: STORAGE_KEY,
    MONEY_SOURCE: MONEY_SOURCE,
    maskText: maskText,
    hasMoney: hasMoney,
    normalizeSettings: normalizeSettings,
    isHidden: isHidden,
    afterToggle: afterToggle,
    exportWarning: exportWarning
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (!root || typeof root !== "object" || typeof root.document === "undefined") return;

  // ── browser part ──
  var doc = root.document;
  var settings = normalizeSettings(null);
  var sessionActive = false;
  var override = false;
  var hidden = false;
  var observer = null;
  var originalText = new Map();   // text node -> the real text it held before it was masked
  var originalAttr = new Map();   // element -> {attribute: real value}
  var ATTRS = ["title", "aria-label", "placeholder", "alt", "aria-valuetext"];
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
  var nativeDialogs = {};

  try { settings = normalizeSettings(JSON.parse(root.localStorage.getItem(STORAGE_KEY))); } catch (e) {}

  function persist() {
    try { root.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  // A node is only ever changed here, or by the app. When the observer reports a change we
  // made ourselves (the node holds exactly the masked form of what we saved) there is nothing to do;
  // when the app has since replaced the text, the old saved text must not come back on restore.
  function maskTextNode(node) {
    var parent = node.parentNode;
    if (parent && parent.nodeType === 1 && SKIP[parent.tagName]) return;
    var before = node.nodeValue;
    var known = originalText.get(node);
    if (known !== undefined && before === maskText(known)) return;
    var after = maskText(before);
    if (after !== before) {
      originalText.set(node, before);
      node.nodeValue = after;
    } else if (known !== undefined) {
      originalText.delete(node);
    }
  }

  function maskAttributes(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var name = ATTRS[i];
      if (!el.hasAttribute(name)) continue;
      var before = el.getAttribute(name);
      var saved = originalAttr.get(el);
      var known = saved ? saved[name] : undefined;
      if (known !== undefined && before === maskText(known)) continue;
      var after = maskText(before);
      if (after !== before) {
        if (!saved) { saved = {}; originalAttr.set(el, saved); }
        saved[name] = before;
        el.setAttribute(name, after);
      } else if (known !== undefined) {
        delete saved[name];
      }
    }
  }

  function maskTree(node) {
    if (!node) return;
    if (node.nodeType === 3) { maskTextNode(node); return; }
    if (node.nodeType !== 1 || SKIP[node.tagName]) return;
    maskAttributes(node);
    var walker = doc.createTreeWalker(node, 1 | 4, {
      acceptNode: function (n) {
        if (n.nodeType === 1) {
          if (SKIP[n.tagName]) return 2;        // reject: skip this element and everything in it
          maskAttributes(n);
          return 3;                             // skip the element itself, keep walking its children
        }
        return 1;                               // accept text
      }
    });
    var current;
    while ((current = walker.nextNode())) maskTextNode(current);
  }

  function restoreAll() {
    originalText.forEach(function (real, node) { if (node.isConnected) node.nodeValue = real; });
    originalText.clear();
    originalAttr.forEach(function (saved, el) {
      if (!el.isConnected) return;
      Object.keys(saved).forEach(function (name) { el.setAttribute(name, saved[name]); });
    });
    originalAttr.clear();
  }

  function onMutations(records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === "characterData") maskTextNode(r.target);
      else if (r.type === "attributes") { if (r.target.nodeType === 1) maskAttributes(r.target); }
      else for (var j = 0; j < r.addedNodes.length; j++) maskTree(r.addedNodes[j]);
    }
  }

  // Pop-up boxes (alert / confirm / prompt) are outside the page: mask their text too.
  function wrapDialogs() {
    ["alert", "confirm", "prompt"].forEach(function (name) {
      if (nativeDialogs[name] || typeof root[name] !== "function") return;
      var original = root[name];
      nativeDialogs[name] = original;
      root[name] = function (message) {
        var args = Array.prototype.slice.call(arguments);
        if (hidden) args[0] = maskText(String(message));
        return original.apply(root, args);
      };
    });
  }

  function updateUi() {
    if (doc.body) doc.body.classList.toggle("privacy-on", hidden);
    var btn = doc.getElementById("privacy-toggle");
    if (btn) {
      btn.classList.toggle("active", hidden);
      btn.setAttribute("aria-pressed", hidden ? "true" : "false");
      btn.title = hidden ? "Privacy Mode is ON: amounts are hidden. Click to show them." : "Privacy Mode is off. Click to hide amounts on screen.";
      btn.innerHTML = hidden ? EYE_OFF : EYE;
    }
    var sw = doc.getElementById("privacy-switch");
    if (sw) sw.checked = settings.manual;
    var auto = doc.getElementById("privacy-auto");
    if (auto) auto.checked = settings.auto;
    var status = doc.getElementById("privacy-status");
    if (status) {
      status.textContent = hidden
        ? (settings.manual ? "Amounts are hidden." : "Amounts are hidden while your session runs.")
        : (override ? "Amounts are showing for the rest of this session." : "Amounts are showing.");
    }
  }

  function refresh() {
    var next = isHidden(settings, sessionActive, override);
    if (next !== hidden) {
      hidden = next;
      if (hidden) {
        wrapDialogs();
        maskTree(doc.body);
        if (!observer && typeof root.MutationObserver === "function") {
          observer = new root.MutationObserver(onMutations);
        }
        if (observer) observer.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
      } else {
        if (observer) observer.disconnect();
        restoreAll();
      }
    }
    updateUi();
  }

  var EYE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  root.PokerHQPrivacy = Object.assign(api, {
    // the header eye
    toggle: function () {
      var next = afterToggle(settings, sessionActive, override);
      settings = next.settings;
      override = next.override;
      persist();
      refresh();
    },
    // the Home card: the switch and "hide while a session is running"
    setManual: function (on) { settings = { manual: !!on, auto: settings.auto }; if (on) override = false; persist(); refresh(); },
    setAuto: function (on) { settings = { manual: settings.manual, auto: !!on }; if (!on) override = false; persist(); refresh(); },
    // called by the active-session code whenever a session starts or ends
    setSessionActive: function (active) {
      active = !!active;
      if (active === sessionActive) return;
      sessionActive = active;
      if (!active) override = false;
      refresh();
    },
    isHidden: function () { return hidden; },
    settings: function () { return { manual: settings.manual, auto: settings.auto }; },
    // ask before a file with real amounts leaves the app; true = go ahead
    confirmExport: function (what) {
      if (!hidden) return true;
      return root.confirm(exportWarning(what));
    },
    refresh: refresh
  });

  function start() { refresh(); }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();
})(typeof window !== "undefined" ? window : undefined);
