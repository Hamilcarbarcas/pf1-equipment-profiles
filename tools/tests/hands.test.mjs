// Handedness core (DESIGN.md §17) and the planner/editor on top of it: grips, rules, the Shield
// slot, the v3 migration, animated shields, mounted lances, grip config, and setGrip.
//
// Run from the module root:  node tools/tests/hands.test.mjs

import assert from "node:assert/strict";

let idSeq = 0;
globalThis.foundry = {
  utils: { randomID: () => `r${++idSeq}`, deepClone: (o) => structuredClone(o), escapeHTML: (s) => s },
};
globalThis.game = { i18n: { localize: (k) => k, format: (k) => k }, user: { isGM: true } };
globalThis.ui = { notifications: { warn() {}, info() {} } };
globalThis.pf1 = { config: { equipmentSlots: { wondrous: {}, armor: {}, clothing: {} }, unequippableLoot: [] } };
const wrappers = {};
const hookFns = {};
globalThis.libWrapper = { register: (_m, target, fn) => (wrappers[target] = fn) };
globalThis.Hooks = { on: (name, fn) => (hookFns[name] ??= []).push(fn), callAll() {}, call: () => true };
game.modules = { get: (id) => (id === "lib-wrapper" ? { active: true } : null) };

const src = (p) => import(new URL(`../../src/${p}`, import.meta.url));
const hands = await src("hands.mjs");
const { buildPlan, isCurrent, profileRequirements, toUpdates } = await src("plan.mjs");
const { capture } = await src("capture.mjs");
const { normalize } = await src("store.mjs");
const edit = await src("edit.mjs");
const { handState } = await src("hand-state.mjs");
const { registerShieldAC, bashedShield } = await src("shield-ac.mjs");

hands.registerBuiltinRules();

class Items extends Array {
  get(id) {
    return this.find((i) => i.id === id);
  }
}

function makeActor(defs, flags = []) {
  const actor = { name: "Tester", uuid: "Actor.t", items: new Items(), itemFlags: { boolean: {} }, getFlag: () => undefined };
  for (const f of flags) actor.itemFlags.boolean[f] = { sources: [{}] };
  defs.forEach((d, i) => actor.items.push(makeItem(d, i, actor)));
  return actor;
}

function makeItem(d, i, actor) {
  const type = d.type ?? "weapon";
  return {
    id: d.id,
    name: d.id,
    type,
    subType: d.subType ?? (type === "weapon" ? "real" : undefined),
    _source: { name: d.id },
    sort: i * 100,
    actor,
    isPhysical: true,
    flags: d.grips ? { "pf1-equipment-profiles": { grips: d.grips } } : {},
    system: {
      equipped: d.equipped ?? false,
      held: d.held,
      weaponSubtype: d.sub,
      hands: d.hands,
      equipmentSubtype: d.eqSub,
      baseTypes: d.baseTypes ?? [],
      slot: d.slot,
      weaponGroups: { total: new Set(d.groups ?? []) },
      armor: d.armor,
    },
    getName: () => d.id,
  };
}

const W = {
  longsword: { id: "longsword", sub: "1h" },
  greatsword: { id: "greatsword", sub: "2h", hands: 2 },
  dagger: { id: "dagger", sub: "light" },
  longbow: { id: "longbow", sub: "ranged", hands: 2, groups: ["bows"] },
  lance: { id: "lance", sub: "2h", hands: 2, baseTypes: ["Lance"] },
  heavy: { id: "heavy", type: "equipment", subType: "shield", eqSub: "heavyShield" },
  buckler: { id: "buckler", type: "equipment", subType: "shield", eqSub: "other", armor: { value: 1, enh: 1 } },
};
const w = (key, extra = {}) => ({ ...W[key], ...extra });

/** Apply a plan's writes to the stub items. */
function apply(actor, plan) {
  for (const u of toUpdates(actor, plan.changes)) {
    const item = actor.items.get(u._id);
    item.system.equipped = u["system.equipped"];
    if (u["system.held"]) item.system.held = u["system.held"];
  }
}

const ref = (actor, id) => ({ name: id, type: actor.items.get(id).type, id, label: id });
const slot = (actor, id, held = null) => ({ state: "item", item: ref(actor, id), held });
const profile = (slots, other = []) => normalize({ version: 3, slots, other });
const ops = (plan) => plan.changes.map((c) => `${c.op}:${c.itemId}${c.to.held && c.op !== "unequip" ? `@${c.to.held}` : ""}`).sort();
const eq = (actor, id) => actor.items.get(id).system.equipped === true;

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

