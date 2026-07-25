import '../shared/data/all.ts';
import { TICK_MS } from '../shared/constants.ts';
import { itemDef } from '../shared/data/items.ts';
import { npcDef } from '../shared/data/npcs.ts';
import { objectDef } from '../shared/data/objects.ts';
import { SKILL_NAMES } from '../shared/skills.ts';
import { actorMesh, MAX_BONES, type ActorLook } from './gl/actormodels.ts';
import { ANIM_DURATION, buildBoneMatrices, poseFor } from './gl/animation.ts';
import { MeshBuilder } from './gl/mesh.ts';
import { objectMesh } from './gl/objectmodels.ts';
import { Renderer, type CameraState, type GpuMesh } from './gl/renderer.ts';
import { TILE, WorldScene } from './gl/worldscene.ts';
import { Connection } from './net.ts';
import { GameState, type EntityView } from './state.ts';
import { SCREEN_H, SCREEN_W, UI, VIEWPORT, type MenuEntry } from './ui/ui.ts';
import { itemIcon } from './ui/icons.ts';

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

const stage = document.getElementById('stage') as HTMLDivElement;
const worldCanvas = document.getElementById('world') as HTMLCanvasElement;
const uiCanvas = document.getElementById('ui') as HTMLCanvasElement;
const loginPanel = document.getElementById('login') as HTMLDivElement;
const nameInput = document.getElementById('name') as HTMLInputElement;
const playButton = document.getElementById('play') as HTMLButtonElement;
const errorLabel = document.getElementById('err') as HTMLDivElement;

const state = new GameState();
const conn = new Connection(state);
const ui = new UI(uiCanvas, state, conn);
let renderer: Renderer;
let scene: WorldScene;
let started = false;

const camera: CameraState = {
  targetX: 0,
  targetY: 0,
  targetZ: 0,
  yaw: 0,
  pitch: 0.74,
  distance: 1250,
};

function fitStage(): void {
  const scale = Math.min(window.innerWidth / SCREEN_W, window.innerHeight / SCREEN_H);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  if (renderer) renderer.resize(VIEWPORT.w, VIEWPORT.h, Math.min(2, window.devicePixelRatio * scale));
}
window.addEventListener('resize', fitStage);
fitStage();

nameInput.focus();
playButton.addEventListener('click', () => startGame());
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startGame();
});

function startGame(): void {
  if (started) return;
  const name = nameInput.value.trim() || `Player${Math.floor(Math.random() * 900 + 100)}`;
  errorLabel.textContent = 'Loading world...';
  started = true;
  setTimeout(() => {
    try {
      renderer = new Renderer(worldCanvas);
      scene = new WorldScene(renderer);
      ui.minimapImage = scene.minimap;
      ui.minimapOrigin = { x: scene.map.minX, y: scene.map.minY };
      ui.onResetCamera = () => {
        camera.yaw = 0;
      };
      ui.onLogout = () => {
        conn.close();
        location.reload();
      };
    } catch (err) {
      errorLabel.textContent = String(err);
      started = false;
      return;
    }
    conn.onClose = (reason) => {
      errorLabel.textContent = reason;
      loginPanel.style.display = 'flex';
      started = false;
    };
    conn.connect(name);
    loginPanel.style.display = 'none';
    fitStage();
    requestAnimationFrame(frame);
  }, 30);
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

const keys = new Set<string>();
let middleDrag = false;
let lastPointer = { x: 0, y: 0 };
let clickMarker: { x: number; y: number; at: number } | null = null;

function toStage(event: MouseEvent): { x: number; y: number } {
  const rect = uiCanvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * SCREEN_W,
    y: ((event.clientY - rect.top) / rect.height) * SCREEN_H,
  };
}

uiCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

