# Changelog

All notable changes to this module are documented here. Release notes are taken from the section
matching each release tag.

## [Unreleased]

### Added
- **Equipment window:** a paper doll with your portrait, icon slots for every PF1 equipment slot,
  main and off hand, two ring slots, and two bars for any number of items: one for clothing, one
  for everything else. Opened from the **Equipment** button on the Inventory tab, it equips your
  character directly: drag an item onto a slot, or select a slot and click an item.
  Double-click or right-click a slot to unequip it.
- **Equipment profiles:** pick a profile from the Inventory tab's dropdown and **Equip** it, or
  **Edit** it or make a **New** one in the same window, without changing what you're wearing. A ✓
  marks profiles that are already fully equipped. In a profile, slots can be set to an item,
  **Empty**, or **Ignore**.
- From the equipment window, **Save to Profile** and **Save as New** save what you're wearing.
- A chain between the hands shows and switches the grip. A two-handed weapon shows in both hand
  slots.
- Equipping changes only what needs changing, sets each weapon's hold to match its hand, and
  reports items it couldn't find, including ones packed in a container.
- Items are matched by name, so profiles survive packing, unpacking, and identification.
- **Disabled Equipment Slots** on the character sheet's Settings tab: turn off slots a character
  can't use. They disappear from the equipment window, and items needing them can't be equipped
  from anywhere.
- **Over Armor** slot for armor worn over another suit, tucked under the Armor slot until used,
  with a warning when it's over heavy armor. Armor gets a **Wearable with other armor** checkbox
  on its Advanced tab; armored coats and kilts are on by default.
- **Slot Icons** settings (GM): pick the icon for each empty slot, and set the icons' color and
  hue.
- **Announce in Chat** setting: post a card listing what changed.
- **Unequipped weapons** are grayed out and struck through on the Combat tab, and attacking with
  one asks first, with an **Attack Anyway** option. Covers the sheet, hotbar, token HUD, and
  macros. Turn it off with the **Unequipped Weapons** setting.
- **Shield slot:** shields have their own slot, tucked behind the off hand. A buckler, or a
  shield while animated, leaves the off hand free, so a buckler and an off-hand weapon can be
  worn together. Saved profiles move their shield over on their own.
- **Grips:** the Combat tab shows the grip of each weapon and each attack with an attack roll
  (1H, 2H, OH) beside its name; click it to switch. Weapons and attacks get a **Grips** row on the
  Details tab to set which grips they can take, and the Held choices offer only those.
- **Equip toggle:** a fist beside each weapon's grip on the Combat tab equips or unequips it.
  Equipping puts the weapon in the hand(s) its grip names and unequips whatever was there.
- **Animated shields:** while a buff with the boolean flag `animatedShield` is active, the shield
  needs no hand. When it ends, choose **Re-grab** or **Drop**.
- **Lances** can be wielded one-handed while a buff with the boolean flag `mounted` is active.
  Dismounting asks to **Regrip Two-Handed** or **Stow** the lance. Profiles that need a buff say
  so in their name, and equipping one without it asks first.
- **Bucklers:** attacking off-hand or two-handed with a buckler worn takes –1 and, in combat,
  costs the buckler's AC until the start of your next turn. Bows and crossbows don't count.
- API at `game.modules.get("pf1-equipment-profiles").api`, with equip gates and hooks for other
  modules, and hand rules under `api.hands`.

### Fixed
- The character sheet's **Settings** tab no longer jumps back to the top when you tick a box on
  it, including PF1's own settings.

---

Earlier releases: see [GitHub Releases](https://github.com/Hamilcarbarcas/pf1-equipment-profiles/releases).

### Changed
- The **Equipment Profiles** section is hidden on armor that isn't marked wearable over other armor. Tick it under **Optional Sections** on the Advanced tab to show it (shared sheet kit 1.8.0).