/* A. Regression on the old hand rules, through the new Shield slot */

check("A1 sword and board replaces a greatsword", () => {
  const a = makeActor([w("greatsword", { equipped: true, held: "2h" }), w("longsword"), w("heavy")]);
  const plan = buildPlan(a, profile({ mainHand: slot(a, "longsword", "1h"), shield: slot(a, "heavy") }));
  assert.deepEqual(ops(plan), ["equip:heavy", "equip:longsword@1h", "unequip:greatsword"]);
});

check("A2 a 2h grip clears a heavy shield", () => {
  const a = makeActor([w("longsword", { equipped: true, held: "1h" }), w("heavy", { equipped: true })]);
  const plan = buildPlan(a, profile({ mainHand: slot(a, "longsword", "2h") }));
  assert.deepEqual(ops(plan), ["regrip:longsword@2h", "unequip:heavy"]);
});

check("A3 a 2h grip keeps a buckler", () => {
  const a = makeActor([w("longsword", { equipped: true, held: "1h" }), w("buckler", { equipped: true })]);
  const plan = buildPlan(a, profile({ mainHand: slot(a, "longsword", "2h") }));
  assert.deepEqual(ops(plan), ["regrip:longsword@2h"]);
});

check("A4 a shield replaces an off-hand dagger", () => {
  const a = makeActor([w("dagger", { equipped: true, held: "oh" }), w("heavy")]);
  const plan = buildPlan(a, profile({ shield: slot(a, "heavy") }));
  assert.deepEqual(ops(plan), ["equip:heavy", "unequip:dagger"]);
});

check("A5 an off-hand dagger replaces a shield", () => {
  const a = makeActor([w("dagger"), w("heavy", { equipped: true })]);
  const plan = buildPlan(a, profile({ offHand: slot(a, "dagger", "oh") }));
  assert.deepEqual(ops(plan), ["equip:dagger@oh", "unequip:heavy"]);
});

check("A6 a shield beside an untouched 2h longsword regrips it; a greatsword goes", () => {
  const a = makeActor([w("longsword", { equipped: true, held: "2h" }), w("heavy")]);
  assert.deepEqual(ops(buildPlan(a, profile({ shield: slot(a, "heavy") }))), ["equip:heavy", "regrip:longsword@1h"]);
  const b = makeActor([w("greatsword", { equipped: true, held: "2h" }), w("heavy")]);
  assert.deepEqual(ops(buildPlan(b, profile({ shield: slot(b, "heavy") }))), ["equip:heavy", "unequip:greatsword"]);
});

check("A7 a buckler and an off-hand dagger coexist", () => {
  const a = makeActor([w("dagger"), w("buckler")]);
  const plan = buildPlan(a, profile({ offHand: slot(a, "dagger", "oh"), shield: slot(a, "buckler") }));
  assert.deepEqual(ops(plan), ["equip:buckler", "equip:dagger@oh"]);
});

check("A8 a Hands-2 longbow stays two-handed; a stored 1h loses", () => {
  const a = makeActor([w("longbow", { held: "1h" })]);
  assert.deepEqual(hands.mainGrip(a.items.get("longbow")), { options: ["2h"], held: "2h", fixed: true });
  const plan = buildPlan(a, profile({ mainHand: slot(a, "longbow", "1h") }));
  assert.deepEqual(ops(plan), ["equip:longbow@2h"]);
  assert.equal(plan.unmet.length, 0);
});

/* B. Profile v2 → v3 */

check("B1 a v2 off-hand shield moves to the Shield slot", () => {
  const p = normalize({ version: 2, slots: { offHand: { state: "item", item: { name: "heavy", type: "equipment", id: "heavy" } } } });
  assert.equal(p.version, 3);
  assert.equal(p.slots.offHand.state, "ignore");
  assert.equal(p.slots.shield.item.name, "heavy");
});