uiCanvas.addEventListener('mousedown', (event) => {
  const { x, y } = toStage(event);
  if (event.button === 1) {
    middleDrag = true;
    lastPointer = { x: event.clientX, y: event.clientY };
    event.preventDefault();
    return;
  }
  const consumed = ui.handleMouseDown(x, y, event.button);
  if (consumed) return;
  if (event.button === 0) handleWorldClick(x, y);
  else if (event.button === 2) {
    const entries = buildWorldMenu(x, y);
    ui.openMenu(x, y, entries);
  }
});

window.addEventListener('mouseup', (event) => {
  if (event.button === 1) middleDrag = false;
  const { x, y } = toStage(event);
  ui.handleMouseUp(x, y);
});

window.addEventListener('mousemove', (event) => {
  if (middleDrag) {
    camera.yaw -= (event.clientX - lastPointer.x) * 0.008;
    camera.pitch = Math.max(0.22, Math.min(1.42, camera.pitch + (event.clientY - lastPointer.y) * 0.005));
    lastPointer = { x: event.clientX, y: event.clientY };
  }
  const { x, y } = toStage(event);
  ui.handleMouseMove(x, y);
});

uiCanvas.addEventListener(
  'wheel',
  (event) => {
    const { x, y } = toStage(event);
    ui.handleMouseMove(x, y);
    if (ui.mouseInViewport) {
      camera.distance = Math.max(520, Math.min(2800, camera.distance + Math.sign(event.deltaY) * 110));
    } else {
      ui.handleWheel(event.deltaY);
    }
    event.preventDefault();
  },
  { passive: false },
);

window.addEventListener('keydown', (event) => {
  if (!started) return;
  keys.add(event.key);
  if (ui.handleKey(event)) event.preventDefault();
});
window.addEventListener('keyup', (event) => keys.delete(event.key));

/* ------------------------------------------------------------------ */
/* Picking                                                             */
/* ------------------------------------------------------------------ */

interface HoverTarget {
  label: string;
  menu: () => MenuEntry[];
  action: () => void;
  depth: number;
}

function tileUnderCursor(sx: number, sy: number): { x: number; y: number } | null {
  const ray = renderer.screenRay(sx - VIEWPORT.x, sy - VIEWPORT.y);
  const plane = state.self?.plane ?? 0;
  let t = 0;
  let prevAbove = true;
  for (let i = 0; i < 700; i++) {
    t += 12;
    const px = ray.origin[0] + ray.dir[0] * t;
    const py = ray.origin[1] + ray.dir[1] * t;
    const pz = ray.origin[2] + ray.dir[2] * t;
    const tx = px / TILE;
    const tz = pz / TILE;
    if (!scene.inBounds(Math.floor(tx), Math.floor(tz))) {
      if (t > 9000) break;
      continue;
    }
    const ground = scene.heightAt(tx, tz, plane);
    const above = py > ground;
    if (prevAbove && !above) {
      return { x: Math.floor(tx), y: Math.floor(tz) };
    }
    prevAbove = above;
  }
  return null;
}

function entityScreenPos(view: EntityView): [number, number, number] | null {
  const h = scene.heightAt(view.renderX + 0.5, view.renderY + 0.5, view.plane);
  return renderer.projectToScreen((view.renderX + 0.5) * TILE, h + 60, (view.renderY + 0.5) * TILE);
}

