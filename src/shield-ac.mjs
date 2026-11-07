/**
 * Shield AC lost until the start of the next turn, for two causes:
 * - a buckler in use: –1 on off-hand and two-handed attacks, and its AC lost (DESIGN.md §17.9);
 * - a shield bash without Improved Shield Bash (§18).
 *
 * The AC loss is a code-built buff with a negative untyped `sac` Change, removed by this module
 * at the start of the actor's next turn rather than by PF1's duration, which counts whole rounds
 * and can't end partway through one (an attack of opportunity before the actor's turn).
 */

import { MODULE_ID } from "./const.mjs";
import { handsFreeNow, hasHeld, isBuckler, isShield } from "./hands.mjs";

const TARGET = "pf1.actionUse.ActionUse.prototype.alterRollData";
// Kept from when bucklers were the only cause, so buffs already on actors still end.
const FLAG = "bucklerArm";
const EXEMPT_GROUPS = ["bows", "crossbows"];
const IMPROVED_BASH = "improvedShieldBash";

const BUFF_NAMES = { buckler: "PF1EP.Buckler.BuffName", bash: "PF1EP.ShieldBash.BuffName" };

/** ActionUse → buckler id, for the post-use hook. */
const marked = new WeakMap();

const t = (key) => game.i18n.localize(key);

function groupsOf(item) {
  const groups = item.system.weaponGroups;
  if (groups?.total instanceof Set) return groups.total;
  return new Set(Array.isArray(groups) ? groups : (groups?.value ?? []));
}

/** RAW: "You can use a bow or crossbow without penalty while carrying it." */
const exempt = (item) => EXEMPT_GROUPS.some((g) => groupsOf(item).has(g));

const wornBuckler = (actor) => actor?.items.find((i) => isBuckler(i) && i.system.equipped === true && !handsFreeNow(i)) ?? null;

/** A shield's AC as PF1 adds it, base plus enhancement, halved when broken (`base-character.mjs`). */
function shieldAC(shield) {
  const total = (Number(shield.system.armor?.value) || 0) + (Number(shield.system.armor?.enh) || 0);
  return shield.isBroken ? Math.floor(total / 2) : total;
}

/**
 * The shield a use bashed with, when that costs its AC (§18): PF1's Bash action (melee, with an
 * attack roll) on an equipped shield in hand. A buckler can't bash, an animated shield isn't in
 * the hand, and Improved Shield Bash keeps the AC.
 */
export function bashedShield(actionUse) {
  const item = actionUse?.item;
  const action = actionUse?.action;
  if (!isShield(item) || isBuckler(item) || item.system.equipped !== true || handsFreeNow(item)) return null;
  if (action?.actionType !== "mwak" || !action.hasAttack) return null;
  if (actionUse.actor?.itemFlags?.boolean?.[IMPROVED_BASH]) return null;
  return item;
}

/** After PF1's own pass, `rollData.action.held` holds the attack dialog's choice. */
function addPenalty(actionUse) {
  const item = actionUse.item;
  if (!actionUse.action?.hasAttack || !hasHeld(item) || exempt(item)) return;
  const held = actionUse.shared.rollData?.action?.held;
  if (held !== "oh" && held !== "2h") return;
  const buckler = wornBuckler(actionUse.actor);
  if (!buckler) return;
  actionUse.shared.attackBonus.push(`-1[${buckler.name}]`);
  marked.set(actionUse, buckler.id);
}

function alterRollData(wrapped, ...args) {
  const result = wrapped(...args);
  const after = () => {
    try {
      addPenalty(this);
    } catch (err) {
      console.error(`${MODULE_ID} | buckler penalty failed`, err);
    }
  };
  if (result instanceof Promise) return result.then((value) => (after(), value));
  after();
  return result;
}

/* -------------------------------------------- */
/*  AC loss                                     */
/* -------------------------------------------- */

const armBuffs = (actor) => actor.items.filter((i) => i.type === "buff" && i.flags?.[MODULE_ID]?.[FLAG]);

/** @param {"buckler"|"bash"} cause */
async function loseAC(actor, shield, cause) {
  const combat = game.combat;
  if (!combat?.started || !combat.getCombatantsByActor(actor).length) return;
  const ac = shieldAC(shield);
  if (ac <= 0) return;

  const stamp = { combat: combat.id, round: combat.round, turn: combat.turn, buckler: shield.id, cause };
  const change = { formula: `-${ac}`, target: "sac", type: "untyped", operator: "add" };
  const name = t(BUFF_NAMES[cause]);
  const existing = armBuffs(actor)[0];
  if (existing) {
    const _id = existing._source.system.changes?.[0]?._id ?? foundry.utils.randomID();
    await existing.update({
      name,
      [`flags.${MODULE_ID}.${FLAG}`]: stamp,
      "system.changes": [{ ...change, _id }],
      "system.active": true,
    });
    return;
  }
  await actor.createEmbeddedDocuments("Item", [
    {
      type: "buff",
      name,
      img: shield.img,
      system: { subType: "temp", active: true, changes: [change] },
      flags: { [MODULE_ID]: { [FLAG]: stamp } },
    },
  ]);
}

/** At the actor's turn: the buff ends if it was made before this turn started. */
const startedBefore = (combat, stamp) =>
  stamp.combat !== combat.id || combat.round > stamp.round || (combat.round === stamp.round && combat.turn > stamp.turn);

async function onTurn(combat, changed) {
  if (!game.users.activeGM?.isSelf || !("turn" in changed || "round" in changed)) return;
  const actor = combat.combatant?.actor;
  if (!actor) return;
  const ended = armBuffs(actor).filter((b) => startedBefore(combat, b.flags[MODULE_ID][FLAG]));
  if (ended.length) await actor.deleteEmbeddedDocuments("Item", ended.map((b) => b.id));
}

async function onCombatEnd(combat) {
  if (!game.users.activeGM?.isSelf) return;
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    const ended = actor ? armBuffs(actor).filter((b) => b.flags[MODULE_ID][FLAG].combat === combat.id) : [];
    if (ended.length) await actor.deleteEmbeddedDocuments("Item", ended.map((b) => b.id));
  }
}

export function registerShieldAC() {
  if (game.modules.get("lib-wrapper")?.active) libWrapper.register(MODULE_ID, TARGET, alterRollData, "WRAPPER");
  else {
    const proto = pf1.actionUse.ActionUse.prototype;
    const original = proto.alterRollData;
    proto.alterRollData = function (...args) {
      return alterRollData.call(this, (...a) => original.apply(this, a), ...args);
    };
  }

  Hooks.on("pf1PostActionUse", (actionUse) => {
    const id = marked.get(actionUse);
    const buckler = id && actionUse.actor?.items.get(id);
    if (buckler) loseAC(actionUse.actor, buckler, "buckler").catch((err) => console.error(`${MODULE_ID} | buckler AC loss failed`, err));
    const bashed = buckler ? null : bashedShield(actionUse);
    if (bashed) loseAC(actionUse.actor, bashed, "bash").catch((err) => console.error(`${MODULE_ID} | shield bash AC loss failed`, err));
  });
  Hooks.on("updateCombat", (combat, changed) => {
    onTurn(combat, changed).catch((err) => console.error(`${MODULE_ID} | buckler turn check failed`, err));
  });
  Hooks.on("deleteCombat", (combat) => {
    onCombatEnd(combat).catch((err) => console.error(`${MODULE_ID} | buckler cleanup failed`, err));
  });
}
