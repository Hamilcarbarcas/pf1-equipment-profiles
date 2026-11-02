/**
 * Grip config on weapons and attacks, and the Held selects it limits. DESIGN.md §17.3.
 *
 * The Grips row sits on the Details tab after Hands (weapons) or Held (attacks). Unset follows
 * type and Hands; a tick that matches that default clears the flag again, so the flag only exists
 * while it differs. The checkboxes carry no `name`, so the sheet's submit never sweeps them up.
 */

import { CSS, MODULE_ID } from "../const.mjs";
import { GRIPS, availableGrips, derivedGrips, gripConfig, hasHeld } from "../hands.mjs";

const t = (key) => game.i18n.localize(key);
const rootOf = (html) => (html instanceof HTMLElement ? html : html?.[0]);
const sameSet = (a, b) => a.length === b.length && a.every((g) => b.includes(g));

function anchorFor(item, root) {
  const tab = root.querySelector('.tab[data-tab="details"]') ?? root;
  const field = item.type === "weapon" ? tab.querySelector('input[name="system.hands"]') : tab.querySelector('select[name="system.held"]');
  return field?.closest(".form-group") ?? null;
}

function injectGrips(sheet, html, options) {
  const item = sheet.document;
  if (!hasHeld(item) || !options?.editable) return;
  const root = rootOf(html);
  const anchor = root && anchorFor(item, root);
  if (!anchor || root.querySelector(`.${CSS}grips`)) return;

  const current = gripConfig(item) ?? derivedGrips(item);
  const row = document.createElement("div");
  row.className = `form-group ${CSS}grips`;
  row.innerHTML = `
    <label data-tooltip="PF1EP.Grips.Hint">${t("PF1EP.Grips.Label")}${gripConfig(item) ? "" : ` <span class="${CSS}grips-default">(${t("PF1EP.Grips.Default")})</span>`}</label>
    <div class="form-fields">
      ${GRIPS.map((g) => `<label class="checkbox"><input type="checkbox" data-grip="${g}"${current.includes(g) ? " checked" : ""}> ${t(`PF1EP.Grip.${g}`)}</label>`).join("")}
    </div>`;
  anchor.after(row);

  row.addEventListener("change", async (event) => {
    const box = event.target.closest("input[data-grip]");
    if (!box) return;
    event.stopPropagation();
    const list = GRIPS.filter((g) => row.querySelector(`input[data-grip="${g}"]`).checked);
    if (!list.length) {
      box.checked = true;
      ui.notifications.warn("PF1EP.Grips.NeedOne", { localize: true });
      return;
    }
    const path = `flags.${MODULE_ID}`;
    if (sameSet(list, derivedGrips(item))) await item.update({ [`${path}.-=grips`]: null });
    else await item.update({ [`${path}.grips`]: list });
  });
}

/** Drop Held options the item can't take; the stored value stays so nothing changes silently. */
function limitHeld(select, allowed) {
  if (!select) return;
  for (const option of [...select.options]) {
    if (!option.value || option.selected || allowed.includes(option.value)) continue;
    option.remove();
  }
}

export function registerGripConfig() {
  Hooks.on("renderItemSheetPF", (sheet, html, options) => {
    try {
      const item = sheet.document;
      if (!hasHeld(item)) return;
      injectGrips(sheet, html, options);
      limitHeld(rootOf(html)?.querySelector('select[name="system.held"]'), availableGrips(item, { profile: true }));
    } catch (err) {
      console.error(`${MODULE_ID} | grip config failed:`, err);
    }
  });

  // The action's own Held override, and the attack dialog's per-use Held (§17.3).
  Hooks.on("renderItemActionSheet", (app, html) => {
    try {
      if (hasHeld(app.item)) limitHeld(rootOf(html)?.querySelector('select[name="held"]'), availableGrips(app.item, { profile: true }));
    } catch (err) {
      console.error(`${MODULE_ID} | action Held limit failed:`, err);
    }
  });
  Hooks.on("renderAttackDialog", (app, html) => {
    try {
      if (hasHeld(app.item)) limitHeld(rootOf(html)?.querySelector('select[name="held"]'), availableGrips(app.item));
    } catch (err) {
      console.error(`${MODULE_ID} | attack dialog Held limit failed:`, err);
    }
  });
}