function findHover(sx: number, sy: number): HoverTarget | null {
  const self = state.self;
  if (!self) return null;
  const vx = sx - VIEWPORT.x;
  const vy = sy - VIEWPORT.y;
  let best: HoverTarget | null = null;

  const consider = (target: HoverTarget) => {
    if (!best || target.depth < best.depth) best = target;
  };

  // NPCs and players.
  for (const npc of state.npcs.values()) {
    if (npc.plane !== self.plane) continue;
    const def = npc.defId !== undefined ? npcDef(npc.defId) : undefined;
    if (!def || def.options.length === 0) continue;
    const pos = entityScreenPos(npc);
    if (!pos) continue;
    const radius = 22 * (def.scale ?? 1);
    if (Math.hypot(pos[0] - vx, pos[1] - vy) > radius) continue;
    const level = def.maxHit > 0 ? ` <col=ffff00>(level-${def.combat})` : '';
    const first = def.options[0];
    consider({
      label: `${first} <col=ffff00>${def.name}${level}`,
      depth: pos[2],
      action: () => conn.send({ t: 'npcAction', npc: npc.id, action: first }),
      menu: () => {
        const entries: MenuEntry[] = [];
        if (state.selectedSpell !== null) {
          entries.push({
            label: `Cast spell on <col=ffff00>${def.name}`,
            action: () => {
              conn.send({ t: 'castSpell', spell: state.selectedSpell!, targetType: 'npc', target: npc.id });
              state.selectedSpell = null;
            },
          });
        }
        for (const option of def.options) {
          entries.push({
            label: `${option} <col=ffff00>${def.name}${level}`,
            action: () => conn.send({ t: 'npcAction', npc: npc.id, action: option }),
          });
        }
        entries.push({
          label: `Examine <col=ffff00>${def.name}`,
          action: () => ui.pushMessage(def.examine),
        });
        return entries;
      },
    });
  }

  for (const player of state.players.values()) {
    if (player === self || player.plane !== self.plane) continue;
    const pos = entityScreenPos(player);
    if (!pos) continue;
    if (Math.hypot(pos[0] - vx, pos[1] - vy) > 22) continue;
    const name = player.name ?? 'Player';
    consider({
      label: `Attack <col=ffffff>${name} <col=ffff00>(level-${player.combat})`,
      depth: pos[2],
      action: () => conn.send({ t: 'playerAction', player: player.id, action: 'Attack' }),
      menu: () => [
        { label: `Attack <col=ffffff>${name}`, action: () => conn.send({ t: 'playerAction', player: player.id, action: 'Attack' }) },
        { label: `Follow <col=ffffff>${name}`, action: () => conn.send({ t: 'playerAction', player: player.id, action: 'Follow' }) },
        { label: `Trade with <col=ffffff>${name}`, action: () => ui.pushMessage('Trading is not available yet.') },
      ],
    });
  }

  // Ground items.
  for (const item of state.groundItems) {
    if (item.p !== self.plane) continue;
    const h = scene.heightAt(item.x + 0.5, item.y + 0.5, item.p);
    const pos = renderer.projectToScreen((item.x + 0.5) * TILE, h + 16, (item.y + 0.5) * TILE);
    if (!pos) continue;
    if (Math.hypot(pos[0] - vx, pos[1] - vy) > 16) continue;
    const def = itemDef(item.item);
    if (!def) continue;
    consider({
      label: `Take <col=ff9040>${def.name}`,
      depth: pos[2] - 0.0005,
      action: () => conn.send({ t: 'groundItemAction', item: item.item, x: item.x, y: item.y, action: 'Take' }),
      menu: () => [
        { label: `Take <col=ff9040>${def.name}`, action: () => conn.send({ t: 'groundItemAction', item: item.item, x: item.x, y: item.y, action: 'Take' }) },
        { label: `Examine <col=ff9040>${def.name}`, action: () => ui.pushMessage(def.examine) },
      ],
    });
  }

  // Scenery objects.
  for (const inst of scene.nearbyObjects(Math.round(self.renderX), Math.round(self.renderY), self.plane, 14)) {
    const def = objectDef(inst.obj.id);
    if (!def || def.options.length === 0) continue;
    const pos = renderer.projectToScreen(inst.worldX, inst.worldY + 60, inst.worldZ);
    if (!pos) continue;
    const radius = Math.max(18, inst.radius * 0.35);
    if (Math.hypot(pos[0] - vx, pos[1] - vy) > radius) continue;
    const first = def.options[0];
    const obj = inst.obj;
    consider({
      label: `${first} <col=00ffff>${def.name}`,
      depth: pos[2] + 0.0008,
      action: () => sendObjectAction(obj.id, obj.x, obj.y, first),
      menu: () => {
        const entries: MenuEntry[] = [];
        if (state.selectedSlot >= 0) {
          const held = itemDef(state.inventory.items[state.selectedSlot] ?? -1);
          if (held) {
            entries.push({
              label: `Use <col=ff9040>${held.name} <col=ffffff>-> <col=00ffff>${def.name}`,
              action: () => {
                conn.send({ t: 'itemOnObject', slot: state.selectedSlot, id: obj.id, x: obj.x, y: obj.y });
                state.selectedSlot = -1;
              },
            });
          }
        }
        for (const option of def.options) {
          entries.push({ label: `${option} <col=00ffff>${def.name}`, action: () => sendObjectAction(obj.id, obj.x, obj.y, option) });
        }
        entries.push({ label: `Examine <col=00ffff>${def.name}`, action: () => ui.pushMessage(def.examine) });
        return entries;
      },
    });
  }

  return best;
}

