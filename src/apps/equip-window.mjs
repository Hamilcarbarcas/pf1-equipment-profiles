/**
 * The paper-doll equip window: build or edit one profile. DESIGN.md §6.
 */

import { CSS, TEMPLATES } from "../const.mjs";
import { capture } from "../capture.mjs";
import { findInContainer, resolveRef } from "../match.mjs";
import {
  HANDS,
  LEFT,
  RIGHT,
  RINGS,
  SLOTS,
  SLOT_ICONS,
  fits,
  fitsOther,
  isBuckler,
  isEquippable,
  isHeavyArmor,
  isLayer,
  layerKind,
  liveHeld,
  mainHandGrip,
  regionOf,
  slotLabel,
} from "../slots.mjs";
import { deleteProfile, findProfile, itemRef, normalize, refLabel, writeProfile } from "../store.mjs";
import { setSelected } from "../selection.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const ICONS = [
  "shield-halved", "sword", "swords", "axe", "dagger", "bow-arrow", "staff", "hammer",
  "hand-fist", "shield", "helmet-battle", "hat-wizard", "wand-sparkles", "user-ninja", "mask", "crosshairs",
  "campground", "person-hiking", "horse", "person-swimming", "moon", "fire", "snowflake", "crown",
].map((n) => `fa-solid fa-${n}`);

const IGNORE = () => ({ state: "ignore", item: null, held: null });
const sameItem = (ref, item) => ref?.id === item.id;

