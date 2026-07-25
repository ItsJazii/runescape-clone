import { TICK_MS } from '../shared/constants.ts';
import { emptyBonuses, type Bonuses } from '../shared/combat.ts';
import { npcDef } from '../shared/data/npcs.ts';
import type {
  FriendEntry,
  NetGroundItem,
  NetNpc,
  NetPlayer,
  NetProjectile,
  NetSpotAnim,
  ServerMessage,
} from '../shared/net.ts';
import { SKILL_COUNT } from '../shared/skills.ts';

export interface HitsplatView {
  dmg: number;
  type: number;
  at: number;
}

export interface EntityView {
  id: number;
  kind: 'player' | 'npc';
  /** Interpolation path for this tick. */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  waypoints: [number, number][];
  renderX: number;
  renderY: number;
  plane: number;
  /** Smoothed facing angle in radians. */
  facing: number;
  targetFacing: number;
  anim: string;
  animStart: number;
  moveKind: number;
  walkCycle: number;
  hp: number;
  maxHp: number;
  hpShownUntil: number;
  hits: HitsplatView[];
  msg: string | null;
  msgUntil: number;
  overhead?: string;
  /* players */
  name?: string;
  combat?: number;
  equipment?: number[];
  look?: number[];
  /* npcs */
  defId?: number;
  lastSeen: number;
}

export interface ShopView {
  name: string;
  items: { id: number; amount: number; price: number }[];
}

export interface DialogueView {
  entity: { kind: 'npc' | 'player' | 'plain'; id?: number; name?: string };
  lines: string[];
  options?: string[];
  title?: string;
}

export interface MakeView {
  title: string;
  options: { item: number; name: string; level?: number; enabled?: boolean }[];
}

export interface ChatLine {
  text: string;
  kind: string;
  at: number;
}

export interface XpDrop {
  skill: number;
  amount: number;
  at: number;
}

export class GameState {
  index = -1;
  username = '';
  tick = 0;
  /** Timestamp of the most recent sync, for interpolation. */
  lastSyncAt = 0;

  self: EntityView | null = null;
  players = new Map<number, EntityView>();
  npcs = new Map<number, EntityView>();
  groundItems: NetGroundItem[] = [];
  projectiles: NetProjectile[] = [];
  spotAnims: NetSpotAnim[] = [];
  objectOverrides: { x: number; y: number; p: number; id: number; rot: number; type: number; original: number }[] = [];

  inventory: { items: number[]; amounts: number[] } = { items: new Array(28).fill(-1), amounts: new Array(28).fill(0) };
  equipment: { items: number[]; amounts: number[] } = { items: new Array(14).fill(-1), amounts: new Array(14).fill(0) };
  bonuses: Bonuses = emptyBonuses();
  weight = 0;
  bank: { items: number[]; amounts: number[]; noted: boolean } = { items: [], amounts: [], noted: false };

  xp = new Float64Array(SKILL_COUNT);
  levels = new Int32Array(SKILL_COUNT).fill(1);
  combatLevel = 3;
  totalLevel = 32;
  totalXp = 0;

  runEnergy = 100;
  prayerPoints = 1;
  specialEnergy = 1000;
  activePrayers = new Set<number>();
  styleIndex = 0;
  autoRetaliate = true;
  autocast: number | null = null;

  chat: ChatLine[] = [];
  xpDrops: XpDrop[] = [];
  totalXpGained = 0;

  friends: FriendEntry[] = [];
  ignores: string[] = [];

  openInterface: string | null = null;
  shop: ShopView | null = null;
  dialogue: DialogueView | null = null;
  make: MakeView | null = null;
  levelUp: { skill: number; level: number; at: number } | null = null;

  /** Selected inventory item for "use on" interactions. */
  selectedSlot = -1;
  selectedSpell: number | null = null;

