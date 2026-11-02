/**
 * Handedness: which grips an item may take, and which hands an equipped item uses. DESIGN.md §17.
 *
 * Everything here is derived at read time from item data, the grip config flag, and the actor's
 * boolean flags; nothing is stamped onto items (§17.4).
 */

import { MODULE_ID } from "./const.mjs";

/** Configurable grips (§17.3), in chip order. */
export const GRIPS = ["1h", "2h", "oh"];
/** Grips held in the main hand. */
export const MAIN_GRIPS = ["1h", "2h"];

const HANDS_OF = { "2h": 2, "1h": 1, oh: 1, none: 0 };
const SIDE_OF = { "2h": "both", "1h": "main", oh: "off", none: null };

export const handsOf = (grip) => HANDS_OF[grip] ?? 1;
export const sideOf = (grip) => (grip in SIDE_OF ? SIDE_OF[grip] : "main");

export const isShield = (item) => item?.type === "equipment" && item.subType === "shield";

/** PF1's misc shield subtype, commented in its proficiency map as the buckler (§2). */
export const isBuckler = (item) => isShield(item) && item.system.equipmentSubtype === "other";

/**
 * Two-handed by type alone (§3.3): PF1's Two-Handed type, or its "Hands" field at 2 or more
 * (how bows, crossbows, and long guns are marked).
 */
export const isTwoHandedOnly = (item) =>
  item?.type === "weapon" && (item.system.weaponSubtype === "2h" || (Number(item.system.hands) || 1) >= 2);

export const isNaturalAttack = (item) => item?.type === "attack" && item.subType === "natural";

/** Items with PF1's Held field: weapons and non-natural attacks. */
export const hasHeld = (item) => item?.type === "weapon" || (item?.type === "attack" && !isNaturalAttack(item));

/**
 * A grip means something for it: a weapon, or an attack with an attack roll. PF1 gives every
 * non-natural attack a Held, so rollless ones (pf1-companions' Command Companion) need this.
 */
export const gripMatters = (item) =>
  item?.type === "weapon" || (hasHeld(item) && (item.actions ?? []).some((a) => a.hasAttack));

/** Live item `held`, normalized; legacy "normal" and blank read as 1h. */
export function liveHeld(item) {
  const held = item.system.held;
  return held === "2h" || held === "oh" ? held : "1h";
}

/* -------------------------------------------- */
/*  Base grips                                  */
/* -------------------------------------------- */

/** Explicit grip config (§17.3), or null when unset. */
export function gripConfig(item) {
  const stored = item?.flags?.[MODULE_ID]?.grips;
  if (!Array.isArray(stored)) return null;
  const list = GRIPS.filter((g) => stored.includes(g));
  return list.length ? list : null;
}

/** Grips from type and Hands alone (§17.2). */
export function derivedGrips(item) {
  if (isShield(item)) return isBuckler(item) ? ["none"] : ["oh"];
  if (item?.type === "attack") return isNaturalAttack(item) ? [] : [...GRIPS];
  if (item?.type !== "weapon") return [];
  if (isTwoHandedOnly(item)) return ["2h"];
  switch (item.system.weaponSubtype) {
    case "light":
    case "ranged":
      return ["1h", "oh"];
    default:
      return [...GRIPS];
  }
}

export const baseGrips = (item) => (isShield(item) ? derivedGrips(item) : (gripConfig(item) ?? derivedGrips(item)));

/** Grip an item takes when nothing says otherwise. */
export function defaultGrip(item) {
  const base = baseGrips(item);
  if (isShield(item)) return base[0];
  return base.includes("1h") ? "1h" : (base[0] ?? "1h");
}

/* -------------------------------------------- */
/*  Rules                                       */
/* -------------------------------------------- */

const rules = new Map();

/**
 * Register a hand rule (§17.4).
 * @param {string} id
 * @param {object} rule
 * @param {(item: Item, actor: Actor|null) => boolean} rule.applies
 * @param {{grip: string, requires: string|Function, label?: string, icon?: string}[]} [rule.add]
 * @param {{grip: string, requires: string|Function, label?: string, icon?: string}} [rule.force]
 * @param {"regrab"|"regrip"|"warn"} [rule.lapse]
 */
export function registerRule(id, rule) {
  if (!id || typeof rule?.applies !== "function") throw new Error(`${MODULE_ID} | registerRule needs an id and applies()`);
  rules.set(id, { ...rule, id });
}

export function unregisterRule(id) {
  rules.delete(id);
}

export const allRules = () => [...rules.values()];

/** A boolean flag name read from active items, or a function of the actor. */
export function requirementMet(actor, requires) {
  if (typeof requires === "function") {
    try {
      return !!requires(actor);
    } catch (err) {
      console.error(`${MODULE_ID} | hand rule requirement failed`, err);
      return false;
    }
  }
  return !!actor?.itemFlags?.boolean?.[requires];
}

