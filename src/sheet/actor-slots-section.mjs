/**
 * "Disabled Equipment Slots" block on the actor sheet's Settings tab. DESIGN.md §3.7.
 */

import { CSS, MODULE_ID } from "../const.mjs";
import { TOGGLES, disabledSet, setDisabled, toggleLabel } from "../actor-slots.mjs";

const esc = foundry.utils.escapeHTML;
const t = (key) => game.i18n.localize(key);

function inject(app, html) {
  const actor = app.actor;
  if (!actor?.isOwner || !["character", "npc"].includes(actor.type)) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const tab = root?.querySelector('.tab[data-tab="settings"]');
  if (!tab || tab.querySelector(`:scope > .${CSS}actor-slots`)) return;

  const off = disabledSet(actor);
  const editable = app.isEditable !== false;
  const boxes = TOGGLES.map(
    (key) =>
      `<label class="checkbox"><input type="checkbox" data-pep-slot="${key}"${off.has(key) ? " checked" : ""}${
        editable ? "" : " disabled"
      }> ${esc(toggleLabel(key))}</label>`
  ).join("");

  const block = document.createElement("div");
  block.className = `${CSS}actor-slots`;
  block.innerHTML = `<h2>${esc(t("PF1EP.ActorSlots.Title"))}</h2>
<div class="${CSS}slot-toggles">${boxes}</div>
<p class="notes">${esc(t("PF1EP.ActorSlots.Hint"))}</p>`;

  block.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-pep-slot]");
    if (!input) return;
    // The sheet's own form would otherwise submit on this change.
    event.stopPropagation();
    const keys = new Set(
      [...block.querySelectorAll("input[data-pep-slot]:checked")].map((el) => el.dataset.pepSlot)
    );
    setDisabled(actor, keys);
  });

  tab.append(block);
}

export function registerActorSlotsSection() {
  Hooks.on("renderActorSheet", (app, html) => {
    try {
      inject(app, html);
    } catch (err) {
      console.error(`${MODULE_ID} | disabled-slots section failed:`, err);
    }
  });
}
