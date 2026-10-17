/**
 * Setting registration. DESIGN.md §12.
 */

import { MODULE_ID } from "./const.mjs";

export const KEYS = Object.freeze({
  announce: "announce",
  slotStyle: "slotStyle",
});

export const DEFAULT_STYLE = Object.freeze({ color: "#b3a37f", hue: 0, tint: true, images: {} });

export function registerSettings() {
  game.settings.register(MODULE_ID, KEYS.announce, {
    scope: "world",
    name: "PF1EP.Settings.Announce.Name",
    hint: "PF1EP.Settings.Announce.Hint",
    config: true,
    type: Boolean,
    default: false,
  });

  // §6.5: placeholder icon look, edited through its own menu.
  game.settings.register(MODULE_ID, KEYS.slotStyle, {
    scope: "world",
    config: false,
    type: Object,
    default: { ...DEFAULT_STYLE, images: {} },
    onChange: () => {
      for (const app of foundry.applications.instances.values()) {
        if (app.constructor?.usesSlotStyle) app.render();
      }
    },
  });
}

export function setting(key) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return undefined;
  }
}

/** Slot style with defaults filled in; a fresh object each call. */
export function slotStyle() {
  const stored = setting(KEYS.slotStyle) ?? {};
  return {
    color: typeof stored.color === "string" && stored.color ? stored.color : DEFAULT_STYLE.color,
    hue: Number.isFinite(Number(stored.hue)) ? Number(stored.hue) : DEFAULT_STYLE.hue,
    tint: stored.tint !== false,
    images: { ...(stored.images ?? {}) },
  };
}