check("B2 a v2 Empty off hand empties the shield too; v2 weapons stay", () => {
  const p = normalize({ version: 2, slots: { offHand: { state: "empty" } } });
  assert.equal(p.slots.shield.state, "empty");
  const q = normalize({ version: 2, slots: { offHand: { state: "item", item: { name: "dagger", type: "weapon", id: "dagger" }, held: "oh" } } });
  assert.equal(q.slots.offHand.item.name, "dagger");
  assert.equal(q.slots.shield.state, "ignore");
});

check("B3 a v3 Empty off hand leaves the shield alone", () => {
  const p = normalize({ version: 3, slots: { offHand: { state: "empty" } } });
  assert.equal(p.slots.shield.state, "ignore");
});

/* C. Capture round trips */

check("C1 captures read back as current", () => {
  const sets = [
    [w("longsword", { equipped: true, held: "1h" }), w("heavy", { equipped: true })],
    [w("greatsword", { equipped: true, held: "2h" }), w("buckler", { equipped: true })],
    [w("longsword", { equipped: true, held: "1h" }), w("dagger", { equipped: true, held: "oh" }), w("buckler", { equipped: true })],
  ];
  for (const defs of sets) {
    const a = makeActor(defs);
    assert.ok(isCurrent(a, normalize(capture(a))), defs.map((d) => d.id).join("+"));
  }
});

/* D. Animated shield */

check("D1 animated: the shield uses no hand, and the capture is current", () => {
  const a = makeActor([w("greatsword", { equipped: true, held: "2h" }), w("heavy", { equipped: true })], ["animatedShield"]);
  const shield = a.items.get("heavy");
  assert.equal(hands.liveGrip(shield), "none");
  assert.deepEqual(hands.usage(shield), { grip: "none", hands: 0, side: null });
  const cap = normalize(capture(a));
  assert.equal(cap.slots.shield.held, "none");
  assert.ok(isCurrent(a, cap));
});

check("D2 the same profile without the buff is unmet and drops the shield", () => {
  const a = makeActor([w("greatsword", { equipped: true, held: "2h" }), w("heavy")]);
  const plan = buildPlan(a, profile({ mainHand: slot(a, "greatsword", "2h"), shield: slot(a, "heavy", "none") }));
  assert.deepEqual(plan.unmet.map((u) => u.requires), ["animatedShield"]);
  assert.deepEqual(plan.skipped.map((s) => `${s.item.id}:${s.reason}`), ["heavy:twoHanded"]);
  assert.equal(isCurrent(a, profile({ mainHand: slot(a, "greatsword", "2h"), shield: slot(a, "heavy", "none") })), false);
});

check("D3 live: a greatsword dropped in keeps an animated shield", () => {
  const a = makeActor([w("longsword", { equipped: true, held: "1h" }), w("greatsword"), w("heavy", { equipped: true })], ["animatedShield"]);
  const p = normalize(capture(a));
  assert.ok(edit.place(a, p, "mainHand", a.items.get("greatsword"), { live: true }).ok);
  assert.equal(p.slots.shield.state, "item");
  apply(a, buildPlan(a, p));
  assert.ok(eq(a, "greatsword") && eq(a, "heavy") && !eq(a, "longsword"));
});

check("D4 re-grab after the lapse displaces what's in the way", () => {
  const regrab = (a) => buildPlan(a, profile({ shield: slot(a, "heavy", "oh") }));
  const a = makeActor([w("greatsword", { equipped: true, held: "2h" }), w("heavy", { equipped: true })]);
  assert.deepEqual(ops(regrab(a)), ["unequip:greatsword"]);
  const b = makeActor([w("longsword", { equipped: true, held: "2h" }), w("heavy", { equipped: true })]);
  assert.deepEqual(ops(regrab(b)), ["regrip:longsword@1h"]);
  const c = makeActor([w("longsword", { equipped: true, held: "1h" }), w("dagger", { equipped: true, held: "oh" }), w("heavy", { equipped: true })]);
  assert.deepEqual(ops(regrab(c)), ["unequip:dagger"]);
  const free = makeActor([w("longsword", { equipped: true, held: "1h" }), w("heavy", { equipped: true })]);
  assert.deepEqual(ops(regrab(free)), []);
});

check("D5 drop unequips the shield", () => {
  const a = makeActor([w("greatsword", { equipped: true, held: "2h" }), w("heavy", { equipped: true })]);
  assert.deepEqual(ops(buildPlan(a, profile({ shield: { state: "empty" } }))), ["unequip:heavy"]);
});

