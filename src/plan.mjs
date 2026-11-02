/**
 * Profile → list of changes. DESIGN.md §7.1–7.2, hands §17.10.
 */

import { blockingToggle, disabledSet, isOff } from "./actor-slots.mjs";
import { findInContainer, resolveRef } from "./match.mjs";
import { RINGS, SHIELD, SLOTS, fits, kindOf, occupancy } from "./slots.mjs";
import { availableGrips, liveGrip, liveHeld, mainGrip, requirementFor } from "./hands.mjs";

const sameName = (item, ref) => item.type === ref.type && item._source.name === ref.name;

/** Occupancy bucket a profile slot key reads from. */
const bucketFor = (key) => (RINGS.includes(key) ? "rings" : key);

/**
 * Main-hand grip to write. A stored grip that is no longer usable falls back to the default; when
 * it was a rule grip, the unmet requirement is reported (§17.6).
 */
function planMainHeld(item, stored, note) {
  const grip = mainGrip(item);
  if (stored && grip.options.includes(stored)) return grip.fixed ? grip.held : stored;
  if (stored) note(item, "mainHand", stored);
  return grip.held;
}

/** Shield grip for this plan: the stored one when usable now, else the live one (§17.2). */
function planShieldGrip(item, stored, note) {
  const avail = availableGrips(item);
  if (stored && avail.includes(stored)) return stored;
  if (stored) note(item, SHIELD, stored);
  return avail[0] ?? "oh";
}

/**
 * @param {Actor} actor
 * @param {object} profile - Normalized profile.
 * @returns {{changes: object[], missing: object[], skipped: object[], unmet: object[], active: boolean}}
 *   `active` is false for a profile that sets nothing it can act on. `unmet` lists rule grips the
 *   profile asks for whose requirement doesn't hold now (§17.6).
 */
export function buildPlan(actor, profile) {
  const skipped = [];
  const unmet = [];
  const note = (item, slot, grip) => {
    const req = requirementFor(item, grip);
    if (req && !req.met) unmet.push({ item, slot, grip, requires: req.requires, rule: req.rule, label: req.label, icon: req.icon });
  };

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

    const wantHeld = key === "offHand" ? "oh" : key === "mainHand" ? slot.held : null;
    const item = resolveRef(actor, slot.item, {
      claimed,
      inSlot: (i) => bucket.get(i.id) === bucketFor(key) && (i.type !== "weapon" || !wantHeld || liveGrip(i) === wantHeld),
      replaceable,
    });
    if (!item) {
      missing.push({ ref: slot.item, slot: key, container: findInContainer(actor, slot.item) });
      continue;
    }
    if (!fits(item, key)) {
      if (key === "offHand") note(item, key, "oh");
      skipped.push({ item, slot: key, reason: "fit" });
      continue;
    }

    claimed.add(item.id);
    const to = { equipped: true, held: null };
    let grip = null;
    if (key === "mainHand") grip = to.held = planMainHeld(item, slot.held, note);
    else if (key === "offHand") grip = to.held = "oh";
    else if (key === SHIELD) grip = planShieldGrip(item, slot.held, note);
    targets.set(item.id, { item, slot: key, to, grip });
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
    targets.set(item.id, { item, slot: "other", to: { equipped: o.equipped, held: null }, grip: null });
  }

  const targetIn = (key) => [...targets.values()].find((t) => t.slot === key) ?? null;
  const drop = (target, reason) => {
    targets.delete(target.item.id);
    skipped.push({ item: target.item, slot: target.slot, reason });
  };
  const usesHand = (target) => !!target && target.grip !== "none";

  const mainTarget = targetIn("mainHand");
  let offTarget = targetIn("offHand");
  let shieldTarget = targetIn(SHIELD);

  // A 2h main hand wins over the off hand and a hand-using shield (§3.3, §17.10).
  if (mainTarget?.to.held === "2h") {
    if (offTarget) drop(offTarget, "twoHanded");
    if (usesHand(shieldTarget)) drop(shieldTarget, "twoHanded");
    offTarget = targetIn("offHand");
    shieldTarget = targetIn(SHIELD);
  }
  // An off-hand weapon and a hand-using shield both want the off hand; the weapon wins.
  if (offTarget && usesHand(shieldTarget)) {
    drop(shieldTarget, "offHand");
    shieldTarget = null;
  }

  const unequip = new Map();
  const vacate = (key, list, keep = () => false) => {
    for (const item of list) {
      if (!targets.has(item.id) && !keep(item)) unequip.set(item.id, { item, slot: key });
    }
  };
  const handsFree = (item) => liveGrip(item) === "none";

  for (const key of SLOTS) {
    if (RINGS.includes(key) || slots[key].state === "ignore") continue;
    // A missing item leaves its slot as it is rather than stripping it.
    if (slots[key].state === "item" && !targetIn(key)) continue;
    vacate(key, occ[key]);
  }

  // Knock-ons for the off hand (§3.3, §17.10). Hands-free shields always stay.
  if (mainTarget?.to.held === "2h") {
    vacate("offHand", occ.offHand);
    vacate(SHIELD, occ.shield, handsFree);
  }
  if (offTarget) vacate(SHIELD, occ.shield, handsFree);
  if (usesHand(shieldTarget)) vacate("offHand", occ.offHand);

  // Filling the off hand beside an untouched 2h grip regrips it to 1h, or unequips it when it
  // cannot be wielded one-handed.
  if (!mainTarget && slots.mainHand.state === "ignore" && (offTarget || usesHand(shieldTarget))) {
    for (const item of occ.mainHand) {
      if (targets.has(item.id) || liveGrip(item) !== "2h") continue;
      if (mainGrip(item).options.includes("1h")) {
        targets.set(item.id, { item, slot: "mainHand", to: { equipped: true, held: "1h" }, grip: "1h" });
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

  return { changes, missing, skipped, unmet, active: targets.size + emptySlots > 0 };
}

/** Applying would change nothing, and nothing it asks for is waiting on a requirement (§5, §17.6). */
export function isCurrent(actor, profile) {
  const plan = buildPlan(actor, profile);
  return plan.active && plan.changes.length === 0 && plan.unmet.length === 0;
}

/** Rule grips a profile relies on, met or not: `[{ requires, label, icon, met }]`, one per requirement (§17.8). */
export function profileRequirements(actor, profile) {
  const found = new Map();
  const check = (key, grip) => {
    const slot = profile.slots[key];
    if (slot?.state !== "item" || !grip) return;
    const item = resolveRef(actor, slot.item, { claimed: new Set() });
    const req = item && requirementFor(item, grip);
    if (req && !found.has(req.requires)) found.set(req.requires, { requires: req.requires, label: req.label, icon: req.icon, met: req.met });
  };
  check("mainHand", profile.slots.mainHand?.held);
  check("offHand", "oh");
  check(SHIELD, profile.slots[SHIELD]?.held);
  return [...found.values()];
}

/** " (Mounted)" after a profile's name when it relies on a rule grip (§17.8). */
export function requirementSuffix(actor, profile) {
  const labels = profileRequirements(actor, profile).map((r) => (r.label ? game.i18n.localize(r.label) : String(r.requires)));
  return labels.length ? ` (${labels.join(", ")})` : "";
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
