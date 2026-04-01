window.PokerHQConfig = Object.assign({}, window.PokerHQConfig || {}, {
  overrideProfile: {
    id: "codex-pages-test",
    firestorePath: "pokerhq-bob",
    firestoreDocPrefix: "codex-pages-test__",
    localPrefix: "pokerhq_codex_pages_test_"
  }
});

window.PokerHQBuild = Object.assign({}, window.PokerHQBuild || {}, {
  label: "CODEX TEST",
  version: "2026.04.01",
  channel: "pages"
});
