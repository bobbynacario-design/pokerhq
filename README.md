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
| `functions/` | Cloud Functions: event reminder email, AI proxy, weekly backup |
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
- `tests/stats.test.js` — venue / weekday breakdowns (`js/data/stats.js`)
- `tests/merge.test.js` — record-level sync merge, including multi-device scenarios (`js/data/merge.js`)
- `tests/sync-glue.test.js` — the real `js/data/sync.js` against an in-memory Firestore fake (`tests/fakes/`)
- `tests/backup.test.js` — weekly backup logic (`functions/backup.js`)
- `tests/ai-config.test.js` — fails if a client AI model or `max_tokens` would be rejected by the Cloud Function proxy

`scripts/gen-hand-ranking.js` regenerates the 169-hand ordering embedded in `js/data/pushfold.js`
(seeded Monte Carlo; it self-checks against known equities).

## Sync and backups

- Lists (sessions, hands, tournaments, …) are merged record-by-record on save, so a stale
  device can no longer overwrite another device's additions. Backup **Restore** is the one
  deliberate overwrite, and it keeps a copy of what it replaced (undo toast +
  `↩ UNDO LAST RESTORE`). Small single values (bankroll, wallet, goals) are still
  last-write-wins; the Treasury **bankroll check** flags any drift.
- `pokerhqWeeklyBackup` (Cloud Function, Sundays 03:00 Manila) writes the owner's data to
  `pokerhq-backups/weekly/PokerHQ_Backup_YYYY-MM-DD.json` in the project's default Storage
  bucket, keeps the newest 8 distinct versions, and skips empty or unchanged data. The file is
  the same format as **JSON BACKUP**, so it loads with **RESTORE JSON**. Deploy with
  `npm run deploy` in `functions/`; keep the `pokerhq-backups/` Storage prefix private.

## Releasing

See [PROMOTION_CHECKLIST.md](PROMOTION_CHECKLIST.md). Do not promote from untracked local files:
run `git ls-files` to confirm everything the app loads is committed.
