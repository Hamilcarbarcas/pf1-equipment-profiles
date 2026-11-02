/**
 * The paper-doll window, in two modes. DESIGN.md §6.
 *
 * - live: shows what is equipped and equips on every edit (§6.6). Each edit is a one-slot change
 *   to the captured current state, applied through the normal plan → gates → write path.
 * - profile: builds or edits one saved profile without touching the actor.
 */

import { CSS, TEMPLATES } from "../const.mjs";
import { applyProfile } from "../apply.mjs";
import { capture } from "../capture.mjs";
import { findInContainer, resolveRef } from "../match.mjs";
import { isCurrent, requirementSuffix } from "../plan.mjs";
import {
  LEFT,
  RIGHT,
  RINGS,
  SHIELD,
  SLOTS,
  fits,
  BARS,
  barOf,
  fitsOther,
  isEquippable,
  isHeavyArmor,
  isLayer,
  layerKind,
  regionOf,
  slotLabel,
} from "../slots.mjs";
import { MAIN_GRIPS, canOffHand, defaultGrip, grips, isShield, mainGrip, requirementFor } from "../hands.mjs";
import { handState } from "../hand-state.mjs";
import { resolveConflicts } from "../hand-actions.mjs";
import { deleteProfile, findProfile, listProfiles, normalize, refLabel, writeProfile } from "../store.mjs";
import { getSelected, setSelected } from "../selection.mjs";
import { clearSlot, markEmpty, mirrored, place, toggleHeld } from "../edit.mjs";
import { blockingToggle, disabledSet, isOff, toggleLabel } from "../actor-slots.mjs";
import { slotStyle } from "../settings.mjs";
import { applyStyleVars, glyphHtml } from "../style.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const ICONS = [
  "shield-halved", "sword", "swords", "axe", "dagger", "bow-arrow", "staff", "hammer",
  "hand-fist", "shield", "helmet-battle", "hat-wizard", "wand-sparkles", "user-ninja", "mask", "crosshairs",
  "campground", "person-hiking", "horse", "person-swimming", "moon", "fire", "snowflake", "crown",
].map((n) => `fa-solid fa-${n}`);

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

