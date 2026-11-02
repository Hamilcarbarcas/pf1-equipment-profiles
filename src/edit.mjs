/**
 * Slot edits shared by both window modes, kept free of UI so they can be tested headless.
 * DESIGN.md §6.2, §6.6, hands §17.
 *
 * Every function edits `profile` in place. In live mode the result is applied straight away, so
 * a few knock-ons differ: a live edit may free a fixed 2h main hand rather than refuse, and pins
 * the other ring slot so presence-only ring room (§3.4) can't keep the ring being replaced.
 * Live mode judges rule grips by the actor's current state; profile mode accepts them (§17.4).
 */

import { blockingToggle, disabledSet, isOff } from "./actor-slots.mjs";
import { resolveRef } from "./match.mjs";
import { BARS, HANDS, RINGS, SHIELD, SLOTS, fits, fitsBar } from "./slots.mjs";
import { availableGrips, canOffHand, defaultGrip, isShield, liveGrip, mainGrip } from "./hands.mjs";
import { itemRef } from "./store.mjs";

export const IGNORE = () => ({ state: "ignore", item: null, held: null });
export const EMPTY = () => ({ state: "empty", item: null, held: null });

const sameItem = (ref, item) => ref?.id === item.id;
const resolve = (actor, ref) => resolveRef(actor, ref, { claimed: new Set() });
const gripOpts = (live) => ({ profile: !live });

/** Main hand held two-handed, so the off hand mirrors it. */
export function mirrored(actor, profile) {
  const main = profile.slots.mainHand;
  return main.state === "item" && main.held === "2h";
}

/** The shield's grip in this profile, or null without one (§17.2). */
export function shieldGripIn(actor, profile) {
  const slot = profile.slots[SHIELD];
  if (slot.state !== "item") return null;
  if (slot.held) return slot.held;
  const item = resolve(actor, slot.item);
  return item ? defaultGrip(item) : null;
}

/** The profile's shield takes up the off hand. */
export const shieldUsesHand = (actor, profile) => {
  const grip = shieldGripIn(actor, profile);
  return !!grip && grip !== "none";
};

/** Drop an item from every slot and the Other list. */
export function release(profile, item) {
  for (const key of SLOTS) {
    if (sameItem(profile.slots[key].item, item)) profile.slots[key] = IGNORE();
  }
  profile.other = profile.other.filter((o) => !sameItem(o.item, item));
}

/** Grip a weapon gets going into the main hand: its current one when it allows a choice. */
export function mainHeld(item, { live = false } = {}) {
  const grip = mainGrip(item, gripOpts(live));
  const current = item.system.equipped === true ? liveGrip(item) : null;
  return grip.fixed || !current || !grip.options.includes(current) ? grip.held : current;
}

/** A 2h main hand frees the off hand: off-hand weapon and hand-using shield both go. */
function freeOffForTwoHanded(actor, profile) {
  if (profile.slots.offHand.state === "item") profile.slots.offHand = IGNORE();
  if (shieldUsesHand(actor, profile)) profile.slots[SHIELD] = IGNORE();
}

function pinOtherRing(profile, key) {
  const otherKey = RINGS.find((k) => k !== key);
  if (profile.slots[otherKey].state === "ignore") profile.slots[otherKey] = EMPTY();
}

/** Free the off hand of a mirrored 2h grip: regrip to 1h, or clear a weapon that can't. */
function freeMirroredOff(actor, profile, live) {
  const mainItem = resolve(actor, profile.slots.mainHand.item);
  if (mainItem && mainGrip(mainItem, gripOpts(live)).options.includes("1h")) profile.slots.mainHand.held = "1h";
  else profile.slots.mainHand = live ? EMPTY() : IGNORE();
}

/**
 * Something needs the off hand while the main hand is two-handed: regrip it to 1h when allowed,
 * else free it (live) or refuse (profile).
 * @returns {boolean} false when refused.
 */
