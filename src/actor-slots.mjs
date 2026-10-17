/**
 * Per-actor disabled equipment slots. DESIGN.md §3.7.
 *
 * Stored as `flags.pf1-equipment-profiles.disabledSlots`, an array of toggle keys. A disabled
 * slot is hidden in the window, skipped by profiles, and blocks equipping matching items on the
 * actor by any route (sheet toggle, other modules) through `preUpdateItem` / `preCreateItem`.
 */

import { MODULE_ID } from "./const.mjs";
import { isClothing, isShield, regionOf, slotLabel } from "./slots.mjs";

/** Toggle keys, in settings-tab order. Over Armor follows Armor; both rings share one. */
export const TOGGLES = [
  "head", "headband", "eyes", "neck", "shoulders", "chest", "body", "armor",
  "belt", "wrists", "hands", "rings", "feet", "mainHand", "offHand", "clothing",
];

export function disabledSet(actor) {
  const stored = actor?.getFlag?.(MODULE_ID, "disabledSlots");
  return new Set(Array.isArray(stored) ? stored.filter((k) => TOGGLES.includes(k)) : []);
}

/** Toggle governing a doll slot or bar key. */
export function toggleFor(key) {
  if (key === "armorOver") return "armor";
  if (key === "ring1" || key === "ring2") return "rings";
  return key;
}

export const isOff = (key, off) => off.has(toggleFor(key));

export function toggleLabel(key) {
  if (key === "rings") return game.i18n.localize("PF1EP.ActorSlots.Rings");
  return slotLabel(key);
}

/**
 * Toggle that stops this item being equipped on the actor, or null. Weapons need a hand, so
 * only both hands disabled blocks one; a shield needs the off hand. Slotless items never block.
 */
export function blockingToggle(item, off) {
  if (!off.size) return null;
  const region = regionOf(item);
  if (!region) return null;
  if (region === "hand") {
    if (isShield(item)) return off.has("offHand") ? "offHand" : null;
    return off.has("mainHand") && off.has("offHand") ? "mainHand" : null;
  }
  if (region === "ring") return off.has("rings") ? "rings" : null;
  if (region === "other") return isClothing(item) && off.has("clothing") ? "clothing" : null;
  return off.has(region) ? region : null;
}

export async function setDisabled(actor, keys) {
  await actor.setFlag(MODULE_ID, "disabledSlots", TOGGLES.filter((k) => keys.has(k)));
}

function warnBlocked(item, key) {
  ui.notifications.warn(
    game.i18n.format("PF1EP.Warn.SlotDisabled", { item: item.name, slot: toggleLabel(key), actor: item.actor?.name ?? "" })
  );
}

/** Blocks equipping into a disabled slot by any route. Unequipping is never blocked. */
export function registerSlotBlocking() {
  Hooks.on("preUpdateItem", (item, changes) => {
    if (foundry.utils.getProperty(changes, "system.equipped") !== true || !item.actor) return;
    const key = blockingToggle(item, disabledSet(item.actor));
    if (!key) return;
    warnBlocked(item, key);
    return false;
  });

  // A dropped-in equipped item still arrives, just unequipped.
  Hooks.on("preCreateItem", (item) => {
    if (item.system?.equipped !== true || !item.actor) return;
    const key = blockingToggle(item, disabledSet(item.actor));
    if (!key) return;
    item.updateSource({ "system.equipped": false });
    warnBlocked(item, key);
  });
}
