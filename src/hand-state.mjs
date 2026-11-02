/**
 * Live hand state and conflicts. DESIGN.md §17.5.
 *
 * Only the held items count: the first main-hand weapon, the first off-hand weapon, and the
 * shield, as capture reads them (§6.3). Spare equipped weapons are carried, not held.
 */

import { disabledSet, isOff } from "./actor-slots.mjs";
import { HANDS, occupancy } from "./slots.mjs";
import { grips, invalidHeld, liveHeld, rulesFor, usage } from "./hands.mjs";

const lapseRule = (item, lapse) => rulesFor(item).find((r) => r.lapse === lapse)?.id ?? null;

/**
 * @returns {{budget: number, used: number, free: number, main: Item|null, off: Item|null,
 *   shield: Item|null, items: object[], conflicts: {kind: string, items: Item[], rule: string|null}[]}}
 */
export function handState(actor) {
  const occ = occupancy(actor);
  const main = occ.mainHand[0] ?? null;
  const off = occ.offHand[0] ?? null;
  const shield = occ.shield[0] ?? null;

  const disabled = disabledSet(actor);
  const budget = HANDS.filter((k) => !isOff(k, disabled)).length;
  const items = [main, off, shield].filter(Boolean).map((item) => ({ item, ...usage(item) }));
  const used = items.reduce((n, u) => n + u.hands, 0);

  const conflicts = [];
  if (shield && usage(shield).hands > 0) {
    const rivals = [main && usage(main).side === "both" ? main : null, off].filter(Boolean);
    if (rivals.length) conflicts.push({ kind: "overBudget", items: [shield, ...rivals], rule: lapseRule(shield, "regrab") });
  }
  for (const item of [main, off]) {
    if (!item || !invalidHeld(item)) continue;
    const held = liveHeld(item);
    conflicts.push({ kind: "invalidGrip", items: [item], rule: grips(item).find((g) => g.rule && g.grip === held)?.rule ?? null });
  }

  return { budget, used, free: Math.max(0, budget - used), main, off, shield, items, conflicts };
}
