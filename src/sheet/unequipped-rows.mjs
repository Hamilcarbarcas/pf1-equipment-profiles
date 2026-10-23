/**
 * Combat tab: gray out and strike through unequipped weapons. DESIGN.md §16.
 *
 * Display only; the prompt on use is in ../unequipped.mjs.
 */

import { CSS } from "../const.mjs";
import { isUnequippedWeapon, unequippedEnabled } from "../unequipped.mjs";

export function registerUnequippedRows() {
  Hooks.on("renderActorSheet", (app, html) => {
    if (!unequippedEnabled()) return;
    const actor = app.actor;
    if (!actor || !["character", "npc"].includes(actor.type)) return;

    const root = html instanceof HTMLElement ? html : html?.[0];
    for (const row of root?.querySelectorAll(".tab.combat li.item[data-item-id]") ?? []) {
      if (!isUnequippedWeapon(actor.items.get(row.dataset.itemId))) continue;
      row.classList.add(`${CSS}unequipped`);
      row.querySelector(".item-name")?.setAttribute("data-tooltip", "PF1EP.Unequipped.Row");
    }
  });
}
