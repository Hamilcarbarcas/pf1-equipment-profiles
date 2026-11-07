import { MODULE_ID } from "./const.mjs";
import { registerSettings } from "./settings.mjs";
import { registerSheetHooks } from "./sheet/inventory-controls.mjs";
import { registerLayerSection } from "./sheet/layer-section.mjs";
import { registerActorSlotsSection } from "./sheet/actor-slots-section.mjs";
import { registerSlotBlocking } from "./actor-slots.mjs";
import { registerSettingsScroll } from "./sheet/settings-scroll.mjs";
import { registerUnequippedGuard } from "./unequipped.mjs";
import { registerUnequippedRows } from "./sheet/unequipped-rows.mjs";
import { SlotStyleConfig } from "./apps/slot-style-config.mjs";
import { api } from "./api.mjs";
import { registerBuiltinRules } from "./hands.mjs";
import { registerHandWatch } from "./hand-watch.mjs";
import { registerGripConfig } from "./sheet/grip-config.mjs";
import { registerGripChips } from "./sheet/grip-chip.mjs";
import { registerShieldAC } from "./shield-ac.mjs";

Hooks.once("init", () => {
  registerSettings();

  game.settings.registerMenu(MODULE_ID, "slotStyleMenu", {
    name: "PF1EP.Settings.StyleMenu.Name",
    label: "PF1EP.Settings.StyleMenu.Label",
    hint: "PF1EP.Settings.StyleMenu.Hint",
    icon: "fa-solid fa-palette",
    type: SlotStyleConfig,
    restricted: true,
  });

  registerSheetHooks();
  registerLayerSection();
  registerActorSlotsSection();
  registerSlotBlocking();
  registerSettingsScroll();
  registerUnequippedGuard();
  registerUnequippedRows();
  registerBuiltinRules();
  registerHandWatch();
  registerGripConfig();
  registerGripChips();
  registerShieldAC();
  game.modules.get(MODULE_ID).api = api;
});
