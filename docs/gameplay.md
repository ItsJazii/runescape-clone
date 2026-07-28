# Gameplay content

An inventory of what is actually implemented. Anything stubbed or missing is
listed honestly at the [bottom](#not-implemented) rather than quietly omitted.

Totals: **388 items**, **67 NPC types**, **90 object types**, **34 spells**,
**29 prayers**, **11 shops**, **16 tasks**, over a **256x256** map on 4 planes
holding **5,095 objects**, **160 NPC spawns** and **15 respawning ground items**.

## Skills

All 23 skills exist and are tracked on the real XP curve
(`xp(L) = floor(¼ · Σ floor(i + 300·2^(i/7)))`, level 99 = 13,034,431 XP, capped
at 200M). 17 of them are trainable:

| Skill | How | Notes |
| --- | --- | --- |
| Woodcutting | Chop trees | Tree/Dead (1), Oak (15), Willow (30), Maple (45), Yew (60), Magic (75). Bronze→Rune axes, 4-tick interval, stumps regrow |
| Mining | Mine rocks | Clay/Copper/Tin (1), Iron (15), Silver (20), Coal (30), Gold (40), Mithril (55), Adamantite (70), Runite (85). 3-tick interval, 1/256 gem roll |
| Fishing | Fishing spots | Net, Bait, Lure, Cage, Harpoon — shrimp through shark. 5-tick interval |
| Cooking | Fire or range | 18 raw foods; burn chance falls with level, and a range burns less than a fire |
| Firemaking | Light logs | 8 log types; creates a real temporary fire object and steps you back off it |
| Smithing | Smelt + smith | 8 bar types at a furnace; 18 products across 7 tiers on an anvil, 12.5 XP per bar |
| Crafting | Leather, gems, jewellery, spinning | Needle and thread, chisel, gold bar + furnace, spinning wheel |
| Fletching | Cut, string, tip | Logs → shafts and unstrung bows, bow string, arrowtips |
| Runecraft | Altars | Air (1), Mind (2), Water (5), Earth (9), Fire (14); multiple runes per essence at higher levels |
| Prayer | Bury bones | Bones 4.5 XP through Dragon bones 72 XP |
| Thieving | Pickpocket | Man, Woman, Farmer; failure costs 1 damage and a 3-tick stun |
| Magic | Cast spells | See [Magic](#magic) |
| Attack, Strength, Defence, Ranged, Hitpoints | Combat | 4 XP per damage to the style's skill, 4/3 XP to Hitpoints |

Not trainable: **Agility, Herblore, Slayer, Farming, Construction, Hunter**.
They appear on the stats tab and count toward total level, but nothing trains
them.

## Combat

Three styles, all using the real formulas from `src/shared/combat.ts`:

```
effective = floor(level · prayerMultiplier) + styleBonus + 8
roll      = effective · (equipmentBonus + 64)
hitChance = att > def ?  1 - (def + 2) / (2·(att + 1))
                      :  att / (2·(def + 1))
maxHit    = floor(0.5 + effectiveStrength · (strengthBonus + 64) / 640)
damage    = uniform integer in [0, maxHit]     // a 0 is the blue "block" splat
```

- **Attack types**: stab, slash, crush, magic, ranged, each with its own attack
  and defence bonus.
- **Weapon categories**: unarmed, sword, scimitar, dagger, longsword, 2h, axe,
  mace, warhammer, pickaxe, spear, whip, claws, bow, crossbow, thrown, staff.
  Each has its own style table, so a scimitar offers Chop/Slash/Lunge/Block
  while a dagger offers Stab/Lunge/Slash/Block.
- **Styles**: Accurate/Aggressive/Controlled/Defensive for melee (+3 to the
  relevant stat, or +1 to three of them for Controlled), Accurate/Rapid/Longrange
  for ranged.
- **Ranged** consumes ammo from the quiver, drops it at the target 80% of the
  time, and refuses to fire an empty bow.
- **Projectiles** fly for `1 + floor(distance / 6)` ticks, and the damage lands
  on the tick the projectile arrives, not when it was fired.
- **NPCs** roll with `+9` instead of the player's `+8`, and their magic defence
  is `floor(0.7·magic + 0.3·defence)`.
- **Auto-retaliate** targets whoever hit you, if you have no target already.
- **Aggression**: aggressive NPCs scan `aggroRange` tiles and need line of
  sight, but ignore anyone above `aggroMaxLevel` — so a boosted character walks
  past a Dark wizard untouched.
- **Death** plays a 3-tick animation, then NPCs drop loot and start a respawn
  timer while players respawn at Lumbridge (3222, 3218).

### Animation

Attack, flinch, death and skilling animations are bone poses in
`src/client/gl/animation.ts`. Two things are worth knowing if you touch them:

- The skeleton is **flat, not hierarchical**, so rotating the torso does not
  carry the arms — every bone a pose needs must be driven explicitly.
- Four-legged models (**cow, rat, spider, scorpion, bear, unicorn, chicken**)
  reuse `ARM_L`/`ARM_R` for hind legs and pincers, and their bodies sit far
  below the humanoid bone pivots. They therefore take a separate branch that
  lunges from the root bone and never touches the arm bones. `isQuadruped()` is
  the single source of truth for that list, and `src/test/animation.test.ts`
  asserts every NPC model visibly moves when it attacks.

Being hit plays the `block` flinch on the defender, including on a zero-damage
hit — unless the defender started its own animation on that same tick, in which
case its attack wins.

## Magic

34 spells in the standard book. Combat spells come in Strike/Bolt/Blast/Wave
tiers across air/water/earth/fire, from Wind Strike (level 1, max 2) up to Fire
Wave (level 75, max 20), plus Crumble Undead. Elemental staves supply unlimited
runes of their element.

Utility spells that do real work: **Low and High Level Alchemy** (40% / 60% of
base value), **Bones to Bananas**, **Superheat Item** (smelts an ore, and
respects the Smithing requirement), and four **teleports** (Varrock, Lumbridge,
Falador, Camelot).

Casting a combat spell costs 5 ticks, reaches 10 tiles regardless of weapon,
needs line of sight, and awards the spell's base XP plus 2 XP per damage.

## Prayer

29 prayers with real drain. Drain interval is
`floor((60 + 2·prayerBonus) / totalDrain)` ticks, so prayer bonus from equipment
genuinely extends them.

- Three tiers of stat boosts at 5% / 10% / 15% for Defence, Strength, Attack,
  Ranged and Magic.
- **Protect from Magic / Missiles / Melee**, which zero incoming damage of that
  type.
- **Redemption** heals you for 25% of remaining prayer when you drop below 10%
  hitpoints, then empties your prayer and switches everything off.
- **Rapid Restore**, **Rapid Heal**, **Protect Item**, **Preserve**.
- The high-level combination prayers **Chivalry, Piety, Rigour, Augury**.

Prayers are grouped into mutually exclusive families, so lighting Piety switches
off Ultimate Strength.

## Items and equipment

388 items across 14 equipment slots using RuneScape's own slot numbering (head,
cape, amulet, weapon, body, shield, legs, hands, feet, ring, ammo). Seven metal
tiers — Bronze, Iron, Steel, Black, Mithril, Adamant, Rune — with the real Attack
requirements (1, 1, 5, 10, 20, 30, 40) and each of ten weapon shapes plus armour
in every tier, generated from a table rather than hand-written.

Also present: bows and arrows with ranged strength, leather and studded armour,
wizard robes and elemental staves, amulets, rings, 18 cookable fish and meats,
ores and bars, 8 log types, 14 rune types, gems cut and uncut, and the full tool
set (tinderbox, chisel, hammer, knife, needle, spade, pickaxes, axes, fishing
gear).

Equipment bonuses are summed into a single `Bonuses` record (attack and defence
per type, melee/ranged strength, magic damage, prayer bonus) whenever gear
changes. Containers implement RuneScape's stacking rules — stackables merge,
non-stackables take a slot each — with 28 inventory slots and 800 bank slots.

## NPCs

67 types, from Chicken (3 hp) to Lesser demon (79 hp), including townsfolk with
dialogue, shopkeepers, bankers, guards, and the whole low-level combat ladder:
rats, goblins, men and women, farmers, imps, dwarves, barbarians, skeletons,
zombies, ghosts, spiders, scorpions, bears, unicorns, hobgoblins, hill and moss
giants, black knights, chaos druids and a lesser demon.

Drops are rolled per kill: guaranteed items first (bones, raw meat, hides), then
one weighted roll against a table whose weights sum to the table size (128 by
default). Mid-level monsters can hit the shared Rare Drop Table. Kill credit
goes to whoever dealt the most damage, tracked per NPC in `damageBy`.

## World

256x256 tiles, 4 planes, built entirely in code by `src/shared/world/lumbridge.ts`.
Nine named areas:

**Lumbridge** (castle, church, village, farms) · **Lumbridge Swamp** (mine, cave
entrance) · **Al Kharid** (palace, shops, furnace) · **Al Kharid Mine** (every
ore, with scorpions) · **Draynor Village** (bank, market, willows) · **Draynor
Manor** (skeletons, zombies, ghosts) · **Wizards' Tower** · **Lumbridge Swamp
Caves** (giants, spiders, a demon, on plane 3) · **The Wilderness Road** (bears
and unicorns)

Interactive scenery: doors and gates (which auto-close after 100 ticks), stairs
and ladders between planes, bank booths and chests, shop counters, altars,
ranges, fires, anvils, furnaces, spinning wheels, a millstone, a tannery, wells
and pumps that fill containers, trees, mining rocks, fishing spots, and pickable
crops.

## Other systems

- **Banking** — 800 slots, reachable from Lumbridge castle's top floor, Draynor
  and Al Kharid; deposit, withdraw, deposit-all, deposit-equipment.
- **Shops** — 11 of them with live shared stock that restocks gradually. General
  stores buy anything at 40%; specialists only buy what they sell.
- **Dialogue and quests** — around 20 NPC dialogue scripts with branching
  options. **Cook's Assistant**, **Sheep Shearer** and **The Restless Ghost**
  track stages and hand out rewards.
- **Getting Started** — a 16-entry checklist (talk, explore, chop, light, fish,
  cook, mine, smelt, equip, fight, loot, eat, shop, bank, cast, pray) that ticks
  itself off as you play. Informational only; nothing is gated behind it.
- **Social** — friends list with online state, ignore list, private messaging.
- **Ground items** — private to the owner for 100 ticks, public for another 200,
  then gone.
- **Run energy**, hitpoint regeneration every 100 ticks, and boosted stats
  draining back to base.
- **Persistence** — one JSON file per character in `data/players/`, holding
  skills, all three containers, position, quest stages, tasks, friends and
  ignores. There is no password; the display name *is* the account.

## Not implemented

Known gaps, so nobody has to discover them the hard way:

- **Agility, Herblore, Slayer, Farming, Construction, Hunter** have no training
  methods. Seeds and vegetable patches exist but nothing can be planted.
- **Curse spells** (Confuse, Weaken, Curse, Bind) cast and play their graphic
  but apply no effect.
- **Enchant spells** only produce a different item for sapphire → Ring of
  recoil; the others return the same ring.
- **Telekinetic Grab** always reports nothing to grab.
- **Pottery wheel**, **market stall stealing** and searching chests, barrels and
  crates are present as objects but return a "nothing here" message.
- **Noted bank items** are toggled in the protocol but not implemented.
- The **`members` flag** on items and spells is data-only; nothing gates on it.
- **Al Kharid's toll gate** takes your 10 coins through dialogue but does not
  actually gate passage.
- There is **no authentication** of any kind, and no PvP beyond the
  `playerAction` Attack plumbing.
