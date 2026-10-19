/**
 * Slot edits shared by both window modes, kept free of UI so they can be tested headless.
 * DESIGN.md §6.2, §6.6.
 *
 * Every function edits `profile` in place. In live mode the result is applied straight away, so
 * a few knock-ons differ: a live edit may free a fixed 2h main hand rather than refuse, and pins
 * the other ring slot so presence-only ring room (§3.4) can't keep the ring being replaced.
 */

import { blockingToggle, disabledSet, isOff } from "./actor-slots.mjs";
import { resolveRef } from "./match.mjs";
import { BARS, RINGS, SLOTS, fits, fitsBar, isBuckler, isTwoHandedOnly, liveHeld, mainHandGrip } from "./slots.mjs";
import { itemRef } from "./store.mjs";

export const IGNORE = () => ({ state: "ignore", item: null, held: null });
export const EMPTY = () => ({ state: "empty", item: null, held: null });

const sameItem = (ref, item) => ref?.id === item.id;
const resolve = (actor, ref) => resolveRef(actor, ref, { claimed: new Set() });

/** Main hand held two-handed, so the off hand mirrors it (a buckler there breaks the mirror). */
export function mirrored(actor, profile) {
  const main = profile.slots.mainHand;
  if (main.state !== "item" || main.held !== "2h") return false;
  const off = profile.slots.offHand;
  if (off.state !== "item") return true;
  const item = resolve(actor, off.item);
  return !(item && isBuckler(item));
}

/** Drop an item from every slot and the Other list. */
export function release(profile, item) {
  for (const key of SLOTS) {
    if (sameItem(profile.slots[key].item, item)) profile.slots[key] = IGNORE();
  }
  profile.other = profile.other.filter((o) => !sameItem(o.item, item));
}

/** Grip a weapon gets going into the main hand: its current one when it allows a choice. */
export function mainHeld(item) {
  const grip = mainHandGrip(item);
  const live = item.system.equipped === true ? liveHeld(item) : null;
  return grip.fixed || !live || live === "oh" ? grip.held : live;
}

/** A 2h main hand leaves only a buckler in the off hand. */
function freeOffForTwoHanded(actor, profile) {
  const off = profile.slots.offHand;
  if (off.state !== "item") return;
  const item = resolve(actor, off.item);
  if (!item || !isBuckler(item)) profile.slots.offHand = IGNORE();
}

function pinOtherRing(profile, key) {
  const otherKey = RINGS.find((k) => k !== key);
  if (profile.slots[otherKey].state === "ignore") profile.slots[otherKey] = EMPTY();
}

/** Free the off hand of a mirrored 2h grip: regrip to 1h, or clear a fixed 2h weapon. */
function freeMirroredOff(actor, profile, live) {
  const mainItem = resolve(actor, profile.slots.mainHand.item);
  if (mainItem && !mainHandGrip(mainItem).fixed) profile.slots.mainHand.held = "1h";
  else profile.slots.mainHand = live ? EMPTY() : IGNORE();
}

/**
 * Put `item` into `key`. A bar key ("clothing" / "other") adds it to the Other list.
 * @returns {{ok: true} | {ok: false, warn: string, data?: object}}
 */
export function place(actor, profile, key, item, { live = false } = {}) {
  if (!item || actor.items.get(item.id) !== item) return { ok: false, warn: "PF1EP.Warn.NotThisActor" };

  // A two-handed-only weapon dropped on the off hand means "wield it": main hand, 2h (§3.3).
  if (key === "offHand" && isTwoHandedOnly(item)) key = "mainHand";

  // Disabled on this actor (§3.7): the target slot, or every slot the item could use.
  const off = disabledSet(actor);
  const blockedBy = isOff(key, off) ? key : blockingToggle(item, off);
  if (blockedBy) return { ok: false, warn: "PF1EP.Warn.SlotDisabled", data: { item, slot: blockedBy } };

  if (BARS.includes(key)) {
    if (!fitsBar(item, key)) return { ok: false, warn: "PF1EP.Warn.DoesNotFit", data: { item, slot: key } };
    release(profile, item);
    profile.other.push({ item: itemRef(item), equipped: true });
    return { ok: true };
  }
  if (!fits(item, key)) return { ok: false, warn: "PF1EP.Warn.DoesNotFit", data: { item, slot: key } };

  // An off-hand item beside a 2h grip: regrip the main hand when it allows one hand, else free it
  // (live) or refuse (profile).
  if (key === "offHand" && !isBuckler(item) && mirrored(actor, profile)) {
    const mainItem = resolve(actor, profile.slots.mainHand.item);
    if (mainItem && !mainHandGrip(mainItem).fixed) profile.slots.mainHand.held = "1h";
    else if (live) profile.slots.mainHand = IGNORE();
    else return { ok: false, warn: "PF1EP.Warn.OffHandLocked" };
  }

  release(profile, item);
  let held = null;
  if (key === "offHand" && item.type === "weapon") held = "oh";
  if (key === "mainHand") held = mainHeld(item);
  profile.slots[key] = { state: "item", item: itemRef(item), held };

  if (key === "mainHand" && held === "2h") freeOffForTwoHanded(actor, profile);
  if (live && RINGS.includes(key)) pinOtherRing(profile, key);
  return { ok: true };
}

/** Double-click / Ignore / Unequip. Live sets Empty (unequip); a profile sets Ignore. */
export function clearSlot(actor, profile, key, { live = false } = {}) {
  if (key === "offHand" && mirrored(actor, profile)) {
    freeMirroredOff(actor, profile, live);
    return true;
  }
  if (!SLOTS.includes(key)) return false;
  profile.slots[key] = live ? EMPTY() : IGNORE();
  if (live && RINGS.includes(key)) pinOtherRing(profile, key);
  return true;
}

/** Profile-only: mark a slot Empty. The mirrored off hand frees the grip instead. */
export function markEmpty(actor, profile, key) {
  if (key === "offHand" && mirrored(actor, profile)) {
    freeMirroredOff(actor, profile, false);
    return true;
  }
  if (!SLOTS.includes(key)) return false;
  profile.slots[key] = EMPTY();
  return true;
}

/** Flip the main hand between 1h and 2h when the weapon allows it. */
export function toggleHeld(actor, profile) {
  const main = profile.slots.mainHand;
  if (main.state !== "item") return false;
  const item = resolve(actor, main.item);
  if (!item || mainHandGrip(item).fixed) return false;
  main.held = main.held === "2h" ? "1h" : "2h";
  if (main.held === "2h") freeOffForTwoHanded(actor, profile);
  return true;
}