  handle(msg: ServerMessage, now: number): void {
    switch (msg.t) {
      case 'init':
        this.index = msg.index;
        this.username = msg.name;
        this.tick = msg.tick;
        break;

      case 'sync':
        this.applySync(msg, now);
        break;

      case 'stats':
        for (let i = 0; i < SKILL_COUNT; i++) {
          this.xp[i] = msg.xp[i] ?? 0;
          this.levels[i] = msg.levels[i] ?? 1;
        }
        this.combatLevel = msg.combat;
        this.totalLevel = msg.totalLevel;
        this.totalXp = msg.totalXp;
        break;

      case 'inv':
        this.inventory = { items: msg.items.map((v) => v ?? -1), amounts: msg.amounts };
        break;

      case 'equip':
        this.equipment = { items: msg.items, amounts: msg.amounts };
        this.bonuses = msg.bonuses;
        this.weight = msg.weight;
        break;

      case 'friends':
        this.friends = msg.list;
        break;

      case 'ignores':
        this.ignores = msg.list;
        break;

      case 'private':
        this.chat.push({
          text: msg.outgoing ? `To ${msg.name}: ${msg.text}` : `From ${msg.name}: ${msg.text}`,
          kind: 'private',
          at: now,
        });
        if (this.chat.length > 120) this.chat.shift();
        break;

      case 'bank':
        this.bank = { items: msg.items, amounts: msg.amounts, noted: msg.noted };
        this.openInterface = 'bank';
        break;

      case 'shop':
        this.shop = { name: msg.name, items: msg.items };
        this.openInterface = 'shop';
        break;

      case 'dialogue':
        this.dialogue = { entity: msg.entity, lines: msg.lines, options: msg.options, title: msg.title };
        this.openInterface = 'dialogue';
        break;

      case 'makeAmount':
        this.make = { title: msg.title, options: msg.options };
        this.openInterface = 'make';
        break;

      case 'iface':
        this.openInterface = msg.id;
        break;

      case 'closeIface':
        this.openInterface = null;
        this.shop = null;
        this.dialogue = null;
        this.make = null;
        break;

      case 'msg':
        this.chat.push({ text: msg.text, kind: msg.kind ?? 'game', at: now });
        if (this.chat.length > 120) this.chat.shift();
        break;

      case 'xp':
        this.xpDrops.push({ skill: msg.skill, amount: msg.amount, at: now });
        this.totalXpGained += msg.amount;
        break;

      case 'levelup':
        this.levelUp = { skill: msg.skill, level: msg.level, at: now };
        break;

      case 'prayers':
        this.activePrayers = new Set(msg.active);
        break;

      case 'style':
        this.styleIndex = msg.index;
        this.autoRetaliate = msg.autoRetaliate;
        this.autocast = msg.autocast;
        break;
    }
  }

  private applySync(msg: Extract<ServerMessage, { t: 'sync' }>, now: number): void {
    this.tick = msg.tick;
    this.lastSyncAt = now;
    this.runEnergy = msg.run;
    this.prayerPoints = msg.prayer;
    this.specialEnergy = msg.spec;
    this.groundItems = msg.items;
    this.projectiles = msg.projectiles;
    this.spotAnims = msg.spotanims;
    this.objectOverrides = msg.objects;

    this.self = this.updateEntity(this.players, msg.self, 'player', now, this.self ?? undefined);
    this.players.set(msg.self.i, this.self);
    for (const p of msg.players) this.updateEntity(this.players, p, 'player', now);
    for (const n of msg.npcs) this.updateEntity(this.npcs, n, 'npc', now);

    for (const [id, view] of [...this.players]) if (view.lastSeen !== msg.tick) this.players.delete(id);
    for (const [id, view] of [...this.npcs]) if (view.lastSeen !== msg.tick) this.npcs.delete(id);
  }

