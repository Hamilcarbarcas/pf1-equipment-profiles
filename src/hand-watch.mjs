/**
 * Watches rule requirements: fires `pf1EquipmentProfiles.handsChanged` and handles lapses.
 * DESIGN.md §17.5–17.6.
 *
 * A lapse is an active item carrying a watched boolean flag being switched off or deleted while
 * no other item still supplies the flag. Item hooks fire on every client; one prompts (§17.6).
 */

import { MODULE_ID } from "./const.mjs";
import { lapseRegrip, promptRegrab } from "./hand-actions.mjs";
import {
  allRules,
  availableGrips,
  defaultGrip,
  handsFreeNow,
  liveHeld,
  requirementMet,
  rulesFor,
  usage,
  watchedFlags,
} from "./hands.mjs";

const DELAY = 50;

/** Last usage per actor, for the hook's `before`. */
const lastUsage = new Map();
const pending = new Map();

const ownFlags = (item) => Object.keys(item?.system?.flags?.boolean ?? {});

function usageMap(actor) {
  const map = {};
  for (const item of actor.items) {
    const u = usage(item);
    if (u) map[item.id] = u.grip;
  }
  return map;
}

const sameMap = (a, b) => {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...keys].every((k) => a?.[k] === b?.[k]);
};

function isPrompter(actor) {
  return !!actor.activeOwner?.isSelf;
}

/** Collapse a burst of item changes (toggle then delete) into one check per actor. */
function schedule(actor, lost = []) {
  const key = actor.uuid;
  const entry = pending.get(key) ?? { actor, lost: new Set() };
  for (const flag of lost) entry.lost.add(flag);
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    pending.delete(key);
    run(entry.actor, entry.lost).catch((err) => console.error(`${MODULE_ID} | hand lapse failed`, err));
  }, DELAY);
  pending.set(key, entry);
}

async function run(actor, lost) {
  const before = lastUsage.get(actor.uuid) ?? null;
  const after = usageMap(actor);
  lastUsage.set(actor.uuid, after);
  if (before && !sameMap(before, after)) Hooks.callAll("pf1EquipmentProfiles.handsChanged", actor, before, after);

  const gone = [...lost].filter((flag) => !requirementMet(actor, flag));
  if (!gone.length || !isPrompter(actor)) return;

  for (const rule of allRules()) {
    const entries = [...(rule.add ?? []), ...(rule.force ? [rule.force] : [])];
    const hit = entries.find((e) => gone.includes(e.requires));
    if (!hit || !rule.lapse) continue;
    for (const item of [...actor.items]) {
      if (item.system?.equipped !== true || !rulesFor(item).some((r) => r.id === rule.id)) continue;
      await lapse(actor, item, rule, hit);
    }
  }
}

async function lapse(actor, item, rule, entry) {
  switch (rule.lapse) {
    case "regrab":
      // Only a shield that now needs its hand again: not a buckler, not still hands-free.
      if (defaultGrip(item) === "none" || handsFreeNow(item)) return;
      return promptRegrab(actor, item);
    case "regrip":
      if (liveHeld(item) !== entry.grip || availableGrips(item).includes(entry.grip)) return;
      return lapseRegrip(actor, item);
    case "warn":
      ui.notifications.warn(game.i18n.format("PF1EP.Hands.Lapsed", { item: item.name, actor: actor.name }));
  }
}

/** Watched flags this item supplied before the change, if the change switched it off. */
function lostBy(item, changes) {
  const flags = ownFlags(item).filter((f) => watchedFlags().has(f));
  if (!flags.length) return [];
  const touched = ["system.active", "system.equipped", "system.disabled"].some((p) => foundry.utils.hasProperty(changes, p));
  return touched && !item.isActive ? flags : [];
}

export function registerHandWatch() {
  Hooks.on("updateItem", (item, changes) => {
    if (item.actor) schedule(item.actor, lostBy(item, changes));
  });
  Hooks.on("deleteItem", (item) => {
    if (!item.actor) return;
    const flags = item.isActive ? ownFlags(item).filter((f) => watchedFlags().has(f)) : [];
    schedule(item.actor, flags);
  });
  Hooks.on("createItem", (item) => {
    if (item.actor) schedule(item.actor);
  });
}