export function rulesFor(item) {
  const actor = item?.actor ?? null;
  return allRules().filter((rule) => {
    try {
      return !!rule.applies(item, actor);
    } catch (err) {
      console.error(`${MODULE_ID} | hand rule "${rule.id}" failed`, err);
      return false;
    }
  });
}

/** Boolean flag names some rule requires; function requirements can't be watched. */
export function watchedFlags() {
  const flags = new Set();
  for (const rule of allRules()) {
    for (const entry of [...(rule.add ?? []), ...(rule.force ? [rule.force] : [])]) {
      if (typeof entry.requires === "string") flags.add(entry.requires);
    }
  }
  return flags;
}

/* -------------------------------------------- */
/*  Grips                                       */
/* -------------------------------------------- */

/**
 * Every grip with its requirement (§17.4). Base grips have no rule. `met` is false for a rule grip
 * whose requirement doesn't hold now; `forced` marks a grip that replaces the rest while met.
 * @returns {{grip: string, met: boolean, requires: any, rule: string|null, forced: boolean, label?: string, icon?: string}[]}
 */
export function grips(item) {
  const actor = item?.actor ?? null;
  const list = baseGrips(item).map((grip) => ({ grip, met: true, requires: null, rule: null, forced: false }));
  for (const rule of rulesFor(item)) {
    const entry = (e, forced) => ({
      grip: e.grip,
      met: requirementMet(actor, e.requires),
      requires: e.requires,
      rule: rule.id,
      forced,
      label: e.label,
      icon: e.icon,
    });
    for (const add of rule.add ?? []) {
      if (!list.some((g) => g.grip === add.grip && !g.rule)) list.push(entry(add, false));
    }
    if (rule.force) list.push(entry(rule.force, true));
  }
  return list;
}

/**
 * Grip names usable now. A forced grip that is met is the only one. A profile is built for later,
 * so it may also use rule grips whose requirement is unmet.
 */
export function availableGrips(item, { profile = false } = {}) {
  const list = grips(item);
  const forced = list.find((g) => g.forced && g.met);
  if (forced && !profile) return [forced.grip];
  return [...new Set(list.filter((g) => g.met || profile).map((g) => g.grip))];
}

/** The rule grip `grip` depends on, or null when the item takes it without one. */
export function requirementFor(item, grip) {
  const list = grips(item).filter((g) => g.grip === grip);
  if (!list.length || list.some((g) => !g.rule)) return null;
  return list[0];
}

/** Main-hand grips usable now (or in a profile), the default among them, and whether it's a choice. */
export function mainGrip(item, opts = {}) {
  const options = availableGrips(item, opts).filter((g) => MAIN_GRIPS.includes(g));
  const def = defaultGrip(item);
  return { options, held: options.includes(def) ? def : (options[0] ?? "1h"), fixed: options.length < 2 };
}

export const canOffHand = (item, opts = {}) => item?.type === "weapon" && availableGrips(item, opts).includes("oh");

/** A shield under a forced hands-free grip right now (an animated shield, §17.4). */
export const handsFreeNow = (item) => grips(item).some((g) => g.forced && g.met && g.grip === "none");

/**
 * A stored Held the item can't take now, kept rather than corrected because it is a rule grip or
 * outside an explicit config (§17.5). Other stray values are data quirks and fall back silently.
 */
export function invalidHeld(item, held = liveHeld(item)) {
  if (!hasHeld(item) || availableGrips(item).includes(held)) return false;
  if (gripConfig(item)) return true;
  return grips(item).some((g) => g.rule && g.grip === held);
}

/** Grip an item is in now (§17.2). */
export function liveGrip(item) {
  if (isShield(item)) return availableGrips(item)[0] ?? "oh";
  if (!hasHeld(item)) return null;
  const held = liveHeld(item);
  if (availableGrips(item).includes(held) || invalidHeld(item, held)) return held;
  const main = mainGrip(item);
  return main.options.length ? main.held : (availableGrips(item)[0] ?? held);
}

/** Hands an equipped weapon or shield uses now, or null. */
export function usage(item) {
  if (item?.system?.equipped !== true) return null;
  if (item.type !== "weapon" && !isShield(item)) return null;
  const grip = liveGrip(item);
  return { grip, hands: handsOf(grip), side: sideOf(grip) };
}

/* -------------------------------------------- */
/*  Built-in rules                              */
/* -------------------------------------------- */

/** PF1 boolean flags the built-in rules read (§17.10). */
export const FLAGS = Object.freeze({ mounted: "mounted", animatedShield: "animatedShield" });

export function registerBuiltinRules() {
  registerRule("mountedLance", {
    applies: (item) => item?.type === "weapon" && (item.system.baseTypes ?? []).includes("Lance"),
    add: [{ grip: "1h", requires: FLAGS.mounted, label: "PF1EP.Hands.Req.Mounted", icon: "fa-horse" }],
    lapse: "regrip",
  });
  registerRule("animatedShield", {
    applies: (item) => isShield(item),
    force: { grip: "none", requires: FLAGS.animatedShield, label: "PF1EP.Hands.Req.Animated", icon: "fa-wand-sparkles" },
    lapse: "regrab",
  });
}
