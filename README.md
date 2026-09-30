# pokerhq

PokerHQ — a tournament poker dashboard: plan events, log sessions and hands, track the
bankroll, review results, and study. It is a static web app (installable PWA) backed by
Firebase (Google sign-in, Firestore sync) with a small set of Cloud Functions.

Live app: <https://bobbynacario-design.github.io/pokerhq/> (the repo root, served by GitHub Pages).

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | App shell and page markup; also holds the core session/dashboard code |
| `js/app.js`, `js/data/sync.js` | Entry module: Firebase sign-in and record-level sync |
| `js/data/*.js` | Pure helpers: `util` (dates, session result, bankroll), `merge` (sync engine), `backup-format` (backup file version + checks), `privacy` (Privacy Mode), `pushfold`, `icm`, `stats` |
| `js/features/*.js` | One file per feature (calendar, hands, treasury, calculator, review, …) |
| `styles/app.css` | All styles |
| `sw.js` | Service worker (offline shell); bump `CACHE_NAME` when the precache list changes |
| `functions/` | Cloud Functions: event reminder email, Anthropic + OpenAI proxies, phone notifications, weekly backup |
| `tests/` | Node tests for the logic (see below) |
| `e2e/` | Browser tests: the real app driven in Chromium (see below) |
| `deploy/firestore.rules` | Reference copy only — rules are deployed from the sonicvault repo |

## Run locally

Any static file server works, for example `python -m http.server 8000` from the repo root.
Signing in needs the owner Google account; **Load demo data** on the Home page works without
touching real data.

## Tests

Pure logic is covered by Node's built-in test runner (Node 20+, no install needed):

```
node --test "tests/*.test.js"
node scripts/check-ai-request-compat.js
```

Both run in CI on every push and pull request (`.github/workflows/test.yml`), together with the
browser tests below.

- `tests/util.test.js` — local date, session result, bankroll bookkeeping
- `tests/pushfold.test.js` — push/fold ranges and notation (`js/data/pushfold.js`)
- `tests/icm.test.js` — ICM maths, cross-checked against brute-force enumeration (`js/data/icm.js`)
- `tests/stats.test.js` — venue / weekday / month / format breakdowns and the calendar's location filter (`js/data/stats.js`)
- `tests/merge.test.js` — record-level sync merge, including multi-device scenarios (`js/data/merge.js`)
- `tests/sync-glue.test.js` — the real `js/data/sync.js` against an in-memory Firestore fake (`tests/fakes/`)
- `tests/backup.test.js` — weekly backup logic (`functions/backup.js`)
- `tests/ai-config.test.js` — fails if a client AI model or `max_tokens` would be rejected by the Cloud Function proxy
- `tests/openai-proxy.test.js` — the OpenAI proxy's allowlists (`functions/openai-proxy.js`), checked against the app's real requests
- `tests/ai-proxy-client.test.js` — client fallback: local key → direct, otherwise the proxy (`js/data/ai-proxy.js`)
- `tests/drills.test.js` — the Daily Drill library and picker: unique ids, context steering, no repeats, streaks, saved state (`js/data/drills.js`)
- `tests/backup-format.test.js` — backup file versions: newer files refused with a clear message, older ones upgraded step by step, damaged records dropped and reported (`js/data/backup-format.js`)
- `tests/privacy.test.js` — Privacy Mode: what counts as an amount, when the screen is hidden, and the checklist that fails when a new export, money box or canvas chart could bypass it (`js/data/privacy.js`)
- `tests/theme.test.js` — light-theme readability guard: fails on hard-coded white text or a text colour with no light-mode value
- `tests/events.test.js`, `tests/push.test.js`, `tests/sw-push.test.js` — event dates/times, notification selection and messages, and the service worker's push handlers

### Browser tests

`e2e/` drives the real app in Chromium (Playwright) with the Firebase pieces swapped for the
in-memory fakes in `tests/fakes/`, so nothing touches live data:

```
npm ci
npx playwright install chromium   # once
npm run test:e2e                  # all suites, a few at a time
node e2e/run.js signin            # only suites whose file name contains "signin"
```

