# PF1 Equipment Profiles

Named equipment loadouts for Pathfinder 1e. Build a profile on a paper-doll equip window, then
swap to it in one click.

**Manifest URL:** `https://github.com/Hamilcarbarcas/pf1-equipment-profiles/releases/latest/download/module.json`

## Requirements
- Foundry VTT v13
- PF1e system v11.10

## Contents

- [Using profiles](#using-profiles)
- [The equip window](#the-equip-window)
  - [Slots](#slots)
  - [Hands](#hands)
  - [Rings](#rings)
  - [Over armor](#over-armor)
  - [Other equipped](#other-equipped)
- [Equipping a profile](#equipping-a-profile)
  - [Matching items](#matching-items)
- [Settings](#settings)
- [For module developers](#for-module-developers)

## Using profiles

The **Inventory** tab gains a row under the currency:

- **Dropdown:** your profiles. A ✓ marks any profile that is already fully equipped.
- **Equip:** equips the selected profile.
- **Edit / New:** open the equip window. **New** starts from what you have equipped now.

Profiles belong to the actor. Anyone who owns the actor can make and use them.

## The equip window

Your portrait sits in the middle, with slots down both sides, the hands below, and an **Other
Equipped** strip at the bottom. Your equippable items are listed on the right.

- **Assign an item:** drag it onto a slot, either from the list or from the character sheet. You
  can also click a slot to select it, then click an item. Clicking an item with no slot selected
  puts it in its natural slot.
- **Move an item:** drag it from one slot to another.
- **Right-click a slot** to mark it **Empty** or set it back to **Ignore**.
- **From Current** refills the window from what is equipped now. **Clear** sets every slot back to
  Ignore.

### Slots

Each slot is in one of three states:

| State | When the profile is equipped |
| --- | --- |
| **Ignore** (blank) | Whatever is in the slot stays there. |
| **Item** | That item is equipped, and anything else in the slot is unequipped. |
| **Empty** (red ⦸) | Everything in the slot is unequipped. |

Slots with nothing equipped start as Ignore. Mark a slot Empty if the profile should take
something off.

### Hands

- **Main Hand** holds a weapon. Use the **1H / 2H** button to choose the grip, where the weapon
  allows it.
- **Off Hand** holds a weapon or a shield.
- Equipping a profile sets each weapon's hold on its item sheet. A dagger in each hand becomes
  one-handed and off-hand.
- A two-handed grip clears the off hand, except for a buckler.
- If a weapon's attack actions set their own hold, the window warns you, because the profile's
  grip won't reach those actions.

### Rings

The two ring slots don't care which finger is which, only which rings are worn. A blank ring slot
keeps one ring you already wear. If that would mean more than two rings, the extra ones come off,
and you're told which.

### Over armor

The **Over Armor** slot under Armor holds armor worn on top of another suit: an armored coat or
an armored kilt. You can still wear either one as your only armor in the Armor slot.

A coat worn alone counts as your armor, so a profile that puts a breastplate in Armor takes the
coat off. To wear it over the breastplate, put it in Over Armor as well. The window warns you
when a coat or kilt is over heavy armor.

This module only equips the layers. PF1's own numbers for two suits worn together aren't fully
right: spell failure adds up, and AC can mix the two suits' bonuses. Check those by hand.

### Other equipped

Extra weapons (armor spikes, a spare dagger) and items without a slot go here. Each one can be set
to equip or unequip. Items not listed are left alone.

An equipped weapon that isn't in a hand slot or in **Other Equipped** counts as being in your main
hand. Add weapons like armor spikes to **Other Equipped** so that changing your main hand doesn't
take them off.

## Equipping a profile

Equipping changes only what needs to change, in one update. You're told how many items changed,
and which items couldn't be found. An item found only inside a container is reported as being in
that container, since items in containers can't be equipped.

### Matching items

Items are matched by name, so a profile keeps working after you move an item in and out of a pack
or replace it with a fresh copy. Identifying an item doesn't break the match. When two items share
a name, the one already in place wins, then an unequipped one.

## Settings

| Setting | Effect |
| --- | --- |
| **Announce in Chat** | Posts a chat card listing what changed whenever a profile is equipped. |

## For module developers

`game.modules.get("pf1-equipment-profiles").api`:

| Member | Does |
| --- | --- |
| `list(actor)` | Profiles as `{ id, name, icon, current }` |
| `current(actor)` | IDs of the profiles that are fully equipped |
| `apply(actor, idOrName, { gates, source })` | Equips a profile. Returns the result, or `null` if cancelled. |
| `capture(actor)` | Slots built from what is equipped now |
| `save(actor, profile)` / `remove(actor, idOrName)` | Write or delete a profile |
| `openEditor(actor, id?)` | Opens the equip window |
| `registerGate(id, handler, { order })` / `unregisterGate(id)` | See below |

`actor` can be a document, UUID, ID, or name. Leave it out to use the selected token, then your
assigned character.

**Equip gates** hold an equip until something approves it. A gate is
`async (request) => boolean`, where `request` is
`{ actor, token, profile: { id, name }, changes, source }`. Gates run one at a time, in `order`.
Anything other than `true` cancels the equip. Each change lists the item, slot, `op`
(`equip`, `unequip`, or `regrip`), and its `from` and `to` state.

**Hooks:** `pf1EquipmentProfiles.preApply(actor, profile, plan)` runs before the gates; return
`false` to cancel. `pf1EquipmentProfiles.apply(actor, profile, result)` runs after the write.
