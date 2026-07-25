import {
  AttackStyle,
  AttackType,
  HP_XP_PER_DAMAGE,
  MAGIC_XP_PER_DAMAGE,
  XP_PER_DAMAGE,
  attackBonusFor,
  defenceBonusFor,
  effectiveLevel,
  hitChance,
  maxHit as computeMaxHit,
  maxRoll,
  rollDamage,
  styleBonusFor,
} from '../shared/combat.ts';
import { EquipSlot, itemDef } from '../shared/data/items.ts';
import { ELEMENT_RUNES, SpellKind, STAFF_ELEMENTS, spellById, type SpellDef } from '../shared/data/spells.ts';
import { Skill } from '../shared/skills.ts';
import { distanceTo } from '../shared/world/pathfinding.ts';
import type { Entity } from './entity.ts';
import { Npc } from './npc.ts';
import { Player } from './player.ts';
import type { World } from './world.ts';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function isPlayer(e: Entity): e is Player {
  return e instanceof Player;
}

export function combatDistance(a: Entity, b: Entity): number {
  return distanceTo(a.x, a.y, b.x, b.y, b.size, b.size);
}

/** Attack/defence roll for an NPC (NPCs use +9 rather than +8). */
function npcAttackRoll(npc: Npc, type: AttackType): number {
  const level = type === AttackType.RANGED ? npc.def.ranged : type === AttackType.MAGIC ? npc.def.magic : npc.def.attack;
  return (level + 9) * (attackBonusFor(npc.bonuses, type) + 64);
}

function npcDefenceRoll(npc: Npc, type: AttackType): number {
  const level = type === AttackType.MAGIC ? Math.floor(npc.def.magic * 0.7 + npc.def.defence * 0.3) : npc.def.defence;
  return (level + 9) * (defenceBonusFor(npc.bonuses, type) + 64);
}

function playerDefenceRoll(player: Player, type: AttackType): number {
  const styleBonus = styleBonusFor(player.style.style);
  if (type === AttackType.MAGIC) {
    const magicDefence = Math.floor(player.levels[Skill.DEFENCE] * 0.3 + player.levels[Skill.MAGIC] * 0.7);
    const effective = effectiveLevel(magicDefence, player.prayerMultipliers.magic, styleBonus.defence);
    return maxRoll(effective, defenceBonusFor(player.bonuses, AttackType.MAGIC));
  }
  const effective = effectiveLevel(player.levels[Skill.DEFENCE], player.prayerMultipliers.defence, styleBonus.defence);
  return maxRoll(effective, defenceBonusFor(player.bonuses, type));
}

export function defenceRollOf(entity: Entity, type: AttackType): number {
  return isPlayer(entity) ? playerDefenceRoll(entity, type) : npcDefenceRoll(entity as Npc, type);
}

/** Which overhead prayer, if any, protects against this attack type. */
function protectedFrom(entity: Entity, type: AttackType): boolean {
  if (!isPlayer(entity)) return false;
  const overhead = entity.prayerMultipliers.overhead;
  if (!overhead) return false;
  if (type === AttackType.MAGIC) return overhead === 'magic';
  if (type === AttackType.RANGED) return overhead === 'missiles';
  return overhead === 'melee';
}

/* ------------------------------------------------------------------ */
/* Player attacking                                                    */
/* ------------------------------------------------------------------ */

export function playerCanReach(world: World, player: Player, target: Entity): boolean {
  const range = player.autocastSpell !== null ? 10 : player.attackRange;
  const dist = combatDistance(player, target);
  if (dist > range) return false;
  if (range > 1) {
    return world.collision.hasLineOfSight(player.x, player.y, target.x, target.y, player.plane);
  }
  return true;
}

export function performPlayerAttack(world: World, player: Player, target: Entity): void {
  if (player.attackDelay > 0) return;

  const spellId = player.autocastSpell;
  if (spellId !== null) {
    const spell = spellById(spellId);
    if (spell && spell.kind === SpellKind.COMBAT) {
      castCombatSpell(world, player, target, spell, true);
      return;
    }
  }

  const style = player.style;
  const type = style.type;
  player.face(target.x, target.y);
  player.playAnimation(style.anim, world.tick);

  if (type === AttackType.RANGED) {
    performRangedAttack(world, player, target);
    return;
  }

  const styleBonus = styleBonusFor(style.style);
  const effAtt = effectiveLevel(player.levels[Skill.ATTACK], player.prayerMultipliers.attack, styleBonus.attack);
  const attRoll = maxRoll(effAtt, attackBonusFor(player.bonuses, type));
  const defRoll = defenceRollOf(target, type);

  const effStr = effectiveLevel(player.levels[Skill.STRENGTH], player.prayerMultipliers.strength, styleBonus.strength);
  const max = computeMaxHit(effStr, player.bonuses.meleeStrength);

  let damage = 0;
  if (Math.random() < hitChance(attRoll, defRoll) && !protectedFrom(target, type)) {
    damage = rollDamage(max);
  }
  applyDamage(world, player, target, damage, 0);
  awardMeleeXp(player, damage, style.style);
  player.attackDelay = player.attackSpeed;
  world.enterCombat(player, target);
}

