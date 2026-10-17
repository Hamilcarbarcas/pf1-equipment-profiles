/**
 * "Wearable with other armor" toggle on armor items' Advanced tab. DESIGN.md §3.6.
 *
 * Tri-state on the item: unset follows the base-type default (on for armored coat and kilt);
 * ticking or unticking stores an explicit boolean.
 */

import { CSS, MODULE_ID } from "../const.mjs";
import { isArmor, isLayer } from "../slots.mjs";
import { makeCollapsible, setBadge } from "../common/sheet/collapse.mjs";
import { bindFields } from "../common/sheet/field-bind.mjs";

const MARKER = `${CSS}sheet`;
const t = (key) => game.i18n.localize(key);

function markup() {
  return `
<div class="${MARKER}">
  <h3 class="form-header ${MARKER}-header">
    <i class="fa-solid fa-user-shield"></i> ${t("PF1EP.Sheet.Title")}
  </h3>
  <div class="${MARKER}-body">
    <div class="form-group">
      <label class="checkbox"><input type="checkbox" data-field="layer"/> ${t("PF1EP.Sheet.Layer")}</label>
    </div>
    <p class="notes">${t("PF1EP.Sheet.LayerHint")}</p>
  </div>
</div>`;
}

function inject(sheet, html, options) {
  const item = sheet.document;
  if (!isArmor(item) || !options?.editable) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const tab = root?.querySelector('.tab[data-tab="advanced"]');
  if (!tab || tab.querySelector(`.${MARKER}`)) return;

  const holder = document.createElement("div");
  holder.innerHTML = markup();
  const section = holder.firstElementChild;
  tab.append(section);

  const badge = () => setBadge(section, isLayer(item) ? t("PF1EP.Sheet.LayerBadge") : "");

  bindFields(section, {
    doc: item,
    base: `flags.${MODULE_ID}`,
    values: { layer: isLayer(item) },
    fields: { layer: { type: "checkbox", onChange: badge } },
  });

  makeCollapsible(sheet, section, {
    key: "layer",
    marker: MARKER,
    configured: isLayer(item),
    badge: "",
  });
  badge();
}

export function registerLayerSection() {
  Hooks.on("renderItemSheetPF", (sheet, html, options) => {
    try {
      inject(sheet, html, options);
    } catch (err) {
      console.error(`${MODULE_ID} | layer section failed:`, err);
    }
  });
}
