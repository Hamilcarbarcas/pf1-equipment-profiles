/**
 * Slot vocabulary, item → slot mapping, and live occupancy. DESIGN.md §3.
 */

import { MODULE_ID } from "./const.mjs";

export const HANDS = ["mainHand", "offHand"];
/** Doll columns (§3.1). Over Armor is drawn stacked under Armor, not as its own row. */
export const LEFT = ["head", "shoulders", "armor", "body", "chest", "belt", "feet"];
export const RIGHT = ["headband", "eyes", "neck", "wrists", "hands", "ring1", "ring2"];
export const RINGS = ["ring1", "ring2"];

/** Resolution order: hands first, then layout order (§4.1). */
export const SLOTS = [...HANDS, "head", "shoulders", "armor", "armorOver", "body", "chest", "belt", "feet", ...RIGHT];

const WONDROUS = new Set(["head", "headband", "eyes", "shoulders", "neck", "chest", "body", "belt", "wrists", "hands", "feet"]);

export const SLOT_ICONS = Object.freeze({
  mainHand: "fa-sword",
  offHand: "fa-shield-halved",
  head: "fa-helmet-battle",
  headband: "fa-crown",
  eyes: "fa-glasses",
  neck: "fa-gem",
  shoulders: "fa-hood-cloak",
  chest: "fa-vest",
  body: "fa-shirt-long-sleeve",
  armor: "fa-user-shield",
  armorOver: "fa-vest-patches",
  hands: "fa-mitten",
  wrists: "fa-hand-back-fist",
  belt: "fa-grip-lines",
  feet: "fa-boot",
  ring1: "fa-ring",
  ring2: "fa-ring",
});

export function slotLabel(key) {
  const slots = pf1.config.equipmentSlots;
  switch (key) {
    case "mainHand":
      return game.i18n.localize("PF1EP.Slot.MainHand");
    case "offHand":
      return game.i18n.localize("PF1EP.Slot.OffHand");
    case "armor":
      return game.i18n.localize(slots.armor.armor);
    case "armorOver":
      return game.i18n.localize("PF1EP.Slot.ArmorOver");
    case "clothing":
      return game.i18n.localize(slots.clothing.clothing);
    case "other":
      return game.i18n.localize("PF1EP.Window.Other");
    case "ring1":
    case "ring2":
      return game.i18n.localize(slots.wondrous.ring);
    default:
      return game.i18n.localize(slots.wondrous[key] ?? key);
  }
}

/** Item types the inventory tab offers an equip toggle for. */
export function isEquippable(item) {
  if (!item?.isPhysical) return false;
  switch (item.type) {
    case "weapon":
    case "equipment":
    case "container":
      return true;
    case "loot":
      return !pf1.config.unequippableLoot.includes(item.subType);
    default:
      return false;
  }
}

/** "hand" | "ring" | "other" | a worn slot key, or null when not equippable. */
export function regionOf(item) {
  if (!isEquippable(item)) return null;
  if (item.type === "weapon") return "hand";
  if (item.type !== "equipment") return "other";
  switch (item.subType) {
    case "armor":
      return "armor";
    case "shield":
      return "hand";
    case "clothing":
      return "other";
    default: {
      const slot = item.system.slot;
      if (slot === "ring") return "ring";
      return WONDROUS.has(slot) ? slot : "other";
    }
  }
}

/** Change `kind` (§7.2). */
export function kindOf(item) {
  if (item.type === "weapon") return "weapon";
  if (item.type === "equipment") {
    if (item.subType === "shield") return "shield";
    if (item.subType === "armor") return "armor";
    if (item.subType === "clothing" || regionOf(item) !== "other") return "worn";
  }
  return "other";
}

/** PF1 base types worn over another suit (§3.6). */
export const LAYER_BASE_TYPES = Object.freeze({ coat: "Armored Coat", kilt: "Armored Kilt" });

export const isArmor = (item) => item?.type === "equipment" && item.subType === "armor";

/** Default for the "wearable with other armor" toggle: on for PF1's coat and kilt base types. */
export function layerDefault(item) {
  const base = item?.system?.baseTypes ?? [];
  return Object.values(LAYER_BASE_TYPES).some((t) => base.includes(t));
}

/** Armor worn over another suit: the item's toggle when set, else `layerDefault` (§3.6). */
export function isLayer(item) {
  if (!isArmor(item)) return false;
  const flag = item.flags?.[MODULE_ID]?.layer;
  return typeof flag === "boolean" ? flag : layerDefault(item);
}

