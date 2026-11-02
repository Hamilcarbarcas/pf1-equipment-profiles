/**
 * Hand actions and prompts: setGrip, the lapse prompts, the unmet-requirement prompt, and the
 * use-time fallback. DESIGN.md §17.5–17.6.
 *
 * Every prompt works out its outcome when a button is clicked, so a player can free a hand while
 * it is open. Closing a prompt leaves the conflict; the doll's Resolve button reopens it.
 */

import { CSS } from "./const.mjs";
import { applyProfile } from "./apply.mjs";
import { capture } from "./capture.mjs";
import { buildPlan } from "./plan.mjs";
import { itemRef, normalize } from "./store.mjs";
import { clearSlot, place, release, setGripIn } from "./edit.mjs";
import { toggleLabel } from "./actor-slots.mjs";
import { handState } from "./hand-state.mjs";
import { availableGrips, hasHeld, isShield, liveHeld, mainGrip, rulesFor } from "./hands.mjs";

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Open prompts by key, so a repeated trigger doesn't stack a second one. */
const open = new Set();

const live = (actor) => normalize(capture(actor));
const isHeldNow = (actor, item) => {
  const cap = capture(actor);
  return [cap.slots.mainHand, cap.slots.offHand].some((s) => s.item?.id === item.id);
};

/** Items a profile would unequip, for the prompt text. */
function unequippedBy(actor, profile) {
  return buildPlan(actor, profile)
    .changes.filter((c) => c.op === "unequip")
    .map((c) => actor.items.get(c.itemId))
    .filter(Boolean);
}

const listOrNothing = (items) => (items.length ? items.map((i) => `<strong>${esc(i.name)}</strong>`).join(", ") : t("PF1EP.Hands.Nothing"));

async function ask(key, { title, icon, content, buttons }) {
  if (open.has(key)) return null;
  open.add(key);
  try {
    return await foundry.applications.api.DialogV2.wait({
      window: { title, icon },
      classes: [`${CSS}hand-prompt`],
      content,
      buttons,
      rejectClose: false,
    });
  } finally {
    open.delete(key);
  }
}

/* -------------------------------------------- */
/*  setGrip                                     */
/* -------------------------------------------- */

/**
 * Put a weapon or attack into `grip` (§17.5). A held weapon goes through the window's edit and
 * `applyProfile`, so gates and knock-ons apply; anything else just has its Held written.
 */
export async function setGrip(item, grip, { gates = true, quiet = true } = {}) {
  const actor = item?.actor;
  if (!actor || !hasHeld(item)) return null;
  if (!availableGrips(item).includes(grip)) {
    ui.notifications.warn(t("PF1EP.Warn.GripNotAllowed", { item: item.name }));
    return null;
  }
  if (item.type === "weapon" && item.system.equipped === true && isHeldNow(actor, item)) {
    const profile = live(actor);
    const result = setGripIn(actor, profile, item, grip);
    if (!result.ok) {
      ui.notifications.warn(t(result.warn, { item: item.name, slot: "", actor: actor.name }));
      return null;
    }
    return applyProfile(actor, profile, { gates, source: "grip", quiet });
  }
  if (item.system.held === grip) return { applied: false };
  await item.update({ "system.held": grip });
  return { applied: true };
}

/**
 * Equip a weapon into the hand(s) its grip names, or unequip it (§17.8). Same edit and
 * `applyProfile` as the window's live mode, so whatever holds those hands is unequipped.
 */
export async function setWielded(item, wield, { gates = true, quiet = true } = {}) {
  const actor = item?.actor;
  if (!actor || item.type !== "weapon") return null;
  const profile = live(actor);
  if (wield) {
    const held = liveHeld(item);
    const grip = availableGrips(item).includes(held) ? held : mainGrip(item).held;
    const result = setGripIn(actor, profile, item, grip);
    if (!result.ok) {
      const slot = result.data?.slot ? toggleLabel(result.data.slot) : "";
      ui.notifications.warn(t(result.warn, { item: item.name, slot, actor: actor.name }));
      return null;
    }
  } else {
    // A spare (equipped, not in a hand) sits in the Other list.
    const key = ["mainHand", "offHand"].find((k) => profile.slots[k].item?.id === item.id);
    if (key) clearSlot(actor, profile, key, { live: true });
    else {
      release(profile, item);
      profile.other.push({ item: itemRef(item), equipped: false });
    }
  }
  return applyProfile(actor, profile, { gates, source: "toggle", quiet });
}