function sendObjectAction(id: number, x: number, y: number, action: string): void {
  conn.send({ t: 'objectAction', id, x, y, action });
}

function handleWorldClick(sx: number, sy: number): void {
  const hover = findHover(sx, sy);
  if (state.selectedSlot >= 0 && hover) {
    // "Use item on" is handled through the right-click menu; a left-click cancels.
    state.selectedSlot = -1;
  }
  if (hover) {
    hover.action();
    return;
  }
  const tile = tileUnderCursor(sx, sy);
  if (!tile) return;
  state.selectedSlot = -1;
  state.selectedSpell = null;
  conn.send({ t: 'walk', x: tile.x, y: tile.y });
  clickMarker = { x: tile.x, y: tile.y, at: performance.now() };
}

function buildWorldMenu(sx: number, sy: number): MenuEntry[] {
  const entries: MenuEntry[] = [];
  const hover = findHover(sx, sy);
  if (hover) entries.push(...hover.menu());
  const tile = tileUnderCursor(sx, sy);
  if (tile) {
    entries.push({
      label: 'Walk here',
      action: () => {
        conn.send({ t: 'walk', x: tile.x, y: tile.y });
        clickMarker = { x: tile.x, y: tile.y, at: performance.now() };
      },
    });
  }
  return entries;
}

/* ------------------------------------------------------------------ */
/* Scene helpers                                                       */
/* ------------------------------------------------------------------ */

const boneMatrices: Float32Array[] = Array.from({ length: MAX_BONES }, () => new Float32Array(16));
const actorGpu = new Map<string, GpuMesh | null>();
const groundItemGpu = new Map<number, GpuMesh | null>();
const effectGpu = new Map<string, GpuMesh | null>();

function actorGpuMesh(key: string, look: ActorLook): GpuMesh | null {
  let gpu = actorGpu.get(key);
  if (gpu === undefined) {
    gpu = renderer.upload(actorMesh(key, look));
    actorGpu.set(key, gpu);
  }
  return gpu;
}

function groundItemMesh(itemId: number): GpuMesh | null {
  let gpu = groundItemGpu.get(itemId);
  if (gpu === undefined) {
    const def = itemDef(itemId);
    const b = new MeshBuilder();
    const colour = def?.colour ?? 0xaaaaaa;
    switch (def?.icon) {
      case 'coins':
        for (let i = 0; i < 5; i++) b.cylinder((i % 3) * 8 - 8, i * 2, Math.floor(i / 3) * 8 - 4, 9, 9, 3, 8, colour);
        break;
      case 'log':
        b.push();
        b.rotateY(0.6);
        b.cylinder(0, 8, 0, 8, 8, 44, 6, colour, true, true);
        b.pop();
        break;
      case 'bones':
        b.box(-14, 3, 0, 30, 6, 6, colour);
        b.box(14, 3, 6, 8, 6, 16, colour);
        b.box(-14, 3, -6, 8, 6, 16, colour);
        break;
      case 'ore':
      case 'bar':
        b.rock(0, 0, 0, 14, colour, itemId);
        break;
      default:
        b.box(0, 2, 0, 22, 8, 22, colour, undefined, undefined);
        b.box(0, 10, 0, 14, 6, 14, colour);
    }
    gpu = renderer.upload(b.build());
    groundItemGpu.set(itemId, gpu);
  }
  return gpu;
}