export class EquipWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: [`${CSS}equip-window`],
    window: { icon: "fa-solid fa-shirt", resizable: true },
    position: { width: 840, height: "auto" },
    actions: {
      selectSlot: onSelectSlot,
      assignItem: onAssignItem,
      toggleHeld: onToggleHeld,
      toggleOther: onToggleOther,
      removeOther: onRemoveOther,
      pickIcon: onPickIcon,
      fromCurrent: onFromCurrent,
      clear: onClear,
      save: onSave,
      remove: onRemove,
    },
  };

  static PARTS = {
    body: { template: `${TEMPLATES}/equip-window.hbs`, scrollable: [`.${CSS}item-list`] },
  };

  /** One window per actor and profile; a second open brings the first forward. */
  static open(actor, profileId = null) {
    const id = `${CSS}equip-${actor.uuid.replaceAll(".", "-")}-${profileId ?? "new"}`;
    const existing = foundry.applications.instances.get(id);
    if (existing) {
      existing.bringToFront();
      return existing;
    }
    const app = new this(actor, profileId, { id });
    app.render({ force: true });
    return app;
  }

  constructor(actor, profileId, options = {}) {
    super(options);
    this.actor = actor;
    this.profileId = profileId;
    const existing = profileId ? findProfile(actor, profileId) : null;
    if (existing) this.draft = foundry.utils.deepClone(existing);
    else {
      this.draft = normalize({ ...capture(actor) });
      this.draft.name = "";
      this.draft.sort = null;
    }
    this.selectedSlot = null;
    this.filterText = "";
    this.itemHooks = [];
  }

  get title() {
    return game.i18n.format("PF1EP.Window.Title", { actor: this.actor.name });
  }

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const draft = this.draft;
    const claimed = new Set();
    const resolved = {};
    for (const key of SLOTS) {
      const slot = draft.slots[key];
      if (slot.state !== "item") continue;
      const item = resolveRef(this.actor, slot.item, { claimed });
      if (item) claimed.add(item.id);
      resolved[key] = item;
    }

    const mainItem = resolved.mainHand;
    const main2h = draft.slots.mainHand.state === "item" && draft.slots.mainHand.held === "2h";
    const offLocked = main2h && !(resolved.offHand && isBuckler(resolved.offHand));

    const slotView = (key) => {
      const slot = draft.slots[key];
      const item = resolved[key] ?? null;
      const view = {
        key,
        label: slotLabel(key),
        icon: SLOT_ICONS[key],
        state: slot.state,
        selected: this.selectedSlot === key,
        locked: key === "offHand" && offLocked,
        img: item?.img ?? null,
        caption: slotLabel(key),
        missing: false,
        tooltip: slotLabel(key),
        grip: null,
      };
      if (slot.state === "empty") {
        view.caption = game.i18n.localize("PF1EP.Window.Empty");
        view.tooltip = `${view.label}: ${view.caption}`;
      } else if (slot.state === "item") {
        if (item) {
          view.caption = item.name;
          view.tooltip = `${view.label}: ${item.name}`;
        } else {
          const container = findInContainer(this.actor, slot.item);
          view.missing = true;
          view.caption = refLabel(slot.item);
          view.tooltip = container
            ? game.i18n.format("PF1EP.Window.InContainer", { item: view.caption, container: container.name })
            : game.i18n.format("PF1EP.Window.Missing", { item: view.caption });
        }
      }
      if (key === "mainHand" && slot.state === "item" && mainItem) {
        const grip = mainHandGrip(mainItem);
        view.grip = { held: slot.held ?? grip.held, fixed: grip.fixed, label: game.i18n.localize(`PF1EP.Grip.${slot.held ?? grip.held}`) };
      }
      return view;
    };

    const other = draft.other.map((entry, index) => {
      const item = resolveRef(this.actor, entry.item, { claimed });
      if (item) claimed.add(item.id);
      return {
        index,
        img: item?.img ?? null,
        name: item?.name ?? refLabel(entry.item),
        missing: !item,
        equipped: entry.equipped,
      };
    });

    const warnings = [];
    for (const key of HANDS) {
      const item = resolved[key];
      if (item?.type !== "weapon") continue;
      const actions = (item.actions ?? []).filter((a) => a.hasAttack && a.held).map((a) => a.name);
      if (actions.length) warnings.push(game.i18n.format("PF1EP.Warn.HeldHidden", { item: item.name, actions: actions.join(", ") }));
    }
    const over = resolved.armorOver;
    if (over && isHeavyArmor(resolved.armor)) {
      const kind = layerKind(over);
      if (kind) warnings.push(game.i18n.format(`PF1EP.Warn.LayerOverHeavy.${kind}`, { item: over.name }));
    }

    return Object.assign(context, {
      css: CSS,
      draft,
      isNew: !this.profileId,
      icons: ICONS.map((icon) => ({ icon, active: icon === draft.icon })),
      portrait: this.actor.img,
      left: LEFT.map(slotView),
      right: RIGHT.map(slotView),
      hands: HANDS.map(slotView),
      other,
      otherSelected: this.selectedSlot === "other",
      groups: this.#itemGroups(claimed),
      filterText: this.filterText,
      warnings,
    });
  }

  #itemGroups(claimed) {
    const groups = [
      { key: "weapons", label: "PF1.InventoryWeapons", items: [] },
      { key: "armor", label: "PF1.ArmorOrShield", items: [] },
      { key: "worn", label: "PF1.InventoryEquipment", items: [] },
      { key: "other", label: "PF1.Other", items: [] },
    ];
    const at = Object.fromEntries(groups.map((g) => [g.key, g]));
    const selected = this.selectedSlot;
    const needle = this.filterText.toLowerCase();
    const items = [...this.actor.items].filter(isEquippable).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    for (const item of items) {
      const fitsSelected = !selected || (selected === "other" ? fitsOther(item) : fits(item, selected));
      const view = {
        uuid: item.uuid,
        id: item.id,
        img: item.img,
        name: item.name,
        equipped: item.system.equipped === true,
        assigned: claimed.has(item.id),
        misfit: !fitsSelected,
        hidden: !fitsSelected || (!!needle && !item.name.toLowerCase().includes(needle)),
      };
      if (item.type === "weapon") at.weapons.items.push(view);
      else if (item.type === "equipment" && ["armor", "shield"].includes(item.subType)) at.armor.items.push(view);
      else if (item.type === "equipment") at.worn.items.push(view);
      else at.other.items.push(view);
    }
    for (const g of groups) g.hidden = g.items.every((i) => i.hidden);
    return groups.filter((g) => g.items.length);
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const ContextMenu = foundry.applications.ux.ContextMenu.implementation;
    new ContextMenu(this.element, `.${CSS}slot`, this.#slotMenu(), { jQuery: false, fixed: true });

    const rerender = (item) => {
      if (item.parent === this.actor) this.render();
    };
    for (const hook of ["createItem", "updateItem", "deleteItem"]) {
      this.itemHooks.push([hook, Hooks.on(hook, rerender)]);
    }
  }

  _onClose(options) {
    for (const [hook, id] of this.itemHooks) Hooks.off(hook, id);
    this.itemHooks = [];
    super._onClose(options);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;

    const name = root.querySelector('input[name="name"]');
    name?.addEventListener("input", () => (this.draft.name = name.value));

    const filter = root.querySelector(`input.${CSS}filter`);
    filter?.addEventListener("input", () => {
      this.filterText = filter.value;
      this.#applyFilter();
    });

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
  }

  #applyFilter() {
    const needle = this.filterText.toLowerCase();
    for (const el of this.element.querySelectorAll(`.${CSS}item`)) {
      const off = el.classList.contains("misfit");
      el.hidden = off || (!!needle && !el.dataset.name.toLowerCase().includes(needle));
    }
  }

  #slotMenu() {
    const keyOf = (el) => el.dataset.slot;
    return [
      {
        name: "PF1EP.Window.MarkEmpty",
        icon: '<i class="fa-solid fa-ban"></i>',
        callback: (el) => this.#setSlot(keyOf(el), { state: "empty", item: null, held: null }),
      },
      {
        name: "PF1EP.Window.Ignore",
        icon: '<i class="fa-solid fa-eraser"></i>',
        callback: (el) => this.#setSlot(keyOf(el), IGNORE()),
      },
    ];
  }

  /* -------------------------------------------- */
  /*  Draft edits                                 */
  /* -------------------------------------------- */

  #setSlot(key, slot) {
    if (!SLOTS.includes(key)) return;
    this.draft.slots[key] = slot;
    this.render();
  }

  /** Drop an item from every slot and the Other list. */
  #release(item) {
    for (const key of SLOTS) {
      if (sameItem(this.draft.slots[key].item, item)) this.draft.slots[key] = IGNORE();
    }
    this.draft.other = this.draft.other.filter((o) => !sameItem(o.item, item));
  }

  #offLocked() {
    const main = this.draft.slots.mainHand;
    return main.state === "item" && main.held === "2h";
  }

  /** First slot an item naturally goes in (§6.2, click to assign). */
  naturalSlot(item) {
    const region = regionOf(item);
    const open = (key) => this.draft.slots[key].state !== "item";
    if (region === "hand") {
      if (item.type !== "weapon") return "offHand";
      if (open("mainHand")) return "mainHand";
      return this.#offLocked() ? "mainHand" : "offHand";
    }
    if (region === "ring") return RINGS.find(open) ?? "ring1";
    if (region === "other") return "other";
    // A layer goes over a suit already assigned, otherwise it is the armor (§3.6).
    if (region === "armor" && isLayer(item)) {
      const armor = this.draft.slots.armor;
      return armor.state === "item" && !sameItem(armor.item, item) ? "armorOver" : "armor";
    }
    return region;
  }

  assign(key, item) {
    if (!item || this.actor.items.get(item.id) !== item) {
      ui.notifications.warn("PF1EP.Warn.NotThisActor", { localize: true });
      return;
    }
    if (key === "other") return this.#addOther(item);
    if (!fits(item, key)) {
      ui.notifications.warn(game.i18n.format("PF1EP.Warn.DoesNotFit", { item: item.name, slot: slotLabel(key) }));
      return;
    }
    if (key === "offHand" && this.#offLocked() && !isBuckler(item)) {
      ui.notifications.warn("PF1EP.Warn.OffHandLocked", { localize: true });
      return;
    }

    this.#release(item);
    let held = null;
    if (key === "offHand" && item.type === "weapon") held = "oh";
    if (key === "mainHand") {
      const grip = mainHandGrip(item);
      const live = item.system.equipped === true ? liveHeld(item) : null;
      held = grip.fixed || !live || live === "oh" ? grip.held : live;
    }
    this.draft.slots[key] = { state: "item", item: itemRef(item), held };
    if (key === "mainHand" && held === "2h") this.clearOffForTwoHanded();
    this.render();
  }

  clearOffForTwoHanded() {
    const off = this.draft.slots.offHand;
    if (off.state !== "item") return;
    const item = resolveRef(this.actor, off.item, { claimed: new Set() });
    if (!item || !isBuckler(item)) this.draft.slots.offHand = IGNORE();
  }

  #addOther(item) {
    if (!fitsOther(item)) {
      ui.notifications.warn(game.i18n.format("PF1EP.Warn.DoesNotFit", { item: item.name, slot: game.i18n.localize("PF1EP.Window.Other") }));
      return;
    }
    this.#release(item);
    this.draft.other.push({ item: itemRef(item), equipped: true });
    this.render();
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

  #onDrop(event, el) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const target = el.dataset.drop;

    if (data?.type === "Item") return this.assign(target, fromUuidSync(data.uuid));

    if (data?.type === "pepSlot") {
      const from = data.slot;
      if (from === target) return;
      const slot = this.draft.slots[from];
      if (slot?.state !== "item") return;
      const item = resolveRef(this.actor, slot.item, { claimed: new Set() });
      if (item) this.assign(target, item);
      return;
    }

    if (data?.type === "pepOther") {
      const entry = this.draft.other[data.index];
      if (!entry || target === "other") return;
      const item = resolveRef(this.actor, entry.item, { claimed: new Set() });
      if (item) this.assign(target, item);
    }
  }
}