  private updateEntity(
    map: Map<number, EntityView>,
    data: NetPlayer | NetNpc,
    kind: 'player' | 'npc',
    now: number,
    existing?: EntityView,
  ): EntityView {
    let view = existing ?? map.get(data.i);
    if (!view) {
      view = {
        id: data.i,
        kind,
        fromX: data.x,
        fromY: data.y,
        toX: data.x,
        toY: data.y,
        waypoints: [],
        renderX: data.x,
        renderY: data.y,
        plane: data.p,
        facing: dirToAngle(data.d),
        targetFacing: dirToAngle(data.d),
        anim: 'idle',
        animStart: data.at,
        moveKind: 0,
        walkCycle: Math.random() * 4,
        hp: data.hp,
        maxHp: data.maxHp,
        hpShownUntil: 0,
        hits: [],
        msg: null,
        msgUntil: 0,
        lastSeen: this.tick,
      };
      map.set(data.i, view);
    }

    if (data.mv === 3) {
      view.fromX = data.x;
      view.fromY = data.y;
      view.renderX = data.x;
      view.renderY = data.y;
    } else {
      view.fromX = view.renderX;
      view.fromY = view.renderY;
    }
    view.toX = data.x;
    view.toY = data.y;
    view.waypoints = data.wp ?? [];
    view.plane = data.p;
    view.moveKind = data.mv;
    view.hp = data.hp;
    view.maxHp = data.maxHp;
    view.overhead = data.oh;
    view.lastSeen = this.tick;

    if (data.face) {
      view.targetFacing = Math.atan2(data.face[0] + 0.5 - (data.x + 0.5), data.face[1] + 0.5 - (data.y + 0.5));
    } else if (data.mv === 0) {
      view.targetFacing = dirToAngle(data.d);
    }

    if (data.a !== view.anim || data.at !== view.animStart) {
      view.anim = data.a;
      view.animStart = data.at;
    }
    if (data.hits?.length) {
      for (const hit of data.hits) view.hits.push({ dmg: hit.dmg, type: hit.type, at: now });
      view.hpShownUntil = now + 8000;
    }
    if (data.msg) {
      view.msg = data.msg;
      view.msgUntil = now + 5000;
    }
    if (kind === 'player') {
      const p = data as NetPlayer;
      view.name = p.name;
      view.combat = p.combat;
      view.equipment = p.eq;
      view.look = p.look;
    } else {
      view.defId = (data as NetNpc).def;
    }
    return view;
  }

  /** Advances interpolation. Call once per animation frame. */
  interpolate(now: number, dt: number): void {
    // A sync can be handled after requestAnimationFrame captured its
    // timestamp, so clamp on both ends.
    const progress = Math.max(0, Math.min(1, (now - this.lastSyncAt) / TICK_MS));
    for (const map of [this.players, this.npcs]) {
      for (const view of map.values()) {
        const points: [number, number][] = [[view.fromX, view.fromY], ...view.waypoints, [view.toX, view.toY]];
        const segments = Math.max(1, points.length - 1);
        const scaled = progress * segments;
        const seg = Math.max(0, Math.min(segments - 1, Math.floor(scaled)));
        const localT = scaled - seg;
        const a = points[seg];
        const b = points[seg + 1];
        view.renderX = a[0] + (b[0] - a[0]) * localT;
        view.renderY = a[1] + (b[1] - a[1]) * localT;

        if (view.moveKind === 1 || view.moveKind === 2) {
          const dx = view.toX - view.fromX;
          const dy = view.toY - view.fromY;
          if (dx !== 0 || dy !== 0) view.targetFacing = Math.atan2(dx, dy);
          view.walkCycle += dt * (view.moveKind === 2 ? 2.2 : 1.35);
        } else {
          view.walkCycle += dt * 0.5;
        }

        let diff = view.targetFacing - view.facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        view.facing += diff * Math.min(1, dt * 14);

        view.hits = view.hits.filter((h) => now - h.at < 1200);
        if (view.msg && now > view.msgUntil) view.msg = null;
      }
    }
    this.xpDrops = this.xpDrops.filter((d) => now - d.at < 3000);
    if (this.levelUp && now - this.levelUp.at > 6000) this.levelUp = null;
  }

  npcName(view: EntityView): string {
    return view.defId !== undefined ? npcDef(view.defId)?.name ?? 'null' : view.name ?? 'null';
  }
}

function dirToAngle(dir: number): number {
  const DIR_DX = [0, 1, 1, 1, 0, -1, -1, -1];
  const DIR_DY = [1, 1, 0, -1, -1, -1, 0, 1];
  if (dir < 0 || dir > 7) return 0;
  return Math.atan2(DIR_DX[dir], DIR_DY[dir]);
}
