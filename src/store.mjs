/**
 * Profile storage in actor flags. DESIGN.md §5.
 *
 * Every slot is written explicitly (Ignore included) so a plain merge-update can never leave a
 * stale slot behind; writes go to per-profile paths so concurrent edits to different profiles
 * cannot overwrite each other.
 */

import { MODULE_ID } from "./const.mjs";
import { SLOTS } from "./slots.mjs";

export const DEFAULT_ICON = "fa-solid fa-shield-halved";

const IGNORE = Object.freeze({ state: "ignore", item: null, held: null });

/** Stored item reference (§4). `name` is the true name; `label` is what a player sees. */
export function itemRef(item) {
  return {
    name: item._source.name,
    type: item.type,
    id: item.id,
    label: item.getName?.(true) ?? item.name,
  };
}

/** Name to show for a stored reference whose item cannot be found. */
export const refLabel = (ref) => (game.user.isGM ? ref?.name : ref?.label) ?? ref?.name ?? "?";

export function blankSlots() {
  return Object.fromEntries(SLOTS.map((key) => [key, { ...IGNORE }]));
}

function normalizeSlot(slot) {
  if (slot?.state === "item" && slot.item?.name) {
    return { state: "item", item: { ...slot.item }, held: slot.held ?? null };
  }
  if (slot?.state === "empty") return { state: "empty", item: null, held: null };
  return { ...IGNORE };
}

export function normalize(profile) {
  const slots = blankSlots();
  for (const key of SLOTS) slots[key] = normalizeSlot(profile?.slots?.[key]);
  const other = (profile?.other ?? [])
    .filter((o) => o?.item?.name)
    .map((o) => ({ item: { ...o.item }, equipped: o.equipped !== false }));
  return {
    id: profile?.id || foundry.utils.randomID(16),
    name: String(profile?.name ?? "").trim() || game.i18n.localize("PF1EP.DefaultName"),
    icon: profile?.icon || DEFAULT_ICON,
    sort: Number.isFinite(profile?.sort) ? profile.sort : 0,
    quickAction: profile?.quickAction === true,
    slots,
    other,
  };
}

/** All profiles, in sort order. */
export function listProfiles(actor) {
  const map = actor?.getFlag(MODULE_ID, "profiles") ?? {};
  return Object.values(map)
    .filter((p) => p?.id)
    .map(normalize)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

/** By id, else by case-insensitive name. An ambiguous name throws. */
export function findProfile(actor, idOrName) {
  if (!idOrName) return null;
  const all = listProfiles(actor);
  const byId = all.find((p) => p.id === idOrName);
  if (byId) return byId;
  const needle = String(idOrName).toLowerCase();
  const byName = all.filter((p) => p.name.toLowerCase() === needle);
  if (byName.length > 1) throw new Error(`${MODULE_ID} | profile name "${idOrName}" is ambiguous on ${actor.name}`);
  return byName[0] ?? null;
}

export async function writeProfile(actor, profile) {
  const clean = normalize(profile);
  if (!Number.isFinite(profile?.sort)) {
    const sorts = listProfiles(actor).map((p) => p.sort);
    clean.sort = (sorts.length ? Math.max(...sorts) : 0) + 100;
  }
  await actor.update({ [`flags.${MODULE_ID}.profiles.${clean.id}`]: clean });
  return clean;
}

/** The deletion operator lives here only, so a v14 change is a one-line fix (§5). */
export async function deleteProfile(actor, id) {
  await actor.update({ [`flags.${MODULE_ID}.profiles.-=${id}`]: null });
}