/* -------------------------------------------- */
/*  Shield lapse: Re-grab / Drop                */
/* -------------------------------------------- */

function regrabProfile(actor, shield) {
  const profile = live(actor);
  place(actor, profile, "shield", shield, { live: true });
  return profile;
}

function dropProfile(actor) {
  const profile = live(actor);
  profile.slots.shield = { state: "empty", item: null, held: null };
  return profile;
}

/** The animated shield's time is up (§17.6). */
export async function promptRegrab(actor, shield) {
  const lost = unequippedBy(actor, regrabProfile(actor, shield));
  const choice = await ask(`${actor.uuid}:regrab:${shield.id}`, {
    title: t("PF1EP.Hands.Regrab.Title"),
    icon: "fa-solid fa-shield-halved",
    content: `<p>${t("PF1EP.Hands.Regrab.Body", { shield: `<strong>${esc(shield.name)}</strong>` })}</p>
      <p>${t("PF1EP.Hands.Regrab.Unequips", { items: listOrNothing(lost) })}</p>
      <p class="hint">${t("PF1EP.Hands.FreeFirst")}</p>`,
    buttons: [
      { action: "regrab", label: t("PF1EP.Hands.Regrab.Regrab"), icon: "fa-solid fa-hand-back-fist", default: true },
      { action: "drop", label: t("PF1EP.Hands.Regrab.Drop"), icon: "fa-solid fa-arrow-down" },
    ],
  });
  if (!actor.items.get(shield.id)?.system.equipped) return;
  if (choice === "regrab") await applyProfile(actor, regrabProfile(actor, shield), { source: "lapse" });
  else if (choice === "drop") await applyProfile(actor, dropProfile(actor), { source: "lapse" });
}

/* -------------------------------------------- */
/*  Lance lapse: Regrip Two-Handed / Stow       */
/* -------------------------------------------- */

function regripProfile(actor, weapon) {
  const profile = live(actor);
  const grip = mainGrip(weapon).held;
  const result = setGripIn(actor, profile, weapon, grip);
  return result.ok ? profile : null;
}

function stowProfile(actor, weapon) {
  const profile = live(actor);
  const key = profile.slots.offHand.item?.id === weapon.id ? "offHand" : "mainHand";
  profile.slots[key] = { state: "empty", item: null, held: null };
  return profile;
}

/**
 * A rule grip lapsed on a held weapon (the lance on dismount, §17.6). With nothing to displace it
 * regrips without asking. A weapon that isn't held just has its Held corrected.
 */
export async function lapseRegrip(actor, weapon) {
  const grip = mainGrip(weapon).held;
  if (!isHeldNow(actor, weapon)) {
    if (liveHeld(weapon) !== grip) await weapon.update({ "system.held": grip });
    return;
  }
  const profile = regripProfile(actor, weapon);
  if (!profile) return;
  const lost = unequippedBy(actor, profile).filter((i) => i.id !== weapon.id);
  if (!lost.length) {
    await applyProfile(actor, profile, { source: "lapse", quiet: true });
    return;
  }
  const choice = await ask(`${actor.uuid}:regrip:${weapon.id}`, {
    title: t("PF1EP.Hands.Regrip.Title"),
    icon: "fa-solid fa-hand",
    content: `<p>${t("PF1EP.Hands.Regrip.Body", { item: `<strong>${esc(weapon.name)}</strong>` })}</p>
      <p>${t("PF1EP.Hands.Regrip.Unequips", { items: listOrNothing(lost) })}</p>
      <p class="hint">${t("PF1EP.Hands.FreeFirst")}</p>`,
    buttons: [
      { action: "regrip", label: t("PF1EP.Hands.Regrip.Regrip"), icon: "fa-solid fa-link", default: true },
      { action: "stow", label: t("PF1EP.Hands.Regrip.Stow", { item: weapon.name }), icon: "fa-solid fa-box-archive" },
    ],
  });
  if (!actor.items.get(weapon.id)?.system.equipped) return;
  if (choice === "regrip") {
    const now = regripProfile(actor, weapon);
    if (now) await applyProfile(actor, now, { source: "lapse" });
  } else if (choice === "stow") await applyProfile(actor, stowProfile(actor, weapon), { source: "lapse" });
}