function effectMesh(key: string, colour: number, radius: number): GpuMesh | null {
  let gpu = effectGpu.get(key);
  if (gpu === undefined) {
    const b = new MeshBuilder();
    b.sphere(0, 0, 0, radius, colour, 3, 7);
    gpu = renderer.upload(b.build());
    effectGpu.set(key, gpu);
  }
  return gpu;
}

const PROJECTILE_COLOURS: Record<string, number> = {
  arrow: 0xc0a070,
  strike_air: 0xd8e8f0,
  strike_water: 0x4a9fe0,
  strike_earth: 0x8a6a3a,
  strike_fire: 0xff6a20,
  bolt_air: 0xd8e8f0,
  bolt_water: 0x4a9fe0,
  bolt_earth: 0x8a6a3a,
  bolt_fire: 0xff6a20,
  blast_air: 0xe8f0f8,
  blast_water: 0x60b0f0,
  blast_earth: 0x9a7a4a,
  blast_fire: 0xff8030,
  wave_air: 0xf0f8ff,
  wave_water: 0x70c0ff,
  wave_earth: 0xaa8a5a,
  wave_fire: 0xffa040,
};

function lookForEntity(view: EntityView): { key: string; look: ActorLook } {
  if (view.kind === 'npc' && view.defId !== undefined) {
    const def = npcDef(view.defId)!;
    return {
      key: `npc:${def.id}`,
      look: { model: def.model, colour: def.colour, colour2: def.colour2, scale: def.scale ?? 1 },
    };
  }
  const eq = view.equipment ?? new Array(14).fill(-1);
  return {
    key: `player:${eq.join(',')}:${(view.look ?? []).join(',')}`,
    look: { model: 'human', colour: 0x7a6a56, colour2: 0x4a3a28, equipment: eq },
  };
}

function animationFor(view: EntityView, now: number): { name: string; t: number } {
  if (view.moveKind === 1) return { name: 'walk', t: view.walkCycle };
  if (view.moveKind === 2) return { name: 'run', t: view.walkCycle };
  const anim = view.anim;
  if (!anim || anim === 'idle') return { name: 'idle', t: view.walkCycle };
  const duration = ANIM_DURATION[anim] ?? 1;
  const elapsedTicks = (state.tick - view.animStart) + Math.min(1, (now - state.lastSyncAt) / TICK_MS);
  const t = elapsedTicks / duration;
  if (t > 1.05 && anim !== 'death') return { name: 'idle', t: view.walkCycle };
  return { name: anim, t: Math.max(0, Math.min(anim === 'death' ? 1 : t, 1.2)) };
}

/* ------------------------------------------------------------------ */
/* Frame                                                               */
/* ------------------------------------------------------------------ */

let lastFrame = performance.now();
const overlayQueue: (() => void)[] = [];