export class EquipWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  /** Re-rendered when the slot style setting changes. */
  static usesSlotStyle = true;

  static DEFAULT_OPTIONS = {
    classes: [`${CSS}equip-window`],
    window: { icon: "fa-solid fa-shirt", resizable: true },
    position: { width: 760, height: "auto" },
    actions: {
      selectSlot: onSelectSlot,
      assignItem: onAssignItem,
      toggleHeld: onToggleHeld,
      resolveHands: onResolveHands,
      toggleOther: onToggleOther,
      removeOther: onRemoveOther,
      pickIcon: onPickIcon,
      fromCurrent: onFromCurrent,
      clear: onClear,
      save: onSave,
      remove: onRemove,
      equipProfile: onEquipProfile,
      saveToProfile: onSaveToProfile,
      saveAsNew: onSaveAsNew,
    },
  };

  static PARTS = {
    body: { template: `${TEMPLATES}/equip-window.hbs`, scrollable: [`.${CSS}item-list`] },
  };

  static #idFor(actor, suffix) {
    return `${CSS}equip-${actor.uuid.replaceAll(".", "-")}-${suffix}`;
  }

  static #show(id, make) {
    const existing = foundry.applications.instances.get(id);
    if (existing) {
      existing.bringToFront();
      return existing;
    }
    const app = make();
    app.render({ force: true });
    return app;
  }

  /** Profile editor; `profileId` null makes a new one. */
  static open(actor, profileId = null) {
    const id = this.#idFor(actor, profileId ?? "new");
    return this.#show(id, () => new this(actor, { mode: "profile", profileId }, { id }));
  }

  /** Live equipment window (§6.6). */
  static openLive(actor) {
    const id = this.#idFor(actor, "live");
    return this.#show(id, () => new this(actor, { mode: "live" }, { id }));
  }

  constructor(actor, { mode = "profile", profileId = null } = {}, options = {}) {
    super(options);
    this.actor = actor;
    this.mode = mode;
    this.profileId = profileId;
    if (mode === "profile") {
      const existing = profileId ? findProfile(actor, profileId) : null;
      if (existing) this.draft = foundry.utils.deepClone(existing);
      else {
        this.draft = normalize({ ...capture(actor) });
        this.draft.name = "";
        this.draft.sort = null;
      }
    }
    this.selectedSlot = null;
    this.filterText = "";
    this.docHooks = [];
  }

  get live() {
    return this.mode === "live";
  }

  get title() {
    if (this.live) return t("PF1EP.Live.Title", { actor: this.actor.name });
    return t("PF1EP.Window.Title", { actor: this.actor.name });
  }

  /** What the doll shows: the live capture, or the profile being edited. */
  #view() {
    if (this.live) return normalize({ ...capture(this.actor), name: t("PF1EP.Live.Name") });
    return this.draft;
  }

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const draft = this.#view();
    const style = slotStyle();
    const disabled = disabledSet(this.actor);
    const claimed = new Set();
    const resolved = {};
    for (const key of SLOTS) {
      const slot = draft.slots[key];
      if (slot.state !== "item") continue;
      const item = resolveRef(this.actor, slot.item, { claimed });
      if (item) claimed.add(item.id);
      resolved[key] = item;
    }

    const main = draft.slots.mainHand;
    const mainItem = resolved.mainHand ?? null;
    const twoHanded = main.state === "item" && main.held === "2h";
    const mirror = twoHanded && !!mainItem;
    const shieldItem = resolved[SHIELD] ?? null;
    const shieldGrip = shieldItem ? (draft.slots[SHIELD].held ?? defaultGrip(shieldItem)) : null;

    /** A grip that relies on a rule: badge plus tooltip suffix (§17.8). */
    const reqView = (item, grip) => {
      const req = item && grip ? requirementFor(item, grip) : null;
      if (!req) return null;
      return { icon: req.icon ?? "fa-circle-info", met: req.met, label: req.label ? t(req.label) : String(req.requires) };
    };

    const slotView = (key) => {
      const slot = draft.slots[key];
      const item = resolved[key] ?? null;
      const label = slotLabel(key);
      const view = {
        key,
        label,
        state: slot.state,
        selected: this.selectedSlot === key,
        img: item?.img ?? null,
        filled: !!item,
        drag: !!item,
        missing: false,
        glyph: glyphHtml(key, style),
        tooltip: label,
        disabled: isOff(key, disabled),
        requires: null,
      };
      if (slot.state === "empty") view.tooltip = `${label}: ${t("PF1EP.Window.Empty")}`;
      else if (slot.state === "item") {
        if (item) view.tooltip = item.name;
        else {
          const container = findInContainer(this.actor, slot.item);
          const name = refLabel(slot.item);
          view.missing = true;
          view.tooltip = container
            ? t("PF1EP.Window.InContainer", { item: name, container: container.name })
            : t("PF1EP.Window.Missing", { item: name });
        }
      }
      return view;
    };

    const left = LEFT.map((key) => {
      if (key !== "armor") return slotView(key);
      return { stack: true, armor: slotView("armor"), over: slotView("armorOver") };
    });

    const mainView = slotView("mainHand");
    const shieldView = slotView(SHIELD);
    for (const [view, item, grip] of [[mainView, mainItem, main.held], [shieldView, shieldItem, shieldGrip]]) {
      view.requires = reqView(item, grip);
      if (view.requires) view.tooltip = t("PF1EP.Window.Needs", { item: view.tooltip, needs: view.requires.label });
    }
    const handStack = {
      front: !!shieldItem && shieldGrip !== "none",
      open: (!!shieldItem && shieldGrip === "none") || draft.slots[SHIELD].state === "empty",
    };

    const off = slotView("offHand");
    if (mirror) {
      Object.assign(off, {
        mirror: true,
        img: mainItem.img,
        filled: true,
        drag: false,
        tooltip: t("PF1EP.Window.TwoHanded", { item: mainItem.name }),
      });
    }
    let link = null;
    if (mainItem?.type === "weapon" && !isOff("mainHand", disabled) && !isOff("offHand", disabled)) {
      const grip = mainGrip(mainItem, { profile: !this.live });
      // Live, a main-hand grip waiting on a rule locks the chain and says why (§17.8).
      const waiting = this.live ? grips(mainItem).find((g) => MAIN_GRIPS.includes(g.grip) && g.rule && !g.met) : null;
      let tooltip;
      if (!grip.fixed) tooltip = t(twoHanded ? "PF1EP.Window.Grip2h" : "PF1EP.Window.Grip1h");
      else if (waiting) tooltip = t("PF1EP.Window.GripNeeds", { needs: waiting.label ? t(waiting.label) : String(waiting.requires) });
      else tooltip = t(twoHanded ? "PF1EP.Window.GripFixed2h" : "PF1EP.Window.GripFixed1h");
      link = { twoHanded, fixed: grip.fixed, tooltip };
    }

    const entries = draft.other.map((entry, index) => {
      const item = resolveRef(this.actor, entry.item, { claimed });
      if (item) claimed.add(item.id);
      return {
        index,
        bar: item ? barOf(item) : "other",
        img: item?.img ?? null,
        name: item?.name ?? refLabel(entry.item),
        missing: !item,
        equipped: entry.equipped,
      };
    });
    const bars = BARS.map((key) => ({
      key,
      icon: key === "clothing" ? "fa-shirt" : "fa-box-open",
      hint: key === "clothing" ? "PF1EP.Window.ClothingHint" : "PF1EP.Window.OtherHint",
      entries: entries.filter((e) => e.bar === key),
      disabled: isOff(key, disabled),
    }));

    const warnings = [];
    for (const key of ["mainHand", "offHand"]) {
      const item = resolved[key];
      if (item?.type !== "weapon") continue;
      const actions = (item.actions ?? []).filter((a) => a.hasAttack && a.held).map((a) => a.name);
      if (actions.length) warnings.push(t("PF1EP.Warn.HeldHidden", { item: item.name, actions: actions.join(", ") }));
    }
    // Equipped before the slot was disabled: left on, but flagged (§3.7).
    for (const item of this.actor.items) {
      if (item.system.equipped !== true) continue;
      const key = blockingToggle(item, disabled);
      if (key) warnings.push(t("PF1EP.Warn.EquippedInDisabled", { item: item.name, slot: toggleLabel(key) }));
    }
    // Live hand conflicts (§17.5): listed, with a Resolve button that reopens the prompt.
    let conflicts = [];
    if (this.live) {
      conflicts = handState(this.actor).conflicts.map((c) =>
        c.kind === "invalidGrip"
          ? t("PF1EP.Hands.Conflict.InvalidGrip", { item: c.items[0].name })
          : t("PF1EP.Hands.Conflict.OverBudget", { items: c.items.map((i) => i.name).join(", ") })
      );
    }
    const over = resolved.armorOver;
    if (over && isHeavyArmor(resolved.armor)) {
      const kind = layerKind(over);
      if (kind) warnings.push(t(`PF1EP.Warn.LayerOverHeavy.${kind}`, { item: over.name }));
    }

    let profiles = [];
    if (this.live) {
      const all = listProfiles(this.actor);
      let selectedId = getSelected(this.actor);
      if (!all.some((p) => p.id === selectedId)) selectedId = all[0]?.id ?? null;
      profiles = all.map((p) => ({
        id: p.id,
        name: p.name + requirementSuffix(this.actor, p),
        current: isCurrent(this.actor, p),
        selected: p.id === selectedId,
      }));
    }

    return Object.assign(context, {
      css: CSS,
      live: this.live,
      actorUuid: this.actor.uuid,
      draft,
      isNew: !this.live && !this.profileId,
      icons: ICONS.map((icon) => ({ icon, active: icon === draft.icon })),
      portrait: this.actor.img,
      left,
      right: RIGHT.map(slotView),
      main: mainView,
      off,
      shield: shieldView,
      handStack,
      link,
      conflicts,
      bars,
      groups: this.#itemGroups(claimed, disabled),
      filterText: this.filterText,
      warnings,
      profiles,
      hasProfiles: profiles.length > 0,
    });
  }

  #itemGroups(claimed, disabled) {
    const groups = [
      { key: "weapons", label: "PF1.InventoryWeapons", items: [] },
      { key: "armor", label: "PF1.ArmorOrShield", items: [] },
      { key: "worn", label: "PF1.InventoryEquipment", items: [] },
      { key: "other", label: "PF1.Other", items: [] },
    ];
    const at = Object.fromEntries(groups.map((g) => [g.key, g]));
    const items = [...this.actor.items].filter(isEquippable).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    for (const item of items) {
      const slots = SLOTS.filter((k) => fits(item, k, { profile: !this.live }) && !isOff(k, disabled));
      // A shield also lists under the off hand, where it lands when dropped there (§17.8).
      if (isShield(item) && !isOff("offHand", disabled)) slots.push("offHand");
      if (fitsOther(item) && !isOff(barOf(item), disabled)) slots.push(barOf(item));
      const blockedBy = blockingToggle(item, disabled);
      const view = {
        uuid: item.uuid,
        id: item.id,
        img: item.img,
        name: item.name,
        slots: slots.join(" "),
        equipped: item.system.equipped === true,
        assigned: claimed.has(item.id),
        blocked: !!blockedBy,
        blockedHint: blockedBy ? t("PF1EP.Window.SlotDisabled", { slot: toggleLabel(blockedBy) }) : "",
      };
      if (item.type === "weapon") at.weapons.items.push(view);
      else if (item.type === "equipment" && ["armor", "shield"].includes(item.subType)) at.armor.items.push(view);
      else if (item.type === "equipment") at.worn.items.push(view);
      else at.other.items.push(view);
    }
    return groups.filter((g) => g.items.length);
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const ContextMenu = foundry.applications.ux.ContextMenu.implementation;
    new ContextMenu(this.element, `.${CSS}slot`, this.#slotMenu(), { jQuery: false, fixed: true });

    // Delegated, so it survives re-renders; selection does not re-render (§6.2), so both clicks
    // of a double-click land on the same element.
    this.element.addEventListener("dblclick", (event) => {
      const slot = event.target.closest(`.${CSS}slot`);
      if (!slot) return;
      event.preventDefault();
      this.#select(null);
      this.clearSlot(slot.dataset.slot);
    });

    const onItem = (item) => {
      if (item.parent === this.actor) this.render();
    };
    for (const hook of ["createItem", "updateItem", "deleteItem"]) this.docHooks.push([hook, Hooks.on(hook, onItem)]);
    if (this.live) {
      const onActor = (actor) => {
        if (actor === this.actor) this.render();
      };
      this.docHooks.push(["updateActor", Hooks.on("updateActor", onActor)]);
    }
  }

  _onClose(options) {
    for (const [hook, id] of this.docHooks) Hooks.off(hook, id);
    this.docHooks = [];
    super._onClose(options);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    applyStyleVars(root, slotStyle());

    const name = root.querySelector('input[name="name"]');
    name?.addEventListener("input", () => (this.draft.name = name.value));

    const filter = root.querySelector(`input.${CSS}filter`);
    filter?.addEventListener("input", () => {
      this.filterText = filter.value;
      this.#applyFilter();
    });

    const profileSelect = root.querySelector(`select.${CSS}profile-select`);
    profileSelect?.addEventListener("change", () => setSelected(this.actor, profileSelect.value));

    for (const el of root.querySelectorAll("[data-drag]")) {
      el.addEventListener("dragstart", (event) => this.#onDragStart(event, el));
    }
    for (const el of root.querySelectorAll("[data-drop]")) {
      el.addEventListener("dragover", (event) => {
        event.preventDefault();
        el.classList.add("drag-over");
      });
      el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
      el.addEventListener("drop", (event) => {
        el.classList.remove("drag-over");
        this.#onDrop(event, el);
      });
    }

    this.#applySelection();
    this.#applyFilter();
  }

  /** Selection lives in the DOM only, so a click never re-renders. */
  #select(key) {
    this.selectedSlot = key;
    this.#applySelection();
    this.#applyFilter();
  }

  #applySelection() {
    for (const el of this.element.querySelectorAll(`.${CSS}slot, .${CSS}other`)) {
      el.classList.toggle("selected", !!this.selectedSlot && el.dataset.slot === this.selectedSlot);
    }
  }

  #applyFilter() {
    const needle = this.filterText.toLowerCase();
    const slot = this.selectedSlot;
    for (const el of this.element.querySelectorAll(`.${CSS}item`)) {
      const fitsSlot = !slot || el.dataset.slots.split(" ").includes(slot);
      el.hidden = !fitsSlot || (!!needle && !el.dataset.name.toLowerCase().includes(needle));
    }
    for (const group of this.element.querySelectorAll(`.${CSS}group`)) {
      group.hidden = [...group.querySelectorAll(`.${CSS}item`)].every((el) => el.hidden);
    }
  }

  #slotMenu() {
    const keyOf = (el) => el.dataset.slot;
    if (this.live) {
      return [
        {
          name: "PF1EP.Window.Unequip",
          icon: '<i class="fa-solid fa-hand"></i>',
          condition: (el) => el.classList.contains("filled"),
          callback: (el) => this.clearSlot(keyOf(el)),
        },
      ];
    }
    return [
      {
        name: "PF1EP.Window.MarkEmpty",
        icon: '<i class="fa-solid fa-ban"></i>',
        callback: (el) => this.#markEmpty(keyOf(el)),
      },
      {
        name: "PF1EP.Window.Ignore",
        icon: '<i class="fa-solid fa-eraser"></i>',
        callback: (el) => this.clearSlot(keyOf(el)),
      },
    ];
  }

  /* -------------------------------------------- */
  /*  Edits                                       */
  /* -------------------------------------------- */

  /** First slot an item naturally goes in (§6.2, click to assign). */
  naturalSlot(item) {
    const profile = this.#view();
    const region = regionOf(item);
    const open = (key) => profile.slots[key].state !== "item";
    if (region === "hand") {
      if (isShield(item)) return SHIELD;
      if (open("mainHand") || !canOffHand(item, { profile: !this.live })) return "mainHand";
      return mirrored(this.actor, profile) ? "mainHand" : "offHand";
    }
    if (region === "ring") return RINGS.find(open) ?? "ring1";
    if (region === "other") return barOf(item);
    if (region === "armor" && isLayer(item)) {
      const armor = profile.slots.armor;
      return armor.state === "item" && armor.item?.id !== item.id ? "armorOver" : "armor";
    }
    return region;
  }

  /** Live: apply the edited capture through the normal apply path (§6.6). Profile: redraw. */
  async #finish(profile) {
    if (this.live) await applyProfile(this.actor, normalize(profile), { source: "window", quiet: true });
    else this.render();
  }

  async assign(key, item) {
    const profile = this.#view();
    const result = place(this.actor, profile, key, item, { live: this.live });
    if (!result.ok) {
      const { item: it, slot } = result.data ?? {};
      const label = slot ? toggleLabel(slot) : "";
      ui.notifications.warn(t(result.warn, { item: it?.name ?? "", slot: label, actor: this.actor.name }));
      return;
    }
    await this.#finish(profile);
  }

  /** Double-click / Ignore / Unequip. */
  async clearSlot(key) {
    const profile = this.#view();
    if (clearSlot(this.actor, profile, key, { live: this.live })) await this.#finish(profile);
  }

  #markEmpty(key) {
    if (this.live) return;
    if (markEmpty(this.actor, this.draft, key)) this.render();
  }

  async toggleHeld() {
    const profile = this.#view();
    if (toggleHeld(this.actor, profile, { live: this.live })) await this.#finish(profile);
  }

  async removeOther(index) {
    const profile = this.#view();
    const entry = profile.other[index];
    if (!entry) return;
    if (this.live) entry.equipped = false;
    else profile.other.splice(index, 1);
    await this.#finish(profile);
  }

  /* -------------------------------------------- */
  /*  Drag and drop                               */
  /* -------------------------------------------- */

  #onDragStart(event, el) {
    const { drag } = el.dataset;
    let data = null;
    if (drag === "item") data = { type: "Item", uuid: el.dataset.uuid };
    else if (drag === "slot") data = { type: "pepSlot", slot: el.dataset.slot };
    else if (drag === "other") data = { type: "pepOther", index: Number(el.dataset.index) };
    if (data) event.dataTransfer.setData("text/plain", JSON.stringify(data));
  }

  /** Only this actor's items can be placed; fromUuidSync throws on compendium-embedded UUIDs. */
  #ownItem(uuid) {
    const prefix = `${this.actor.uuid}.Item.`;
    return uuid?.startsWith(prefix) ? this.actor.items.get(uuid.slice(prefix.length)) : null;
  }

  #onDrop(event, el) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const target = el.dataset.drop;
    const profile = this.#view();

    if (data?.type === "Item") return this.assign(target, this.#ownItem(data.uuid));

    if (data?.type === "pepSlot") {
      if (data.slot === target) return;
      const slot = profile.slots[data.slot];
      if (slot?.state !== "item") return;
      const item = resolveRef(this.actor, slot.item, { claimed: new Set() });
      if (item) this.assign(target, item);
      return;
    }

    if (data?.type === "pepOther") {
      const entry = profile.other[data.index];
      if (!entry || BARS.includes(target)) return;
      const item = resolveRef(this.actor, entry.item, { claimed: new Set() });
      if (item) this.assign(target, item);
    }
  }

  /** Called from the select action; exposed so the action functions can reach the private state. */
  select(key) {
    this.#select(key);
  }
}

