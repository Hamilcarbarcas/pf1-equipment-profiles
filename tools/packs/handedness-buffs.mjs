// astora-mod `buffs` changes for the handedness core (pf1-equipment-profiles DESIGN.md §17.10):
// the Mounted buff gains boolean flag `mounted`, and a new Animated Shield buff (4 rounds, boolean
// flag `animatedShield`) goes in Item Buffs.
//
// Applies to a pack-tools YAML tree, so it can be run on a live pull (packs-live-check) before a
// push, per tools/pack-tools/PENDING.md. Idempotent. Dry run unless --write.
//
//   node tools/packs/handedness-buffs.mjs <tree root containing buffs/> [--write]

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const yaml = require("C:/Code/FoundryVTT/tools/pack-tools/node_modules/js-yaml");
const DUMP = { sortKeys: true, lineWidth: -1, noRefs: true };

const [root, ...flags] = process.argv.slice(2);
const write = flags.includes("--write");
if (!root) throw new Error("usage: handedness-buffs.mjs <tree root> [--write]");
const buffs = path.join(root, "buffs");

const MOUNTED = "Misc_Buffs_ZfJgZ0wyp78YHLeC/Universal_Features_uUVzcpGMaVwbqC4R/Mounted_xZeWz5lwh0Lz54os.yml";
const ITEM_BUFFS = "Item_Buffs_cD0qQQpcjrwPg0Ps";
const ANIMATED_ID = "pepAnimShield001";
const ANIMATED = `${ITEM_BUFFS}/Animated_Shield_${ANIMATED_ID}.yml`;

function load(rel) {
  const file = path.join(buffs, rel);
  const text = fs.readFileSync(file, "utf8");
  const doc = yaml.load(text);
  // An untouched document must dump back to its file byte for byte, or the edit would be noisy.
  if (yaml.dump(doc, DUMP) !== text) console.warn(`note: ${rel} doesn't round-trip exactly; diff will show reformatting`);
  return { file, doc };
}

const out = [];

// 1. Mounted gains `mounted`.
{
  const { file, doc } = load(MOUNTED);
  doc.system.flags ??= {};
  doc.system.flags.boolean ??= {};
  if (doc.system.flags.boolean.mounted === true) out.push("Mounted: already has `mounted`");
  else {
    doc.system.flags.boolean.mounted = true;
    out.push("Mounted: + boolean flag `mounted`");
    if (write) fs.writeFileSync(file, yaml.dump(doc, DUMP));
  }
}

// 2. Animated Shield.
{
  const file = path.join(buffs, ANIMATED);
  if (fs.existsSync(file)) out.push("Animated Shield: already present");
  else {
    const now = Date.now();
    const doc = {
      _id: ANIMATED_ID,
      _key: `!items!${ANIMATED_ID}`,
      _stats: {
        compendiumSource: null,
        coreVersion: "13.351",
        createdTime: now,
        duplicateSource: null,
        exportSource: null,
        lastModifiedBy: null,
        modifiedTime: now,
        systemId: "pf1",
        systemVersion: "11.11",
      },
      effects: [],
      flags: { "astora-mod": { buffToggle: { autoDelete: true } } },
      folder: ITEM_BUFFS.split("_").pop(),
      img: "icons/equipment/shield/heater-crystal-blue.webp",
      name: "Animated Shield",
      ownership: { default: 0 },
      sort: 0,
      system: {
        actions: [],
        active: false,
        attackNotes: [],
        changeFlags: {},
        changes: [],
        conditions: [],
        contextNotes: [],
        description: {
          instructions: "",
          value:
            "<p>The shield defends on its own for 4 rounds, leaving its hand free. Its shield bonus and abilities still apply, and so do its armor check penalty, arcane spell failure, and nonproficiency. When it ends, choose to re-grab the shield or let it drop.</p>",
        },
        duration: { end: "turnStart", units: "round", value: "4" },
        effectNotes: [],
        flags: { boolean: { animatedShield: true }, dictionary: {} },
        hideFromToken: false,
        level: 0,
        links: { children: [] },
        scriptCalls: [],
        showInQuickbar: false,
        subType: "item",
        tag: "",
        tags: [],
        uses: { autoDeductChargesCost: "", maxFormula: "", per: "", rechargeFormula: "", value: null },
      },
      type: "buff",
    };
    out.push(`Animated Shield: new (${ANIMATED})`);
    if (write) fs.writeFileSync(file, yaml.dump(doc, DUMP));
  }
}

console.log(`${write ? "WROTE" : "DRY RUN"} ${buffs}\n  ${out.join("\n  ")}`);
