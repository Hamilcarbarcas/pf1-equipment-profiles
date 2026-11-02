/**
 * Combat tab grip chip and equip toggle on weapon and attack rows. DESIGN.md §17.8.
 *
 * The chip shows the current grip; a click steps to the next grip usable now through `setGrip`,
 * so a held weapon's knock-ons and gates apply. A grip the item can no longer take is marked, and
 * a click corrects it. The toggle (weapons only) equips into the grip's hand(s) through
 * `setWielded`. Both sit right-aligned so they line up down the list.
 */

import { CSS, MODULE_ID } from "../const.mjs";
import { GRIPS, availableGrips, gripMatters, invalidHeld, liveGrip, liveHeld } from "../hands.mjs";
import { setGrip, setWielded } from "../hand-actions.mjs";

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

function chip(item) {
  const options = availableGrips(item).filter((g) => GRIPS.includes(g));
  const current = item.type === "weapon" && item.system.equipped === true ? liveGrip(item) : liveHeld(item);
  const invalid = item.system.equipped === true && invalidHeld(item);
  const clickable = options.length > 1 || !options.includes(current);

  const el = document.createElement("a");
  el.className = `${CSS}grip-chip`;
  el.classList.toggle("fixed", !clickable);
  el.classList.toggle("invalid", invalid);
  el.textContent = t(`PF1EP.Grip.${current}`);

  const tips = [t(pf1.config.weaponHoldTypes[current] ?? current)];
  if (invalid) tips.push(t("PF1EP.Grips.ChipInvalid"));
  else if (clickable) tips.push(t("PF1EP.Grips.ChipCycle"));
  const own = (item.actions ?? []).filter((a) => a.hasAttack && a.held).map((a) => a.name);
  if (own.length) tips.push(t("PF1EP.Grips.ChipActions", { actions: own.join(", ") }));
  el.dataset.tooltip = tips.join("<br>");

  el.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!clickable) return;
    const next = options[(options.indexOf(current) + 1) % options.length];
    setGrip(item, next, { quiet: false }).catch((err) => console.error(`${MODULE_ID} | grip chip failed`, err));
  });
  return el;
}

/** Attack items have no equipped state; they get a spacer so their chips line up. */
function equipToggle(item) {
  const el = document.createElement("a");
  el.className = `${CSS}equip-toggle`;
  if (item.type !== "weapon") {
    el.classList.add("spacer");
    return el;
  }
  const equipped = item.system.equipped === true;
  el.classList.toggle("active", equipped);
  el.innerHTML = `<i class="fa-solid fa-hand-fist"></i>`;
  el.dataset.tooltip = t(equipped ? "PF1EP.Grips.ToggleUnequip" : "PF1EP.Grips.ToggleEquip");

  el.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setWielded(item, !equipped).catch((err) => console.error(`${MODULE_ID} | equip toggle failed`, err));
  });
  return el;
}

export function registerGripChips() {
  Hooks.on("renderActorSheet", (app, html) => {
    try {
      const actor = app.actor;
      if (!actor?.isOwner || !["character", "npc"].includes(actor.type)) return;
      const root = html instanceof HTMLElement ? html : html?.[0];
      for (const row of root?.querySelectorAll(".tab.combat li.item[data-item-id]") ?? []) {
        const item = actor.items.get(row.dataset.itemId);
        const name = row.querySelector(".item-name");
        if (!gripMatters(item) || !name || name.querySelector(`.${CSS}hand-controls`)) continue;
        const group = document.createElement("span");
        group.className = `${CSS}hand-controls`;
        group.append(chip(item), equipToggle(item));
        name.append(group);
      }
    } catch (err) {
      console.error(`${MODULE_ID} | grip chips failed:`, err);
    }
  });
}
