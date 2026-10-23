/**
 * Unequipped weapons: ask before using one. DESIGN.md §16.
 *
 * PF1 rolls an unequipped weapon like an equipped one; its `canUse` getter checks `equipped`
 * but nothing calls it. This wraps `ItemPF#use`, the one entry point the sheet, hotbar, token
 * HUD, container sheet, and macros share, and asks before the use goes ahead.
 */

import { MODULE_ID } from "./const.mjs";
import { KEYS, setting } from "./settings.mjs";

const TARGET = "pf1.documents.item.ItemPF.prototype.use";

let enabled = true;

/** Refreshed by the setting's onChange; `game.settings.get` is too slow for every use. */
export function setUnequippedEnabled(value) {
  enabled = value !== false;
}

export const unequippedEnabled = () => enabled;

/** A weapon on an actor that is not equipped. */
export function isUnequippedWeapon(item) {
  return item?.type === "weapon" && !!item.actor && item.system?.equipped !== true;
}

/** Resolves true to go ahead. Closing the dialog cancels. */
async function confirmUse(item) {
  const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: t("PF1EP.Unequipped.Title"), icon: "fa-solid fa-hand" },
    content: `<p>${t("PF1EP.Unequipped.Body", { item: foundry.utils.escapeHTML(item.name) })}</p>`,
    buttons: [
      { action: "use", label: t("PF1EP.Unequipped.UseAnyway"), icon: "fa-solid fa-sword" },
      { action: "cancel", label: t("Cancel"), icon: "fa-solid fa-xmark", default: true },
    ],
    rejectClose: false,
  });
  return choice === "use";
}

async function guardedUse(wrapped, ...args) {
  if (!enabled || !isUnequippedWeapon(this)) return wrapped(...args);
  if (!(await confirmUse(this))) return undefined;
  return wrapped(...args);
}

export function registerUnequippedGuard() {
  setUnequippedEnabled(setting(KEYS.unequippedWeapons));

  if (game.modules.get("lib-wrapper")?.active) {
    // MIXED: a cancelled use never reaches the wrapped call.
    libWrapper.register(MODULE_ID, TARGET, guardedUse, "MIXED");
    return;
  }
  const proto = pf1.documents.item.ItemPF.prototype;
  const original = proto.use;
  proto.use = function (...args) {
    return guardedUse.call(this, (...a) => original.apply(this, a), ...args);
  };
}
