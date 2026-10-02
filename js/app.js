import {
  resolveProfileConfig,
  resolveLegacyLocalStorageKey,
  resolveLocalStorageKey,
  resolveLocalReadKeys
} from "./data/config.js?v=20261002a";
import { initSync } from "./data/sync.js?v=20261002a";

window.PokerHQConfig = Object.assign({}, window.PokerHQConfig || {}, {
  resolveProfileConfig,
  resolveLegacyLocalStorageKey,
  resolveLocalStorageKey,
  resolveLocalReadKeys
});

initSync();
