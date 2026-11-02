/**
 * Build profile slots from what is equipped now. DESIGN.md §6.3.
 */

import { PROFILE_VERSION, blankSlots, itemRef } from "./store.mjs";
import { blockingToggle, disabledSet, isOff } from "./actor-slots.mjs";
import { RINGS, SHIELD, occupancy } from "./slots.mjs";
import { liveGrip } from "./hands.mjs";

const itemSlot = (item, held = null) => ({ state: "item", item: itemRef(item), held });

/** Unoccupied slots stay Ignore. */
export function capture(actor) {
  const occ = occupancy(actor);
  const slots = blankSlots();
  const other = [];

  const [off, ...spareOff] = occ.offHand;
  if (off) slots.offHand = itemSlot(off, "oh");
  for (const extra of spareOff) other.push({ item: itemRef(extra), equipped: true });

  // The shield's grip is recorded, so a hands-free shield reads back as one (§17.2).
  const shield = occ.shield[0];
  if (shield) slots[SHIELD] = itemSlot(shield, liveGrip(shield));

  const [main, ...spare] = occ.mainHand;
  if (main) slots.mainHand = itemSlot(main, liveGrip(main) === "2h" ? "2h" : "1h");
  for (const item of spare) other.push({ item: itemRef(item), equipped: true });

  for (const key of Object.keys(slots)) {
    if (key === "mainHand" || key === "offHand" || key === SHIELD || RINGS.includes(key)) continue;
    const item = occ[key]?.[0];
    if (item) slots[key] = itemSlot(item);
  }

  occ.rings.slice(0, 2).forEach((ring, i) => (slots[RINGS[i]] = itemSlot(ring)));
  for (const item of occ.other) other.push({ item: itemRef(item), equipped: true });

  // Disabled slots (§3.7) stay Ignore even when something was equipped there before.
  const disabled = disabledSet(actor);
  if (disabled.size) {
    for (const key of Object.keys(slots)) if (isOff(key, disabled)) slots[key] = blankSlots()[key];
    const keep = other.filter((o) => {
      const item = actor.items.get(o.item.id);
      return !item || !blockingToggle(item, disabled);
    });
    other.splice(0, other.length, ...keep);
  }

  return { version: PROFILE_VERSION, slots, other };
}
