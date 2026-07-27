/** Wire protocol shared by the client and the authoritative server. */

import type { Bonuses } from './combat.ts';

/* ------------------------------------------------------------------ */
/* Client -> Server                                                     */
/* ------------------------------------------------------------------ */

export type ClientMessage =
  | { t: 'login'; name: string }
  | { t: 'walk'; x: number; y: number; ctrl?: boolean }
  | { t: 'walkMinimap'; x: number; y: number }
  | { t: 'objectAction'; id: number; x: number; y: number; action: string }
  | { t: 'npcAction'; npc: number; action: string }
  | { t: 'playerAction'; player: number; action: string }
  | { t: 'groundItemAction'; item: number; x: number; y: number; action: string }
  | { t: 'itemAction'; slot: number; item: number; action: string }
  | { t: 'itemOnItem'; slotA: number; slotB: number }
  | { t: 'itemOnObject'; slot: number; id: number; x: number; y: number }
  | { t: 'itemOnNpc'; slot: number; npc: number }
  | { t: 'swapSlots'; from: number; to: number }
  | { t: 'equipAction'; slot: number; action: string }
  | { t: 'bank'; action: 'deposit' | 'withdraw' | 'depositAll' | 'depositEquipment' | 'setNoted' | 'close'; slot?: number; amount?: number; noted?: boolean }
  | { t: 'shop'; action: 'buy' | 'sell' | 'value' | 'close'; slot?: number; amount?: number }
  | { t: 'dialogue'; option?: number }
  | { t: 'setStyle'; index: number }
  | { t: 'setAutoRetaliate'; on: boolean }
  | { t: 'prayer'; id: number }
  | { t: 'toggleRun' }
  | { t: 'castSpell'; spell: number; targetType: 'npc' | 'player' | 'item' | 'none'; target?: number }
  | { t: 'autocast'; spell: number | null }
  | { t: 'chat'; text: string }
  | { t: 'friend'; action: 'add' | 'remove'; name: string }
  | { t: 'ignore'; action: 'add' | 'remove'; name: string }
  | { t: 'privateMessage'; name: string; text: string }
  | { t: 'closeInterface' }
  | { t: 'makeAmount'; amount: number; option: number }
  | { t: 'ping' };

/* ------------------------------------------------------------------ */
/* Server -> Client                                                     */
/* ------------------------------------------------------------------ */

/** A friend list entry. Offline friends are still listed, greyed out. */
export interface FriendEntry {
  name: string;
  online: boolean;
}

export interface RenderedEntity {
  /** Server-side index. */
  i: number;
  /** Tile position at the end of this tick. */
  x: number;
  y: number;
  p: number;
  /** Facing direction 0-7, or -1. */
  d: number;
  /** Current animation name. */
  a: string;
  /** Animation start tick. */
  at: number;
  hp: number;
  maxHp: number;
  /** Overhead prayer icon. */
  oh?: string;
  /** Chat message shown above the head. */
  msg?: string;
  /** Hitsplats applied this tick. */
  hits?: { dmg: number; type: number }[];
  /** Movement kind this tick: 0 = stand, 1 = walk, 2 = run, 3 = teleport. */
  mv: number;
  /** Intermediate tiles stepped through this tick (running crosses two). */
  wp?: [number, number][];
  /** Tile the entity is turned towards, for combat facing. */
  face?: [number, number];
}

export interface NetPlayer extends RenderedEntity {
  name: string;
  combat: number;
  /** Equipment item ids by slot for rendering (-1 = empty). */
  eq: number[];
  /** Appearance: gender, hair, torso, legs, colours. */
  look: number[];
  skulled?: boolean;
}

export interface NetNpc extends RenderedEntity {
  /** NPC definition id. */
  def: number;
}

export interface NetGroundItem {
  x: number;
  y: number;
  p: number;
  item: number;
  amount: number;
}

export interface NetProjectile {
  from: { x: number; y: number };
  to: { x: number; y: number };
  gfx: string;
  startTick: number;
  duration: number;
  arcHeight: number;
}

export interface NetSpotAnim {
  x: number;
  y: number;
  gfx: string;
  startTick: number;
  height: number;
}

export type ServerMessage =
  | { t: 'init'; index: number; name: string; tick: number }
  | {
      t: 'sync';
      tick: number;
      self: NetPlayer;
      players: NetPlayer[];
      npcs: NetNpc[];
      items: NetGroundItem[];
      projectiles: NetProjectile[];
      spotanims: NetSpotAnim[];
      /** Dynamically changed objects (doors opening etc.) */
      objects: { x: number; y: number; p: number; id: number; rot: number; type: number; original: number }[];
      /** Run energy, 0-100. */
      run: number;
      /** Whether the run toggle is on, so the orb can light up. */
      runOn: boolean;
      spec: number;
      prayer: number;
    }
  | { t: 'stats'; xp: number[]; levels: number[]; combat: number; totalLevel: number; totalXp: number }
  | { t: 'inv'; items: (number | null)[]; amounts: number[] }
  | { t: 'equip'; items: number[]; amounts: number[]; bonuses: Bonuses; weight: number }
  | { t: 'msg'; text: string; kind?: 'game' | 'chat' | 'trade' | 'system' | 'private' }
  | { t: 'friends'; list: FriendEntry[] }
  | { t: 'ignores'; list: string[] }
  /** `outgoing` distinguishes "To Bob:" from "From Bob:". */
  | { t: 'private'; name: string; text: string; outgoing: boolean }
  | { t: 'xp'; skill: number; amount: number }
  | { t: 'levelup'; skill: number; level: number }
  | { t: 'iface'; id: string; data?: unknown }
  | { t: 'closeIface' }
  | { t: 'bank'; items: number[]; amounts: number[]; noted: boolean }
  | { t: 'shop'; name: string; items: { id: number; amount: number; price: number }[] }
  | { t: 'dialogue'; entity: { kind: 'npc' | 'player' | 'plain'; id?: number; name?: string }; lines: string[]; options?: string[]; title?: string }
  | { t: 'prayers'; active: number[] }
  | { t: 'style'; index: number; autoRetaliate: boolean; autocast: number | null }
  | { t: 'design'; look: number[] }
  | { t: 'makeAmount'; options: { item: number; name: string; level?: number; enabled?: boolean }[]; title: string }
  /** Ids of the completed "Getting Started" tasks. */
  | { t: 'tasks'; done: string[] }
  | { t: 'sound'; name: string }
  | { t: 'pong' };
