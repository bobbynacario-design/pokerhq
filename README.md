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
| `js/data/*.js` | Pure helpers: `util` (dates, session result, bankroll), `merge` (sync engine), `pushfold`, `icm`, `stats` |
| `js/features/*.js` | One file per feature (calendar, hands, treasury, calculator, review, …) |
| `styles/app.css` | All styles |
| `sw.js` | Service worker (offline shell); bump `CACHE_NAME` when the precache list changes |
| `functions/` | Cloud Functions: event reminder email, Anthropic + OpenAI proxies, phone notifications, weekly backup |
| `tests/` | Node tests (see below) |
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

Both run in CI on every push and pull request (`.github/workflows/test.yml`).

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
- `tests/events.test.js`, `tests/push.test.js`, `tests/sw-push.test.js` — event dates/times, notification selection and messages, and the service worker's push handlers

`scripts/gen-hand-ranking.js` regenerates the 169-hand ordering embedded in `js/data/pushfold.js`
(seeded Monte Carlo; it self-checks against known equities).

## Calendar location filter

Calendar → the location selector (next to MONTH / LIST / PLANNED ONLY) narrows the month grid and
the list to one location. Each place is listed once however it was typed: Okada, Metro Card Club,
Solaire, City of Dreams and Newport are recognised by name ("Okada Manila, Parañaque", "Metrocard
Club, Pasig", "Solaire Resort North" …), and for any other venue the address / city / building
suffix is ignored (`js/data/stats.js`, `placeOf` — add a room to `KNOWN_PLACES` to give it a
standard name). Events with no venue collect under "(no venue)", and the choice is remembered on
that device. It combines
with **Planned only**; the "Playing These" card and the .ics export always include everything.

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
