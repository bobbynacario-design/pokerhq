# PokerHQ Promotion Checklist

Use this when promoting changes from the Codex test deploy to the live root app.

## Current Deployment Split

- Live root app: `/pokerhq/`
  - Source of truth: tracked [`index.html`](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\index.html)
  - Current model: single-file inline app
- Codex test app: `/pokerhq/deploy/codex-pages/`
  - Source of truth: tracked files under [`deploy/codex-pages`](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\deploy\codex-pages)
  - Current model: extracted module bundle
  - Test identity override: [`deploy/codex-pages/profile-override.js`](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\deploy\codex-pages\profile-override.js)

## Guardrails

- Do not point live root `index.html` at extracted root assets unless those root assets are tracked and deployed.
- Do not promote from local untracked files.
- Do not reuse the test profile override in live.
- Do not overwrite `/pokerhq/` as part of test deploy work.
- Treat root and test as separate release targets.

## Before Promoting Anything

1. Confirm the target.
   - Test-only change: edit only [`deploy/codex-pages`](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\deploy\codex-pages)
   - Live change: explicitly update [`index.html`](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\index.html) or intentionally tracked live assets

2. Check tracked state.
   - Run `git ls-files`
   - Verify every file you plan to promote is tracked

3. Check working tree.
   - Run `git status --short`
   - Separate real app changes from temp artifacts and local-only extraction files

4. Check data isolation.
   - Test deploy should keep its own profile/path override
   - Live root should keep the live profile/path

## Test Deploy QA

Run these on `/pokerhq/deploy/codex-pages/` before any promotion:

- Confirm build badge matches on desktop and iPhone
- Confirm sync works on both devices
- Confirm calendar events sync both ways
- Confirm weekly intelligence import does not duplicate strategy notes
- Confirm demo load/reset works
- Confirm active session start/resume/timer works
- Confirm session detail and linked hands work
- Confirm review surfaces and heatmaps render

## Promotion Decision

Only promote if all of these are true:

- The behavior is stable on the Codex test URL
- The tracked files to be promoted are clearly identified
- The promotion path for live is explicit
- The profile/data path for live remains correct
- There is no dependency on untracked local files

## Safe Promotion Paths

### Path A: Keep Live Root Single-File

Use this if live should remain on the old architecture for now.

1. Port only the approved changes into tracked [`index.html`](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\index.html)
2. Verify live profile/path logic remains unchanged
3. Commit only the live root file change
4. Push and verify `/pokerhq/`

### Path B: Migrate Live Root To Extracted Assets

Use this only if we intentionally upgrade live to the extracted architecture.

1. Make sure tracked root assets exist for:
   - [`js/app.js`](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\js\app.js)
   - [`styles/app.css`](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\styles\app.css)
   - all required root `js/data/*`
   - all required root `js/features/*`
2. Make sure those files are committed, not just present locally
3. Update tracked live [`index.html`](C:\Users\BobbyNacario\OneDrive - Xcelerate\Desktop\Codex\pokerhq\index.html) to reference those tracked root assets
4. Remove any test-only build badge/profile override from live
5. Push and verify `/pokerhq/`

## Pre-Push Checklist

- `git diff --cached --stat`
- confirm only intended live or test files are staged
- if pushing live root, inspect `index.html` header asset references
- if pushing test deploy, inspect `deploy/codex-pages/index.html` and `profile-override.js`

## Post-Push Verification

### Live Root

- Open [https://bobbynacario-design.github.io/pokerhq/](https://bobbynacario-design.github.io/pokerhq/)
- Hard refresh
- Confirm shell is expected
- Confirm sync works on desktop and iPhone
- Confirm live data path is unchanged

### Codex Test

- Open [https://bobbynacario-design.github.io/pokerhq/deploy/codex-pages/](https://bobbynacario-design.github.io/pokerhq/deploy/codex-pages/)
- Hard refresh
- Confirm build badge is present
- Confirm test profile remains isolated
- Confirm cross-device sync still works

## Current Repo Risk Notes

- Several extracted root files are present locally but are still untracked.
- Temporary verification artifacts are also present locally.
- Because of that, `git status` alone can look noisy; use `git ls-files` to confirm what is actually deployable.