check("D6 lapse conflict: a hand-using shield beside a 2h weapon", () => {
  const a = makeActor([w("greatsword", { equipped: true, held: "2h" }), w("heavy", { equipped: true })]);
  assert.equal(hands.liveGrip(a.items.get("heavy")), "oh");
});

/* E. Lance */

check("E1 lance grips: fixed 2h unmounted, 1h added mounted, both in a profile", () => {
  const a = makeActor([w("lance")]);
  const lance = a.items.get("lance");
  assert.deepEqual(hands.mainGrip(lance), { options: ["2h"], held: "2h", fixed: true });
  assert.deepEqual(hands.mainGrip(lance, { profile: true }).options, ["2h", "1h"]);
  const m = makeActor([w("lance")], ["mounted"]);
  assert.deepEqual(hands.mainGrip(m.items.get("lance")), { options: ["2h", "1h"], held: "2h", fixed: false });
});

check("E2 mounted live: lance in, toggled 1h, shield added, applied", () => {
  const a = makeActor([w("lance"), w("heavy")], ["mounted"]);
  const p = normalize(capture(a));
  assert.ok(edit.place(a, p, "mainHand", a.items.get("lance"), { live: true }).ok);
  assert.equal(p.slots.mainHand.held, "2h");
  assert.ok(edit.toggleHeld(a, p, { live: true }));
  assert.equal(p.slots.mainHand.held, "1h");
  assert.ok(edit.place(a, p, "offHand", a.items.get("heavy"), { live: true }).ok);
  assert.equal(p.slots.shield.item.id, "heavy");
  assert.equal(p.slots.mainHand.held, "1h");
  apply(a, buildPlan(a, p));
  assert.ok(eq(a, "lance") && eq(a, "heavy"));
  assert.equal(a.items.get("lance").system.held, "1h");
});

check("E3 unmounted live: the lance's grip is locked", () => {
  const a = makeActor([w("lance", { equipped: true, held: "2h" })]);
  const p = normalize(capture(a));
  assert.equal(edit.toggleHeld(a, p, { live: true }), false);
});

check("E4 a 1h-lance-and-shield profile, unmounted: unmet, lance 2h, shield dropped", () => {
  const a = makeActor([w("lance"), w("heavy")]);
  const p = profile({ mainHand: slot(a, "lance", "1h"), shield: slot(a, "heavy", "oh") });
  const plan = buildPlan(a, p);
  assert.deepEqual(plan.unmet.map((u) => u.requires), ["mounted"]);
  assert.deepEqual(ops(plan), ["equip:lance@2h"]);
  assert.deepEqual(plan.skipped.map((s) => `${s.item.id}:${s.reason}`), ["heavy:twoHanded"]);
  assert.deepEqual(profileRequirements(a, p).map((r) => [r.requires, r.met]), [["mounted", false]]);
});

check("E5 the same profile, mounted: lance 1h and shield", () => {
  const a = makeActor([w("lance"), w("heavy")], ["mounted"]);
  const plan = buildPlan(a, profile({ mainHand: slot(a, "lance", "1h"), shield: slot(a, "heavy", "oh") }));
  assert.equal(plan.unmet.length, 0);
  assert.deepEqual(ops(plan), ["equip:heavy", "equip:lance@1h"]);
});

check("E6 dismounted with a 1h lance: kept as held and flagged invalid", () => {
  const a = makeActor([w("lance", { equipped: true, held: "1h" }), w("heavy", { equipped: true })]);
  const lance = a.items.get("lance");
  assert.equal(hands.invalidHeld(lance), true);
  assert.equal(hands.liveGrip(lance), "1h");
  assert.deepEqual(ops(buildPlan(a, profile({ mainHand: slot(a, "lance", "2h") }))), ["regrip:lance@2h", "unequip:heavy"]);
});

check("E7 profile mode: a shield beside a lance regrips it to 1h and records Mounted", () => {
  const a = makeActor([w("lance"), w("heavy")]);
  const p = profile({});
  assert.ok(edit.place(a, p, "mainHand", a.items.get("lance")).ok);
  assert.equal(p.slots.mainHand.held, "2h");
  assert.ok(edit.place(a, p, "shield", a.items.get("heavy")).ok);
  assert.equal(p.slots.mainHand.held, "1h");
  assert.equal(p.slots.shield.held, "oh");
  assert.deepEqual(profileRequirements(a, p).map((r) => r.requires), ["mounted"]);
});