function frame(now: number): void {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  requestAnimationFrame(frame);

  // Camera keys
  if (keys.has('ArrowLeft')) camera.yaw += dt * 2.2;
  if (keys.has('ArrowRight')) camera.yaw -= dt * 2.2;
  if (keys.has('ArrowUp')) camera.pitch = Math.min(1.42, camera.pitch + dt * 1.2);
  if (keys.has('ArrowDown')) camera.pitch = Math.max(0.22, camera.pitch - dt * 1.2);

  state.interpolate(now, dt);
  scene.applyOverrides(state.objectOverrides);

  const self = state.self;
  if (self) {
    const groundY = scene.heightAt(self.renderX + 0.5, self.renderY + 0.5, self.plane);
    camera.targetX = (self.renderX + 0.5) * TILE;
    camera.targetY = groundY + 110;
    camera.targetZ = (self.renderY + 0.5) * TILE;
  }
  ui.compassAngle = camera.yaw;

  renderer.beginFrame(camera, now / 1000);
  overlayQueue.length = 0;

  if (self) {
    drawWorld(self, now);
  }

  // Hover detection over the viewport.
  if (ui.mouseInViewport && !ui.contextMenu && !ui.overlayCoversViewport()) {
    const hover = findHover(ui.mouseX, ui.mouseY);
    ui.hoverText = hover ? hover.label.replace(/<col=[0-9a-f]{6}>/g, '') : 'Walk here';
  } else if (ui.mouseInViewport) {
    ui.hoverText = '';
  }

  ui.draw(now);
  // World-space overlays (names, hitsplats, chat bubbles) sit above the 3D
  // scene but must stay behind any interface occupying the viewport.
  if (!ui.overlayCoversViewport()) {
    const ctx = ui.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h);
    ctx.clip();
    for (const fn of overlayQueue) fn();
    drawClickMarker(now);
    drawXpDrops(now);
    ctx.restore();
  }
}