/* -------------------------------------------- */
/*  Use-time fallback                           */
/* -------------------------------------------- */

/**
 * A weapon whose Held its grips no longer allow is about to be used (§17.6 fallback).
 * @returns {Promise<boolean>} true to go ahead with the use.
 */
export async function confirmInvalidUse(item) {
  const choice = await ask(`${item.actor?.uuid}:use:${item.id}`, {
    title: t("PF1EP.Hands.Use.Title"),
    icon: "fa-solid fa-hand",
    content: `<p>${t("PF1EP.Hands.Use.Body", { item: `<strong>${esc(item.name)}</strong>` })}</p>`,
    buttons: [
      { action: "regrip", label: t("PF1EP.Hands.Regrip.Regrip"), icon: "fa-solid fa-link", default: true },
      { action: "use", label: t("PF1EP.Unequipped.UseAnyway"), icon: "fa-solid fa-sword" },
      { action: "cancel", label: t("Cancel"), icon: "fa-solid fa-xmark" },
    ],
  });
  if (choice === "use") return true;
  if (choice !== "regrip") return false;
  const result = await setGrip(item, mainGrip(item).held, { quiet: false });
  return !!result;
}

/* -------------------------------------------- */
/*  Unmet requirements on apply                 */
/* -------------------------------------------- */

const reqLabel = (u) => (u.label ? t(u.label) : String(u.requires));

/**
 * A profile asks for a rule grip whose requirement doesn't hold now (§17.6). Asked only when the
 * fallback loses something.
 * @returns {Promise<boolean>} true to apply with the fallback.
 */
export async function confirmUnmet(actor, profile, plan) {
  const dropped = plan.skipped.filter((s) => s.item && ["twoHanded", "offHand"].includes(s.reason)).map((s) => s.item);
  if (!dropped.length) return true;
  const needs = [...new Set(plan.unmet.map(reqLabel))].join(", ");
  const label =
    dropped.length === 1 && isShield(dropped[0])
      ? t("PF1EP.Hands.Unmet.DropShield")
      : t("PF1EP.Hands.Unmet.Without", { items: dropped.map((i) => i.name).join(", ") });
  const choice = await ask(`${actor.uuid}:unmet:${profile.id}`, {
    title: t("PF1EP.Hands.Unmet.Title", { needs }),
    icon: "fa-solid fa-hand",
    content: `<p>${t("PF1EP.Hands.Unmet.Body", { profile: `<strong>${esc(profile.name)}</strong>`, needs: esc(needs), items: listOrNothing(dropped) })}</p>`,
    buttons: [
      { action: "drop", label, icon: "fa-solid fa-arrow-down", default: true },
      { action: "cancel", label: t("Cancel"), icon: "fa-solid fa-xmark" },
    ],
  });
  return choice === "drop";
}

/* -------------------------------------------- */
/*  Resolve (doll button)                       */
/* -------------------------------------------- */

/** Reopen the prompt for each standing conflict (§17.6). */
export async function resolveConflicts(actor) {
  for (const conflict of handState(actor).conflicts) {
    const [item] = conflict.items;
    const lapse = conflict.rule ? rulesFor(item).find((r) => r.id === conflict.rule)?.lapse : null;
    if (conflict.kind === "overBudget" && isShield(item)) await promptRegrab(actor, item);
    else if (conflict.kind === "invalidGrip" && (lapse === "regrip" || !lapse)) await lapseRegrip(actor, item);
  }
}

