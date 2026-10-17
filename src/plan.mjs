/**
 * Profile → list of changes. DESIGN.md §7.1–7.2.
 */

import { blockingToggle, disabledSet, isOff } from "./actor-slots.mjs";
import { findInContainer, resolveRef } from "./match.mjs";
import {
  RINGS,
  SLOTS,
  fits,
  isBuckler,
  kindOf,
  liveHeld,
  mainHandGrip,
  occupancy,
} from "./slots.mjs";

const sameName = (item, ref) => item.type === ref.type && item._source.name === ref.name;

/** Occupancy bucket a profile slot key reads from. */
const bucketFor = (key) => (RINGS.includes(key) ? "rings" : key);

/**
 * @param {Actor} actor
 * @param {object} profile - Normalized profile.
 * @returns {{changes: object[], missing: object[], skipped: object[], active: boolean}}
 *   `active` is false for a profile that sets nothing it can act on.
 */
export function buildPlan(actor, profile) {
  const skipped = [];

  // Disabled slots act as Ignore; anything they would equip is reported (§3.7).
  const off = disabledSet(actor);
  const slots = { ...profile.slots };
  if (off.size) {
    for (const key of SLOTS) {
      if (slots[key].state === "ignore" || !isOff(key, off)) continue;
      if (slots[key].state === "item") skipped.push({ item: null, ref: slots[key].item, slot: key, reason: "disabled" });
      slots[key] = { state: "ignore", item: null, held: null };
    }
  }

  // Weapons an Other entry equips are not main-hand occupants (§7.2).
  const otherIds = new Set();
  for (const o of profile.other) {
    if (!o.equipped) continue;
    for (const item of actor.items) if (sameName(item, o.item)) otherIds.add(item.id);
  }

  const occ = occupancy(actor, otherIds);
  const bucket = new Map();
  for (const [key, list] of Object.entries(occ)) for (const item of list) bucket.set(item.id, key);

  const assigned = new Set(SLOTS.filter((k) => slots[k].state !== "ignore").map(bucketFor));
  const replaceable = (item) => item.system.equipped === true && assigned.has(bucket.get(item.id));

  const claimed = new Set();
  const targets = new Map();
  const missing = [];
  let emptySlots = 0;

  for (const key of SLOTS) {
    const slot = slots[key];
    if (slot.state === "empty") emptySlots++;
    if (slot.state !== "item") continue;

    const wantHeld = key === "offHand" ? "oh" : slot.held;
    const item = resolveRef(actor, slot.item, {
      claimed,
      inSlot: (i) => bucket.get(i.id) === bucketFor(key) && (i.type !== "weapon" || !wantHeld || liveHeld(i) === wantHeld),
      replaceable,
    });
    if (!item) {
      missing.push({ ref: slot.item, slot: key, container: findInContainer(actor, slot.item) });
      continue;
    }
    if (!fits(item, key)) {
      skipped.push({ item, slot: key, reason: "fit" });
      continue;
    }

    claimed.add(item.id);
    const to = { equipped: true, held: null };
    if (item.type === "weapon") to.held = key === "offHand" ? "oh" : (slot.held ?? mainHandGrip(item).held);
    targets.set(item.id, { item, slot: key, to });
  }

  for (const o of profile.other) {
    const item = resolveRef(actor, o.item, {
      claimed,
      inSlot: (i) => bucket.get(i.id) === "other",
      replaceable,
    });
    if (!item) {
      if (o.equipped) missing.push({ ref: o.item, slot: "other", container: findInContainer(actor, o.item) });
      continue;
    }
    if (o.equipped && blockingToggle(item, off)) {
      skipped.push({ item, ref: o.item, slot: "other", reason: "disabled" });
      continue;
    }
    claimed.add(item.id);
    targets.set(item.id, { item, slot: "other", to: { equipped: o.equipped, held: null } });
  }

  const targetIn = (key) => [...targets.values()].find((t) => t.slot === key) ?? null;
  const mainTarget = targetIn("mainHand");
  let offTarget = targetIn("offHand");

  // A 2h main hand wins over a non-buckler off-hand assignment (§3.3).
  if (mainTarget?.to.held === "2h" && offTarget && !isBuckler(offTarget.item)) {
    targets.delete(offTarget.item.id);
    skipped.push({ item: offTarget.item, slot: "offHand", reason: "twoHanded" });
    offTarget = null;
  }

  const unequip = new Map();
  const vacate = (key, list, keep = () => false) => {
    for (const item of list) {
      if (!targets.has(item.id) && !keep(item)) unequip.set(item.id, { item, slot: key });
    }
  };

  for (const key of SLOTS) {
    if (RINGS.includes(key) || slots[key].state === "ignore") continue;
    // A missing item leaves its slot as it is rather than stripping it.
    if (slots[key].state === "item" && !targetIn(key)) continue;
    vacate(key, occ[key]);
  }

  // Knock-on: 2h main hand clears the off hand, bucklers excepted (§3.3).
  if (mainTarget?.to.held === "2h") vacate("offHand", occ.offHand, isBuckler);

  // Knock-on: filling the off hand beside an untouched 2h grip regrips it to 1h, or unequips it
  // when it cannot be wielded one-handed.
  if (!mainTarget && slots.mainHand.state === "ignore" && offTarget && !isBuckler(offTarget.item)) {
    for (const item of occ.mainHand) {
      if (targets.has(item.id) || liveHeld(item) !== "2h") continue;
      const grip = mainHandGrip(item);
      if (!grip.fixed && item.system.weaponSubtype !== "ranged") {
        targets.set(item.id, { item, slot: "mainHand", to: { equipped: true, held: "1h" } });
      } else unequip.set(item.id, { item, slot: "mainHand" });
    }
  }

  // Rings: an unordered pair; Ignore keeps a current ring while there is room (§3.4).
  if (RINGS.some((k) => slots[k].state !== "ignore")) {
    const named = new Set([...targets.values()].filter((t) => RINGS.includes(t.slot)).map((t) => t.item.id));
    const unresolved = RINGS.filter((k) => slots[k].state === "item" && !targetIn(k)).length;
    let room = RINGS.filter((k) => slots[k].state === "ignore").length + unresolved;
    for (const item of occ.rings) {
      if (named.has(item.id)) continue;
      if (room > 0) {
        room--;
        continue;
      }
      unequip.set(item.id, { item, slot: "ring" });
    }
  }

  const changes = [];
  const push = (item, slot, to, op) =>
    changes.push({
      itemId: item.id,
      label: item.name,
      slot,
      kind: kindOf(item),
      op,
      from: { equipped: item.system.equipped === true, held: item.type === "weapon" ? liveHeld(item) : null },
      to,
      cost: null,
    });

  for (const { item, slot, to } of targets.values()) {
    const equipped = item.system.equipped === true;
    if (to.equipped && !equipped) push(item, slot, to, "equip");
    else if (!to.equipped && equipped) push(item, slot, { equipped: false, held: null }, "unequip");
    else if (to.equipped && to.held && to.held !== liveHeld(item)) push(item, slot, to, "regrip");
  }
  for (const { item, slot } of unequip.values()) {
    if (!targets.has(item.id)) push(item, slot, { equipped: false, held: null }, "unequip");
  }

  return { changes, missing, skipped, active: targets.size + emptySlots > 0 };
}

/** Applying would change nothing (§5). */
export function isCurrent(actor, profile) {
  const plan = buildPlan(actor, profile);
  return plan.active && plan.changes.length === 0;
}

/** Same change: same item, op and end state. Used to intersect a re-plan with the approved plan (§7.3). */
export const sameChange = (a, b) =>
  a.itemId === b.itemId && a.op === b.op && a.to.equipped === b.to.equipped && (a.to.held ?? null) === (b.to.held ?? null);

export function toUpdates(actor, changes) {
  const updates = [];
  for (const change of changes) {
    const item = actor.items.get(change.itemId);
    if (!item) continue;
    const update = { _id: item.id, "system.equipped": change.to.equipped };
    if (change.to.held && item.system.held !== change.to.held) update["system.held"] = change.to.held;
    updates.push(update);
  }
  return updates;
}
