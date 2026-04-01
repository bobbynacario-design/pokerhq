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
