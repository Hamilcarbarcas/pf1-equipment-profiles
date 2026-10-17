/**
 * Setting registration. DESIGN.md §12.
 */

import { MODULE_ID } from "./const.mjs";

export const KEYS = Object.freeze({
  announce: "announce",
});

export function registerSettings() {
  game.settings.register(MODULE_ID, KEYS.announce, {
    scope: "world",
    name: "PF1EP.Settings.Announce.Name",
    hint: "PF1EP.Settings.Announce.Hint",
    config: true,
    type: Boolean,
    default: false,
  });
}

export function setting(key) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return undefined;
  }
}
