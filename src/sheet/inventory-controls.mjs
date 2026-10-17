/**
 * Inventory tab row: profile dropdown, Equip, Edit, New. DESIGN.md §9.
 *
 * PF1 v11 sheets are AppV1 (jQuery `html`). All sheet DOM work stays in this file so the v14
 * ApplicationV2 sheet needs only a replacement here (§9.3). Feature-specific row class, so the
 * de-dup below never removes another module's nodes.
 */

import { CSS } from "../const.mjs";
import { applyProfile, isPending } from "../apply.mjs";
import { isCurrent } from "../plan.mjs";
import { getSelected, setSelected } from "../selection.mjs";
import { listProfiles } from "../store.mjs";
import { EquipWindow } from "../apps/equip-window.mjs";

const esc = foundry.utils.escapeHTML;
const t = (key) => game.i18n.localize(key);

export function registerSheetHooks() {
  Hooks.on("renderActorSheet", onRenderSheet);
}

function onRenderSheet(app, html, data) {
  const actor = app.actor;
  if (!actor?.isOwner || data?.isLootSheet) return;
  if (!["character", "npc"].includes(actor.type)) return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  const header = root?.querySelector(".tab.inventory > header");
  if (!header) return;
  root.querySelector(`.tab.inventory > .${CSS}controls`)?.remove();
  header.after(buildRow(actor));
}

function buildRow(actor) {
  const profiles = listProfiles(actor);
  const current = new Set(profiles.filter((p) => isCurrent(actor, p)).map((p) => p.id));

  let selectedId = getSelected(actor);
  if (!profiles.some((p) => p.id === selectedId)) {
    selectedId = profiles.find((p) => current.has(p.id))?.id ?? profiles[0]?.id ?? null;
  }

  const row = document.createElement("div");
  row.className = `${CSS}controls`;
  row.dataset.actorUuid = actor.uuid;

  const button = (action, icon, label) =>
    `<button type="button" data-pep="${action}"><i class="fa-solid ${icon}" inert></i> ${esc(t(label))}</button>`;

  const parts = [button("live", "fa-user-shield", "PF1EP.Controls.Equipment")];
  if (profiles.length) {
    const options = profiles
      .map((p) => {
        const mark = current.has(p.id) ? "✓ " : "";
        return `<option value="${p.id}"${p.id === selectedId ? " selected" : ""}>${mark}${esc(p.name)}</option>`;
      })
      .join("");
    parts.push(
      `<select class="${CSS}select" data-tooltip="PF1EP.Controls.Select">${options}</select>`,
      button("equip", "fa-shirt", "PF1EP.Controls.Equip"),
      button("edit", "fa-pen-to-square", "PF1EP.Controls.Edit")
    );
  } else {
    parts.push(`<span class="${CSS}spacer"></span>`);
  }
  parts.push(button("new", "fa-plus", "PF1EP.Controls.New"));
  row.innerHTML = parts.join("");

  const select = row.querySelector("select");
  // Kept out of the sheet's submit-on-change.
  select?.addEventListener("change", (event) => {
    event.stopPropagation();
    setSelected(actor, select.value);
  });

  row.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-pep]");
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    const id = select?.value ?? null;
    const profile = profiles.find((p) => p.id === id) ?? null;
    switch (btn.dataset.pep) {
      case "live":
        EquipWindow.openLive(actor);
        break;
      case "equip":
        if (profile) applyProfile(actor, profile, { source: "sheet" });
        break;
      case "edit":
        if (profile) EquipWindow.open(actor, profile.id);
        break;
      case "new":
        EquipWindow.open(actor, null);
        break;
    }
  });

  if (isPending(actor)) {
    row.classList.add("pending");
    for (const el of row.querySelectorAll("button, select")) {
      if (el.dataset.pep !== "live") el.disabled = true;
    }
  }
  return row;
}
