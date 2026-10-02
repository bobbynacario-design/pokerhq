"use strict";
// Shared harness for the browser (end-to-end) tests: a tiny static server for the
// repo, a real Chromium, and the in-memory Firebase stand-ins from tests/fakes so
// nothing here touches the internet or your data. Everything else is the app as
// shipped. Run with: npm run test:e2e
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
// Screenshots and other files a suite writes go here (CI uploads it when a run fails).
const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), "pokerhq-e2e");
fs.mkdirSync(OUT, { recursive: true });
const out = (name) => path.join(OUT, name);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };

// The sign-in the harness performs (the fake auth module hands the app this user).
const OWNER = { uid: "u1", email: "bobbynacario@gmail.com", isAnonymous: false };

// opts: {viewport, signedIn (default true), demo, expandDetails (audit hidden panels)}
async function boot(opts) {
  opts = opts || {};
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("nf"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, serviceWorkers: "block", timezoneId: "Asia/Manila" });
  const page = await ctx.newPage();
  const errors = [];
  const dialogs = [];   // every alert/confirm the app showed, oldest first
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("dialog", (d) => { dialogs.push({ type: d.type(), message: d.message() }); d.accept(); });
  await page.route("https://www.gstatic.com/firebasejs/**", (route) => {
    const file = route.request().url().split("/").pop().replace(".js", ".mjs");
    route.fulfill({ status: 200, contentType: "text/javascript", body: fs.readFileSync(path.join(ROOT, "tests/fakes", file), "utf8") });
  });
  await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route(/cdnjs\.cloudflare\.com/, (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.goto("http://127.0.0.1:" + port + "/index.html");
  await page.waitForFunction(() => typeof window.__authCallback === "function");
  if (opts.signedIn !== false) {
    await page.evaluate((u) => window.__authCallback(u), OWNER);
    await page.waitForTimeout(400);
    await page.evaluate(() => { const o = document.getElementById("onboarding-overlay"); if (o) o.style.display = "none"; });
  }
  if (opts.demo) {
    await page.evaluate(() => { loadDemoMode(); });
    await page.waitForTimeout(300);
  }
  if (opts.expandDetails) await page.evaluate(() => document.querySelectorAll('details.disclosure').forEach((el) => { el.open = true; }));
  // Ignore the noise from the CDNs we block on purpose.
  const realErrors = () => errors.filter((e) => !/Failed to load resource|net::ERR|ERR_FAILED|jspdf|fonts/i.test(e));
  const close = async () => { await browser.close(); server.close(); };
  return { page, ctx, errors, dialogs, realErrors, close, port, out };
}

// Freeze animations so screenshots and colour measurements are stable.
async function freezeMotion(page) {
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
}

// Wrap a suite: runs fn(t), prints ok lines, and exits non-zero with the failure on any error.
function suite(name, fn) {
  const t = { ok: (m) => console.log("ok  " + m), out };
  Promise.resolve().then(() => fn(t)).then(() => { console.log("PASS " + name); }).catch((e) => {
    console.error("FAIL " + name + "\n" + (e && e.stack || e));
    process.exit(1);
  });
}

module.exports = { boot, freezeMotion, suite, ROOT, OUT, out, OWNER };
