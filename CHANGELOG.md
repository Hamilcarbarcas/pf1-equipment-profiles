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
- API at `game.modules.get("pf1-equipment-profiles").api`, with equip gates and hooks for other
  modules.

### Fixed
- The character sheet's **Settings** tab no longer jumps back to the top when you tick a box on
  it, including PF1's own settings.

---

Earlier releases: see [GitHub Releases](https://github.com/Hamilcarbarcas/pf1-equipment-profiles/releases).
