import { AttackType, emptyBonuses, type Bonuses } from '../shared/combat.ts';
import { npcDef, type NpcDef } from '../shared/data/npcs.ts';
import { Entity } from './entity.ts';

export class Npc extends Entity {
  readonly def: NpcDef;
  readonly spawnX: number;
  readonly spawnY: number;
  readonly spawnPlane: number;
  respawnTimer = 0;
  /** Ticks before the NPC may wander again. */
  wanderDelay = 0;
  /** Player index that dealt the most damage. */
  damageBy = new Map<number, number>();
  bonuses: Bonuses;
  /** Prevents re-aggression on the same player forever. */
  aggroCooldown = 0;

  constructor(defId: number, x: number, y: number, plane: number) {
    super();
    const def = npcDef(defId);
    if (!def) throw new Error(`Unknown npc def ${defId}`);
    this.def = def;
    this.x = x;
    this.y = y;
    this.plane = plane;
    this.spawnX = x;
    this.spawnY = y;
    this.spawnPlane = plane;
    this.size = def.size;
    this.maxHitpoints = def.hitpoints;
    this.hitpoints = def.hitpoints;
    this.bonuses = { ...emptyBonuses(), ...def.bonuses };
  }

  override get name(): string {
    return this.def.name;
  }

  get attackable(): boolean {
    return this.def.options.includes('Attack') && this.def.maxHit >= 0 && this.def.hitpoints > 0;
  }

  get attackType(): AttackType {
    return this.def.attackType;
  }

  respawn(): void {
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.plane = this.spawnPlane;
    this.hitpoints = this.maxHitpoints;
    this.dead = false;
    this.deathTicks = 0;
    this.target = null;
    this.damageBy.clear();
    this.path.length = 0;
    this.animation = 'idle';
    this.moveKind = 3;
    this.frozen = 0;
  }

  creditDamage(playerIndex: number, amount: number): void {
    this.damageBy.set(playerIndex, (this.damageBy.get(playerIndex) ?? 0) + amount);
  }

  topDamager(): number {
    let best = -1;
    let bestAmount = 0;
    for (const [index, amount] of this.damageBy) {
      if (amount > bestAmount) {
        bestAmount = amount;
        best = index;
      }
    }
    return best;
  }
}
