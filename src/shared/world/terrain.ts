/** Terrain (floor) types with their base colours, matching RuneScape's palette. */

export interface TerrainType {
  id: number;
  name: string;
  colour: number;
  /** Water is animated and blocks movement. */
  water?: boolean;
  /** Blocks movement (void, deep water, lava). */
  blocked?: boolean;
  /** Minimap colour override. */
  minimap?: number;
  /** Slight per-tile colour jitter to break up flat areas. */
  noise?: number;
}

const list: TerrainType[] = [];
function terrain(name: string, colour: number, extra: Partial<TerrainType> = {}): number {
  const id = list.length;
  list.push({ id, name, colour, noise: 0.06, ...extra });
  return id;
}

export const T_NONE = terrain('none', 0x000000, { blocked: true, noise: 0 });
export const T_GRASS = terrain('grass', 0x3f7a2e, { noise: 0.1 });
export const T_GRASS_DARK = terrain('dark grass', 0x2f6224, { noise: 0.09 });
export const T_GRASS_LIGHT = terrain('light grass', 0x568f38, { noise: 0.1 });
export const T_DIRT = terrain('dirt', 0x6f5537, { noise: 0.08 });
export const T_PATH = terrain('path', 0x8a8272, { noise: 0.05 });
export const T_GRAVEL = terrain('gravel', 0x77726a, { noise: 0.07 });
export const T_SAND = terrain('sand', 0xc4a86a, { noise: 0.05 });
export const T_DESERT = terrain('desert sand', 0xd2b678, { noise: 0.05 });
export const T_SWAMP = terrain('swamp', 0x445a2c, { noise: 0.12 });
export const T_MUD = terrain('mud', 0x5a4a30, { noise: 0.1 });
export const T_WATER = terrain('water', 0x2c4f8a, { water: true, blocked: true, noise: 0.03 });
export const T_SHALLOW_WATER = terrain('shallow water', 0x3f6ba0, { water: true, blocked: true, noise: 0.03 });
export const T_STONE_FLOOR = terrain('stone floor', 0x87837a, { noise: 0.04 });
export const T_WOOD_FLOOR = terrain('wooden floor', 0x8a6a42, { noise: 0.05 });
export const T_MARBLE = terrain('marble', 0xbdbdb2, { noise: 0.03 });
export const T_CARPET_RED = terrain('red carpet', 0x8f2f2a, { noise: 0.03 });
export const T_CARPET_BLUE = terrain('blue carpet', 0x2f3f8f, { noise: 0.03 });
export const T_FARMLAND = terrain('farmland', 0x6a5535, { noise: 0.09 });
export const T_WHEAT_FIELD = terrain('wheat', 0xa8913f, { noise: 0.08 });
export const T_LAVA = terrain('lava', 0xc03a10, { blocked: true, noise: 0.15 });
export const T_ROCK_FLOOR = terrain('rock', 0x6d6963, { noise: 0.08 });
export const T_SNOW = terrain('snow', 0xdfe6ec, { noise: 0.03 });
export const T_BRIDGE = terrain('bridge', 0x86663f, { noise: 0.04 });

export function terrainType(id: number): TerrainType {
  return list[id] ?? list[0];
}

export function allTerrain(): TerrainType[] {
  return list;
}

export interface PlacedObject {
  id: number;
  x: number;
  y: number;
  plane: number;
  /** 0-3, each step is a 90 degree clockwise rotation. */
  rot: number;
  /** 0 = wall on tile edge, 2 = scenery, 4 = wall decoration, 22 = ground decoration. */
  type: number;
}

export interface NpcSpawn {
  def: number;
  x: number;
  y: number;
  plane: number;
}

export interface ItemSpawn {
  item: number;
  amount: number;
  x: number;
  y: number;
  plane: number;
  /** Ticks between respawns. */
  respawn: number;
}

export interface NamedArea {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TeleportLink {
  /** Object position that triggers it. */
  x: number;
  y: number;
  plane: number;
  objectId: number;
  action: string;
  to: { x: number; y: number; plane: number };
}

export interface WorldMap {
  minX: number;
  minY: number;
  width: number;
  height: number;
  planes: number;
  /** Vertex heights, ((width + 1) * (height + 1)) entries. */
  heights: Int16Array;
  /** Per-plane, per-tile terrain ids. */
  underlay: Uint8Array;
  overlay: Uint8Array;
  /** Bit flags: 1 = indoors (hide roof when inside), 2 = bridge deck. */
  tileFlags: Uint8Array;
  objects: PlacedObject[];
  npcSpawns: NpcSpawn[];
  itemSpawns: ItemSpawn[];
  areas: NamedArea[];
  links: TeleportLink[];
}

export const HEIGHT_PER_PLANE = 240;
