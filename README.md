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
| `js/data/*.js` | Pure helpers: `util` (dates, session result, bankroll), `merge` (sync engine), `backup-format` (backup file version + checks), `privacy` (Privacy Mode), `trueroi` (trip costs and true ROI), `poster` (reading a poster photo), `pushfold`, `icm`, `stats` |
| `js/features/*.js` | One file per feature (calendar, hands, treasury, calculator, review, …) |
| `styles/app.css` | All styles |
| `sw.js` | Service worker (offline shell); bump `CACHE_NAME` when the precache list changes |
| `functions/` | Cloud Functions: event reminder email, Anthropic + OpenAI proxies, phone notifications, weekly backup |
| `tests/` | Node tests for the logic (see below) |
| `e2e/` | Browser tests: the real app driven in Chromium (see below) |
| `deploy/firestore.rules` | Reference copy only — rules are deployed from the sonicvault repo |

## Run locally

Any static file server works, for example `python -m http.server 8000` from the repo root.
Signing in needs the owner Google account. **Explore demo — no sign-in** on the entry screen
opens sample data with recent sessions and upcoming events relative to today. Demo actions
stay in memory; leaving the demo restores cached real data, drill progress and active drafts.

## Planning and session improvements

- Calendar **Slate Optimizer** validates written and ISO dates, excludes past events by default,
  and reserves money for re-entries before choosing buy-ins. Edit the suggested checkboxes,
  then **Apply / Pin selected events** to star them on the calendar. Budget overruns and
  overlapping dates block Apply. Existing plans remain; new stars have an undo action.
  Choose a location (or explicitly compare all locations) and dates before building. The date
  window starts at the next 30 days, with a next-7-days shortcut. **Use current bankroll** fills
  only the budget. The first view is a shortlist, grouped by location and ordered by date;
  **Browse events** offers searchable alternatives in pages of six. Unchecking leaves a row
  in place, **Clear selection** unchecks all choices, and **Reset suggestions** restores the
  original picks. Selections survive browsing, searching, and changing pages. Buy-in cap and
  reserve settings are inside the optional limits panel.
- Log Session records **Reached the final table?** explicitly (Yes / No / Not recorded),
  including finishes outside the top three. Older saved final-table labels remain intact.
  A final table without a prize counts toward final tables but never toward ITM. The field
  survives edits, sync, JSON backups and the appended CSV column.
- Readiness shows **Complete check-in** until all six answers are available. Skip remains
  available; Start Session enables after the check-in is complete.
- Home puts active play first and tucks workspace settings and detailed analysis into
  expandable panels. Calendar email and phone-notification settings start collapsed.

## More planning, demo and practice tools

- Slate budgets include pinned events at **every location within the chosen dates**, counting
  selected pins once. Optional travel and hotel allowances sit beside the re-entry reserve.
  These estimates never change the bankroll or create trip expenses. An unknown pinned
  buy-in needs to be filled before applying; overruns block new pinning.
- **Calendar cleanup → Review duplicates** finds conservative name / venue variants on the
  same dates. Different flights, formats, buy-ins and known start times stay separate.
  Preview each pair, choose which name to keep, and merge explicitly. Stars, complementary
  fields, notes and sources survive; Undo restores both entries.
- Add `?demo=1` to the app URL for a direct, sign-in-free sample-data tour: plan → capture
  a hand → review a session. **Copy demo link** shares that URL; **Tour** restarts the guide.
  Leaving demo removes the URL flag and restores real data. Demo actions remain in memory.
- PLAY's active session includes **Blind level, stack & breaks**. Set the room's big blind,
  stack, level duration and break cadence. The clock can start, pause and resume; **Next level**
  advances manually. Stack converts to BB; break reminders appear in-app while open. Clock
  settings and paused/running state restore with the local active draft after reload.
