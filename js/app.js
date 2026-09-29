import {
  resolveProfileConfig,
  resolveLegacyLocalStorageKey,
  resolveLocalStorageKey,
  resolveLocalReadKeys
} from "./data/config.js?v=20260929p";
import { initSync } from "./data/sync.js?v=20260929p";

window.PokerHQConfig = Object.assign({}, window.PokerHQConfig || {}, {
  resolveProfileConfig,
  resolveLegacyLocalStorageKey,
  resolveLocalStorageKey,
  resolveLocalReadKeys
});

initSync();