function performRangedAttack(world: World, player: Player, target: Entity): void {
  const ammoSlot = player.equipment.ids[EquipSlot.AMMO];
  const weapon = player.weapon;
  const usesAmmo = weapon?.weapon?.type === 'bow' || weapon?.weapon?.type === 'crossbow';
  if (usesAmmo && ammoSlot < 0) {
    player.message('There is no ammo left in your quiver.');
    player.target = null;
    return;
  }

  const styleBonus = styleBonusFor(player.style.style);
  const effRange = effectiveLevel(player.levels[Skill.RANGED], player.prayerMultipliers.ranged, styleBonus.ranged);
  const attRoll = maxRoll(effRange, attackBonusFor(player.bonuses, AttackType.RANGED));
  const defRoll = defenceRollOf(target, AttackType.RANGED);
  const effStr = effectiveLevel(player.levels[Skill.RANGED], player.prayerMultipliers.rangedStrength, styleBonus.ranged);
  const max = computeMaxHit(effStr, player.bonuses.rangedStrength);

  let damage = 0;
  if (Math.random() < hitChance(attRoll, defRoll) && !protectedFrom(target, AttackType.RANGED)) {
    damage = rollDamage(max);
  }

  if (usesAmmo) {
    player.equipment.removeSlot(EquipSlot.AMMO, 1);
    player.sendEquipment();
    // Ammo drops on the floor at the target 80% of the time.
    if (Math.random() < 0.8 && ammoSlot >= 0) {
      world.addGroundItem(ammoSlot, 1, target.x, target.y, target.plane, player.index);
    }
  }

  const delay = 1 + Math.floor(combatDistance(player, target) / 6);
  world.addProjectile(player.x, player.y, target.x, target.y, 'arrow', delay);
  world.queueHit(target, player, damage, delay, 1, () => {
    if (damage > 0) {
      const xp = damage * XP_PER_DAMAGE;
      if (player.style.style === AttackStyle.LONGRANGE) {
        player.addXp(Skill.RANGED, xp / 2);
        player.addXp(Skill.DEFENCE, xp / 2);
      } else {
        player.addXp(Skill.RANGED, xp);
      }
      player.addXp(Skill.HITPOINTS, damage * HP_XP_PER_DAMAGE);
    }
  });
  player.attackDelay = player.attackSpeed;
  world.enterCombat(player, target);
}

export function castCombatSpell(world: World, player: Player, target: Entity, spell: SpellDef, autocast: boolean): boolean {
  if (player.levels[Skill.MAGIC] < spell.level) {
    player.message(`Your Magic level is not high enough for this spell.`);
    return false;
  }
  if (!hasRunes(player, spell)) {
    player.message('You do not have enough runes to cast this spell.');
    return false;
  }
  if (!playerCanReach(world, player, target)) return false;

  consumeRunes(player, spell);
  player.face(target.x, target.y);
  player.playAnimation('cast', world.tick);

  const effMagic = effectiveLevel(player.levels[Skill.MAGIC], player.prayerMultipliers.magic, 0);
  const attRoll = maxRoll(effMagic, attackBonusFor(player.bonuses, AttackType.MAGIC));
  const defRoll = defenceRollOf(target, AttackType.MAGIC);
  const hit = Math.random() < hitChance(attRoll, defRoll) && !protectedFrom(target, AttackType.MAGIC);

  let damage = 0;
  if (hit) {
    const base = spell.maxHit ?? 0;
    const boosted = Math.floor(base * (1 + player.bonuses.magicDamage / 100));
    damage = rollDamage(boosted);
  }

  const delay = 1 + Math.floor(combatDistance(player, target) / 6);
  if (spell.projectile) world.addProjectile(player.x, player.y, target.x, target.y, spell.projectile, delay);
  world.queueHit(target, player, damage, delay, hit && damage > 0 ? 1 : 0, () => {
    world.addSpotAnim(target.x, target.y, hit ? (spell.gfx ?? 'hit_air') : 'splash', 0);
    player.addXp(Skill.MAGIC, spell.xp + damage * MAGIC_XP_PER_DAMAGE);
    if (damage > 0) player.addXp(Skill.HITPOINTS, damage * HP_XP_PER_DAMAGE);
  });

  player.attackDelay = 5;
  world.enterCombat(player, target);
  if (!autocast) player.target = target;
  return true;
}