Suites: `smoke` (boot, calculator, sessions, bankroll check, restore + undo), `signin` (the gate; the
Google button is on the first screen at ten window sizes), `active-session` (start, timer, check-in,
bullets, capture a hand and a villain, log the result), `save-reload` (nothing vanishes on reload or on
a new device), `backup-restore` (newer / foreign / damaged files), `light-contrast` (every page passes
4.5:1 text contrast in light mode, desktop and phone), `calendar-bars` (readable full-name event bars, seven equal
columns at desktop / laptop / phone widths), `privacy` (with Privacy Mode on, every page, pop-up, chart and
tooltip is swept for a readable amount), plus one per feature (`bounty`, `daily-drill`,
`format`, `icm`, `modals`, `month`, `openai`, `push`, `size-guard`, `stats`, `venue`). Screenshots go to
`E2E_OUT` (default: a temp folder); CI keeps them when a run fails. Add a suite by dropping a
`something.e2e.js` in `e2e/` that uses `boot()` from `e2e/lib.js`.

### Privacy Mode

The eye in the header (and the card on Home) hides money on screen: bankroll, wallet, buy-ins, prizes,
P&L, staking. `js/data/privacy.js` watches the whole page and swaps any peso amount (`₱1,234`,
`−₱500`, `+₱6,000`, `₱1.5k`, `PHP 1,234`) for `₱•••`, so new screens are covered without extra code.
It also masks tooltips and labels, and the text of `alert` / `confirm` boxes, and can switch itself on
while a session is running. Amounts come back exactly when it is turned off. It is a display setting kept
on the device, not synced. What it does and does not cover:

| Where | What happens |
| --- | --- |
| Text, SVG charts and tooltips, toasts, pop-ups | Masked automatically |
| Boxes holding a saved amount (`data-money`) | Blurred until you click into them |
| CSV files, weekly / backer PDF, calendar `.ics` | Ask first: "this file will contain your real amounts" |
| JSON backup | Never masked or blocked: a backup has to be complete |
| Phone alerts | "Leave buy-in amounts out" switch (`pushHideAmounts`, applied by `functions/push.js`; needs a functions deploy) |
| Email reminders | Not covered |
| Percentages (ROI, ITM) | Shown |

When adding to the app: print money with the `₱` sign (or `PHP`), mark new amount boxes `data-money`, draw
charts as SVG (not canvas), and call `PokerHQPrivacy.confirmExport('…')` before any file that carries
amounts. `tests/privacy.test.js` and `e2e/privacy.e2e.js` fail if one of those is missed.

### Changing the backup file format

Bump `CURRENT_VERSION` in `js/data/backup-format.js`, add the step that upgrades the old shape to
`MIGRATIONS`, and change the weekly server backup (`functions/backup.js`) to write the same number. A
unit test fails if the two disagree. Older files keep restoring; files from a newer PokerHQ are refused.

`scripts/gen-hand-ranking.js` regenerates the 169-hand ordering embedded in `js/data/pushfold.js`
(seeded Monte Carlo; it self-checks against known equities).

## Calendar location filter