function drawWorld(self: EntityView, now: number): void {
  const plane = self.plane;
  const cx = Math.round(self.renderX);
  const cy = Math.round(self.renderY);

  // Terrain and scenery.
  for (const chunk of scene.visibleChunks(cx, cy, plane, 52)) {
    renderer.draw(chunk.terrain);
    renderer.draw(chunk.scenery);
  }
  // The floor above, so upper storeys are visible from below the stairs.
  if (plane + 1 < 3) {
    for (const chunk of scene.visibleChunks(cx, cy, plane + 1, 24)) {
      renderer.draw(chunk.terrain);
      renderer.draw(chunk.scenery);
    }
  }

  // Animated fires.
  for (const inst of scene.nearbyObjects(cx, cy, plane, 20)) {
    const def = objectDef(inst.obj.id);
    if (def?.model !== 'fire') continue;
    const mesh = fireGpu();
    if (!mesh) continue;
    const flicker = 1 + Math.sin(now / 90 + inst.obj.x) * 0.12;
    buildBoneMatrices(boneMatrices, inst.worldX, inst.worldY, inst.worldZ, 0, flicker, []);
    renderer.setBones(boneMatrices, MAX_BONES);
    renderer.draw(mesh);
  }
  renderer.resetBones();

  // Ground items.
  for (const item of state.groundItems) {
    if (item.p !== plane) continue;
    const mesh = groundItemMesh(item.item);
    if (!mesh) continue;
    const h = scene.heightAt(item.x + 0.5, item.y + 0.5, plane);
    buildBoneMatrices(boneMatrices, (item.x + 0.5) * TILE, h, (item.y + 0.5) * TILE, now / 900, 1, []);
    renderer.setBones(boneMatrices, MAX_BONES);
    renderer.draw(mesh);
  }
  renderer.resetBones();

  // Characters.
  const all: EntityView[] = [...state.npcs.values(), ...state.players.values()];
  for (const view of all) {
    if (view.plane !== plane) continue;
    const { key, look } = lookForEntity(view);
    const mesh = actorGpuMesh(key, look);
    if (!mesh) continue;
    const def = view.defId !== undefined ? npcDef(view.defId) : undefined;
    const quadruped = !!def && ['cow', 'rat', 'spider', 'scorpion', 'bear', 'unicorn', 'chicken'].includes(def.model);
    const anim = animationFor(view, now);
    const pose = poseFor(anim.name, anim.t, view.walkCycle, quadruped);
    const groundY = scene.heightAt(view.renderX + 0.5, view.renderY + 0.5, plane);
    buildBoneMatrices(
      boneMatrices,
      (view.renderX + 0.5) * TILE,
      groundY,
      (view.renderY + 0.5) * TILE,
      view.facing,
      def?.scale ?? 1,
      pose,
    );
    renderer.setBones(boneMatrices, MAX_BONES);
    if (def?.model === 'ghost') {
      renderer.gl.enable(renderer.gl.BLEND);
      renderer.gl.blendFunc(renderer.gl.SRC_ALPHA, renderer.gl.ONE_MINUS_SRC_ALPHA);
      renderer.setAlpha(0.55);
      renderer.draw(mesh);
      renderer.setAlpha(1);
      renderer.gl.disable(renderer.gl.BLEND);
    } else {
      renderer.draw(mesh);
    }
    queueEntityOverlay(view, def?.name, now);
  }
  renderer.resetBones();

  // Projectiles.
  const gl = renderer.gl;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  for (const proj of state.projectiles) {
    const elapsed = state.tick - proj.startTick + Math.min(1, (now - state.lastSyncAt) / TICK_MS);
    const t = elapsed / proj.duration;
    if (t < 0 || t > 1) continue;
    const colour = PROJECTILE_COLOURS[proj.gfx] ?? 0xffffff;
    const mesh = effectMesh(`proj:${proj.gfx}`, colour, proj.gfx === 'arrow' ? 8 : 14);
    if (!mesh) continue;
    const x = (proj.from.x + (proj.to.x - proj.from.x) * t + 0.5) * TILE;
    const z = (proj.from.y + (proj.to.y - proj.from.y) * t + 0.5) * TILE;
    const baseY = scene.heightAt(proj.from.x + 0.5, proj.from.y + 0.5, plane);
    const arc = Math.sin(t * Math.PI) * proj.arcHeight * 4;
    buildBoneMatrices(boneMatrices, x, baseY + 70 + arc, z, 0, 1, []);
    renderer.setBones(boneMatrices, MAX_BONES);
    renderer.draw(mesh);
  }
  for (const spot of state.spotAnims) {
    const elapsed = state.tick - spot.startTick + Math.min(1, (now - state.lastSyncAt) / TICK_MS);
    if (elapsed < 0 || elapsed > 1.6) continue;
    const mesh = effectMesh('spot', 0xffe0a0, 20);
    if (!mesh) continue;
    const h = scene.heightAt(spot.x + 0.5, spot.y + 0.5, plane);
    renderer.setAlpha(Math.max(0, 1 - elapsed / 1.6));
    buildBoneMatrices(boneMatrices, (spot.x + 0.5) * TILE, h + 60, (spot.y + 0.5) * TILE, 0, 1 + elapsed, []);
    renderer.setBones(boneMatrices, MAX_BONES);
    renderer.draw(mesh);
  }
  renderer.setAlpha(1);
  gl.disable(gl.BLEND);
  renderer.resetBones();
}

let fireMeshCache: GpuMesh | null | undefined;
function fireGpu(): GpuMesh | null {
  if (fireMeshCache === undefined) fireMeshCache = renderer.upload(objectMesh(26185, 0));
  return fireMeshCache;
}

/* ------------------------------------------------------------------ */
/* World overlays drawn on the 2D canvas                               */
/* ------------------------------------------------------------------ */