/* F. Grip config */

check("F1 a config pins grips over type and Hands", () => {
  const a = makeActor([w("longsword", { grips: ["2h"] }), w("dagger", { grips: ["1h"] })]);
  const ls = a.items.get("longsword");
  assert.deepEqual(hands.mainGrip(ls), { options: ["2h"], held: "2h", fixed: true });
  assert.equal(hands.canOffHand(ls), false);
  assert.equal(hands.canOffHand(a.items.get("dagger")), false);
});

check("F2 a stored Held outside an explicit config is flagged; a quirk isn't", () => {
  const a = makeActor([w("longsword", { grips: ["2h"], held: "1h", equipped: true }), w("greatsword", { held: "1h", equipped: true })]);
  assert.equal(hands.invalidHeld(a.items.get("longsword")), true);
  assert.equal(hands.invalidHeld(a.items.get("greatsword")), false);
  assert.equal(hands.liveGrip(a.items.get("greatsword")), "2h");
});

check("F3 an off-hand drop of a no-oh weapon goes to the main hand", () => {
  const a = makeActor([w("longsword", { grips: ["1h", "2h"] })]);
  const p = profile({});
  assert.ok(edit.place(a, p, "offHand", a.items.get("longsword")).ok);
  assert.equal(p.slots.mainHand.item.id, "longsword");
  assert.equal(p.slots.offHand.state, "ignore");
});

/* G. setGripIn */

check("G1 setGrip moves a dagger off-hand and two-hands a longsword", () => {
  const a = makeActor([w("dagger", { equipped: true, held: "1h" })]);
  const p = normalize(capture(a));
  assert.ok(edit.setGripIn(a, p, a.items.get("dagger"), "oh").ok);
  apply(a, buildPlan(a, p));
  assert.equal(a.items.get("dagger").system.held, "oh");

  const b = makeActor([w("longsword", { equipped: true, held: "1h" }), w("heavy", { equipped: true })]);
  const q = normalize(capture(b));
  assert.ok(edit.setGripIn(b, q, b.items.get("longsword"), "2h").ok);
  apply(b, buildPlan(b, q));
  assert.equal(b.items.get("longsword").system.held, "2h");
  assert.equal(eq(b, "heavy"), false);
});

check("G2 setGrip refuses a grip that isn't allowed now", () => {
  const a = makeActor([w("lance", { equipped: true, held: "2h" })]);
  const p = normalize(capture(a));
  assert.equal(edit.setGripIn(a, p, a.items.get("lance"), "1h").ok, false);
});

/* H. Profile-mode shields */

check("H1 profile: a shield beside a greatsword goes hands-free and records the requirement", () => {
  const a = makeActor([w("greatsword"), w("heavy")]);
  const p = profile({});
  edit.place(a, p, "mainHand", a.items.get("greatsword"));
  assert.ok(edit.place(a, p, "offHand", a.items.get("heavy")).ok);
  assert.equal(p.slots.shield.held, "none");
  assert.equal(p.slots.mainHand.held, "2h");
  assert.deepEqual(profileRequirements(a, p).map((r) => r.requires), ["animatedShield"]);
});

check("H2 profile: a shield beside a 2h longsword regrips it instead", () => {
  const a = makeActor([w("longsword"), w("heavy")]);
  const p = profile({});
  edit.place(a, p, "mainHand", a.items.get("longsword"));
  edit.toggleHeld(a, p);
  assert.equal(p.slots.mainHand.held, "2h");
  assert.ok(edit.place(a, p, "shield", a.items.get("heavy")).ok);
  assert.equal(p.slots.mainHand.held, "1h");
  assert.equal(p.slots.shield.held, "oh");
});

check("H3 live: an off-hand dagger releases a hand-using shield but not a buckler", () => {
  const a = makeActor([w("longsword", { equipped: true, held: "1h" }), w("dagger"), w("heavy", { equipped: true })]);
  const p = normalize(capture(a));
  edit.place(a, p, "offHand", a.items.get("dagger"), { live: true });
  assert.equal(p.slots.shield.state, "ignore");
  apply(a, buildPlan(a, p));
  assert.ok(eq(a, "dagger") && !eq(a, "heavy"));

  const b = makeActor([w("longsword", { equipped: true, held: "1h" }), w("dagger"), w("buckler", { equipped: true })]);
  const q = normalize(capture(b));
  edit.place(b, q, "offHand", b.items.get("dagger"), { live: true });
  apply(b, buildPlan(b, q));
  assert.ok(eq(b, "dagger") && eq(b, "buckler"));
});

