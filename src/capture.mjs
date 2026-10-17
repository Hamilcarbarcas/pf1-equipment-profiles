/**
 * Build profile slots from what is equipped now. DESIGN.md §6.3.
 */

import { blankSlots, itemRef } from "./store.mjs";
import { blockingToggle, disabledSet, isOff } from "./actor-slots.mjs";
import { RINGS, isShield, liveHeld, occupancy } from "./slots.mjs";

const itemSlot = (item, held = null) => ({ state: "item", item: itemRef(item), held });

/** Unoccupied slots stay Ignore. */
export function capture(actor) {
  const occ = occupancy(actor);
  const slots = blankSlots();
  const other = [];

  const off = occ.offHand.find((i) => !isShield(i)) ?? occ.offHand[0];
  if (off) slots.offHand = itemSlot(off, off.type === "weapon" ? "oh" : null);
  for (const extra of occ.offHand) {
    if (extra !== off && extra.type === "weapon") other.push({ item: itemRef(extra), equipped: true });
  }

  const [main, ...spare] = occ.mainHand;
  if (main) slots.mainHand = itemSlot(main, liveHeld(main) === "2h" ? "2h" : "1h");
  for (const item of spare) other.push({ item: itemRef(item), equipped: true });

  for (const key of Object.keys(slots)) {
    if (key === "mainHand" || key === "offHand" || RINGS.includes(key)) continue;
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

  return { slots, other };
}