- **Create practice drill** on a hand replay or recurring leak opens an editable exercise.
  Saved drills appear in IMPROVE → Strategy with source-hand links and practice-day history.
  Today's completion toggles with Undo; removing a drill also has Undo. Progress syncs inside
  `drillState`, survives Daily Drill actions, and is included in existing backups.

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
- `tests/planning-tools.test.js` — whole-plan budgeting, conservative duplicate detection and detail retention, paused/running blind clocks, and custom practice surviving Daily Drill updates.
- `tests/backup-format.test.js` — backup file versions: newer files refused with a clear message, older ones upgraded step by step, damaged records dropped and reported (`js/data/backup-format.js`)
- `tests/trueroi.test.js` — trip costs and true ROI: currency conversion, which trip a session belongs to, poker vs true ROI, the satellite-seat rule (never double counted), warnings, and that the pieces add up to the total (`js/data/trueroi.js`)
- `tests/inbox.test.js` — the Review Inbox: what lands in it from each of five sources, the ordering, resolving and undoing (`js/data/inbox.js`)
- `tests/markers.test.js` — live hand markers: the six kinds, time / stack stamped on each tap, double-tap guard, tag counts and filters, finishing a hand (`js/data/markers.js`)
- `tests/privacy.test.js` — Privacy Mode: what counts as an amount, when the screen is hidden, and the checklist that fails when a new export, money box or canvas chart could bypass it (`js/data/privacy.js`)
- `tests/poster.test.js` — Event Poster Import: the request sent to Claude, reading the answer (also when cut off), the blocking rules and warnings, duplicates, what reaches the calendar, and that the page loads and caches the files (`js/data/poster.js`)
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

`planning-practice` covers whole-plan limits, merge previews and Undo, saved hand/leak practice,
clock reload and keyboard behavior, and the direct demo tour at desktop and phone widths.
`planned-events` covers the collapsed plan, six-row pagination, unpinning without losing your
place or keyboard focus, Start next, Privacy Mode, and desktop/phone layouts.

Suites: `smoke` (boot, calculator, sessions, bankroll check, restore + undo), `signin` (the gate; the
Google button is on the first screen at ten window sizes), `active-session` (start, timer, check-in,
bullets, capture a hand and a villain, log the result), `save-reload` (nothing vanishes on reload or on
a new device), `backup-restore` (newer / foreign / damaged files), `light-contrast` (every page passes
4.5:1 text contrast in light mode, desktop and phone), `calendar-bars` (readable full-name event bars, seven equal
columns at desktop / laptop / phone widths), `privacy` (with Privacy Mode on, every page, pop-up, chart and
tooltip is swept for a readable amount), `live-markers` (the six one-tap buttons, finish-later, tag filters,
phone layout), `inbox` (every source, Review and Mark resolved, undo, reload, live updates, phone), `trips` (trips, costs in
other currencies, poker vs true ROI, the satellite-seat rule, undo, reload, phone), `poster` (photo to confirmation screen to calendar with the AI call mocked, errors, undo, phone), plus one per feature (`bounty`, `daily-drill`,
`format`, `icm`, `modals`, `month`, `openai`, `push`, `size-guard`, `stats`, `venue`). Screenshots go to
`E2E_OUT` (default: a temp folder); CI keeps them when a run fails. Add a suite by dropping a
`something.e2e.js` in `e2e/` that uses `boot()` from `e2e/lib.js`.

### Trips & True ROI

