import { MODULE_ID } from "./const.mjs";
import { registerSettings } from "./settings.mjs";
import { registerSheetHooks } from "./sheet/inventory-controls.mjs";
import { api } from "./api.mjs";

Hooks.once("init", () => {
  registerSettings();
  registerSheetHooks();
  game.modules.get(MODULE_ID).api = api;
});