/* -------------------------------------------- */
/*  Actions (`this` is the window)              */
/* -------------------------------------------- */

const isRightClick = (event) => event.type === "contextmenu";

function onSelectSlot(event, target) {
  if (isRightClick(event)) return;
  const key = target.dataset.slot;
  this.selectedSlot = this.selectedSlot === key ? null : key;
  this.render();
}

function onAssignItem(event, target) {
  if (isRightClick(event)) return;
  const item = this.actor.items.get(target.dataset.itemId);
  if (!item) return;
  this.assign(this.selectedSlot ?? this.naturalSlot(item), item);
}

function onToggleHeld(event) {
  if (isRightClick(event)) return;
  const main = this.draft.slots.mainHand;
  if (main.state !== "item") return;
  main.held = main.held === "2h" ? "1h" : "2h";
  if (main.held === "2h") this.clearOffForTwoHanded();
  this.render();
}

function onToggleOther(event, target) {
  if (isRightClick(event)) return;
  const entry = this.draft.other[Number(target.dataset.index)];
  if (!entry) return;
  entry.equipped = !entry.equipped;
  this.render();
}

function onRemoveOther(event, target) {
  if (isRightClick(event)) return;
  this.draft.other.splice(Number(target.dataset.index), 1);
  this.render();
}

function onPickIcon(event, target) {
  if (isRightClick(event)) return;
  this.draft.icon = target.dataset.icon;
  this.render();
}

function onFromCurrent(event) {
  if (isRightClick(event)) return;
  Object.assign(this.draft, capture(this.actor));
  this.render();
}

function onClear(event) {
  if (isRightClick(event)) return;
  this.draft.slots = normalize({}).slots;
  this.draft.other = [];
  this.render();
}

async function onSave(event) {
  if (isRightClick(event)) return;
  // Selected before the write so the sheet re-render it triggers already shows it.
  setSelected(this.actor, this.draft.id);
  await writeProfile(this.actor, this.draft);
  this.close();
}

async function onRemove(event) {
  if (isRightClick(event) || !this.profileId) return;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "PF1EP.Window.DeleteTitle" },
    content: `<p>${game.i18n.format("PF1EP.Window.DeleteConfirm", { profile: foundry.utils.escapeHTML(this.draft.name) })}</p>`,
    rejectClose: false,
  });
  if (!ok) return;
  await deleteProfile(this.actor, this.profileId);
  setSelected(this.actor, null);
  this.close();
}