TREASURY → Trips & True ROI. A **trip** is a name and dates; its **costs** (flights, hotel, transport, food,
visa & fees, tips, other) are entered in pesos or in one of 16 currencies with the exchange rate you got
(`js/data/trueroi.js`; the rate becomes that trip's default for the next cost). Two synced lists hold them:
`trips` and `tripExpenses` (also in the JSON and weekly backups). Trip costs never touch the wallet or bankroll.

- **Poker ROI** = (winnings − buy-ins logged on sessions) / buy-ins: what the app always showed.
- **True ROI** = (winnings − everything paid) / everything paid, where everything = cash buy-ins + satellite
  buy-ins + trip costs in pesos. A trip with costs but no sessions yet shows no ROI.
- A session or satellite belongs to a trip by its date, unless a trip (or "Not on a trip") is picked on the
  form (`session.tripId`, `satellite.tripId`).
- **Satellites are never counted twice.** A session marked `seatViaSatellite` (the "Seat won in a satellite"
  box) contributes ₱0 of cash buy-in; the satellites in the Satellites tracker carry its cost, each counted once,
  in the trip they belong to. Warnings appear when a seat session has no satellites counted, or when a satellite
  looks like it is also logged as a session.
- The pieces always add up to the total (a test checks it). Costs whose trip was deleted are kept under "Not on a trip".

### Event Poster Import

PLAN → Calendar → 📷 IMPORT POSTER. Pick or take a photo of a poster or schedule (optionally add a hint such as the
venue or month); Claude reads it and the app shows one editable card per event on a confirmation screen. Only what the
player ticks reaches the calendar.

- `js/data/poster.js` is pure: it builds the request (one image block, then the instructions, with today's date so
  "Oct 12" gets the right year), a strict JSON schema (`output_config`), parses the answer (also when it is wrapped in
  text or cut off), and turns each event into a **draft** with checks.
- **Blocked** (cannot be added until fixed): no name, no or invalid date, a price in another currency with no exchange
  rate. **Warnings** (still addable): a date more than 30 days ago, no buy-in, and fields Claude marked as unsure
  (outlined in orange). Duplicates (same date + name + venue as an existing event, the calendar's own fingerprint) come
  unticked and badged.
- `js/features/poster-import.js` owns the pop-up. The photo is decoded, shrunk to at most 1568 px and re-encoded as JPEG
  under 4 MB (stays inside Claude's 5 MB image limit and the 10 MB callable limit) and is **never stored**.
  Adding uses the calendar's own `importCalendarUpdateEvents`, so records have the same shape, dedupe and pesos as the
  ✨ Update Events import; a valid start time is kept in `time`, which the phone alerts read. Toast with **UNDO**.
- No server change: the `pokerhqAiCall` proxy passes image blocks straight through (a test checks the model and size
  limits against `functions/index.js`). Uses the Claude key from the AI Assistant card, or the keyless proxy.
- Tests: `tests/poster.test.js` (pure logic and wiring), `e2e/poster.e2e.js` (the pop-up end to end with the AI call
  mocked, including what would be sent), and the light-mode contrast scan covers the pop-up's states.

### Review Inbox

REVIEW → Inbox (with a count badge, and a card on Home) lists what is waiting for a second look.
`js/data/inbox.js` builds it from six sources. Unresolved hands are not duplicated as lessons, and dismissed recurring leaks return after three new examples:

| Source | Shows when | "Mark resolved" writes |
| --- | --- | --- |
| Session | no debrief yet; stays visible and becomes overdue after 14 days | `session.debriefedAt` (also the session detail's MARK DEBRIEF DONE) |
| Hand | needs details, or tagged Review later | `hand.resolvedAt` |
| Recurring leak | the same hand tag appears 3+ times in 90 days | synced `reviewState.dismissedLeaks` |
| Lesson | a hand's lesson is due for a re-read: 3, 10, then 30 days | `hand.lessonStep`, `hand.lessonSeenAt` |
| Villain | notes untouched for 60+ days, at a venue you played in the last 120 days or have an event at in the next 30 | `opponent.reviewedAt` (saving the villain sets `updatedAt`) |
| Drill | you saved it in the Daily Drill | removes it from the synced saved list |

Ages are calendar days. Finishing a marker's details or editing a villain's notes clears its item by
itself. Not in v1: recurring weaknesses, "create a drill from this".

### Live hand markers

The active session has six big buttons (Big pot, ICM spot, Opponent read, Uncertain decision, Tilt,
Review later). A tap saves a normal hand record (`js/data/markers.js` builds it) with
`marker: {kind, at, elapsedMs?, stack?, level?}`, `tags: [kind]`, `needsDetails: true` and `result: ""`
("not sure yet"), held against the running session with `pendingSessionKey` like any hand captured
mid-session. Saving the hand form clears `needsDetails`. The marker kinds are the hand `tags` (leak tags):
Hand History filters by them and by "needs details", and any hand can be tagged. The app has no blind
clock, so stack and level are two optional boxes that are stamped on each tap. Tag ids are stored on
hands, so never rename or reuse one.

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
| Other currencies (USD 420, TWD 31,500, $, €, ¥ ...) | Masked like pesos (trip costs) |

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

**Playing These** starts collapsed, with the next event and **Start next** ready to use.
Expand **Manage events** for six compact rows at a time, in date order, with short location
labels, buy-ins, and quick start/remove controls. Removing a pick preserves the open list and
page; it leaves the tournament in the calendar so you can pin it again.

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
locally for immediate offline use and synced as `drillState`, so progress follows the signed-in profile across devices.

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
- Synced lists start as one Firestore document. Before a logical list reaches Firestore's 1 MiB
  document cap, `js/data/sync.js` atomically converts it to a manifest plus conservative chunks;
  realtime sync and weekly backups reassemble those chunks transparently. The Home **Data safety**
  card only warns if Firestore still refuses a write after this fallback.
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
