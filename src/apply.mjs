/**
 * Applying a profile: plan → hooks → gates → re-plan → one batched write → report.
 * DESIGN.md §7.3–7.4.
 */

import { CSS, MODULE_ID, TEMPLATES } from "./const.mjs";
import { KEYS, setting } from "./settings.mjs";
import { buildPlan, sameChange, toUpdates } from "./plan.mjs";
import { hasGates, runGates } from "./gates.mjs";
import { refLabel } from "./store.mjs";

const pending = new Set();

export const isPending = (actor) => pending.has(actor.uuid);

/** Toggle the pending state on every rendered control row and equip window for this actor (§8.2). */
function markPending(actor, on) {
  const selector = `.${CSS}controls[data-actor-uuid="${actor.uuid}"], .${CSS}ew[data-actor-uuid="${actor.uuid}"]`;
  for (const row of document.querySelectorAll(selector)) {
    row.classList.toggle("pending", on);
    for (const el of row.querySelectorAll("button, select")) el.disabled = on;
  }
}

/**
 * @param {Actor} actor
 * @param {object} profile - Normalized profile.
 * @param {object} [options]
 * @param {boolean} [options.gates=true]
 * @param {string} [options.source="api"]
 * @param {boolean} [options.quiet=false] - No success toasts; warnings still show (live edits, §6.6).
 * @returns {Promise<object|null>} Result, or null when cancelled.
 */
export async function applyProfile(actor, profile, { gates = true, source = "api", quiet = false } = {}) {
  if (!actor?.isOwner) {
    ui.notifications.warn("PF1EP.Warn.NotOwner", { localize: true });
    return null;
  }
  if (isPending(actor)) {
    ui.notifications.warn(game.i18n.format("PF1EP.Warn.Pending", { actor: actor.name }));
    return null;
  }

  const plan = buildPlan(actor, profile);
  if (!plan.changes.length) {
    report(actor, profile, { changes: [], skipped: plan.skipped, missing: plan.missing, stale: [] }, quiet);
    return { applied: false, changes: [], skipped: plan.skipped, missing: plan.missing };
  }

  if (Hooks.call("pf1EquipmentProfiles.preApply", actor, profile, plan) === false) return null;

  pending.add(actor.uuid);
  markPending(actor, true);
  try {
    let changes = plan.changes;
    let stale = [];

    if (gates && hasGates()) {
      const request = {
        actor,
        token: actor.getActiveTokens()[0] ?? null,
        profile: { id: profile.id, name: profile.name },
        changes: plan.changes,
        source,
      };
      if (!(await runGates(request))) return null;

      // §7.3: the inventory may have moved while a gate held; write only what was approved.
      const replan = buildPlan(actor, profile);
      changes = replan.changes.filter((c) => plan.changes.some((a) => sameChange(a, c)));
      stale = replan.changes.filter((c) => !plan.changes.some((a) => sameChange(a, c)));
    }

    const updates = toUpdates(actor, changes);
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);

    const result = { applied: updates.length > 0, changes, skipped: plan.skipped, missing: plan.missing, stale };
    Hooks.callAll("pf1EquipmentProfiles.apply", actor, profile, result);
    report(actor, profile, result, quiet);
    if (result.applied && setting(KEYS.announce)) await announce(actor, profile, changes);
    return result;
  } finally {
    pending.delete(actor.uuid);
    markPending(actor, false);
  }
}

function missingLabel({ ref, container }) {
  const name = refLabel(ref);
  return container ? game.i18n.format("PF1EP.Report.InContainer", { item: name, container: container.name }) : name;
}

function report(actor, profile, { changes, skipped, missing, stale }, quiet = false) {
  const t = (key, data) => game.i18n.format(key, data);
  if (quiet) {
    // Live edits: the doll itself shows the result.
  } else if (changes.length) ui.notifications.info(t("PF1EP.Report.Applied", { profile: profile.name, count: changes.length }));
  else if (!missing.length) ui.notifications.info(t("PF1EP.Report.AlreadyEquipped", { profile: profile.name }));

  const rings = changes.filter((c) => c.slot === "ring" && c.op === "unequip").map((c) => c.label);
  if (rings.length && !quiet) ui.notifications.info(t("PF1EP.Report.RingsRemoved", { items: rings.join(", ") }));

  if (missing.length) ui.notifications.warn(t("PF1EP.Report.Missing", { profile: profile.name, items: missing.map(missingLabel).join(", ") }));

  const twoHanded = skipped.filter((s) => s.reason === "twoHanded").map((s) => s.item.name);
  if (twoHanded.length) ui.notifications.warn(t("PF1EP.Report.TwoHanded", { items: twoHanded.join(", ") }));
  const disabled = skipped.filter((s) => s.reason === "disabled").map((s) => s.item?.name ?? refLabel(s.ref));
  if (disabled.length) ui.notifications.warn(t("PF1EP.Report.Disabled", { items: disabled.join(", "), actor: actor.name }));
  const misfit = skipped.filter((s) => s.reason === "fit").map((s) => s.item.name);
  if (misfit.length) ui.notifications.warn(t("PF1EP.Report.NoLongerFits", { items: misfit.join(", ") }));

  if (stale.length) ui.notifications.warn(t("PF1EP.Report.Stale", { items: stale.map((c) => c.label).join(", ") }));
}

async function announce(actor, profile, changes) {
  const name = (change) => actor.items.get(change.itemId)?.getName?.(true) ?? change.label;
  const group = (op) => changes.filter((c) => c.op === op).map(name);
  const content = await foundry.applications.handlebars.renderTemplate(`${TEMPLATES}/chat-card.hbs`, {
    css: CSS,
    profile,
    equipped: group("equip"),
    unequipped: group("unequip"),
    regripped: changes.filter((c) => c.op === "regrip").map((c) => ({ name: name(c), held: game.i18n.localize(pf1.config.weaponHoldTypes[c.to.held]) })),
  });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content,
    flags: { [MODULE_ID]: { profile: profile.id } },
  });
}
