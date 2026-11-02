# PF1 Equipment Profiles

A paper-doll equipment window for Pathfinder 1e. Equip your character from it directly, and save
named loadouts you can swap to in one click.

**Manifest URL:** `https://github.com/Hamilcarbarcas/pf1-equipment-profiles/releases/latest/download/module.json`

## Requirements
- Foundry VTT v13
- PF1e system v11.10

## Contents

- [The Inventory tab row](#the-inventory-tab-row)
- [The equipment window](#the-equipment-window)
  - [Equipping directly](#equipping-directly)
  - [Building a profile](#building-a-profile)
  - [Slots](#slots)
  - [Hands](#hands)
  - [Rings](#rings)
  - [Over armor](#over-armor)
  - [Clothing and other items](#clothing-and-other-items)
  - [Disabled slots](#disabled-slots)
- [Equipping a profile](#equipping-a-profile)
  - [Matching items](#matching-items)
- [Unequipped weapons](#unequipped-weapons)
- [Grips](#grips)
- [Hand rules](#hand-rules)
  - [Animated shields](#animated-shields)
  - [Lances](#lances)
  - [Bucklers](#bucklers)
- [Settings](#settings)
  - [Slot icons](#slot-icons)
- [For module developers](#for-module-developers)

## The Inventory tab row

The **Inventory** tab gains a row under the currency:

- **Equipment:** opens the equipment window for your character.
- **Dropdown:** your profiles. A ✓ marks any profile that is already fully equipped.
- **Equip:** equips the selected profile.
- **Edit / New:** open the window to edit the selected profile, or to build a new one.

Profiles belong to the actor. Anyone who owns the actor can make and use them.

## The equipment window

Your portrait fills the middle, with slots down both sides, your hands below it, and two bars
along the bottom: **Clothing** and everything else. Your equippable items are listed on the right.
Hover a slot to see what's in it, or the slot's name when it's empty.

The window opens two ways. **Equipment** works on your character directly. **New** and **Edit**
build a profile and don't change what you're wearing.

### Equipping directly

Anything you do here happens straight away:

- **Equip an item:** drag it onto a slot from the list or the character sheet, or click a slot and
  then click an item. Clicking an item with no slot selected puts it in its natural slot. The
  item in the slot comes off.
- **Unequip:** double-click the slot, or right-click it and choose **Unequip**.
- **Move an item:** drag it from one slot to another, like a dagger from your off hand to your main
  hand.

Along the bottom:
- the **profile dropdown** and **Equip** swap to a saved profile;
- **Save to Profile** replaces the selected profile with what you're wearing now (it asks first);
- **Save as New** asks for a name and saves what you're wearing as a new profile.

### Building a profile

The same window, but nothing changes on your character until the profile is equipped.

- Assign items the same way: drag, or click a slot then an item.
- **Double-click** a slot to set it back to **Ignore**. **Right-click** to choose **Mark Empty**
  or **Ignore**.
- **From Current** fills the window from what you're wearing. **Clear** sets every slot back to
  Ignore.
- Pick an icon and a name at the top, then **Save**.

### Slots

In a profile, each slot is in one of three states:

| State | When the profile is equipped |
| --- | --- |
| **Ignore** (blank) | Whatever is in the slot stays there. |
| **Item** | That item is equipped, and anything else in the slot is unequipped. |
| **Empty** (red ⦸) | Everything in the slot is unequipped. |

A new profile starts with empty slots on Ignore. Mark a slot Empty if the profile should take
something off.

### Hands

- **Main Hand** and **Off Hand** hold weapons. A shield goes in the **Shield** slot, tucked
  behind the off hand. Dropping a shield on either hand puts it there.
- A shield that needs its hand sits in front of the off hand, and the off hand is taken. A
  buckler, or a shield while it's animated, needs no hand: its slot slides out to the right, and
  the off hand stays free for a weapon or a two-handed grip.
- The **chain** between the hands shows the grip. A linked chain means two-handed; a broken chain
  means one-handed. Click it to switch, when the weapon allows.
- A two-handed weapon shows in both hand slots. Dropping one on the off hand puts it in your
  main hand. Dropping something beside it that needs the off hand switches the weapon to one
  hand, or takes it off if it can only be used two-handed.
- A weapon can only be used two-handed if its type is Two-Handed, or if its **Hands** (on the
  weapon's Details tab) is 2 or more. That's how bows, crossbows, and muskets are marked.
  Ranged weapons with Hands 1, like pistols, darts, and slings, are one-handed and can go in
  the off hand. PF1's hand crossbow comes with Hands 2; set it to 1 if you dual-wield them. Any
  weapon's grips can be set by hand: see [Grips](#grips).
- Equipping sets each weapon's hold on its item sheet. A dagger in each hand becomes one-handed
  and off-hand.
- If a weapon's attack actions set their own hold, the window warns you, because the grip set
  here won't reach those actions.
- A small icon on a hand slot marks a grip that needs something, like a horse on a lance held
  one-handed while mounted. Profiles that need something say so in the profile dropdown, for
  example "Lance & Shield (Mounted)". See [Hand rules](#hand-rules).
- When the hands don't add up, such as an animated shield running out while you hold a
  greatsword, the window lists the problem with a **Resolve** button.

### Rings

The two ring slots don't care which finger is which, only which rings are worn. When you equip
directly, the ring you drop on is the one that comes off. In a profile, a blank ring slot keeps
one ring you already wear. If that would mean more than two rings, the extra ones come off, and
you're told which.

### Over armor

Armor marked **Wearable with other armor** goes in the **Over Armor** slot, which hides mostly
under the Armor slot until something is in it. Armored coats and armored kilts are marked
automatically. To change it for any armor, use the checkbox in its **Equipment Profiles**
section on the Advanced tab. On armor that isn't marked, that section is hidden: tick it under **Optional Sections** on the same tab.

A coat worn alone counts as your armor, so putting a breastplate in Armor takes the coat off. To
wear it over the breastplate, put it in Over Armor as well. The window warns you when a coat or
kilt is over heavy armor.

This module only equips the layers. PF1's own numbers for two suits worn together aren't fully
right: spell failure adds up, and AC can mix the two suits' bonuses. Check those by hand.

### Clothing and other items

The two bars along the bottom hold any number of items. The **Clothing** bar (shirt icon) takes
outfits, so you can wear several. The other bar (box icon) takes extra weapons (armor spikes, a
spare dagger) and items without a slot. Click a bar's icon to filter the list to items that fit
it. In a profile, each item can be set to equip or unequip; items not listed are left alone.

An equipped weapon that isn't in a hand slot or in the other-items bar counts as being in your
main hand. Add weapons like armor spikes to that bar so that changing your main hand doesn't
take them off.

### Disabled slots

Some characters can't use every slot: a creature with no hands can't wear rings, gloves, or
bracers. On the character sheet's **Settings** tab, **Disabled Equipment Slots** has a checkbox
for each slot. **Rings** covers both ring slots, and **Armor** covers Over Armor too.

A checked slot disappears from the equipment window, and nothing that needs it can be equipped,
from the window or the sheet. You get a warning instead. A weapon needs only one hand, so it's
blocked only when both hands are disabled. A shield needs the off hand. Profiles skip disabled
slots and tell you what they skipped. Anything already equipped when you disable its slot stays
on, and the window points it out.

## Equipping a profile

Equipping changes only what needs to change, in one update. You're told how many items changed,
and which items couldn't be found. An item found only inside a container is reported as being in
that container, since items in containers can't be equipped.

### Matching items

Items are matched by name, so a profile keeps working after you move an item in and out of a pack
or replace it with a fresh copy. Identifying an item doesn't break the match. When two items share
a name, the one already in place wins, then an unequipped one.

## Unequipped weapons

On the Combat tab, a weapon that isn't equipped is grayed out and struck through. Attacking with
one, from the sheet, the hotbar, the token HUD, or a macro, first asks whether to **Attack
Anyway**. Cancel or close the prompt and nothing is rolled. Equip the weapon first, or draw it in
play, and it attacks as normal.

This covers weapons from the Inventory tab only. Attacks you've added on the Combat tab, like
natural attacks, have no equipped state and aren't affected. Turn it off with the **Unequipped
Weapons** setting.

## Grips

- **On the Combat tab,** each weapon, and each attack that makes an attack roll, shows its grip,
  **1H**, **2H**, or **OH**, next to its name. Click it to switch to the next grip the item can take. A weapon in your hands
  switches the way the equipment window would, so going two-handed takes a shield off. A grip
  that's no longer allowed shows in red; click it to fix it.
- **The fist** beside a weapon's grip equips or unequips it. Equipping puts it in the hand(s) its
  grip names and unequips whatever was there, the way the equipment window would.
- **On the item,** weapons and attacks have a **Grips** row on the Details tab, under Hands (or
  Held). Tick the grips the item can be wielded with. Left at the default, it follows the type
  and Hands. The Held choices on the item, on its actions, and in the attack dialog only offer the
  ticked grips.

## Hand rules

Some grips depend on what's happening. Each one is switched on by a buff with a boolean flag (on
the buff's Advanced tab), so any buff can supply it.

### Animated shields

- While a buff with the flag `animatedShield` is active, your shield needs no hand. A
  two-handed weapon or an off-hand weapon fits beside it, and the shield still gives its AC.
- When the buff ends, you're asked to **Re-grab** the shield or **Drop** it. Re-grab takes off
  whatever is in the way: a two-handed weapon switches to one hand, or is unequipped if it can't.
  Drop unequips the shield. The prompt waits, so you can free a hand first, and Re-grab then
  takes nothing off. Turning the buff off early asks the same.
- A profile with a shield beside a two-handed weapon needs the buff, and its name shows
  "(Animated Shield)". Equipping it without the buff asks whether to **Drop Shield** or
  **Cancel**.

### Lances

- A lance can be wielded one-handed while a buff with the flag `mounted` is active. Click the
  chain to switch. While you aren't mounted, the chain is locked, and its tooltip says why.
- One-handed, a lance adds your Strength once, like any one-handed weapon.
- A profile can hold a one-handed lance and a shield; its name shows "(Mounted)". Equipping it
  while you aren't mounted asks whether to **Drop Shield** (the lance goes two-handed) or
  **Cancel**.
- Dismounting with the lance in one hand asks you to **Regrip Two-Handed**, which frees the off
  hand, or **Stow** the lance. With nothing in your off hand, the lance just switches to two
  hands.

### Bucklers

- With a buckler worn, an attack made off-hand or two-handed takes a –1 penalty. In combat it
  also costs the buckler's AC until the start of your next turn, through a **Buckler: Arm in Use**
  buff that's removed when your turn comes.
- Bows and crossbows don't count, and neither does an animated buckler.

## Settings

| Setting | Effect |
| --- | --- |
| **Announce in Chat** | Posts a chat card listing what changed whenever a profile is equipped. |
| **Unequipped Weapons** | Grays out unequipped weapons on the Combat tab and asks before attacking with one. On by default. |
| **Slot Icons** (GM) | Opens the slot icon settings below. |

### Slot icons

Pick the icons shown in empty slots, and their color and hue, for everyone.

- **Click a slot** to choose an image. **Right-click** it to go back to the built-in icon.
- **Color** tints the icons. With **Tint images** on, an image with a transparent background
  becomes a silhouette in that color. Turn it off to show colored images as they are.
- **Hue** shifts the icons' colors.

Items in filled slots always show their own image.

## For module developers

`game.modules.get("pf1-equipment-profiles").api`:

| Member | Does |
| --- | --- |
| `list(actor)` | Profiles as `{ id, name, icon, current }` |
| `current(actor)` | IDs of the profiles that are fully equipped |
| `apply(actor, idOrName, { gates, source })` | Equips a profile. Returns the result, or `null` if cancelled. |
| `capture(actor)` | Slots built from what is equipped now |
| `save(actor, profile)` / `remove(actor, idOrName)` | Write or delete a profile |
| `openEquipment(actor)` | Opens the equipment window |
| `openEditor(actor, id?)` | Opens the profile editor |
| `registerGate(id, handler, { order })` / `unregisterGate(id)` | See below |

`actor` can be a document, UUID, ID, or name. Leave it out to use the selected token, then your
assigned character.

**Equip gates** hold an equip until something approves it, including every change made in the
equipment window. A gate is `async (request) => boolean`, where `request` is
`{ actor, token, profile: { id, name }, changes, source }`. `source` is `"sheet"`, `"window"`,
`"hotbar"`, or `"api"`. Gates run one at a time, in `order`. Anything other than `true` cancels
the equip. Each change lists the item, slot, `op` (`equip`, `unequip`, or `regrip`), and its
`from` and `to` state.

**Hooks:** `pf1EquipmentProfiles.preApply(actor, profile, plan)` runs before the gates; return
`false` to cancel. `pf1EquipmentProfiles.apply(actor, profile, result)` runs after the write.
`pf1EquipmentProfiles.handsChanged(actor, before, after)` runs when any held item's grip
changes; `before` and `after` map item IDs to grips (`before` is `null` the first time).

**Hands** are under `api.hands`:

| Member | Does |
| --- | --- |
| `usage(item)` | `{ grip, hands, side }` for an equipped weapon or shield, or `null`. `grip` is `1h`, `2h`, `oh`, or `none`. |
| `grips(item)` | Every grip the item can take, with `met`, `requires`, and `rule`. |
| `availableGrips(item, { profile })` | Grip names usable now. `profile: true` includes grips whose requirement isn't met. |
| `state(actor)` | The held items, hands used and free, and any `conflicts`. |
| `setGrip(item, grip, { gates })` | Switches a weapon or attack to a grip, through the same path as the equipment window. |
| `resolve(actor)` | Reopens the prompt for each conflict. |
| `registerRule(id, rule)` / `unregisterRule(id)` | Adds a hand rule. |

A rule adds a grip, or forces one, while a requirement holds. The requirement is a boolean flag
name or a function of the actor. `lapse` says what happens when it stops holding: `"regrab"`
(the shield prompt), `"regrip"` (the lance prompt), or `"warn"`.

```js
api.hands.registerRule("mountedLance", {
  applies: (item) => item.system.baseTypes?.includes("Lance"),
  add: [{ grip: "1h", requires: "mounted", label: "Mounted", icon: "fa-horse" }],
  lapse: "regrip",
});
```