/* I. Hand state conflicts (§17.5) */

check("I1 a hand-using shield beside a 2h weapon or an off-hand weapon conflicts", () => {
  const a = makeActor([w("greatsword", { equipped: true, held: "2h" }), w("heavy", { equipped: true })]);
  assert.deepEqual(handState(a).conflicts.map((c) => [c.kind, c.rule]), [["overBudget", "animatedShield"]]);
  const b = makeActor([w("greatsword", { equipped: true, held: "2h" }), w("heavy", { equipped: true })], ["animatedShield"]);
  assert.equal(handState(b).conflicts.length, 0);
  const c = makeActor([w("longsword", { equipped: true, held: "1h" }), w("dagger", { equipped: true, held: "oh" }), w("buckler", { equipped: true })]);
  assert.equal(handState(c).conflicts.length, 0);
  assert.equal(handState(c).used, 2);
});

check("I2 a dismounted 1h lance is an invalidGrip conflict", () => {
  const a = makeActor([w("lance", { equipped: true, held: "1h" })]);
  assert.deepEqual(handState(a).conflicts.map((c) => [c.kind, c.rule]), [["invalidGrip", "mountedLance"]]);
});

/* J. Buckler penalty (§17.9) */

registerShieldAC();
const alter = wrappers["pf1.actionUse.ActionUse.prototype.alterRollData"];
function attack(actor, id, held) {
  const item = actor.items.get(id);
  const use = { item, actor, action: { hasAttack: true }, shared: { rollData: { action: { held } }, attackBonus: [] } };
  alter.call(use, () => undefined);
  return use.shared.attackBonus;
}

check("J1 -1 on two-handed and off-hand attacks with a buckler worn", () => {
  const a = makeActor([w("longsword", { equipped: true }), w("dagger", { equipped: true }), w("buckler", { equipped: true })]);
  assert.deepEqual(attack(a, "longsword", "2h"), ["-1[buckler]"]);
  assert.deepEqual(attack(a, "dagger", "oh"), ["-1[buckler]"]);
  assert.deepEqual(attack(a, "longsword", "1h"), []);
});

check("J2 bows, an animated buckler, and no buckler never trigger", () => {
  const a = makeActor([w("longbow", { equipped: true }), w("buckler", { equipped: true })]);
  assert.deepEqual(attack(a, "longbow", "2h"), []);
  const b = makeActor([w("longsword", { equipped: true }), w("buckler", { equipped: true })], ["animatedShield"]);
  assert.deepEqual(attack(b, "longsword", "2h"), []);
  const c = makeActor([w("longsword", { equipped: true }), w("buckler")]);
  assert.deepEqual(attack(c, "longsword", "2h"), []);
});

/* K. Shield bash AC loss (§18) */

const bash = (actor, id, action = { actionType: "mwak", hasAttack: true }) =>
  bashedShield({ item: actor.items.get(id), actor, action })?.id ?? null;

check("K1 a bash with an equipped shield in hand costs its AC", () => {
  const a = makeActor([w("heavy", { equipped: true })]);
  assert.equal(bash(a, "heavy"), "heavy");
});

check("K2 Improved Shield Bash, animated, unequipped, buckler, or a non-melee action keep the AC", () => {
  assert.equal(bash(makeActor([w("heavy", { equipped: true })], ["improvedShieldBash"]), "heavy"), null);
  assert.equal(bash(makeActor([w("heavy", { equipped: true })], ["animatedShield"]), "heavy"), null);
  assert.equal(bash(makeActor([w("heavy")]), "heavy"), null);
  assert.equal(bash(makeActor([w("buckler", { equipped: true })]), "buckler"), null);
  assert.equal(bash(makeActor([w("heavy", { equipped: true })]), "heavy", { actionType: "rwak", hasAttack: true }), null);
  assert.equal(bash(makeActor([w("longsword", { equipped: true })]), "longsword"), null);
});

console.log(`hands.test.mjs: ${passed} checks passed`);