/* -------------------------------------------- */
/*  Actions (`this` is the window)              */
/* -------------------------------------------- */

const isRightClick = (event) => event.type === "contextmenu";

function onSelectSlot(event, target) {
  // The second click of a double-click is the double-click's, not a toggle.
  if (isRightClick(event) || event.detail > 1) return;
  const key = target.dataset.slot;
  this.select(this.selectedSlot === key ? null : key);
}

function onAssignItem(event, target) {
  if (isRightClick(event)) return;
  const item = this.actor.items.get(target.dataset.itemId);
  if (!item) return;
  this.assign(this.selectedSlot ?? this.naturalSlot(item), item);
}

function onToggleHeld(event) {
  if (isRightClick(event)) return;
  this.toggleHeld();
}

function onResolveHands(event) {
  if (isRightClick(event)) return;
  resolveConflicts(this.actor);
}

function onToggleOther(event, target) {
  if (isRightClick(event) || this.live) return;
  const entry = this.draft.other[Number(target.dataset.index)];
  if (!entry) return;
  entry.equipped = !entry.equipped;
  this.render();
}

function onRemoveOther(event, target) {
  if (isRightClick(event)) return;
  this.removeOther(Number(target.dataset.index));
}

function onPickIcon(event, target) {
  if (isRightClick(event) || this.live) return;
  this.draft.icon = target.dataset.icon;
  this.render();
}