Calendar → the location selector (next to MONTH / LIST / PLANNED ONLY) narrows the month grid and
the list to one location. Each place is listed once however it was typed: the Manila rooms (Okada, Metro Card Club,
Solaire, City of Dreams, Newport) and Paradise City are recognised by name ("Okada Manila,
Parañaque", "Metrocard Club, Pasig", "Paradise City Incheon" …), Asia-Pacific festival hotels are
grouped by destination ("Sheraton Hanoi" and "Hanoi, Vietnam" → Hanoi; likewise Macau, Cebu,
Singapore, Seoul, Melbourne …), and for any other venue the address / city / building suffix is
ignored (`js/data/stats.js`, `placeOf` — add a line to `KNOWN_PLACES` to give another room or city
a standard name). Events with no venue collect under "(no venue)", and the choice is remembered on
that device. It combines
with **Planned only**; the "Playing These" card and the .ics export always include everything.

## Daily Drill

The left column of the HOME "Go" card holds one small poker drill a day, in the spirit of a
daily quest: a 2-minute version and a 10-minute version, **I did it**, **Try another**, a
"did this help?" nudge, a Monday–Sunday dots row, a "What do you need today?" picker, **Save**, and
**Tuck away** (keys: N another, D done, T tuck away). 56 drills across pre-game, preflop, postflop,
ICM, mental game, bankroll, review and live-table play (`js/data/drills.js`); many have a button
that opens the matching tool (Advisor, ICM Calculator, Hands, Opponents, Calendar …). Today's pick
is steered by the app: a ★ pinned event today or tomorrow favours pre-game drills, a losing last
session favours mental-game and review, a thin bankroll (under 10 average buy-ins) favours
bankroll drills, and no logged hands favours logging one. **Go deeper** (the 10-minute version)
counts for more: it earns a gold diamond in the week row instead of a green dot, and
weeks in a row with at least one deep drill build a **deep weeks** streak. Progress is kept on
that device (localStorage `pokerhq_drill_v1`), not synced.

## Light and dark themes

Text colours are theme tokens, not literals: `var(--wa-NN)` is white at NN% on the dark theme and
dark ink on the light theme (each step chosen to keep at least 4.5:1 on white and on the beige page),
`var(--ink)` is the main text colour, and `--amber / --rose / --mint / --heat-*` are the accent
text colours. Write new text colours with those instead of `rgba(255,255,255,…)` or `#fff`;
`tests/theme.test.js` fails otherwise.

## Sync and backups

- Lists (sessions, hands, tournaments, …) are merged record-by-record on save, so a stale
  device can no longer overwrite another device's additions. Backup **Restore** is the one
  deliberate overwrite, and it keeps a copy of what it replaced (undo toast +
  `↩ UNDO LAST RESTORE`). Small single values (bankroll, wallet, goals) are still
  last-write-wins; the Treasury **bankroll check** flags any drift.
- Each synced list is one Firestore document, which is capped at 1 MiB. The Home **Data safety**
  card warns at 70% / 90% of that limit and says so plainly if a save is ever refused as too
  large (`js/data/util.js`, `cloudSizeWarnings`). Splitting a list across documents is the
  long-term fix if one nears the limit.
- `pokerhqWeeklyBackup` (Cloud Function, Sundays 03:00 Manila) writes the owner's data to
  `pokerhq-backups/weekly/PokerHQ_Backup_YYYY-MM-DD.json` in the project's default Storage
  bucket, keeps the newest 8 distinct versions, and skips empty or unchanged data. The file is
  the same format as **JSON BACKUP**, so it loads with **RESTORE JSON**. Deploy with
  `npm run deploy` in `functions/`; keep the `pokerhq-backups/` Storage prefix private.

## AI without keys

Signed in as the owner, the AI features work without pasting an API key on each device:
Anthropic goes through `pokerhqAiCall` and OpenAI (calendar **Update Events**, voice hand
capture) through `pokerhqOpenAiCall`. A key saved on a device still takes priority. The OpenAI
function needs a secret — `npm run deploy` in `functions/` asks for `OPENAI_API_KEY` the first
time (or run `firebase functions:secrets:set OPENAI_API_KEY`). Requests are checked against strict
allowlists in `functions/openai-proxy.js`, so it can't be used as a general relay.

## Phone notifications

Calendar → **Phone Notifications** → *Enable on this device*. You get a heads-up before events
marked ★ planning (they need a start time) and a morning summary of today's events.

- It's standard Web Push. The server generates its own key pair the first time it's needed and
  keeps it in `pokerhq-server/vapid` (a collection browsers can't read) — nothing to configure.
- `pokerhqPush` (owner-only callable) registers devices; `pokerhqPushAlerts` runs every 15 minutes.
- **iPhone/iPad:** works only from the Home Screen app (iOS 16.4+): Share → Add to Home Screen,
  open PokerHQ from there, then tap Enable.
- Deploy with `npm run deploy` in `functions/`, then use **Send a test** to confirm delivery.

## Releasing

See [PROMOTION_CHECKLIST.md](PROMOTION_CHECKLIST.md). Do not promote from untracked local files:
run `git ls-files` to confirm everything the app loads is committed.
