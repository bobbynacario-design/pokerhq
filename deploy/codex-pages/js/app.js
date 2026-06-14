import {
  resolveProfileConfig,
  resolveLegacyLocalStorageKey,
  resolveLocalStorageKey,
  resolveLocalReadKeys
} from "./data/config.js?v=20260612n";
import { initSync } from "./data/sync.js?v=20260612n";

window.PokerHQConfig = Object.assign({}, window.PokerHQConfig || {}, {
  resolveProfileConfig,
  resolveLegacyLocalStorageKey,
  resolveLocalStorageKey,
  resolveLocalReadKeys
});

initSync();