function onFromCurrent(event) {
  if (isRightClick(event) || this.live) return;
  Object.assign(this.draft, capture(this.actor));
  this.render();
}

function onClear(event) {
  if (isRightClick(event) || this.live) return;
  this.draft.slots = normalize({}).slots;
  this.draft.other = [];
  this.render();
}

async function onSave(event) {
  if (isRightClick(event) || this.live) return;
  // Selected before the write so the sheet re-render it triggers already shows it.
  setSelected(this.actor, this.draft.id);
  await writeProfile(this.actor, this.draft);
  this.close();
}

async function onRemove(event) {
  if (isRightClick(event) || this.live || !this.profileId) return;
  const ok = await DialogV2.confirm({
    window: { title: "PF1EP.Window.DeleteTitle" },
    content: `<p>${t("PF1EP.Window.DeleteConfirm", { profile: foundry.utils.escapeHTML(this.draft.name) })}</p>`,
    rejectClose: false,
  });
  if (!ok) return;
  await deleteProfile(this.actor, this.profileId);
  setSelected(this.actor, null);
  this.close();
}

/** The live footer's selected profile. */
function footerProfile(app) {
  const id = app.element.querySelector(`select.${CSS}profile-select`)?.value;
  return id ? findProfile(app.actor, id) : null;
}

