"use strict";
// Runs every e2e/*.e2e.js in its own process (own browser), a few at a time, and
// exits non-zero if any fail. Usage: node e2e/run.js [name-filter]
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const filter = process.argv[2] || "";
const files = fs.readdirSync(__dirname).filter((f) => f.endsWith(".e2e.js") && f.includes(filter)).sort();
const CONCURRENCY = Number(process.env.E2E_JOBS || 4);
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS || 120000);

if (!files.length) { console.error("No e2e suites match \"" + filter + "\""); process.exit(1); }

function runOne(file) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(__dirname, file)], { stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (d) => { log += d; });
    child.stderr.on("data", (d) => { log += d; });
    const timer = setTimeout(() => { log += "\nTIMED OUT after " + TIMEOUT_MS / 1000 + "s\n"; child.kill("SIGKILL"); }, TIMEOUT_MS);
    child.on("close", (code) => { clearTimeout(timer); resolve({ file, code, log, secs: ((Date.now() - started) / 1000).toFixed(1) }); });
  });
}

(async () => {
  const queue = files.slice();
  const results = [];
  async function worker() {
    while (queue.length) {
      const file = queue.shift();
      const r = await runOne(file);
      results.push(r);
      console.log((r.code === 0 ? "PASS " : "FAIL ") + r.file + "  (" + r.secs + "s)");
      if (r.code !== 0) console.log(r.log.split("\n").map((l) => "    " + l).join("\n"));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
  const failed = results.filter((r) => r.code !== 0);
  console.log("\n" + (results.length - failed.length) + " of " + results.length + " browser suites passed");
  if (failed.length) { console.log("Failed: " + failed.map((r) => r.file).join(", ")); process.exit(1); }
})();
