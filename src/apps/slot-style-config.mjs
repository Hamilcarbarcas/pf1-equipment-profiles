/**
 * GM menu for the empty-slot icons: per-slot image, color, hue, tint. DESIGN.md §6.5.
 */

import { CSS, MODULE_ID, TEMPLATES } from "../const.mjs";
import { DEFAULT_STYLE, KEYS, slotStyle } from "../settings.mjs";
import { HANDS, LEFT, RIGHT, slotLabel } from "../slots.mjs";
import { applyStyleVars, glyphHtml } from "../style.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SlotStyleConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${CSS}slot-style-config`,
    classes: [`${CSS}style-config`],
    window: { title: "PF1EP.StyleConfig.Title", icon: "fa-solid fa-palette" },
    position: { width: 520, height: "auto" },
    actions: {
      pickImage: onPickImage,
      save: onSave,
      reset: onResetAll,
    },
  };

  static PARTS = {
    body: { template: `${TEMPLATES}/slot-style-config.hbs` },
  };

  constructor(options = {}) {
    super(options);
    this.draft = slotStyle();
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const view = (key) => ({
      key,
      label: slotLabel(key),
      glyph: glyphHtml(key, this.draft),
      custom: !!this.draft.images[key],
    });
    return Object.assign(context, {
      left: LEFT.flatMap((k) => (k === "armor" ? ["armor", "armorOver"] : [k])).map(view),
      right: RIGHT.map(view),
      bottom: HANDS.map(view),
      color: this.draft.color,
      hue: this.draft.hue,
      tint: this.draft.tint,
    });
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    // Right-click a slot resets it to the built-in glyph.
    this.element.addEventListener("contextmenu", (event) => {
      const slot = event.target.closest(`.${CSS}style-slot`);
      if (!slot) return;
      event.preventDefault();
      delete this.draft.images[slot.dataset.slot];
      this.render();
    });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    applyStyleVars(root, this.draft);

    const color = root.querySelector('[name="color"]');
    color?.addEventListener("change", () => {
      this.draft.color = color.value || DEFAULT_STYLE.color;
      applyStyleVars(root, this.draft);
    });
    const hue = root.querySelector('[name="hue"]');
    hue?.addEventListener("input", () => {
      this.draft.hue = Number(hue.value) || 0;
      applyStyleVars(root, this.draft);
    });
    hue?.addEventListener("change", () => {
      this.draft.hue = Number(hue.value) || 0;
      applyStyleVars(root, this.draft);
    });
    const tint = root.querySelector('[name="tint"]');
    tint?.addEventListener("change", () => {
      this.draft.tint = tint.checked;
      this.render();
    });
  }
}

function onPickImage(event, target) {
  if (event.type === "contextmenu") return;
  const key = target.dataset.slot;
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  new FilePicker({
    type: "image",
    current: this.draft.images[key] ?? "",
    callback: (path) => {
      this.draft.images[key] = path;
      this.render();
    },
  }).render(true);
}

async function onSave() {
  await game.settings.set(MODULE_ID, KEYS.slotStyle, this.draft);
  this.close();
}

function onResetAll() {
  this.draft = { ...DEFAULT_STYLE, images: {} };
  this.render();
}
