import { AttackStyle } from '../../shared/combat.ts';
import { EQUIP_SLOT_NAMES, itemDef } from '../../shared/data/items.ts';
import { PRAYERS } from '../../shared/data/prayers.ts';
import { SPELLS, SpellKind } from '../../shared/data/spells.ts';
import { TASKS } from '../../shared/data/tasks.ts';
import { SKILL_NAMES, SKILL_COUNT, Skill, levelForXp, xpForLevel } from '../../shared/skills.ts';
import type { AudioEngine } from '../audio/engine.ts';
import { STARTING_TRACKS, TRACK_NAMES, track, trackExists } from '../audio/tracks.ts';
import type { Connection } from '../net.ts';
import type { GameState } from '../state.ts';
import { itemIcon } from './icons.ts';
import { prayerIcon, skillIcon, spellIcon } from './glyphs.ts';

/* ------------------------------------------------------------------ */
/* Layout - the classic fixed-mode 765x503 client                      */
/* ------------------------------------------------------------------ */

export const SCREEN_W = 765;
export const SCREEN_H = 503;
export const VIEWPORT = { x: 4, y: 4, w: 512, h: 334 };
export const CHAT = { x: 0, y: 338, w: 519, h: 165 };
export const SIDE = { x: 516, y: 0, w: 249, h: 503 };
export const MINIMAP = { cx: 644, cy: 84, r: 73 };
export const PANEL = { x: 548, y: 205, w: 190, h: 261 };
export const TAB_ROW_TOP = 168;
export const TAB_ROW_BOTTOM = 466;
export const INV_SLOT_W = 42;
export const INV_SLOT_H = 36;
export const INV_ORIGIN = { x: PANEL.x + 12, y: PANEL.y + 8 };

export interface MenuEntry {
  label: string;
  /** Higher priority entries sort to the top of the menu. */
  priority?: number;
  action: () => void;
}

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  onClick?: (button: number) => void;
  menu?: () => MenuEntry[];
  tooltip?: string;
  drag?: { kind: 'inv' | 'bank'; slot: number };
}

const TAB_NAMES = [
  'Combat Options',
  'Skills',
  'Getting Started',
  'Inventory',
  'Worn Equipment',
  'Prayer',
  'Magic',
  'Chat Channel',
  'Friends List',
  'Ignore List',
  'Logout',
  'Options',
  'Emotes',
  'Music Player',
];

/** Chatbox text colours by message kind. */
const CHAT_COLOURS: Record<string, string> = {
  chat: '#0000b0',
  system: '#a00000',
  private: '#800080',
  trade: '#008080',
  game: '#000000',
};

/** Steps the volume buttons move through, so both ends are reachable. */
const VOLUME_STEP = 0.1;

export class UI {
  readonly ctx: CanvasRenderingContext2D;
  private regions: Region[] = [];
  private stone!: CanvasPattern;
  private darkStone!: CanvasPattern;

  mouseX = 0;
  mouseY = 0;
  mouseInViewport = false;
  activeTab = 3;
  contextMenu: { x: number; y: number; entries: MenuEntry[] } | null = null;
  /** Set by main.ts each frame: the world target under the cursor. */
  hoverText = '';
  worldMenu: (() => MenuEntry[]) | null = null;
  /** Callbacks provided by main.ts. */
  onLogout?: () => void;
  cameraZoomHint = 0;