export function hasRunes(player: Player, spell: SpellDef): boolean {
  const staff = player.equipment.ids[EquipSlot.WEAPON];
  const element = STAFF_ELEMENTS[staff];
  for (const [rune, amount] of spell.runes) {
    if (element && ELEMENT_RUNES[element] === rune) continue;
    if (player.inventory.count(rune) < amount) return false;
  }
  return true;
}

export function consumeRunes(player: Player, spell: SpellDef): void {
  const staff = player.equipment.ids[EquipSlot.WEAPON];
  const element = STAFF_ELEMENTS[staff];
  for (const [rune, amount] of spell.runes) {
    if (element && ELEMENT_RUNES[element] === rune) continue;
    player.inventory.remove(rune, amount);
  }
  player.sendInventory();
}

function awardMeleeXp(player: Player, damage: number, style: AttackStyle): void {
  if (damage <= 0) return;
  const xp = damage * XP_PER_DAMAGE;
  switch (style) {
    case AttackStyle.ACCURATE:
      player.addXp(Skill.ATTACK, xp);
      break;
    case AttackStyle.AGGRESSIVE:
      player.addXp(Skill.STRENGTH, xp);
      break;
    case AttackStyle.DEFENSIVE:
      player.addXp(Skill.DEFENCE, xp);
      break;
    case AttackStyle.CONTROLLED:
      player.addXp(Skill.ATTACK, xp / 3);
      player.addXp(Skill.STRENGTH, xp / 3);
      player.addXp(Skill.DEFENCE, xp / 3);
      break;
    default:
      player.addXp(Skill.ATTACK, xp);
  }
  player.addXp(Skill.HITPOINTS, damage * HP_XP_PER_DAMAGE);
}

/* ------------------------------------------------------------------ */
/* NPC attacking                                                       */
/* ------------------------------------------------------------------ */

export function performNpcAttack(world: World, npc: Npc, target: Entity): void {
  if (npc.attackDelay > 0) return;
  const type = npc.attackType;
  npc.face(target.x, target.y);

  const ranged = type === AttackType.RANGED || type === AttackType.MAGIC;
  npc.playAnimation(ranged ? 'cast' : 'attack', world.tick);

  const attRoll = npcAttackRoll(npc, type);
  const defRoll = defenceRollOf(target, type);
  let damage = 0;
  if (Math.random() < hitChance(attRoll, defRoll) && !protectedFrom(target, type)) {
    damage = rollDamage(npc.def.maxHit);
  }

  if (ranged) {
    const delay = 1 + Math.floor(combatDistance(npc, target) / 6);
    world.addProjectile(npc.x, npc.y, target.x, target.y, npc.def.projectile ?? 'strike_air', delay);
    world.queueHit(target, npc, damage, delay, damage > 0 ? 1 : 0);
  } else {
    applyDamage(world, npc, target, damage, 0);
  }

  npc.attackDelay = npc.def.attackSpeed;
  world.enterCombat(npc, target);
}

/* ------------------------------------------------------------------ */
/* Damage application                                                  */
/* ------------------------------------------------------------------ */

export function applyDamage(world: World, source: Entity | null, target: Entity, damage: number, delay = 0): void {
  if (delay > 0) {
    world.queueHit(target, source, damage, delay, damage > 0 ? 1 : 0);
    return;
  }
  if (target.dead) return;
  const dealt = Math.min(damage, target.hitpoints);
  target.damage(damage);
  if (source) {
    target.lastAttacker = source;
    target.lastAttackedTick = world.tick;
  }

  if (target instanceof Npc && source instanceof Player) {
    target.creditDamage(source.index, dealt);
    if (!target.target) target.target = source;
  }
  if (target instanceof Player) {
    target.stopAction();
    if (target.autoRetaliate && !target.target && source) {
      target.target = source;
    }
    // Redemption prayer
    if (target.prayerMultipliers.overhead === 'redemption' && target.hitpoints > 0) {
      const threshold = Math.floor(target.maxHitpoints * 0.1);
      if (target.hitpoints < threshold && target.prayerPoints > 0) {
        target.heal(Math.floor(target.prayerPoints * 0.25));
        target.prayerPoints = 0;
        target.deactivateAllPrayers();
        world.addSpotAnim(target.x, target.y, 'redemption', 0);
      }
    }
  }

  if (target.hitpoints <= 0 && !target.dead) {
    world.killEntity(target, source);
  }
}