function queueEntityOverlay(view: EntityView, npcName: string | undefined, now: number): void {
  const headY = scene.heightAt(view.renderX + 0.5, view.renderY + 0.5, view.plane) + 190 * (view.kind === 'npc' ? 1 : 1);
  const pos = renderer.projectToScreen((view.renderX + 0.5) * TILE, headY, (view.renderY + 0.5) * TILE);
  if (!pos) return;
  const sx = VIEWPORT.x + pos[0];
  const sy = VIEWPORT.y + pos[1];
  if (sx < VIEWPORT.x - 60 || sx > VIEWPORT.x + VIEWPORT.w + 60) return;

  overlayQueue.push(() => {
    const ctx = ui.ctx;
    // Health bar while in combat.
    if (view.hits.length > 0 || (view.hp < view.maxHp && now < view.hpShownUntil)) {
      const w = 30;
      const ratio = Math.max(0, Math.min(1, view.hp / Math.max(1, view.maxHp)));
      ctx.fillStyle = '#8a0000';
      ctx.fillRect(sx - w / 2, sy - 6, w, 5);
      ctx.fillStyle = '#00c000';
      ctx.fillRect(sx - w / 2, sy - 6, w * ratio, 5);
    }
    // Hitsplats.
    view.hits.forEach((hit, i) => {
      const age = (now - hit.at) / 1200;
      const hy = sy + 14 - age * 8 + i * 2;
      const hx = sx + (i - (view.hits.length - 1) / 2) * 20;
      ctx.fillStyle = hit.dmg === 0 ? '#3a5ac0' : '#a00000';
      ctx.beginPath();
      ctx.ellipse(hx, hy, 11, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ui.text(`${hit.dmg}`, hx, hy + 4, '#ffffff', { align: 'center', size: 11, bold: true });
    });
    // Overhead prayer icon.
    if (view.overhead) {
      ctx.fillStyle = '#d8d8e8';
      ctx.beginPath();
      ctx.arc(sx, sy - 22, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a3a5a';
      ui.text(view.overhead[0].toUpperCase(), sx, sy - 18, '#3a3a5a', { align: 'center', size: 11, bold: true, shadow: false });
    }
    // Name / chat.
    if (view.kind === 'player' && view.name) {
      ui.text(view.name, sx, sy - 34, '#ffffff', { align: 'center', size: 11 });
    }
    if (view.msg) {
      ui.text(view.msg, sx, sy - 48, '#ffff00', { align: 'center', size: 12 });
    }
    void npcName;
  });
}

function drawClickMarker(now: number): void {
  if (!clickMarker) return;
  const age = now - clickMarker.at;
  if (age > 500) {
    clickMarker = null;
    return;
  }
  const h = scene.heightAt(clickMarker.x + 0.5, clickMarker.y + 0.5, state.self?.plane ?? 0);
  const pos = renderer.projectToScreen((clickMarker.x + 0.5) * TILE, h + 4, (clickMarker.y + 0.5) * TILE);
  if (!pos) return;
  const ctx = ui.ctx;
  const size = 6 + Math.sin((age / 500) * Math.PI) * 4;
  ctx.strokeStyle = age < 250 ? '#ffff00' : '#ff2020';
  ctx.lineWidth = 2;
  const x = VIEWPORT.x + pos[0];
  const y = VIEWPORT.y + pos[1];
  ctx.beginPath();
  ctx.moveTo(x - size, y - size);
  ctx.lineTo(x + size, y + size);
  ctx.moveTo(x + size, y - size);
  ctx.lineTo(x - size, y + size);
  ctx.stroke();
}

function drawXpDrops(now: number): void {
  let index = 0;
  for (const drop of state.xpDrops) {
    const age = (now - drop.at) / 3000;
    if (age > 1) continue;
    const x = VIEWPORT.x + VIEWPORT.w - 70;
    const y = VIEWPORT.y + 40 - age * 40 + index * 14;
    ui.ctx.globalAlpha = Math.max(0, 1 - age);
    ui.text(`${SKILL_NAMES[drop.skill].slice(0, 3)} +${Math.round(drop.amount)}`, x, y, '#ffffff', {
      align: 'right',
      size: 12,
      bold: true,
    });
    ui.ctx.globalAlpha = 1;
    index++;
    if (index > 5) break;
  }
}

void itemIcon;
void SCREEN_H;