  private dragSlot = -1;
  private dragFrom: { kind: 'inv' | 'bank'; slot: number } | null = null;
  private dragX = 0;
  private dragY = 0;
  private dragging = false;
  private chatInput = '';
  private chatFocused = false;
  private chatScroll = 0;
  private bankAmountMode = 1;
  private shopAmountMode = 1;
  private makeAmount = 1;
  /** Purely client-side overlay, toggled from the equipment tab. */
  private showEquipStats = false;
  /** Chatbox name entry, used by the friend and ignore lists. */
  private prompt: { title: string; value: string; onSubmit: (name: string) => void } | null = null;
  /** While set, typed chat is sent as a private message to this player. */
  private pmTarget: string | null = null;
  /** Tracks heard at least once; the rest are listed but greyed out. */
  private readonly unlockedTracks = new Set<string>(STARTING_TRACKS);
  /**
   * True once a track has been chosen by hand, which stops the area from
   * overriding it until "Auto" is pressed again.
   */
  musicPinned = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly state: GameState,
    private readonly conn: Connection,
    private readonly audio: AudioEngine,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.buildTextures();
  }

  private buildTextures(): void {
    const make = (base: number, variance: number): CanvasPattern => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const g = c.getContext('2d')!;
      const img = g.createImageData(64, 64);
      for (let i = 0; i < 64 * 64; i++) {
        const n = (Math.random() - 0.5) * variance;
        img.data[i * 4] = clamp(((base >> 16) & 255) + n);
        img.data[i * 4 + 1] = clamp(((base >> 8) & 255) + n);
        img.data[i * 4 + 2] = clamp((base & 255) + n);
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return this.ctx.createPattern(c, 'repeat')!;
    };
    this.stone = make(0x5b5346, 26);
    this.darkStone = make(0x342e24, 20);
  }

  /* ---------------------------------------------------------------- */
  /* Drawing                                                           */
  /* ---------------------------------------------------------------- */

  draw(now: number): void {
    const ctx = this.ctx;
    this.regions = [];
    ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.textBaseline = 'alphabetic';

    this.drawFrame();
    this.drawMinimap();
    this.drawOrbs();
    this.drawTabs();
    this.drawPanel(now);
    this.drawChat(now);

    // A server-driven interface always takes precedence over the local overlay.
    if (this.state.openInterface) this.showEquipStats = false;
    if (this.state.openInterface === 'bank') this.drawBank();
    else if (this.state.openInterface === 'shop') this.drawShop();
    else if (this.state.openInterface === 'make') this.drawMake();
    else if (this.showEquipStats) this.drawEquipStats();
    if (this.state.dialogue) this.drawDialogue();
    if (this.state.levelUp) this.drawLevelUp(now);

    this.drawHoverText();
    this.drawContextMenu();
    this.drawDraggedItem();
  }

  private drawFrame(): void {
    const ctx = this.ctx;
    // Everything except the 3D viewport, which must stay transparent so the
    // WebGL canvas underneath shows through.
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_W, VIEWPORT.y);
    ctx.fillRect(0, VIEWPORT.y, VIEWPORT.x, SCREEN_H - VIEWPORT.y);
    ctx.fillRect(VIEWPORT.x + VIEWPORT.w, VIEWPORT.y, SCREEN_W - VIEWPORT.x - VIEWPORT.w, SCREEN_H - VIEWPORT.y);
    ctx.fillRect(VIEWPORT.x, VIEWPORT.y + VIEWPORT.h, VIEWPORT.w, SCREEN_H - VIEWPORT.y - VIEWPORT.h);
    // Side and chat panel backgrounds.
    ctx.fillStyle = this.stone;
    ctx.fillRect(SIDE.x, 0, SIDE.w, SCREEN_H);
    ctx.fillRect(0, CHAT.y, CHAT.w, CHAT.h);
    bevel(ctx, SIDE.x, 0, SIDE.w, SCREEN_H);
    bevel(ctx, 0, CHAT.y, CHAT.w, CHAT.h);
    // Viewport border.
    ctx.strokeStyle = '#0d0d0d';
    ctx.lineWidth = 4;
    ctx.strokeRect(VIEWPORT.x - 2, VIEWPORT.y - 2, VIEWPORT.w + 4, VIEWPORT.h + 4);
  }

  /* ------------------------------ minimap ------------------------- */

  minimapImage: HTMLCanvasElement | null = null;
  minimapOrigin = { x: 0, y: 0 };

  private drawMinimap(): void {
    const ctx = this.ctx;
    const { cx, cy, r } = MINIMAP;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    const self = this.state.self;
    if (this.minimapImage && self) {
      const scale = 2.6;
      const px = self.renderX - this.minimapOrigin.x;
      const py = self.renderY - this.minimapOrigin.y;
      const imgH = this.minimapImage.height;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        this.minimapImage,
        cx - px * scale,
        cy - (imgH - py) * scale,
        this.minimapImage.width * scale,
        imgH * scale,
      );

      const toMap = (wx: number, wy: number): [number, number] => [
        cx + (wx - self.renderX) * scale,
        cy - (wy - self.renderY) * scale,
      ];

      for (const item of this.state.groundItems) {
        const [mx, my] = toMap(item.x + 0.5, item.y + 0.5);
        ctx.fillStyle = '#d02020';
        ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
      }
      for (const npc of this.state.npcs.values()) {
        if (npc.plane !== self.plane) continue;
        const [mx, my] = toMap(npc.renderX + 0.5, npc.renderY + 0.5);
        ctx.fillStyle = '#f0f000';
        ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
      }
      for (const p of this.state.players.values()) {
        if (p === self || p.plane !== self.plane) continue;
        const [mx, my] = toMap(p.renderX + 0.5, p.renderY + 0.5);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
      }
      // The player dot.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
    }
    ctx.restore();

    // Bezel + compass.
    ctx.strokeStyle = '#1c1a16';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#6e6553';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.stroke();

    this.region(cx - r, cy - r, r * 2, r * 2, {
      onClick: (button) => {
        if (button !== 0) return;
        const self2 = this.state.self;
        if (!self2) return;
        const dx = (this.mouseX - cx) / 2.6;
        const dy = -(this.mouseY - cy) / 2.6;
        if (Math.hypot(this.mouseX - cx, this.mouseY - cy) > r) return;
        this.conn.send({ t: 'walkMinimap', x: Math.round(self2.renderX + dx), y: Math.round(self2.renderY + dy) });
      },
    });

    this.drawCompass(560, 26);
  }

  compassAngle = 0;

  private drawCompass(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#2b2620';
    ctx.beginPath();
    ctx.arc(0, 0, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6e6553';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.rotate(-this.compassAngle);
    ctx.fillStyle = '#c02020';
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(5, 0);
    ctx.lineTo(-5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8e8e8';
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(5, 0);
    ctx.lineTo(-5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    this.region(x - 19, y - 19, 38, 38, { tooltip: 'Compass', onClick: () => { this.compassAngle = 0; this.onResetCamera?.(); } });
  }

  onResetCamera?: () => void;

  /* ------------------------------ orbs ---------------------------- */

  private drawOrbs(): void {
    const s = this.state;
    const hp = s.levels[Skill.HITPOINTS];
    const maxHp = levelForXp(s.xp[Skill.HITPOINTS]) || 10;
    this.orb(529, 55, hp / Math.max(1, maxHp), `${hp}`, '#a02020', 'Hitpoints', 'heart');
    this.orb(529, 90, s.prayerPoints / Math.max(1, levelForXp(s.xp[Skill.PRAYER])), `${s.prayerPoints}`, '#4a7ab0', 'Prayer', 'prayer');
    this.orb(
      535,
      125,
      s.runEnergy / 100,
      `${s.runEnergy}`,
      s.runEnabled ? '#c8a020' : '#6a6050',
      `Toggle Run (${s.runEnabled ? 'on' : 'off'})`,
      'run',
      () => this.conn.send({ t: 'toggleRun' }),
    );
    this.orb(556, 152, s.specialEnergy / 1000, `${Math.floor(s.specialEnergy / 10)}`, '#20a0a0', 'Special attack', 'spec');
  }

  private orb(x: number, y: number, fill: number, label: string, colour: string, tooltip: string, icon: string, onClick?: () => void): void {
    const ctx = this.ctx;
    const r = 13;
    ctx.fillStyle = '#100f0c';
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2620';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // Fill arc from the bottom.
    const clamped = Math.max(0, Math.min(1, fill));
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = colour;
    ctx.fillRect(x - r, y + r - clamped * r * 2, r * 2, clamped * r * 2);
    ctx.restore();
    ctx.strokeStyle = '#6e6553';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    this.text(label, x, y + 4, '#ffffff', { align: 'center', size: 11, bold: true });
    this.orbIcon(icon, x - 20, y);
    this.region(x - r - 8, y - r, r * 2 + 12, r * 2, { tooltip, onClick: onClick ? () => onClick() : undefined });
  }

  private orbIcon(kind: string, x: number, y: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    switch (kind) {
      case 'heart':
        ctx.fillStyle = '#c02020';
        ctx.beginPath();
        ctx.moveTo(0, 5);
        ctx.bezierCurveTo(-8, -2, -4, -8, 0, -3);
        ctx.bezierCurveTo(4, -8, 8, -2, 0, 5);
        ctx.fill();
        break;
      case 'prayer':
        ctx.fillStyle = '#d8d8e0';
        ctx.fillRect(-2, -8, 4, 14);
        ctx.fillRect(-6, -4, 12, 4);
        break;
      case 'run':
        ctx.fillStyle = this.state.runEnabled && this.state.runEnergy > 0 ? '#f0d060' : '#7a7060';
        ctx.beginPath();
        ctx.moveTo(-5, 6);
        ctx.lineTo(1, -1);
        ctx.lineTo(-2, -1);
        ctx.lineTo(5, -8);
        ctx.lineTo(0, -1);
        ctx.lineTo(3, -1);
        ctx.closePath();
        ctx.fill();
        break;
      case 'spec':
        ctx.fillStyle = '#60d0d0';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          const a2 = ((i + 0.5) / 5) * Math.PI * 2 - Math.PI / 2;
          ctx.lineTo(Math.cos(a) * 7, Math.sin(a) * 7);
          ctx.lineTo(Math.cos(a2) * 3, Math.sin(a2) * 3);
        }
        ctx.closePath();
        ctx.fill();
        break;
    }
    ctx.restore();
  }

  /* ------------------------------ tabs ---------------------------- */

  private drawTabs(): void {
    const ctx = this.ctx;
    const tabW = 33;
    const startX = 524;
    for (let i = 0; i < 14; i++) {
      const row = i < 7 ? 0 : 1;
      const col = i % 7;
      const x = startX + col * tabW;
      const y = row === 0 ? TAB_ROW_TOP : TAB_ROW_BOTTOM;
      const active = this.activeTab === i;
      ctx.fillStyle = active ? this.stone : this.darkStone;
      ctx.fillRect(x, y, tabW, 37);
      ctx.strokeStyle = active ? '#8a7f68' : '#1c1a16';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, tabW - 1, 36);
      this.tabIcon(i, x + tabW / 2, y + 19);
      const index = i;
      this.region(x, y, tabW, 37, {
        tooltip: TAB_NAMES[i],
        onClick: () => {
          this.activeTab = index;
          if (index === 10) this.onLogout?.();
        },
      });
    }
  }

  private tabIcon(index: number, x: number, y: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    const gold = '#c8a24a';
    switch (index) {
      case 0: // combat
        ctx.fillStyle = '#b03030';
        ctx.fillRect(-8, -2, 16, 3);
        ctx.save();
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#c0c0c8';
        ctx.fillRect(-1, -9, 2, 18);
        ctx.restore();
        ctx.save();
        ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = '#c0c0c8';
        ctx.fillRect(-1, -9, 2, 18);
        ctx.restore();
        break;
      case 1: // skills
        ctx.fillStyle = gold;
        for (let i = 0; i < 3; i++) ctx.fillRect(-8 + i * 6, 4 - i * 4, 4, 5 + i * 4);
        break;
      case 2: // quests
        ctx.fillStyle = '#3a7ac0';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          const a2 = ((i + 0.5) / 5) * Math.PI * 2 - Math.PI / 2;
          ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
          ctx.lineTo(Math.cos(a2) * 4, Math.sin(a2) * 4);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case 3: {
        // A backpack, like the real inventory tab.
        ctx.fillStyle = '#6a4a24';
        ctx.beginPath();
        ctx.moveTo(-8, 8);
        ctx.lineTo(-8, -3);
        ctx.quadraticCurveTo(0, -11, 8, -3);
        ctx.lineTo(8, 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#9a7038';
        ctx.fillRect(-8, 0, 16, 4);
        ctx.fillStyle = '#4a3018';
        ctx.fillRect(-3, 1, 6, 7);
        break;
      }
      case 4: // equipment
        ctx.fillStyle = '#a0a0a8';
        ctx.fillRect(-6, -8, 12, 10);
        ctx.fillRect(-8, -6, 3, 12);
        ctx.fillRect(5, -6, 3, 12);
        break;
      case 5: // prayer
        ctx.fillStyle = '#d8d8e0';
        ctx.fillRect(-2, -9, 4, 17);
        ctx.fillRect(-7, -4, 14, 4);
        break;
      case 6: {
        // A wizard's hat with a sparkle, like the real magic tab.
        ctx.fillStyle = '#3a4ab0';
        ctx.beginPath();
        ctx.moveTo(0, -11);
        ctx.lineTo(7, 5);
        ctx.lineTo(-7, 5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#2a3480';
        ctx.fillRect(-10, 5, 20, 4);
        ctx.fillStyle = '#e8d860';
        ctx.beginPath();
        ctx.arc(1, -2, 1.6, 0, Math.PI * 2);
        ctx.arc(-3, 2, 1.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 7: // clan
        ctx.fillStyle = '#c8a24a';
        ctx.fillRect(-8, -6, 16, 12);
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(-5, -3, 10, 6);
        break;
      case 8: // friends
        ctx.fillStyle = '#40b040';
        ctx.beginPath();
        ctx.arc(0, -3, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-6, 2, 12, 6);
        break;
      case 9: // ignore
        ctx.fillStyle = '#b04040';
        ctx.beginPath();
        ctx.arc(0, -3, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-6, 2, 12, 6);
        break;
      case 10: // logout
        ctx.fillStyle = '#b03030';
        ctx.fillRect(-7, -8, 10, 16);
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(2, -2, 8, 3);
        break;
      case 11: // settings
        ctx.fillStyle = '#a0a0a8';
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a4a52';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 12: // emotes
        ctx.fillStyle = '#e0c040';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3a2a10';
        ctx.fillRect(-4, -3, 2, 2);
        ctx.fillRect(2, -3, 2, 2);
        ctx.beginPath();
        ctx.arc(0, 1, 4, 0.2, Math.PI - 0.2);
        ctx.stroke();
        break;
      case 13: // music
        ctx.fillStyle = '#c8a24a';
        ctx.fillRect(2, -9, 2, 13);
        ctx.beginPath();
        ctx.arc(0, 4, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
    ctx.restore();
  }

  /* ------------------------------ panel --------------------------- */

  private drawPanel(now: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = this.stone;
    ctx.fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
    bevel(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h);

    switch (this.activeTab) {
      case 0: this.drawCombatTab(); break;
      case 1: this.drawSkillsTab(); break;
      case 2: this.drawQuestTab(); break;
      case 3: this.drawInventoryTab(); break;
      case 4: this.drawEquipmentTab(); break;
      case 5: this.drawPrayerTab(); break;
      case 6: this.drawMagicTab(); break;
      case 7: this.drawChannelTab(); break;
      case 8: this.drawFriendsTab(); break;
      case 9: this.drawIgnoreTab(); break;
      case 11: this.drawSettingsTab(); break;
      case 12: this.drawEmotesTab(); break;
      case 13: this.drawMusicTab(); break;
      default: this.drawPlaceholderTab(TAB_NAMES[this.activeTab]);
    }
    void now;
  }

  private panelTitle(title: string): void {
    this.text(title, PANEL.x + PANEL.w / 2, PANEL.y + 16, '#ffb000', { align: 'center', size: 13, bold: true });
  }

  private drawCombatTab(): void {
    const s = this.state;
    const weaponId = s.equipment.items[3] ?? -1;
    const weapon = weaponId >= 0 ? itemDef(weaponId) : undefined;
    this.panelTitle(weapon ? weapon.name : 'Unarmed');
    const styles = combatStylesFor(weapon);
    let y = PANEL.y + 26;
    for (let i = 0; i < styles.length; i++) {
      const bx = PANEL.x + 10 + (i % 2) * 88;
      const by = y + Math.floor(i / 2) * 46;
      const active = s.styleIndex === i;
      this.ctx.fillStyle = active ? '#6a5f4a' : '#3f382c';
      this.ctx.fillRect(bx, by, 82, 40);
      bevel(this.ctx, bx, by, 82, 40);
      this.text(styles[i].name, bx + 41, by + 16, '#ffb000', { align: 'center', size: 11 });
      this.text(styleLabel(styles[i].style), bx + 41, by + 30, '#e8e8e8', { align: 'center', size: 10 });
      const index = i;
      this.region(bx, by, 82, 40, { onClick: () => this.conn.send({ t: 'setStyle', index }) });
    }
    y += Math.ceil(styles.length / 2) * 46 + 10;

    this.text(`Combat level: ${s.combatLevel}`, PANEL.x + 10, y + 12, '#ffb000', { size: 12 });
    y += 24;
    const ar = s.autoRetaliate;
    this.ctx.fillStyle = ar ? '#4a6a3a' : '#3f382c';
    this.ctx.fillRect(PANEL.x + 10, y, 168, 26);
    bevel(this.ctx, PANEL.x + 10, y, 168, 26);
    this.text(`Auto Retaliate: ${ar ? 'On' : 'Off'}`, PANEL.x + 94, y + 17, '#ffb000', { align: 'center', size: 11 });
    this.region(PANEL.x + 10, y, 168, 26, { onClick: () => this.conn.send({ t: 'setAutoRetaliate', on: !ar }) });

    y += 34;
    if (s.autocast !== null) {
      const spell = SPELLS[s.autocast];
      this.text(`Autocast: ${spell?.name ?? '-'}`, PANEL.x + 10, y + 12, '#ffffff', { size: 11 });
      this.region(PANEL.x + 10, y, 168, 18, { onClick: () => this.conn.send({ t: 'autocast', spell: null }) });
    }
  }

  private drawSkillsTab(): void {
    const s = this.state;
    const cols = 3;
    const cellW = 62;
    const cellH = 32;
    for (let i = 0; i < SKILL_COUNT; i++) {
      const x = PANEL.x + 2 + (i % cols) * cellW;
      const y = PANEL.y + 4 + Math.floor(i / cols) * cellH;
      this.ctx.fillStyle = '#3f382c';
      this.ctx.fillRect(x, y, cellW - 2, cellH - 2);
      bevel(this.ctx, x, y, cellW - 2, cellH - 2);
      this.skillIcon(i, x + 11, y + 15);
      const level = s.levels[i];
      const base = levelForXp(s.xp[i]);
      const colour = level > base ? '#40ff40' : level < base ? '#ff4040' : '#ffff00';
      this.text(`${level}`, x + 28, y + 13, colour, { size: 11, bold: true });
      this.text(`${base}`, x + 42, y + 25, '#ffff00', { size: 11, bold: true });
      const skill = i;
      this.region(x, y, cellW - 2, cellH - 2, {
        tooltip: `${SKILL_NAMES[i]}: ${base} (${Math.floor(s.xp[i]).toLocaleString()} xp)`,
        onClick: () => {
          const next = Math.min(99, base + 1);
          const remaining = Math.max(0, xpForLevel(next) - Math.floor(s.xp[skill]));
          this.pushMessage(
            `${SKILL_NAMES[skill]}: level ${base}, ${Math.floor(s.xp[skill]).toLocaleString()} xp. ` +
              `${remaining.toLocaleString()} xp until level ${next}.`,
          );
        },
      });
    }
    const y = PANEL.y + 4 + Math.ceil(SKILL_COUNT / cols) * cellH + 4;
    this.ctx.fillStyle = '#3f382c';
    this.ctx.fillRect(PANEL.x + 2, y, PANEL.w - 6, 28);
    bevel(this.ctx, PANEL.x + 2, y, PANEL.w - 6, 28);
    this.text(`Total level: ${s.totalLevel}`, PANEL.x + 10, y + 12, '#ffff00', { size: 11 });
    this.text(`Total xp: ${s.totalXp.toLocaleString()}`, PANEL.x + 10, y + 24, '#ffff00', { size: 11 });
  }

  private skillIcon(skill: number, x: number, y: number): void {
    const icon = skillIcon(skill);
    this.ctx.drawImage(icon, Math.round(x - icon.width / 2), Math.round(y - icon.height / 2));
  }

  private drawQuestTab(): void {
    const done = this.state.tasksDone;
    this.panelTitle(`Getting Started  ${done.size}/${TASKS.length}`);

    // The first outstanding task gets its hint spelled out, so a player who has
    // never touched RuneScape always has an obvious next thing to try.
    const next = TASKS.find((t) => !done.has(t.id));
    const rowH = 12;
    let y = PANEL.y + 26;
    let hovered: (typeof TASKS)[number] | null = null;
    for (const task of TASKS) {
      const complete = done.has(task.id);
      const over = this.mouseX >= PANEL.x + 6 && this.mouseX < PANEL.x + PANEL.w - 8 && this.mouseY >= y - 9 && this.mouseY < y + 3;
      if (over) hovered = task;
      // Tick box.
      this.ctx.fillStyle = complete ? '#2f6a24' : '#2e2920';
      this.ctx.fillRect(PANEL.x + 8, y - 9, 10, 10);
      bevel(this.ctx, PANEL.x + 8, y - 9, 10, 10);
      if (complete) {
        this.ctx.strokeStyle = '#7dff7d';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(PANEL.x + 10, y - 4);
        this.ctx.lineTo(PANEL.x + 12.5, y - 1);
        this.ctx.lineTo(PANEL.x + 16, y - 7);
        this.ctx.stroke();
      }
      const colour = complete ? '#40c040' : task === next ? '#ffff00' : '#c8c0a8';
      this.text(task.name, PANEL.x + 23, y, colour, { size: 11 });
      this.region(PANEL.x + 6, y - 10, PANEL.w - 14, rowH, { tooltip: `${task.name} - ${task.hint}` });
      y += rowH;
    }

    const stripY = PANEL.y + 26 + TASKS.length * rowH;
    const stripH = PANEL.y + PANEL.h - stripY - 4;
    this.ctx.fillStyle = '#332e24';
    this.ctx.fillRect(PANEL.x + 4, stripY, PANEL.w - 10, stripH);
    bevel(this.ctx, PANEL.x + 4, stripY, PANEL.w - 10, stripH);
    const shown = hovered ?? next;
    if (shown) {
      this.text(shown.name, PANEL.x + 10, stripY + 12, '#ffb000', { size: 11, bold: true });
      this.wrapText(shown.hint, PANEL.x + 10, stripY + 24, PANEL.w - 22, 10, '#e8e8e8');
    } else {
      this.text('All done. Explore Gielinor!', PANEL.x + PANEL.w / 2, stripY + 20, '#40c040', {
        align: 'center',
        size: 11,
        bold: true,
      });
    }
  }

  private drawInventoryTab(): void {
    const s = this.state;
    for (let slot = 0; slot < 28; slot++) {
      const col = slot % 4;
      const row = Math.floor(slot / 4);
      const x = INV_ORIGIN.x + col * INV_SLOT_W;
      const y = INV_ORIGIN.y + row * INV_SLOT_H;
      const id = s.inventory.items[slot] ?? -1;
      if (this.dragging && this.dragFrom?.kind === 'inv' && this.dragFrom.slot === slot) {
        this.slotRegion(slot, x, y);
        continue;
      }
      if (id >= 0) {
        const selected = s.selectedSlot === slot;
        if (selected) {
          this.ctx.fillStyle = 'rgba(255,255,255,0.18)';
          this.ctx.fillRect(x, y, INV_SLOT_W - 4, INV_SLOT_H - 2);
        }
        this.ctx.drawImage(itemIcon(id), x + 2, y);
        const amount = s.inventory.amounts[slot];
        if (amount > 1) this.drawAmount(amount, x + 2, y + 9);
      }
      this.slotRegion(slot, x, y);
    }
  }

  private slotRegion(slot: number, x: number, y: number): void {
    const s = this.state;
    const id = s.inventory.items[slot] ?? -1;
    this.region(x, y, INV_SLOT_W - 2, INV_SLOT_H - 2, {
      drag: id >= 0 ? { kind: 'inv', slot } : undefined,
      tooltip: id >= 0 ? itemDef(id)?.name : undefined,
      onClick: (button) => {
        if (id < 0) return;
        if (button === 0) this.inventoryLeftClick(slot, id);
      },
      menu: id >= 0 ? () => this.inventoryMenu(slot, id) : undefined,
    });
  }

  private inventoryLeftClick(slot: number, id: number): void {
    const s = this.state;
    if (s.openInterface === 'bank') {
      this.conn.send({ t: 'bank', action: 'deposit', slot, amount: this.bankAmount() });
      return;
    }
    if (s.openInterface === 'shop') {
      this.conn.send({ t: 'shop', action: 'value', slot });
      return;
    }
    if (s.selectedSpell !== null) {
      this.conn.send({ t: 'castSpell', spell: s.selectedSpell, targetType: 'item', target: slot });
      s.selectedSpell = null;
      return;
    }
    if (s.selectedSlot >= 0 && s.selectedSlot !== slot) {
      this.conn.send({ t: 'itemOnItem', slotA: s.selectedSlot, slotB: slot });
      s.selectedSlot = -1;
      return;
    }
    const def = itemDef(id);
    if (!def) return;
    const first = defaultItemAction(def);
    if (first === 'Use') s.selectedSlot = slot;
    else this.conn.send({ t: 'itemAction', slot, item: id, action: first });
  }

  private inventoryMenu(slot: number, id: number): MenuEntry[] {
    const def = itemDef(id);
    if (!def) return [];
    const entries: MenuEntry[] = [];
    if (this.state.openInterface === 'bank') {
      for (const [label, amount] of [['Deposit-1', 1], ['Deposit-5', 5], ['Deposit-10', 10], ['Deposit-All', 1e9]] as [string, number][]) {
        entries.push({ label: `${label} <col=ff9040>${def.name}`, action: () => this.conn.send({ t: 'bank', action: 'deposit', slot, amount }) });
      }
      entries.push({ label: `Examine <col=ff9040>${def.name}`, action: () => this.pushMessage(def.examine) });
      return entries;
    }
    if (this.state.openInterface === 'shop') {
      for (const [label, amount] of [['Sell 1', 1], ['Sell 5', 5], ['Sell 10', 10]] as [string, number][]) {
        entries.push({ label: `${label} <col=ff9040>${def.name}`, action: () => this.conn.send({ t: 'shop', action: 'sell', slot, amount }) });
      }
      entries.push({ label: `Examine <col=ff9040>${def.name}`, action: () => this.pushMessage(def.examine) });
      return entries;
    }
    for (const opt of def.options ?? []) {
      entries.push({ label: `${opt} <col=ff9040>${def.name}`, action: () => this.conn.send({ t: 'itemAction', slot, item: id, action: opt }) });
    }
    if (def.equip !== undefined) {
      entries.push({
        label: `${def.weapon ? 'Wield' : 'Wear'} <col=ff9040>${def.name}`,
        action: () => this.conn.send({ t: 'itemAction', slot, item: id, action: 'Wear' }),
      });
    }
    entries.push({ label: `Use <col=ff9040>${def.name}`, action: () => { this.state.selectedSlot = slot; } });
    entries.push({ label: `Drop <col=ff9040>${def.name}`, action: () => this.conn.send({ t: 'itemAction', slot, item: id, action: 'Drop' }) });
    entries.push({ label: `Examine <col=ff9040>${def.name}`, action: () => this.pushMessage(def.examine) });
    return entries;
  }

  private drawEquipmentTab(): void {
    const s = this.state;
    this.panelTitle('Worn Equipment');
    const layout: [number, number, number][] = [
      [0, 84, 28], // head
      [1, 44, 66], // cape
      [2, 84, 66], // amulet
      [13, 124, 66], // ammo
      [3, 40, 106], // weapon
      [4, 84, 106], // body
      [5, 128, 106], // shield
      [7, 84, 146], // legs
      [9, 40, 186], // hands
      [10, 84, 186], // feet
      [12, 128, 186], // ring
    ];
    for (const [slot, ox, oy] of layout) {
      const x = PANEL.x + ox;
      const y = PANEL.y + oy;
      this.ctx.fillStyle = '#2e2920';
      this.ctx.fillRect(x, y, 36, 36);
      bevel(this.ctx, x, y, 36, 36);
      const id = s.equipment.items[slot] ?? -1;
      if (id >= 0) {
        this.ctx.drawImage(itemIcon(id), x, y + 2);
        if (s.equipment.amounts[slot] > 1) this.drawAmount(s.equipment.amounts[slot], x, y + 11);
      }
      this.region(x, y, 36, 36, {
        tooltip: id >= 0 ? itemDef(id)?.name : EQUIP_SLOT_NAMES[slot],
        onClick: () => {
          if (id >= 0) this.conn.send({ t: 'equipAction', slot, action: 'Remove' });
        },
        menu:
          id >= 0
            ? () => [
                { label: `Remove <col=ff9040>${itemDef(id)?.name}`, action: () => this.conn.send({ t: 'equipAction', slot, action: 'Remove' }) },
                { label: `Examine <col=ff9040>${itemDef(id)?.name}`, action: () => this.pushMessage(itemDef(id)?.examine ?? '') },
              ]
            : undefined,
      });
    }

    // The panel has no room for the full bonus breakdown, so it lives behind
    // a button just like the real equipment stats interface.
    const by = PANEL.y + 226;
    this.ctx.fillStyle = this.showEquipStats ? '#6a5f4a' : '#3f382c';
    this.ctx.fillRect(PANEL.x + 8, by, 174, 22);
    bevel(this.ctx, PANEL.x + 8, by, 174, 22);
    this.text('Equipment Stats', PANEL.x + 95, by + 15, '#ffb000', { align: 'center', size: 11 });
    this.region(PANEL.x + 8, by, 174, 22, {
      onClick: () => {
        this.showEquipStats = !this.showEquipStats;
      },
    });
    this.text(`Weight: ${s.weight.toFixed(1)} kg`, PANEL.x + 95, by + 32, '#ffffff', { align: 'center', size: 10 });
  }

  private drawEquipStats(): void {
    const ctx = this.ctx;
    const b = this.state.bonuses;
    const w = 260;
    const h = 220;
    const x = VIEWPORT.x + (VIEWPORT.w - w) / 2;
    const y = VIEWPORT.y + 40;
    frame(ctx, this.stone, x, y, w, h);
    this.text('Equipment Stats', x + w / 2, y + 18, '#ffb000', { align: 'center', size: 13, bold: true });
    this.closeButton(x + w - 22, y + 4, () => {
      this.showEquipStats = false;
    });

    const sign = (v: number) => `${v >= 0 ? '+' : ''}${v}`;
    const column = (cx: number, title: string, rows: [string, number][]) => {
      this.text(title, cx, y + 40, '#ffffff', { size: 11, bold: true });
      rows.forEach(([label, value], i) => {
        const cy = y + 56 + i * 14;
        this.text(`${label}:`, cx, cy, '#ffb000', { size: 11 });
        this.text(sign(value), cx + 96, cy, '#ffb000', { size: 11, align: 'right' });
      });
    };
    column(x + 14, 'Attack bonus', [
      ['Stab', b.attackStab],
      ['Slash', b.attackSlash],
      ['Crush', b.attackCrush],
      ['Magic', b.attackMagic],
      ['Ranged', b.attackRanged],
    ]);
    column(x + 138, 'Defence bonus', [
      ['Stab', b.defenceStab],
      ['Slash', b.defenceSlash],
      ['Crush', b.defenceCrush],
      ['Magic', b.defenceMagic],
      ['Ranged', b.defenceRanged],
    ]);

    const oy = y + 142;
    this.text('Other bonuses', x + 14, oy, '#ffffff', { size: 11, bold: true });
    const other: [string, string][] = [
      ['Melee strength', sign(b.meleeStrength)],
      ['Ranged strength', sign(b.rangedStrength)],
      ['Magic damage', `${sign(b.magicDamage)}%`],
      ['Prayer', sign(b.prayerBonus)],
    ];
    other.forEach(([label, value], i) => {
      const cx = x + 14 + (i % 2) * 124;
      const cy = oy + 18 + Math.floor(i / 2) * 14;
      this.text(`${label}:`, cx, cy, '#ffb000', { size: 11 });
      this.text(value, cx + 110, cy, '#ffb000', { size: 11, align: 'right' });
    });
    this.text(`Weight: ${this.state.weight.toFixed(1)} kg`, x + w / 2, y + h - 12, '#ffffff', {
      align: 'center',
      size: 11,
    });
  }

  private drawPrayerTab(): void {
    const s = this.state;
    const prayerLevel = levelForXp(s.xp[Skill.PRAYER]);
    this.panelTitle(`Prayer  ${s.prayerPoints}/${prayerLevel}`);
    const cols = 5;
    // The bottom strip mirrors the real prayer book, which names whichever
    // prayer the cursor is over rather than relying on a floating tooltip.
    let described: string | null = null;
    for (let i = 0; i < PRAYERS.length; i++) {
      const p = PRAYERS[i];
      const x = PANEL.x + 6 + (i % cols) * 36;
      const y = PANEL.y + 22 + Math.floor(i / cols) * 31;
      const unlocked = prayerLevel >= p.level;
      const active = s.activePrayers.has(p.id);
      const hovered = this.mouseX >= x && this.mouseX < x + 32 && this.mouseY >= y && this.mouseY < y + 29;
      if (hovered) described = `${p.name} (level ${p.level})`;
      this.ctx.fillStyle = active ? '#8a7434' : hovered ? '#514833' : '#3f382c';
      this.ctx.fillRect(x, y, 32, 29);
      bevel(this.ctx, x, y, 32, 29);
      const icon = prayerIcon(p.id);
      this.ctx.globalAlpha = unlocked ? 1 : 0.3;
      this.ctx.drawImage(icon, x + 16 - icon.width / 2, y + 14 - icon.height / 2);
      this.ctx.globalAlpha = 1;
      const id = p.id;
      this.region(x, y, 32, 29, {
        tooltip: `${p.name} (level ${p.level}) - ${p.description}`,
        onClick: () => {
          if (!unlocked) {
            this.pushMessage(`You need a Prayer level of ${p.level} to use ${p.name}.`);
            return;
          }
          this.conn.send({ t: 'prayer', id });
        },
      });
    }
    const stripY = PANEL.y + 22 + Math.ceil(PRAYERS.length / cols) * 31 + 2;
    this.ctx.fillStyle = '#332e24';
    this.ctx.fillRect(PANEL.x + 4, stripY, PANEL.w - 10, 44);
    bevel(this.ctx, PANEL.x + 4, stripY, PANEL.w - 10, 44);
    if (described) {
      const hoveredPrayer = PRAYERS.find((p) => described!.startsWith(p.name));
      this.text(described, PANEL.x + PANEL.w / 2, stripY + 13, '#ffb000', { align: 'center', size: 11, bold: true });
      if (hoveredPrayer) {
        this.wrapText(hoveredPrayer.description, PANEL.x + 10, stripY + 26, PANEL.w - 22, 10, '#e8e8e8');
      }
    } else {
      this.text('Hover a prayer for details.', PANEL.x + PANEL.w / 2, stripY + 18, '#c8c0a8', { align: 'center', size: 10 });
      this.text('Recharge at an altar.', PANEL.x + PANEL.w / 2, stripY + 32, '#c8c0a8', { align: 'center', size: 10 });
    }
  }

  /** Draws `text` broken onto as many lines as it needs. */
  private wrapText(text: string, x: number, y: number, maxWidth: number, size: number, colour: string): void {
    this.ctx.font = `${size}px Helvetica, Arial, sans-serif`;
    const words = text.split(' ');
    let line = '';
    let cy = y;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (this.ctx.measureText(next).width > maxWidth && line) {
        this.text(line, x, cy, colour, { size });
        line = word;
        cy += size + 2;
      } else {
        line = next;
      }
    }
    if (line) this.text(line, x, cy, colour, { size });
  }

  private drawMagicTab(): void {
    const s = this.state;
    const magicLevel = s.levels[Skill.MAGIC];
    this.panelTitle('Spellbook');
    const cols = 5;
    // OSRS names the hovered spell and lists its runes below the book, so the
    // player can tell the 34 spells apart without memorising the icons.
    let described: (typeof SPELLS)[number] | null = null;
    let shown = 0;
    for (const spell of SPELLS) {
      const x = PANEL.x + 6 + (shown % cols) * 36;
      const y = PANEL.y + 20 + Math.floor(shown / cols) * 27;
      shown++;
      const usable = magicLevel >= spell.level;
      const selected = s.selectedSpell === spell.id;
      const hovered = this.mouseX >= x && this.mouseX < x + 32 && this.mouseY >= y && this.mouseY < y + 25;
      if (hovered) described = spell;
      this.ctx.fillStyle = selected ? '#8a7434' : hovered ? '#514833' : '#3f382c';
      this.ctx.fillRect(x, y, 32, 25);
      bevel(this.ctx, x, y, 32, 25);
      this.ctx.globalAlpha = usable ? 1 : 0.3;
      this.spellIcon(spell.id, x + 16, y + 12);
      this.ctx.globalAlpha = 1;
      const runeText = spell.runes.map(([r, n]) => `${n} ${itemDef(r)?.name.replace(' rune', '')}`).join(', ');
      const id = spell.id;
      this.region(x, y, 32, 25, {
        tooltip: `${spell.name} (level ${spell.level}) - ${runeText}`,
        onClick: () => {
          if (!usable) {
            this.pushMessage(`You need a Magic level of ${spell.level} to cast ${spell.name}.`);
            return;
          }
          if (spell.kind === SpellKind.TELEPORT) {
            this.conn.send({ t: 'castSpell', spell: id, targetType: 'none' });
          } else if (spell.kind === SpellKind.ALCHEMY || spell.effect === 'superheat') {
            s.selectedSpell = id;
            s.selectedSlot = -1;
            this.activeTab = 3;
          } else if (spell.kind === SpellKind.UTILITY) {
            this.conn.send({ t: 'castSpell', spell: id, targetType: 'none' });
          } else {
            s.selectedSpell = s.selectedSpell === id ? null : id;
          }
        },
        menu:
          spell.maxHit !== undefined
            ? () => [
                { label: `Cast <col=ffffff>${spell.name}`, action: () => { s.selectedSpell = id; } },
                { label: `Autocast <col=ffffff>${spell.name}`, action: () => this.conn.send({ t: 'autocast', spell: id }) },
              ]
            : undefined,
      });
    }

    const stripY = PANEL.y + 20 + Math.ceil(SPELLS.length / cols) * 27 + 2;
    this.ctx.fillStyle = '#332e24';
    this.ctx.fillRect(PANEL.x + 4, stripY, PANEL.w - 10, 48);
    bevel(this.ctx, PANEL.x + 4, stripY, PANEL.w - 10, 48);
    if (described) {
      this.text(described.name, PANEL.x + PANEL.w / 2, stripY + 14, '#ffb000', { align: 'center', size: 12, bold: true });
      const levelColour = magicLevel >= described.level ? '#40ff40' : '#ff4040';
      this.text(`Level ${described.level}`, PANEL.x + 10, stripY + 27, levelColour, { size: 10 });
      this.text(`${described.xp} xp`, PANEL.x + PANEL.w - 14, stripY + 27, '#e8e8e8', { size: 10, align: 'right' });
      // Rune requirements, coloured by whether the player is carrying enough.
      let rx = PANEL.x + 10;
      this.ctx.font = '10px Helvetica, Arial, sans-serif';
      for (const [rune, amount] of described.runes) {
        const label = `${amount} ${itemDef(rune)?.name.replace(' rune', '') ?? '?'}`;
        const enough = this.countInventory(rune) >= amount;
        this.text(label, rx, stripY + 41, enough ? '#40ff40' : '#ff4040', { size: 10 });
        rx += this.ctx.measureText(`${label}  `).width;
        this.ctx.font = '10px Helvetica, Arial, sans-serif';
      }
    } else {
      this.text('Hover a spell for its level and runes.', PANEL.x + PANEL.w / 2, stripY + 20, '#c8c0a8', {
        align: 'center',
        size: 10,
      });
      this.text('Click a combat spell, then click a target.', PANEL.x + PANEL.w / 2, stripY + 34, '#c8c0a8', {
        align: 'center',
        size: 10,
      });
    }
  }

  /** How many of `item` the player is carrying. */
  private countInventory(item: number): number {
    let total = 0;
    const inv = this.state.inventory;
    for (let i = 0; i < inv.items.length; i++) if (inv.items[i] === item) total += inv.amounts[i];
    return total;
  }

  private spellIcon(id: number, x: number, y: number): void {
    const icon = spellIcon(id);
    this.ctx.drawImage(icon, Math.round(x - icon.width / 2), Math.round(y - icon.height / 2));
  }

  private drawSettingsTab(): void {
    this.panelTitle('Options');
    let y = PANEL.y + 36;
    const toggle = (label: string, value: boolean, onClick: () => void) => {
      this.ctx.fillStyle = value ? '#4a6a3a' : '#3f382c';
      this.ctx.fillRect(PANEL.x + 10, y, 168, 26);
      bevel(this.ctx, PANEL.x + 10, y, 168, 26);
      this.text(`${label}: ${value ? 'On' : 'Off'}`, PANEL.x + 94, y + 17, '#ffb000', { align: 'center', size: 11 });
      this.region(PANEL.x + 10, y, 168, 26, { onClick });
      y += 32;
    };
    toggle('Run', this.state.runEnabled, () => this.conn.send({ t: 'toggleRun' }));
    toggle('Music', this.audio.musicEnabled, () => {
      this.audio.setMusicEnabled(!this.audio.musicEnabled);
      // Coming back on should resume with the area's track, not silence.
      if (this.audio.musicEnabled) this.musicPinned = false;
    });
    toggle('Sound effects', this.audio.sfxEnabled, () => this.audio.setSfxEnabled(!this.audio.sfxEnabled));

    // Volume rows: label, level as tenths, and a pair of nudge buttons.
    const volume = (label: string, value: number, onChange: (v: number) => void) => {
      this.text(`${label}: ${Math.round(value * 10)}`, PANEL.x + 10, y + 12, '#ffb000', { size: 11 });
      const button = (bx: number, text: string, delta: number) => {
        this.ctx.fillStyle = '#3f382c';
        this.ctx.fillRect(bx, y, 24, 20);
        bevel(this.ctx, bx, y, 24, 20);
        this.text(text, bx + 12, y + 14, '#ffb000', { align: 'center', size: 12 });
        this.region(bx, y, 24, 20, { onClick: () => onChange(value + delta) });
      };
      button(PANEL.x + 124, '-', -VOLUME_STEP);
      button(PANEL.x + 152, '+', VOLUME_STEP);
      y += 26;
    };
    volume('Music volume', this.audio.musicVolume, (v) => this.audio.setMusicVolume(v));
    volume('Effects volume', this.audio.sfxVolume, (v) => this.audio.setSfxVolume(v));

    this.text('Camera: arrow keys or middle-drag', PANEL.x + 10, y + 8, '#e8e8e8', { size: 10 });
    this.text('Zoom: mouse wheel', PANEL.x + 10, y + 20, '#e8e8e8', { size: 10 });
    this.text('Type ::help in chat for commands', PANEL.x + 10, y + 32, '#e8e8e8', { size: 10 });
  }

  private drawEmotesTab(): void {
    this.panelTitle('Emotes');
    const emotes = ['Yes', 'No', 'Bow', 'Angry', 'Think', 'Wave', 'Cheer', 'Clap', 'Dance', 'Laugh', 'Jump', 'Cry'];
    for (let i = 0; i < emotes.length; i++) {
      const x = PANEL.x + 8 + (i % 4) * 45;
      const y = PANEL.y + 28 + Math.floor(i / 4) * 42;
      this.ctx.fillStyle = '#3f382c';
      this.ctx.fillRect(x, y, 42, 38);
      bevel(this.ctx, x, y, 42, 38);
      this.text(emotes[i], x + 21, y + 22, '#ffb000', { align: 'center', size: 10 });
      const name = emotes[i];
      this.region(x, y, 42, 38, { onClick: () => this.conn.send({ t: 'chat', text: `*${name}*` }) });
    }
  }

  private drawPlaceholderTab(title: string): void {
    this.panelTitle(title);
    this.text('Nothing to show here yet.', PANEL.x + PANEL.w / 2, PANEL.y + 60, '#e8e8e8', { align: 'center', size: 11 });
  }

  /** A pair of wide buttons across the bottom of a list panel. */
  private listButtons(labels: [string, () => void][]): void {
    const w = Math.floor((PANEL.w - 16 - (labels.length - 1) * 4) / labels.length);
    const y = PANEL.y + PANEL.h - 28;
    labels.forEach(([label, onClick], i) => {
      const x = PANEL.x + 8 + i * (w + 4);
      this.ctx.fillStyle = '#3f382c';
      this.ctx.fillRect(x, y, w, 22);
      bevel(this.ctx, x, y, w, 22);
      this.text(label, x + w / 2, y + 15, '#ffb000', { align: 'center', size: 10 });
      this.region(x, y, w, 22, { onClick });
    });
  }

  private drawFriendsTab(): void {
    this.panelTitle('Friends List');
    const friends = this.state.friends;
    if (friends.length === 0) {
      this.text('Your friend list is empty.', PANEL.x + PANEL.w / 2, PANEL.y + 44, '#e8e8e8', {
        align: 'center',
        size: 11,
      });
    }

    const rowH = 15;
    const visible = Math.floor((PANEL.h - 66) / rowH);
    for (let i = 0; i < Math.min(friends.length, visible); i++) {
      const friend = friends[i];
      const y = PANEL.y + 30 + i * rowH;
      if (i % 2 === 0) {
        this.ctx.fillStyle = 'rgba(0,0,0,0.14)';
        this.ctx.fillRect(PANEL.x + 6, y - 10, PANEL.w - 12, rowH);
      }
      this.text(friend.name, PANEL.x + 10, y, friend.online ? '#40ff40' : '#ff4040', { size: 11 });
      this.text(friend.online ? 'World 1' : 'Offline', PANEL.x + PANEL.w - 10, y, friend.online ? '#40ff40' : '#ff4040', {
        size: 11,
        align: 'right',
      });

      const name = friend.name;
      const online = friend.online;
      this.region(PANEL.x + 6, y - 10, PANEL.w - 12, rowH, {
        tooltip: online ? `Message ${name}` : `${name} is offline`,
        onClick: () => this.startPrivateMessage(name, online),
        menu: () => [
          { label: `Message <col=ffffff>${name}`, priority: 1, action: () => this.startPrivateMessage(name, online) },
          { label: `Delete <col=ffffff>${name}`, action: () => this.conn.send({ t: 'friend', action: 'remove', name }) },
        ],
      });
    }

    this.listButtons([
      ['Add Friend', () => this.askName('Enter name to add to friend list', (name) => this.conn.send({ t: 'friend', action: 'add', name }))],
      ['Delete Friend', () => this.askName('Enter name to delete from friend list', (name) => this.conn.send({ t: 'friend', action: 'remove', name }))],
    ]);
  }

  private drawIgnoreTab(): void {
    this.panelTitle('Ignore List');
    const ignores = this.state.ignores;
    if (ignores.length === 0) {
      this.text('Your ignore list is empty.', PANEL.x + PANEL.w / 2, PANEL.y + 44, '#e8e8e8', {
        align: 'center',
        size: 11,
      });
    }

    const rowH = 15;
    const visible = Math.floor((PANEL.h - 66) / rowH);
    for (let i = 0; i < Math.min(ignores.length, visible); i++) {
      const name = ignores[i];
      const y = PANEL.y + 30 + i * rowH;
      if (i % 2 === 0) {
        this.ctx.fillStyle = 'rgba(0,0,0,0.14)';
        this.ctx.fillRect(PANEL.x + 6, y - 10, PANEL.w - 12, rowH);
      }
      this.text(name, PANEL.x + 10, y, '#ffffff', { size: 11 });
      this.region(PANEL.x + 6, y - 10, PANEL.w - 12, rowH, {
        tooltip: `${name} cannot message you`,
        menu: () => [
          { label: `Delete <col=ffffff>${name}`, action: () => this.conn.send({ t: 'ignore', action: 'remove', name }) },
        ],
      });
    }

    this.listButtons([
      ['Add Name', () => this.askName('Enter name to add to ignore list', (name) => this.conn.send({ t: 'ignore', action: 'add', name }))],
      ['Delete Name', () => this.askName('Enter name to delete from ignore list', (name) => this.conn.send({ t: 'ignore', action: 'remove', name }))],
    ]);
  }

  private drawChannelTab(): void {
    this.panelTitle('Chat Channel');
    this.text('Channel: ', PANEL.x + 10, PANEL.y + 40, '#ffffff', { size: 11 });
    this.text('None', PANEL.x + 66, PANEL.y + 40, '#ff4040', { size: 11 });
    this.text('You are not in a chat channel.', PANEL.x + PANEL.w / 2, PANEL.y + 70, '#e8e8e8', {
      align: 'center',
      size: 11,
    });
    this.text('Use the friend list to message', PANEL.x + PANEL.w / 2, PANEL.y + 88, '#e8e8e8', {
      align: 'center',
      size: 10,
    });
    this.text('players directly.', PANEL.x + PANEL.w / 2, PANEL.y + 102, '#e8e8e8', { align: 'center', size: 10 });
  }

  /** Marks a track as heard, so the music player lists it as available. */
  unlockTrack(name: string): void {
    if (!trackExists(name) || this.unlockedTracks.has(name)) return;
    this.unlockedTracks.add(name);
    // The chatbox colours lines by kind and prints the text verbatim, so a
    // <col=...> tag here would show up literally.
    this.pushMessage(`You have unlocked a new music track: ${name}.`);
  }

  private drawMusicTab(): void {
    this.panelTitle('Music Player');
    const rowH = 14;
    // Leave room for the Auto/Stop buttons and the now-playing strip.
    const visible = Math.floor((PANEL.h - 74) / rowH);
    for (let i = 0; i < Math.min(TRACK_NAMES.length, visible); i++) {
      const name = TRACK_NAMES[i];
      const y = PANEL.y + 32 + i * rowH;
      const unlocked = this.unlockedTracks.has(name);
      const playing = this.audio.playing === name;
      if (playing) {
        this.ctx.fillStyle = 'rgba(255,176,0,0.16)';
        this.ctx.fillRect(PANEL.x + 6, y - 10, PANEL.w - 12, rowH);
      }
      // Amber for the track playing, green for unlocked, grey for unheard.
      const colour = playing ? '#ffb000' : unlocked ? '#40ff40' : '#7a7368';
      this.text(name, PANEL.x + 10, y, colour, { size: 11 });
      this.region(PANEL.x + 6, y - 10, PANEL.w - 12, rowH, {
        tooltip: unlocked ? name : `${name} (not yet unlocked)`,
        onClick: () => this.selectTrack(name, unlocked),
      });
    }

    this.listButtons([
      ['Auto', () => this.followArea()],
      [this.audio.playing ? 'Stop' : 'Muted', () => this.stopTrack()],
    ]);
    const label = this.audio.playing ?? 'Nothing';
    const suffix = this.musicPinned ? '' : ' (auto)';
    this.text(`Playing: ${label}${suffix}`, PANEL.x + PANEL.w / 2, PANEL.y + PANEL.h - 34, '#ffb000', {
      align: 'center',
      size: 10,
    });
  }

  private selectTrack(name: string, unlocked: boolean): void {
    if (!unlocked) {
      this.pushMessage('You have not unlocked that track yet. Explore to find it.');
      return;
    }
    if (!this.audio.musicEnabled) {
      this.pushMessage('Music is switched off in the Options tab.');
      return;
    }
    const compiled = track(name);
    if (!compiled) return;
    this.musicPinned = true;
    this.audio.playTrack(name, compiled);
    this.pushMessage(`Now playing: ${name}`);
  }

  /** Hands control back to the area, taking effect at the next area change. */
  private followArea(): void {
    this.musicPinned = false;
    this.pushMessage('Music will follow the area you are in.');
  }

  private stopTrack(): void {
    this.musicPinned = true;
    this.audio.stopTrack();
  }

  /* --------------------------- name prompts ----------------------- */

  /** Opens the chatbox name prompt used by the friend and ignore lists. */
  private askName(title: string, onSubmit: (name: string) => void): void {
    this.prompt = { title, value: '', onSubmit };
    this.chatFocused = true;
  }

  private startPrivateMessage(name: string, online: boolean): void {
    if (!online) {
      this.pushMessage(`${name} is currently offline.`);
      return;
    }
    this.pmTarget = name;
    this.chatFocused = true;
    this.pushMessage(`Sending a private message to ${name}. Press Escape to stop.`);
  }

  /* ------------------------------ chat ---------------------------- */

  private drawChat(now: number): void {
    const ctx = this.ctx;
    const inner = { x: CHAT.x + 6, y: CHAT.y + 6, w: CHAT.w - 12, h: CHAT.h - 12 };
    const grad = ctx.createLinearGradient(0, inner.y, 0, inner.y + inner.h);
    grad.addColorStop(0, '#9a8f78');
    grad.addColorStop(1, '#8a8069');
    ctx.fillStyle = grad;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    ctx.strokeStyle = '#2a251c';
    ctx.lineWidth = 2;
    ctx.strokeRect(inner.x, inner.y, inner.w, inner.h);

    const lineHeight = 14;
    const caret = Math.floor(now / 400) % 2 === 0 ? '*' : '';
    const inputY = inner.y + inner.h - 8;

    // A name prompt replaces the message list, exactly as it does in game.
    if (this.prompt) {
      this.text(this.prompt.title, inner.x + inner.w / 2, inner.y + inner.h / 2 - 12, '#000080', {
        align: 'center',
        size: 13,
        shadow: false,
      });
      this.text(`${this.prompt.value}${caret}`, inner.x + inner.w / 2, inner.y + inner.h / 2 + 10, '#000000', {
        align: 'center',
        size: 13,
        shadow: false,
      });
      this.region(inner.x, inner.y, inner.w, inner.h, {});
      return;
    }

    const visible = Math.floor((inner.h - 24) / lineHeight);
    const messages = this.state.chat;
    const start = Math.max(0, messages.length - visible - this.chatScroll);
    let y = inner.y + 14;
    for (let i = start; i < Math.min(messages.length, start + visible); i++) {
      const line = messages[i];
      const colour = CHAT_COLOURS[line.kind] ?? '#000000';
      this.text(line.text, inner.x + 6, y, colour, { size: 12, shadow: false });
      y += lineHeight;
    }

    // Input line
    ctx.fillStyle = '#7d7462';
    ctx.fillRect(inner.x + 1, inputY - 13, inner.w - 2, 14);
    const label = this.pmTarget ? `To ${this.pmTarget}` : this.state.username;
    const prompt = `${label}: ${this.chatInput}${this.chatFocused ? caret : ''}`;
    this.text(prompt, inner.x + 6, inputY - 2, this.pmTarget ? '#800080' : '#0000b0', { size: 12, shadow: false });

    this.region(inner.x, inner.y, inner.w, inner.h, {
      onClick: () => {
        this.chatFocused = true;
      },
    });
  }

  /* ------------------------------ bank ---------------------------- */

  private bankAmount(): number {
    return this.bankAmountMode === -1 ? 1e9 : this.bankAmountMode;
  }

  private drawBank(): void {
    const ctx = this.ctx;
    const w = 488;
    const h = 300;
    const x = VIEWPORT.x + (VIEWPORT.w - w) / 2;
    const y = VIEWPORT.y + 8;
    frame(ctx, this.stone, x, y, w, h);
    this.text('The Bank of Gielinor', x + w / 2, y + 18, '#ffb000', { align: 'center', size: 14, bold: true });
    this.closeButton(x + w - 22, y + 4, () => this.conn.send({ t: 'bank', action: 'close' }));

    const cols = 8;
    const slotW = 48;
    const slotH = 36;
    const ox = x + 16;
    const oy = y + 30;
    for (let i = 0; i < this.state.bank.items.length; i++) {
      const id = this.state.bank.items[i];
      if (id < 0) continue;
      const col = i % cols;
      const row = Math.floor(i / cols);
      if (row > 6) break;
      const sx = ox + col * slotW;
      const sy = oy + row * slotH;
      ctx.fillStyle = '#2e2920';
      ctx.fillRect(sx, sy, slotW - 4, slotH - 2);
      ctx.drawImage(itemIcon(id), sx + 4, sy);
      this.drawAmount(this.state.bank.amounts[i], sx + 2, sy + 9);
      const slot = i;
      this.region(sx, sy, slotW - 4, slotH - 2, {
        tooltip: itemDef(id)?.name,
        onClick: () => this.conn.send({ t: 'bank', action: 'withdraw', slot, amount: this.bankAmount() }),
        menu: () => [
          { label: 'Withdraw-1', action: () => this.conn.send({ t: 'bank', action: 'withdraw', slot, amount: 1 }) },
          { label: 'Withdraw-5', action: () => this.conn.send({ t: 'bank', action: 'withdraw', slot, amount: 5 }) },
          { label: 'Withdraw-10', action: () => this.conn.send({ t: 'bank', action: 'withdraw', slot, amount: 10 }) },
          { label: 'Withdraw-All', action: () => this.conn.send({ t: 'bank', action: 'withdraw', slot, amount: 1e9 }) },
          { label: `Examine <col=ff9040>${itemDef(id)?.name}`, action: () => this.pushMessage(itemDef(id)?.examine ?? '') },
        ],
      });
    }

    // Quantity buttons
    const modes: [string, number][] = [['1', 1], ['5', 5], ['10', 10], ['All', -1]];
    modes.forEach(([label, value], i) => {
      const bx = x + 16 + i * 42;
      const by = y + h - 30;
      ctx.fillStyle = this.bankAmountMode === value ? '#6a5f4a' : '#3f382c';
      ctx.fillRect(bx, by, 38, 20);
      bevel(ctx, bx, by, 38, 20);
      this.text(label, bx + 19, by + 14, '#ffb000', { align: 'center', size: 11 });
      this.region(bx, by, 38, 20, { onClick: () => { this.bankAmountMode = value; } });
    });
    const dx = x + w - 150;
    ctx.fillStyle = '#3f382c';
    ctx.fillRect(dx, y + h - 30, 130, 20);
    bevel(ctx, dx, y + h - 30, 130, 20);
    this.text('Deposit inventory', dx + 65, y + h - 16, '#ffb000', { align: 'center', size: 11 });
    this.region(dx, y + h - 30, 130, 20, { onClick: () => this.conn.send({ t: 'bank', action: 'depositAll' }) });
  }

  private drawShop(): void {
    const shop = this.state.shop;
    if (!shop) return;
    const ctx = this.ctx;
    const w = 420;
    const h = 250;
    const x = VIEWPORT.x + (VIEWPORT.w - w) / 2;
    const y = VIEWPORT.y + 20;
    frame(ctx, this.stone, x, y, w, h);
    this.text(shop.name, x + w / 2, y + 18, '#ffb000', { align: 'center', size: 14, bold: true });
    this.closeButton(x + w - 22, y + 4, () => this.conn.send({ t: 'shop', action: 'close' }));

    const cols = 8;
    let hovered: { id: number; price: number; amount: number } | null = null;
    for (let i = 0; i < shop.items.length; i++) {
      const entry = shop.items[i];
      const sx = x + 14 + (i % cols) * 48;
      const sy = y + 32 + Math.floor(i / cols) * 42;
      const over = this.mouseX >= sx && this.mouseX < sx + 44 && this.mouseY >= sy && this.mouseY < sy + 38;
      if (over) hovered = entry;
      ctx.fillStyle = over ? '#433c2c' : '#2e2920';
      ctx.fillRect(sx, sy, 44, 38);
      bevel(ctx, sx, sy, 44, 38);
      if (entry.amount > 0) {
        ctx.drawImage(itemIcon(entry.id), sx + 4, sy);
        this.drawAmount(entry.amount, sx + 2, sy + 9);
      } else {
        ctx.globalAlpha = 0.3;
        ctx.drawImage(itemIcon(entry.id), sx + 4, sy);
        ctx.globalAlpha = 1;
      }
      this.text(`${entry.price}gp`, sx + 22, sy + 37, '#ffff00', { align: 'center', size: 10 });
      const slot = i;
      const name = itemDef(entry.id)?.name ?? 'Item';
      this.region(sx, sy, 44, 38, {
        tooltip: `${name} - ${entry.price} coins`,
        onClick: () => this.conn.send({ t: 'shop', action: 'value', slot }),
        menu: () => [
          { label: `Value <col=ff9040>${name}`, action: () => this.conn.send({ t: 'shop', action: 'value', slot }) },
          { label: `Buy 1 <col=ff9040>${name}`, action: () => this.conn.send({ t: 'shop', action: 'buy', slot, amount: 1 }) },
          { label: `Buy 5 <col=ff9040>${name}`, action: () => this.conn.send({ t: 'shop', action: 'buy', slot, amount: 5 }) },
          { label: `Buy 10 <col=ff9040>${name}`, action: () => this.conn.send({ t: 'shop', action: 'buy', slot, amount: 10 }) },
          { label: `Buy 50 <col=ff9040>${name}`, action: () => this.conn.send({ t: 'shop', action: 'buy', slot, amount: 50 }) },
        ],
      });
    }

    // A readout strip, so the price and stock are legible without hunting for
    // the hover text in the corner of the viewport.
    const stripY = y + h - 40;
    ctx.fillStyle = '#332e24';
    ctx.fillRect(x + 12, stripY, w - 24, 24);
    bevel(ctx, x + 12, stripY, w - 24, 24);
    if (hovered) {
      const name = itemDef(hovered.id)?.name ?? 'Item';
      this.text(name, x + 20, stripY + 16, '#ffb000', { size: 12, bold: true });
      this.text(`${hovered.price} coins`, x + w / 2 + 20, stripY + 16, '#ffff00', { size: 11 });
      this.text(`${hovered.amount} in stock`, x + w - 20, stripY + 16, '#e8e8e8', { size: 11, align: 'right' });
    } else {
      this.text('Right-click to buy. Click an inventory item to sell it.', x + w / 2, stripY + 16, '#e8e8e8', {
        align: 'center',
        size: 11,
      });
    }
    void this.shopAmountMode;
  }

  private drawMake(): void {
    const make = this.state.make;
    if (!make) return;
    const ctx = this.ctx;
    const w = Math.min(460, 80 + make.options.length * 62);
    const h = 150;
    const x = VIEWPORT.x + (VIEWPORT.w - w) / 2;
    const y = VIEWPORT.y + VIEWPORT.h - h - 16;
    frame(ctx, this.stone, x, y, w, h);
    this.text(make.title, x + w / 2, y + 18, '#ffb000', { align: 'center', size: 13, bold: true });
    this.closeButton(x + w - 22, y + 4, () => this.conn.send({ t: 'closeInterface' }));

    const amounts: [string, number][] = [['1', 1], ['5', 5], ['10', 10], ['All', 1000]];
    amounts.forEach(([label, value], i) => {
      const bx = x + 12 + i * 44;
      const by = y + h - 28;
      ctx.fillStyle = this.makeAmount === value ? '#6a5f4a' : '#3f382c';
      ctx.fillRect(bx, by, 40, 20);
      bevel(ctx, bx, by, 40, 20);
      this.text(label, bx + 20, by + 14, '#ffb000', { align: 'center', size: 11 });
      this.region(bx, by, 40, 20, { onClick: () => { this.makeAmount = value; } });
    });

    const perRow = Math.max(1, Math.floor((w - 24) / 62));
    make.options.forEach((option, i) => {
      const sx = x + 14 + (i % perRow) * 62;
      const sy = y + 30 + Math.floor(i / perRow) * 54;
      if (sy + 50 > y + h - 32) return;
      ctx.fillStyle = '#2e2920';
      ctx.fillRect(sx, sy, 56, 46);
      bevel(ctx, sx, sy, 56, 46);
      ctx.globalAlpha = option.enabled === false ? 0.35 : 1;
      ctx.drawImage(itemIcon(option.item), sx + 10, sy + 2);
      ctx.globalAlpha = 1;
      this.text(option.level ? `${option.level}` : '', sx + 50, sy + 44, '#ffff00', { align: 'right', size: 10 });
      const index = i;
      this.region(sx, sy, 56, 46, {
        tooltip: option.name + (option.level ? ` (level ${option.level})` : ''),
        onClick: () => {
          if (option.enabled === false) return;
          this.conn.send({ t: 'makeAmount', amount: this.makeAmount, option: index });
        },
      });
    });
  }

  private drawDialogue(): void {
    const d = this.state.dialogue;
    if (!d) return;
    const ctx = this.ctx;
    const w = 480;
    const h = 130;
    const x = VIEWPORT.x + (VIEWPORT.w - w) / 2;
    const y = VIEWPORT.y + VIEWPORT.h - h - 6;
    ctx.fillStyle = this.stone;
    ctx.fillRect(x, y, w, h);
    bevel(ctx, x, y, w, h);

    if (d.options && d.options.length) {
      this.text(d.title ?? 'Select an Option', x + w / 2, y + 22, '#ffffff', { align: 'center', size: 14, bold: true });
      d.options.forEach((option, i) => {
        const oy = y + 42 + i * 20;
        const hovered = this.mouseX >= x && this.mouseX <= x + w && this.mouseY >= oy - 14 && this.mouseY <= oy + 4;
        this.text(option, x + w / 2, oy, hovered ? '#ffffff' : '#ffb000', { align: 'center', size: 13 });
        const index = i;
        this.region(x + 10, oy - 14, w - 20, 20, { onClick: () => this.conn.send({ t: 'dialogue', option: index }) });
      });
      return;
    }

    const name = d.entity.kind === 'player' ? d.entity.name ?? 'You' : d.entity.name ?? '';
    if (name) this.text(name, x + 80, y + 24, '#ffffff', { align: 'center', size: 14, bold: true });
    // Simple portrait frame.
    ctx.fillStyle = '#2e2920';
    ctx.fillRect(x + 10, y + 30, 140, 88);
    bevel(ctx, x + 10, y + 30, 140, 88);
    ctx.fillStyle = d.entity.kind === 'player' ? '#c08a5a' : '#9a8a6a';
    ctx.beginPath();
    ctx.arc(x + 80, y + 82, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2018';
    ctx.fillRect(x + 70, y + 74, 5, 5);
    ctx.fillRect(x + 86, y + 74, 5, 5);
    ctx.fillRect(x + 72, y + 92, 17, 3);

    d.lines.forEach((line, i) => {
      this.text(line, x + 170, y + 44 + i * 18, '#000000', { size: 13, shadow: false });
    });
    this.text('Click here to continue', x + w - 20, y + h - 12, '#0000c0', { align: 'right', size: 12, shadow: false });
    this.region(x, y, w, h, { onClick: () => this.conn.send({ t: 'dialogue' }) });
  }

  private drawLevelUp(now: number): void {
    const lv = this.state.levelUp;
    if (!lv) return;
    const ctx = this.ctx;
    const w = 320;
    const h = 70;
    const x = VIEWPORT.x + (VIEWPORT.w - w) / 2;
    const y = VIEWPORT.y + 40;
    const alpha = Math.max(0, Math.min(1, (6000 - (now - lv.at)) / 800));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.stone;
    ctx.fillRect(x, y, w, h);
    bevel(ctx, x, y, w, h);
    this.text(`Congratulations, you just advanced a ${SKILL_NAMES[lv.skill]} level!`, x + w / 2, y + 28, '#ffb000', {
      align: 'center',
      size: 12,
      bold: true,
    });
    this.text(`Your ${SKILL_NAMES[lv.skill]} level is now ${lv.level}.`, x + w / 2, y + 48, '#ffffff', {
      align: 'center',
      size: 12,
    });
    ctx.globalAlpha = 1;
  }

  private closeButton(x: number, y: number, onClick: () => void): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#7a2a2a';
    ctx.fillRect(x, y, 18, 18);
    bevel(ctx, x, y, 18, 18);
    this.text('X', x + 9, y + 13, '#ffffff', { align: 'center', size: 12, bold: true });
    this.region(x, y, 18, 18, { onClick });
  }

  /* ------------------------------ misc ---------------------------- */

  private drawAmount(amount: number, x: number, y: number): void {
    let label: string;
    let colour: string;
    if (amount >= 10_000_000) {
      label = `${Math.floor(amount / 1_000_000)}M`;
      colour = '#00ff80';
    } else if (amount >= 100_000) {
      label = `${Math.floor(amount / 1000)}K`;
      colour = '#ffffff';
    } else {
      label = `${amount}`;
      colour = '#ffff00';
    }
    this.text(label, x + 1, y, colour, { size: 11, bold: false });
  }

  private drawHoverText(): void {
    if (this.contextMenu) return;
    const label = this.hoverText;
    if (!label) return;
    this.text(label, VIEWPORT.x + 6, VIEWPORT.y + 16, '#ffffff', { size: 13 });
  }

  private drawContextMenu(): void {
    const menu = this.contextMenu;
    if (!menu) return;
    const ctx = this.ctx;
    const rowH = 15;
    let width = 90;
    ctx.font = '12px Helvetica, Arial, sans-serif';
    for (const entry of menu.entries) width = Math.max(width, ctx.measureText(stripTags(entry.label)).width + 16);
    const height = menu.entries.length * rowH + 20;
    const x = Math.min(menu.x, SCREEN_W - width - 2);
    const y = Math.min(menu.y, SCREEN_H - height - 2);
    ctx.fillStyle = '#5d5447';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 1, y + 1, width - 2, 16);
    this.text('Choose Option', x + 4, y + 13, '#ffffff', { size: 12 });

    menu.entries.forEach((entry, i) => {
      const ry = y + 18 + i * rowH;
      const hovered = this.mouseX >= x && this.mouseX <= x + width && this.mouseY >= ry && this.mouseY <= ry + rowH;
      if (hovered) {
        ctx.fillStyle = '#8f8574';
        ctx.fillRect(x + 1, ry, width - 2, rowH);
      }
      this.drawTaggedText(entry.label, x + 4, ry + 11, hovered ? '#ffffff' : '#c8c8c8');
    });
    this.menuRect = { x, y, w: width, h: height, rowH, top: y + 18 };
  }

  private menuRect: { x: number; y: number; w: number; h: number; rowH: number; top: number } | null = null;

  private drawDraggedItem(): void {
    if (!this.dragging || this.dragSlot < 0) return;
    const id = this.state.inventory.items[this.dragSlot] ?? -1;
    if (id < 0) return;
    this.ctx.globalAlpha = 0.75;
    this.ctx.drawImage(itemIcon(id), this.dragX - 18, this.dragY - 16);
    this.ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------------- */
  /* Text helpers                                                      */
  /* ---------------------------------------------------------------- */

  text(
    str: string,
    x: number,
    y: number,
    colour: string,
    opts: { size?: number; bold?: boolean; align?: CanvasTextAlign; shadow?: boolean } = {},
  ): void {
    const ctx = this.ctx;
    ctx.font = `${opts.bold ? 'bold ' : ''}${opts.size ?? 12}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = opts.align ?? 'left';
    if (opts.shadow !== false) {
      ctx.fillStyle = '#000000';
      ctx.fillText(str, x + 1, y + 1);
    }
    ctx.fillStyle = colour;
    ctx.fillText(str, x, y);
    ctx.textAlign = 'left';
  }

  private drawTaggedText(str: string, x: number, y: number, defaultColour: string): void {
    const ctx = this.ctx;
    ctx.font = '12px Helvetica, Arial, sans-serif';
    let cursor = x;
    let colour = defaultColour;
    const parts = str.split(/(<col=[0-9a-fA-F]{6}>)/);
    for (const part of parts) {
      const match = /^<col=([0-9a-fA-F]{6})>$/.exec(part);
      if (match) {
        colour = `#${match[1]}`;
        continue;
      }
      if (!part) continue;
      ctx.fillStyle = '#000';
      ctx.fillText(part, cursor + 1, y + 1);
      ctx.fillStyle = colour;
      ctx.fillText(part, cursor, y);
      cursor += ctx.measureText(part).width;
    }
  }

  pushMessage(text: string): void {
    this.state.chat.push({ text, kind: 'game', at: performance.now() });
    if (this.state.chat.length > 120) this.state.chat.shift();
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  private region(x: number, y: number, w: number, h: number, opts: Omit<Region, 'x' | 'y' | 'w' | 'h'>): void {
    this.regions.push({ x, y, w, h, ...opts });
  }

  private regionAt(x: number, y: number): Region | null {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
    }
    return null;
  }

  /** Returns true when the UI consumed the event. */
  handleMouseDown(x: number, y: number, button: number): boolean {
    this.mouseX = x;
    this.mouseY = y;

    if (this.contextMenu) {
      const rect = this.menuRect;
      if (rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.top && y <= rect.y + rect.h) {
        const index = Math.floor((y - rect.top) / rect.rowH);
        const entry = this.contextMenu.entries[index];
        this.contextMenu = null;
        entry?.action();
        return true;
      }
      this.contextMenu = null;
      return true;
    }

    const inViewport = x >= VIEWPORT.x && x < VIEWPORT.x + VIEWPORT.w && y >= VIEWPORT.y && y < VIEWPORT.y + VIEWPORT.h;
    if (inViewport && !this.overlayCoversViewport()) {
      this.chatFocused = false;
      return false;
    }

    const region = this.regionAt(x, y);
    if (!region) return true;
    if (button === 2) {
      const entries = region.menu?.() ?? [];
      if (entries.length) {
        entries.push({ label: 'Cancel', action: () => {} });
        this.contextMenu = { x, y, entries };
      }
      return true;
    }
    if (region.drag) {
      this.dragFrom = region.drag;
      this.dragSlot = region.drag.slot;
      this.dragX = x;
      this.dragY = y;
      this.dragging = false;
    }
    region.onClick?.(button);
    return true;
  }

  handleMouseUp(x: number, y: number): void {
    if (this.dragging && this.dragFrom?.kind === 'inv') {
      const region = this.regionAt(x, y);
      if (region?.drag && region.drag.kind === 'inv' && region.drag.slot !== this.dragFrom.slot) {
        this.conn.send({ t: 'swapSlots', from: this.dragFrom.slot, to: region.drag.slot });
      } else {
        const target = this.slotAt(x, y);
        if (target >= 0 && target !== this.dragFrom.slot) {
          this.conn.send({ t: 'swapSlots', from: this.dragFrom.slot, to: target });
        }
      }
    }
    this.dragging = false;
    this.dragFrom = null;
    this.dragSlot = -1;
  }

  private slotAt(x: number, y: number): number {
    const col = Math.floor((x - INV_ORIGIN.x) / INV_SLOT_W);
    const row = Math.floor((y - INV_ORIGIN.y) / INV_SLOT_H);
    if (col < 0 || col > 3 || row < 0 || row > 6) return -1;
    return row * 4 + col;
  }

  handleMouseMove(x: number, y: number): void {
    this.mouseX = x;
    this.mouseY = y;
    this.mouseInViewport =
      x >= VIEWPORT.x && x < VIEWPORT.x + VIEWPORT.w && y >= VIEWPORT.y && y < VIEWPORT.y + VIEWPORT.h;
    if (this.dragFrom && (Math.abs(x - this.dragX) > 3 || Math.abs(y - this.dragY) > 3)) this.dragging = true;
    if (this.dragging) {
      this.dragX = x;
      this.dragY = y;
    }
    if (!this.contextMenu && !this.mouseInViewport) {
      const region = this.regionAt(x, y);
      this.hoverText = region?.tooltip ?? '';
    }
  }

  handleWheel(delta: number): void {
    if (this.mouseY > CHAT.y && this.mouseX < CHAT.w) {
      this.chatScroll = Math.max(0, this.chatScroll + (delta > 0 ? 1 : -1));
    }
  }

  openMenu(x: number, y: number, entries: MenuEntry[]): void {
    if (!entries.length) return;
    entries.push({ label: 'Cancel', action: () => {} });
    this.contextMenu = { x, y, entries };
  }

  overlayCoversViewport(): boolean {
    return (
      this.state.openInterface === 'bank' ||
      this.state.openInterface === 'shop' ||
      this.state.openInterface === 'make' ||
      this.showEquipStats ||
      !!this.state.dialogue
    );
  }

  handleKey(event: KeyboardEvent): boolean {
    // The name prompt swallows all typing until it is submitted or cancelled.
    if (this.prompt) {
      if (event.key === 'Escape') {
        this.prompt = null;
        return true;
      }
      if (event.key === 'Enter') {
        const { value, onSubmit } = this.prompt;
        this.prompt = null;
        const name = value.trim();
        if (name) onSubmit(name);
        return true;
      }
      if (event.key === 'Backspace') {
        this.prompt.value = this.prompt.value.slice(0, -1);
        return true;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        this.prompt.value = (this.prompt.value + event.key).slice(0, 12);
        return true;
      }
      return true;
    }

    if (event.key === 'Escape') {
      if (this.contextMenu) {
        this.contextMenu = null;
        return true;
      }
      if (this.pmTarget) {
        this.pmTarget = null;
        this.pushMessage('No longer sending private messages.');
        return true;
      }
      if (this.state.selectedSlot >= 0 || this.state.selectedSpell !== null) {
        this.state.selectedSlot = -1;
        this.state.selectedSpell = null;
        return true;
      }
      if (this.showEquipStats) {
        this.showEquipStats = false;
        return true;
      }
      if (this.state.openInterface) {
        this.conn.send({ t: 'closeInterface' });
        return true;
      }
      return false;
    }
    if (event.key === 'Enter') {
      const text = this.chatInput.trim();
      if (text) {
        if (this.pmTarget) this.conn.send({ t: 'privateMessage', name: this.pmTarget, text });
        else this.conn.send({ t: 'chat', text });
        this.chatInput = '';
      }
      this.chatFocused = !this.chatFocused;
      return true;
    }
    if (event.key === 'Backspace') {
      this.chatInput = this.chatInput.slice(0, -1);
      return true;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      if (/^F\d/.test(event.key)) return false;
      this.chatInput = (this.chatInput + event.key).slice(0, 80);
      return true;
    }
    // Function keys switch tabs, like RuneScape.
    const fkeys: Record<string, number> = { F1: 0, F2: 1, F3: 2, F4: 3, F5: 4, F6: 5, F7: 6 };
    if (event.key in fkeys) {
      this.activeTab = fkeys[event.key];
      return true;
    }
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * The chunky border the real client draws around every full-screen interface:
 * a black outline, a lit stone edge and a recessed interior.
 */
function frame(
  ctx: CanvasRenderingContext2D,
  stone: CanvasPattern,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = '#0b0a08';
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = stone;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 1, y + h - 1);
  ctx.lineTo(x + 1, y + 1);
  ctx.lineTo(x + w - 1, y + 1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.moveTo(x + w - 1, y + 1);
  ctx.lineTo(x + w - 1, y + h - 1);
  ctx.lineTo(x + 1, y + h - 1);
  ctx.stroke();
  // Corner studs.
  for (const [cx, cy] of [
    [x + 6, y + 6],
    [x + w - 6, y + 6],
    [x + 6, y + h - 6],
    [x + w - 6, y + h - 6],
  ]) {
    ctx.fillStyle = '#3a342a';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7d7462';
    ctx.beginPath();
    ctx.arc(cx - 0.6, cy - 0.6, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function bevel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y + h - 0.5);
  ctx.lineTo(x + 0.5, y + 0.5);
  ctx.lineTo(x + w - 0.5, y + 0.5);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.moveTo(x + w - 0.5, y + 0.5);
  ctx.lineTo(x + w - 0.5, y + h - 0.5);
  ctx.lineTo(x + 0.5, y + h - 0.5);
  ctx.stroke();
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function stripTags(s: string): string {
  return s.replace(/<col=[0-9a-fA-F]{6}>/g, '');
}

export function defaultItemAction(def: { options?: string[]; equip?: number; weapon?: unknown }): string {
  if (def.options && def.options.length) return def.options[0];
  if (def.equip !== undefined) return 'Wear';
  return 'Use';
}

function styleLabel(style: AttackStyle): string {
  switch (style) {
    case AttackStyle.ACCURATE: return 'Accurate';
    case AttackStyle.AGGRESSIVE: return 'Aggressive';
    case AttackStyle.CONTROLLED: return 'Controlled';
    case AttackStyle.DEFENSIVE: return 'Defensive';
    case AttackStyle.RAPID: return 'Rapid';
    case AttackStyle.LONGRANGE: return 'Longrange';
    default: return 'Magic';
  }
}

function combatStylesFor(weapon: { weapon?: { type: string } } | undefined): { name: string; style: AttackStyle }[] {
  const type = weapon?.weapon?.type ?? 'unarmed';
  const table = (WEAPON_STYLE_TABLE as Record<string, { name: string; style: AttackStyle }[]>)[type];
  return table ?? WEAPON_STYLE_TABLE.unarmed;
}

import { WEAPON_STYLES as WEAPON_STYLE_TABLE } from '../../shared/combat.ts';
