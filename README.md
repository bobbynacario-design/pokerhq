# pokerhq

PokerHQ tournament dashboard.

## Release Safety

- Live root app: [index.html](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\index.html)
- Codex test deploy: [deploy/codex-pages](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\deploy\codex-pages)
- Do not promote live changes from untracked local extraction files.
- Use [PROMOTION_CHECKLIST.md](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\PROMOTION_CHECKLIST.md) before pushing anything to `/pokerhq/`.

## Codex Test Source Of Truth

- Extracted Codex source tree:
  - [js](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\js)
  - [styles](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\styles)
- Published Codex Pages bundle:
  - [deploy/codex-pages](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\deploy\codex-pages)
- Test-only shell files stay inside the deploy bundle:
  - [deploy/codex-pages/index.html](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\deploy\codex-pages\index.html)
  - [deploy/codex-pages/profile-override.js](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\deploy\codex-pages\profile-override.js)
  - [deploy/codex-pages/styles/test-overrides.css](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\deploy\codex-pages\styles\test-overrides.css)
- To refresh the test bundle from the extracted source tree, run:
  - [scripts/sync-codex-pages.ps1](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\scripts\sync-codex-pages.ps1)

## Tests

Pure logic is covered by Node's built-in test runner (Node 20+, no install needed):

```
node --test "tests/*.test.js"
```

- `tests/util.test.js` — local date, session result, bankroll bookkeeping
- `tests/pushfold.test.js` — push/fold ranges and notation (`js/data/pushfold.js`)
- `tests/merge.test.js` — record-level sync merge, including multi-device scenarios (`js/data/merge.js`)
- `tests/sync-glue.test.js` — the real `js/data/sync.js` against an in-memory Firestore fake (`tests/fakes/`)
- `tests/backup.test.js` — weekly backup logic (`functions/backup.js`)

`scripts/gen-hand-ranking.js` regenerates the 169-hand ordering embedded in `js/data/pushfold.js`
(seeded Monte Carlo; it self-checks against known equities).

## Sync and backups

- Lists (sessions, hands, tournaments, …) are merged record-by-record on save, so a stale device
  can no longer overwrite another device's additions. Backup **Restore** is the one deliberate
  overwrite, and it keeps a copy of what it replaced (undo toast + `↩ UNDO LAST RESTORE`).
- `pokerhqWeeklyBackup` (Cloud Function, Sundays 03:00 Manila) writes the owner's data to
  `pokerhq-backups/weekly/PokerHQ_Backup_YYYY-MM-DD.json` in the project's default Storage
  bucket, keeps the newest 8 distinct versions, and skips empty or unchanged data. The file is
  the same format as **JSON BACKUP**, so it loads with **RESTORE JSON**. Deploy with
  `npm run deploy` in `functions/`; keep the `pokerhq-backups/` Storage prefix private.