async function onEquipProfile(event) {
  if (isRightClick(event)) return;
  const profile = footerProfile(this);
  if (profile) await applyProfile(this.actor, profile, { source: "window" });
}

async function onSaveToProfile(event) {
  if (isRightClick(event)) return;
  const profile = footerProfile(this);
  if (!profile) return;
  const esc = foundry.utils.escapeHTML;
  const ok = await DialogV2.confirm({
    window: { title: "PF1EP.Live.OverwriteTitle" },
    content: `<p>${t("PF1EP.Live.OverwriteConfirm", { profile: esc(profile.name), actor: esc(this.actor.name) })}</p>`,
    rejectClose: false,
  });
  if (!ok) return;
  await writeProfile(this.actor, { ...profile, ...capture(this.actor) });
  ui.notifications.info(t("PF1EP.Live.Saved", { profile: profile.name }));
}

async function onSaveAsNew(event) {
  if (isRightClick(event)) return;
  const name = await DialogV2.prompt({
    window: { title: "PF1EP.Live.NewTitle" },
    content: `<div class="form-group"><label>${t("PF1EP.Live.NewName")}</label><div class="form-fields"><input type="text" name="name" autofocus></div></div>`,
    ok: { label: "PF1EP.Window.Save", callback: (_event, button) => button.form.elements.name.value.trim() },
    rejectClose: false,
  });
  if (name === null || name === undefined) return;
  const saved = await writeProfile(this.actor, { ...capture(this.actor), name, sort: null });
  setSelected(this.actor, saved.id);
  ui.notifications.info(t("PF1EP.Live.Saved", { profile: saved.name }));
}
