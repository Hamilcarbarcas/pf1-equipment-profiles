/**
 * Setting registration. DESIGN.md §12.
 */

import { MODULE_ID } from "./const.mjs";
import { setUnequippedEnabled } from "./unequipped.mjs";

export const KEYS = Object.freeze({
  announce: "announce",
  slotStyle: "slotStyle",
  unequippedWeapons: "unequippedWeapons",
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

  // §16: gray out unequipped weapons on the combat tab and ask before using one.
  game.settings.register(MODULE_ID, KEYS.unequippedWeapons, {
    scope: "world",
    name: "PF1EP.Settings.Unequipped.Name",
    hint: "PF1EP.Settings.Unequipped.Hint",
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => {
      setUnequippedEnabled(value);
      for (const app of foundry.applications.instances.values()) {
        if (app.document instanceof Actor) app.render();
      }
      for (const app of Object.values(ui.windows)) {
        if (app.actor) app.render();
      }
    },
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