/** "coat" | "kilt" | null, by base type. */
export function layerKind(item) {
  const base = item?.system?.baseTypes ?? [];
  if (base.includes(LAYER_BASE_TYPES.coat)) return "coat";
  if (base.includes(LAYER_BASE_TYPES.kilt)) return "kilt";
  return null;
}

export const isHeavyArmor = (item) =>
  item?.type === "equipment" && item.subType === "armor" && item.system.equipmentSubtype === "heavyArmor";

/**
 * A weapon that can only be wielded two-handed, so never off-hand (§3.3): PF1's Two-Handed type,
 * or its "Hands" field at 2 or more (how bows, crossbows, and long guns are marked).
 */
export const isTwoHandedOnly = (item) =>
  item?.type === "weapon" && (item.system.weaponSubtype === "2h" || (Number(item.system.hands) || 1) >= 2);

export const isShield = (item) => item?.type === "equipment" && item.subType === "shield";

/** PF1's misc shield subtype, commented in its proficiency map as the buckler (§2). */
export const isBuckler = (item) => isShield(item) && item.system.equipmentSubtype === "other";

export function fits(item, slot) {
  const region = regionOf(item);
  if (!region) return false;
  switch (slot) {
    case "mainHand":
      return item.type === "weapon";
    case "offHand":
      return region === "hand" && !isTwoHandedOnly(item);
    case "ring1":
    case "ring2":
      return region === "ring";
    case "armorOver":
      return isLayer(item);
    case "other":
    case "clothing":
      return fitsBar(item, slot);
    default:
      return region === slot;
  }
}

export const isClothing = (item) => item?.type === "equipment" && item.subType === "clothing";

/** The two bars drawn over the one Other list (§6.1): clothing, and everything else. */
export const BARS = ["clothing", "other"];

/** Which bar an Other-list item shows in. */
export const barOf = (item) => (isClothing(item) ? "clothing" : "other");

/** Item fits that bar: Other-list material, and the bar matching its kind. */
export const fitsBar = (item, bar) => fitsOther(item) && barOf(item) === bar;

/** Other holds extra weapons, clothing, and anything without a slot (§3.2). */
export function fitsOther(item) {
  const region = regionOf(item);
  return region === "other" || item.type === "weapon";
}

/**
 * Hold the main hand defaults to, and whether it can be toggled (§3.3). Only a one-handed melee
 * weapon offers a choice; ranged weapons follow their Hands field.
 */
export function mainHandGrip(item) {
  if (isTwoHandedOnly(item)) return { held: "2h", fixed: true };
  switch (item.system.weaponSubtype) {
    case "light":
    case "ranged":
      return { held: "1h", fixed: true };
    default:
      return { held: "1h", fixed: false };
  }
}

/** Live item `held`, normalized; legacy "normal" and blank read as 1h. */
export function liveHeld(item) {
  const held = item.system.held;
  return held === "2h" || held === "oh" ? held : "1h";
}

/**
 * Equipped items per slot, from live state. Main hand is every equipped weapon not held
 * off-hand and not claimed by `otherIds` (§7.2); off hand is off-hand weapons plus shields.
 * A layer is Over Armor only while a non-layer suit is worn; alone, it is the Armor (§3.6).
 */
export function occupancy(actor, otherIds = new Set()) {
  const occ = { mainHand: [], offHand: [], rings: [], other: [] };
  for (const key of SLOTS) if (!HANDS.includes(key) && !RINGS.includes(key)) occ[key] = [];

  const items = [...actor.items].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const suitWorn = items.some((i) => i.system.equipped === true && regionOf(i) === "armor" && !isLayer(i));
  for (const item of items) {
    if (item.system.equipped !== true) continue;
    const region = regionOf(item);
    if (!region) continue;
    if (region === "hand") {
      if (isShield(item) || liveHeld(item) === "oh") occ.offHand.push(item);
      else if (otherIds.has(item.id)) occ.other.push(item);
      else occ.mainHand.push(item);
    } else if (region === "ring") occ.rings.push(item);
    else if (region === "armor" && suitWorn && isLayer(item)) occ.armorOver.push(item);
    else occ[region].push(item);
  }
  return occ;
}

/** Which occupancy bucket an equipped item sits in, or null. */
export function bucketOf(occ, item) {
  for (const [key, list] of Object.entries(occ)) if (list.includes(item)) return key;
  return null;
}