function claimOffFromMirror(actor, profile, live) {
  if (!mirrored(actor, profile)) return true;
  const mainItem = resolve(actor, profile.slots.mainHand.item);
  if (mainItem && mainGrip(mainItem, gripOpts(live)).options.includes("1h")) profile.slots.mainHand.held = "1h";
  else if (live) profile.slots.mainHand = IGNORE();
  else return false;
  return true;
}

/**
 * Shield grip on placing: the live one in live mode. A profile uses the base grip, or goes
 * hands-free under a rule beside a weapon that can't let go of the off hand (§17.8).
 */
function placedShieldGrip(actor, profile, item, live) {
  if (live) return availableGrips(item)[0] ?? "oh";
  const base = defaultGrip(item);
  if (base === "none" || !mirrored(actor, profile)) return base;
  const mainItem = resolve(actor, profile.slots.mainHand.item);
  const locked = !mainItem || !mainGrip(mainItem, { profile: true }).options.includes("1h");
  return locked && availableGrips(item, { profile: true }).includes("none") ? "none" : base;
}

/**
 * Put `item` into `key`. A bar key ("clothing" / "other") adds it to the Other list.
 * @returns {{ok: true} | {ok: false, warn: string, data?: object}}
 */
export function place(actor, profile, key, item, { live = false } = {}) {
  if (!item || actor.items.get(item.id) !== item) return { ok: false, warn: "PF1EP.Warn.NotThisActor" };
  const opts = gripOpts(live);

  // A shield goes on the arm, a weapon dropped on the shield goes in the off hand (§17.8), and a
  // weapon that can't go off-hand, dropped there, means "wield it": main hand (§3.3).
  if (HANDS.includes(key) && isShield(item)) key = SHIELD;
  if (key === SHIELD && item.type === "weapon") key = "offHand";
  if (key === "offHand" && item.type === "weapon" && !canOffHand(item, opts)) key = "mainHand";

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
  if (!fits(item, key, opts)) return { ok: false, warn: "PF1EP.Warn.DoesNotFit", data: { item, slot: key } };

  let held = null;
  if (key === "offHand") {
    if (!claimOffFromMirror(actor, profile, live)) return { ok: false, warn: "PF1EP.Warn.OffHandLocked" };
    if (shieldUsesHand(actor, profile) && !sameItem(profile.slots[SHIELD].item, item)) profile.slots[SHIELD] = IGNORE();
    held = "oh";
  } else if (key === SHIELD) {
    held = placedShieldGrip(actor, profile, item, live);
    if (held !== "none") {
      if (!claimOffFromMirror(actor, profile, live)) return { ok: false, warn: "PF1EP.Warn.OffHandLocked" };
      if (profile.slots.offHand.state === "item") profile.slots.offHand = IGNORE();
    }
  }

  release(profile, item);
  if (key === "mainHand") held = mainHeld(item, { live });
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

/** Step the main hand to its next grip when the weapon offers more than one. */
export function toggleHeld(actor, profile, { live = false } = {}) {
  const main = profile.slots.mainHand;
  if (main.state !== "item") return false;
  const item = resolve(actor, main.item);
  if (!item) return false;
  const grip = mainGrip(item, gripOpts(live));
  if (grip.fixed) return false;
  const at = grip.options.indexOf(main.held);
  main.held = grip.options[(at + 1) % grip.options.length];
  if (main.held === "2h") freeOffForTwoHanded(actor, profile);
  return true;
}

/**
 * Live: put a held weapon into `grip` (§17.5). `oh` moves it to the off hand; `1h` / `2h` to the
 * main hand with that grip.
 * @returns {{ok: true} | {ok: false, warn: string, data?: object}}
 */
export function setGripIn(actor, profile, item, grip) {
  if (!availableGrips(item).includes(grip)) return { ok: false, warn: "PF1EP.Warn.GripNotAllowed", data: { item } };
  if (grip === "oh") return place(actor, profile, "offHand", item, { live: true });
  const result = place(actor, profile, "mainHand", item, { live: true });
  if (!result.ok) return result;
  const main = profile.slots.mainHand;
  if (main.held !== grip) {
    main.held = grip;
    if (grip === "2h") freeOffForTwoHanded(actor, profile);
  }
  return result;
}
