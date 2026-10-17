# Changelog

All notable changes to this module are documented here. Release notes are taken from the section
matching each release tag.

## [Unreleased]

### Added
- **Equipment profiles** on the Inventory tab: pick a profile from the dropdown and **Equip** it,
  or **Edit** it or make a **New** one. A ✓ marks profiles that are already fully equipped.
- **Equip window:** a paper doll with your portrait, slots for every PF1 equipment slot, main and
  off hand with a one- or two-handed grip, two ring slots, and an **Other Equipped** strip. Drag
  items in, or select a slot and click an item. Right-click a slot to mark it **Empty** or
  **Ignore**. **From Current** and **Clear** fill or reset the window.
- Equipping a profile changes only what needs changing, sets each weapon's hold to match its hand,
  and reports items it couldn't find, including ones packed in a container.
- Items are matched by name, so profiles survive packing, unpacking, and identification.
- **Over Armor** slot for an armored coat or armored kilt worn over another suit, with a warning
  when it's over heavy armor.
- **Announce in Chat** setting: post a card listing what changed.
- API at `game.modules.get("pf1-equipment-profiles").api`, with equip gates and hooks for other
  modules.

---

Earlier releases: see [GitHub Releases](https://github.com/Hamilcarbarcas/pf1-equipment-profiles/releases).
