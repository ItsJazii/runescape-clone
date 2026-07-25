import { itemDef } from '../shared/data/items.ts';
import { openBank, openShop } from './actions.ts';
import { Skill } from '../shared/skills.ts';
import type { Npc } from './npc.ts';
import type { Player } from './player.ts';
import type { World } from './world.ts';

export interface DialogueNode {
  /** Lines spoken by the NPC. */
  npc?: string[];
  /** Lines spoken by the player. */
  you?: string[];
  /** Multiple-choice options. */
  options?: { label: string; next: string; when?: (p: Player) => boolean }[];
  /** Key of the next node ('' or undefined ends the conversation). */
  next?: string;
  /** Runs when the node is shown. */
  action?: (ctx: DialogueContext) => void;
  /** Chooses a different node dynamically. */
  route?: (p: Player) => string | undefined;
}

export interface DialogueContext {
  world: World;
  player: Player;
  npc: Npc | null;
}

export type DialogueScript = Record<string, DialogueNode>;

/* ------------------------------------------------------------------ */
/* Quests                                                              */
/* ------------------------------------------------------------------ */

export const QUESTS: Record<string, { name: string; points: number }> = {
  cooks_assistant: { name: "Cook's Assistant", points: 1 },
  sheep_shearer: { name: 'Sheep Shearer', points: 1 },
  restless_ghost: { name: 'The Restless Ghost', points: 1 },
};

function questStage(p: Player, id: string): number {
  return p.quests[id] ?? 0;
}

function setQuest(p: Player, id: string, stage: number): void {
  p.quests[id] = stage;
}

/* ------------------------------------------------------------------ */
/* Scripts                                                             */
/* ------------------------------------------------------------------ */

const SCRIPTS: Record<string, DialogueScript> = {
  hans: {
    start: {
      npc: ['Hello. What are you doing here?'],
      options: [
        { label: "I'm looking for whoever is in charge of this place.", next: 'charge' },
        { label: 'How long have I been playing?', next: 'played' },
        { label: 'Nothing, sorry.', next: 'bye' },
      ],
    },
    charge: {
      you: ["I'm looking for whoever is in charge of this place."],
      npc: ['Who? Duke Horacio? He is upstairs in the castle.', 'Take the staircase in the south-west corner.'],
      next: '',
    },
    played: {
      you: ['How long have I been playing?'],
      npc: ['You have been playing for a little while now.', 'Keep at it and you will be a legend of Gielinor!'],
      next: '',
    },
    bye: { you: ['Nothing, sorry.'], next: '' },
  },

  duke: {
    start: {
      route: (p) => (questStage(p, 'restless_ghost') > 0 ? 'ghosty' : 'start2'),
    },
    start2: {
      npc: ['Greetings. I am Duke Horacio of Lumbridge.', 'Welcome to my castle.'],
      options: [
        { label: 'Have you any quests for me?', next: 'quests' },
        { label: 'Nice to meet you.', next: 'bye' },
      ],
    },
    quests: {
      you: ['Have you any quests for me?'],
      npc: [
        'I am afraid not right now, adventurer.',
        'Speak to my cook downstairs - he always seems to be in a panic.',
      ],
      next: '',
    },
    ghosty: {
      npc: ['I hear the graveyard has been troubled of late.', 'Father Aereck could use your help.'],
      next: '',
    },
    bye: { you: ['Nice to meet you.'], next: '' },
  },

  cook: {
    start: {
      route: (p) => {
        const stage = questStage(p, 'cooks_assistant');
        if (stage >= 2) return 'done';
        if (stage === 1) return 'progress';
        return 'intro';
      },
    },
    intro: {
      npc: ["What am I to do? The Duke's birthday cake is ruined!"],
      options: [
        { label: "What's wrong?", next: 'whatswrong' },
        { label: "Can you make me a cake?", next: 'nocake' },
        { label: "You don't look very happy.", next: 'whatswrong' },
      ],
    },
    whatswrong: {
      you: ["What's wrong?"],
      npc: [
        "I'm supposed to be baking a cake for the Duke's birthday,",
        'but I forgot to buy the ingredients!',
        'I need a bucket of milk, an egg and a pot of flour.',
      ],
      options: [
        { label: 'I can get those for you.', next: 'accept' },
        { label: "I can't help you right now.", next: 'decline' },
      ],
    },
    accept: {
      you: ['I can get those for you.'],
      npc: [
        'Oh thank you, thank you!',
        'There is a dairy cow north of here, chickens on the farm,',
        'and the mill to the north-west can grind grain into flour.',
      ],
      action: ({ player }) => {
        setQuest(player, 'cooks_assistant', 1);
        player.message('You have started the quest: Cook\'s Assistant.');
      },
      next: '',
    },
    decline: { you: ["I can't help you right now."], npc: ['Oh dear, oh dear.'], next: '' },
    nocake: { you: ['Can you make me a cake?'], npc: ['No! I have a cake to bake for the Duke!'], next: '' },
    progress: {
      npc: ['Have you got the ingredients yet?'],
      options: [
        { label: 'Here you go.', next: 'give' },
        { label: 'Not yet.', next: 'notyet' },
      ],
    },
    give: {
      you: ['Here you go.'],
      route: (p) => {
        const has = p.inventory.has(1927) && p.inventory.has(1944) && p.inventory.has(1933);
        return has ? 'complete' : 'missing';
      },
    },
    missing: {
      npc: ['You still need a bucket of milk, an egg and a pot of flour.'],
      next: '',
    },
    complete: {
      npc: ['You have brought everything! Thank you so much!'],
      action: ({ player }) => {
        player.inventory.remove(1927, 1);
        player.inventory.remove(1944, 1);
        player.inventory.remove(1933, 1);
        player.sendInventory();
        setQuest(player, 'cooks_assistant', 2);
        player.addXp(Skill.COOKING, 300);
        player.inventory.add(1891, 1);
        player.sendInventory();
        player.message('Quest complete: Cook\'s Assistant! You gain 300 Cooking experience.');
      },
      next: 'done',
    },
    notyet: { you: ['Not yet.'], npc: ['Please hurry, the Duke will be furious!'], next: '' },
    done: {
      npc: ['Thank you again for helping me with the cake.', 'Feel free to use my range whenever you like.'],
      next: '',
    },
  },

  aereck: {
    start: {
      route: (p) => {
        const stage = questStage(p, 'restless_ghost');
        if (stage >= 2) return 'done';
        if (stage === 1) return 'progress';
        return 'intro';
      },
    },
    intro: {
      npc: ['Hello there. Welcome to the church of Saradomin.'],
      options: [
        { label: 'Can you tell me about the graveyard?', next: 'graveyard' },
        { label: 'Just passing through.', next: 'bye' },
      ],
    },
    graveyard: {
      you: ['Can you tell me about the graveyard?'],
      npc: [
        'Ah, a terrible business. A ghost has appeared among the graves,',
        'and it frightens away all my parishioners.',
        'Would you be willing to investigate for me?',
      ],
      options: [
        { label: 'Yes, I will help.', next: 'accept' },
        { label: 'No, ghosts scare me.', next: 'bye' },
      ],
    },
    accept: {
      you: ['Yes, I will help.'],
      npc: ['Bless you! Take this amulet - it will let you speak to the dead.'],
      action: ({ player }) => {
        setQuest(player, 'restless_ghost', 1);
        player.inventory.add(1856, 1);
        player.sendInventory();
        player.message('You have started the quest: The Restless Ghost.');
      },
      next: '',
    },
    progress: { npc: ['Have you spoken with the poor spirit yet?'], next: '' },
    done: { npc: ['The graveyard is peaceful once more. Thank you, adventurer.'], next: '' },
    bye: { you: ['Just passing through.'], next: '' },
  },

  guide: {
    start: {
      npc: ['Greetings, adventurer. Welcome to Lumbridge!'],
      options: [
        { label: 'How do I fight?', next: 'combat' },
        { label: 'Where can I train my skills?', next: 'skills' },
        { label: 'Where is the bank?', next: 'bank' },
      ],
    },
    combat: {
      you: ['How do I fight?'],
      npc: [
        'Right-click a monster and choose Attack.',
        'The combat tab lets you pick an attack style -',
        'accurate trains Attack, aggressive trains Strength',
        'and defensive trains Defence.',
      ],
      next: '',
    },
    skills: {
      you: ['Where can I train my skills?'],
      npc: [
        'There are trees all around Lumbridge for Woodcutting,',
        'a mine in the swamp to the south,',
        'and fishing spots along the River Lum to the east.',
      ],
      next: '',
    },
    bank: {
      you: ['Where is the bank?'],
      npc: ['There is a bank on the top floor of this very castle.', 'Draynor Village and Al Kharid also have banks.'],
      next: '',
    },
  },

  shopkeeper: {
    start: {
      npc: ['Can I help you at all?'],
      options: [
        { label: "Yes please. What are you selling?", next: 'trade' },
        { label: "No thanks.", next: 'bye' },
      ],
    },
    trade: {
      you: ['Yes please. What are you selling?'],
      action: ({ player, npc }) => {
        if (npc?.def.shop) {
          openShop(player, npc.def.shop);
        }
      },
      next: '',
    },
    bye: { you: ['No thanks.'], next: '' },
  },

  bob: {
    start: {
      npc: ['Hello, welcome to Bob\'s Brilliant Axes!'],
      options: [
        { label: 'Let me see your wares.', next: 'trade' },
        { label: 'No thanks.', next: 'bye' },
      ],
    },
    trade: {
      you: ['Let me see your wares.'],
      action: ({ player }) => {
        openShop(player, 'bobsaxes');
      },
      next: '',
    },
    bye: { you: ['No thanks.'], next: '' },
  },

  banker: {
    start: {
      npc: ['Good day. How may I help you?'],
      options: [
        { label: 'I would like to access my bank account, please.', next: 'bank' },
        { label: 'What is this place?', next: 'about' },
      ],
    },
    bank: {
      you: ['I would like to access my bank account, please.'],
      action: ({ player }) => {
        openBank(player);
      },
      next: '',
    },
    about: {
      you: ['What is this place?'],
      npc: ['This is a branch of the Bank of Gielinor.', 'We have branches in many towns.'],
      next: '',
    },
  },

  fred: {
    start: {
      route: (p) => {
        const stage = questStage(p, 'sheep_shearer');
        if (stage >= 2) return 'done';
        if (stage === 1) return 'progress';
        return 'intro';
      },
    },
    intro: {
      npc: ['Baaaa. Stupid sheep.'],
      options: [
        { label: 'What is wrong?', next: 'wrong' },
        { label: 'Nice sheep you have there.', next: 'bye' },
      ],
    },
    wrong: {
      you: ['What is wrong?'],
      npc: [
        'These sheep will not shear themselves!',
        'Bring me 20 balls of wool and I will make it worth your while.',
      ],
      options: [
        { label: 'I will do it.', next: 'accept' },
        { label: 'Sounds like hard work.', next: 'bye' },
      ],
    },
    accept: {
      you: ['I will do it.'],
      npc: ['Good! Shear the sheep and spin the wool at a spinning wheel.'],
      action: ({ player }) => {
        setQuest(player, 'sheep_shearer', 1);
        player.message('You have started the quest: Sheep Shearer.');
      },
      next: '',
    },
    progress: {
      npc: ['Have you got my 20 balls of wool?'],
      options: [
        { label: 'Yes, here they are.', next: 'give' },
        { label: 'Not yet.', next: 'bye' },
      ],
    },
    give: {
      you: ['Yes, here they are.'],
      route: (p) => (p.inventory.count(1759) >= 20 ? 'complete' : 'missing'),
    },
    missing: { npc: ['That is not 20 balls of wool!'], next: '' },
    complete: {
      npc: ['Wonderful! Here is your payment.'],
      action: ({ player }) => {
        player.inventory.remove(1759, 20);
        player.inventory.add(995, 60);
        player.sendInventory();
        setQuest(player, 'sheep_shearer', 2);
        player.addXp(Skill.CRAFTING, 150);
        player.message('Quest complete: Sheep Shearer!');
      },
      next: '',
    },
    done: { npc: ['Thanks again for shearing those sheep.'], next: '' },
    bye: { you: ['Maybe later.'], next: '' },
  },

  millie: {
    start: {
      npc: ['Hello. This is the Lumbridge windmill.'],
      options: [
        { label: 'How do I make flour?', next: 'flour' },
        { label: 'Nice mill.', next: 'bye' },
      ],
    },
    flour: {
      you: ['How do I make flour?'],
      npc: ['Pick some grain from the wheat field,', 'then put it in the hopper upstairs.', 'Bring a pot to collect the flour.'],
      next: '',
    },
    bye: { you: ['Nice mill.'], next: '' },
  },

  doomsayer: {
    start: {
      npc: ['Beware, adventurer! Danger lurks everywhere!'],
      options: [
        { label: 'What kind of danger?', next: 'danger' },
        { label: 'You need to relax.', next: 'bye' },
      ],
    },
    danger: {
      you: ['What kind of danger?'],
      npc: ['Goblins across the river! Giant rats in the swamp!', 'Skeletons in Draynor Manor! Be careful out there.'],
      next: '',
    },
    bye: { you: ['You need to relax.'], next: '' },
  },

  aggie: {
    start: {
      npc: ['Hello dearie. Would you like a nice dye?'],
      options: [
        { label: 'Not right now.', next: 'bye' },
        { label: 'What can you make?', next: 'dyes' },
      ],
    },
    dyes: { you: ['What can you make?'], npc: ['Red, yellow and blue dye,', 'if you bring me the right ingredients.'], next: '' },
    bye: { you: ['Not right now.'], next: '' },
  },

  ned: {
    start: {
      npc: ['Ahoy there! I am Ned, an old sailor.'],
      options: [
        { label: 'Can you make me a rope?', next: 'rope' },
        { label: 'Good day to you.', next: 'bye' },
      ],
    },
    rope: {
      you: ['Can you make me a rope?'],
      npc: ['Bring me four balls of wool and I will spin you a rope.'],
      action: ({ player }) => {
        if (player.inventory.count(1759) >= 4) {
          player.inventory.remove(1759, 4);
          player.inventory.add(954, 1);
          player.sendInventory();
          player.message('Ned twists the wool into a sturdy rope.');
        }
      },
      next: '',
    },
    bye: { you: ['Good day to you.'], next: '' },
  },

  wiseoldman: {
    start: {
      npc: ['Hello there. I am the Wise Old Man of Draynor.'],
      options: [
        { label: 'Any advice for an adventurer?', next: 'advice' },
        { label: 'Just saying hello.', next: 'bye' },
      ],
    },
    advice: {
      you: ['Any advice for an adventurer?'],
      npc: [
        'Always bring food when you fight.',
        'Bury the bones you find - it trains your Prayer.',
        'And never venture north without a plan.',
      ],
      next: '',
    },
    bye: { you: ['Just saying hello.'], next: '' },
  },

  zeke: {
    start: {
      npc: ['Welcome to Zeke\'s Superior Scimitars!'],
      options: [
        { label: 'Show me your scimitars.', next: 'trade' },
        { label: 'Maybe later.', next: 'bye' },
      ],
    },
    trade: {
      you: ['Show me your scimitars.'],
      action: ({ player }) => {
        openShop(player, 'scimitars');
      },
      next: '',
    },
    bye: { you: ['Maybe later.'], next: '' },
  },

  ellis: {
    start: {
      npc: ['Greetings. I can tan hides into leather for one coin each.'],
      options: [
        { label: 'Tan my hides, please.', next: 'tan' },
        { label: 'No thank you.', next: 'bye' },
      ],
    },
    tan: {
      you: ['Tan my hides, please.'],
      action: ({ player }) => {
        const hides = player.inventory.count(1739);
        if (hides === 0) {
          player.message('You have no cowhides to tan.');
          return;
        }
        if (player.inventory.count(995) < hides) {
          player.message('You do not have enough coins.');
          return;
        }
        player.inventory.remove(995, hides);
        player.inventory.remove(1739, hides);
        player.inventory.add(1741, hides);
        player.sendInventory();
        player.message(`Ellis tans ${hides} hide${hides === 1 ? '' : 's'} for you.`);
      },
      next: '',
    },
    bye: { you: ['No thank you.'], next: '' },
  },

  karim: {
    start: {
      npc: ['Would you like to buy a nice kebab? Only one coin!'],
      options: [
        { label: 'Yes please.', next: 'buy' },
        { label: 'No thanks.', next: 'bye' },
      ],
    },
    buy: {
      you: ['Yes please.'],
      action: ({ player }) => {
        if (player.inventory.count(995) < 1) {
          player.message('You do not have enough coins.');
          return;
        }
        if (player.inventory.freeSlots() === 0) {
          player.message('Your inventory is full.');
          return;
        }
        player.inventory.remove(995, 1);
        player.inventory.add(1971, 1);
        player.sendInventory();
        player.message('You buy a kebab.');
      },
      next: '',
    },
    bye: { you: ['No thanks.'], next: '' },
  },

  silk: {
    start: {
      npc: ['Fine silk, only three coins a roll!'],
      options: [
        { label: 'I will take one.', next: 'buy' },
        { label: 'Not today.', next: 'bye' },
      ],
    },
    buy: {
      you: ['I will take one.'],
      action: ({ player }) => {
        if (player.inventory.count(995) < 3) {
          player.message('You do not have enough coins.');
          return;
        }
        player.inventory.remove(995, 3);
        player.inventory.add(950, 1);
        player.sendInventory();
      },
      next: '',
    },
    bye: { you: ['Not today.'], next: '' },
  },

  borderguard: {
    start: {
      npc: ['The toll for passing into Al Kharid is 10 gold coins.'],
      options: [
        { label: 'Here is my toll.', next: 'pay' },
        { label: 'That is too expensive.', next: 'bye' },
      ],
    },
    pay: {
      you: ['Here is my toll.'],
      action: ({ player }) => {
        if (player.inventory.count(995) < 10) {
          player.message('You do not have 10 coins.');
          return;
        }
        player.inventory.remove(995, 10);
        player.sendInventory();
        player.message('You pay the toll. The gate is open.');
      },
      npc: ['Thank you. On you go.'],
      next: '',
    },
    bye: { you: ['That is too expensive.'], next: '' },
  },

  monk: {
    start: {
      npc: ['Peace be with you, traveller.'],
      next: '',
    },
  },
};

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

/**
 * Nodes are normalised so each one has exactly one "screen": either the
 * player speaking, the NPC speaking, or a list of options. A node that
 * declares both `you` and `npc` is split into two chained screens.
 */
interface FlatNode {
  speaker: 'you' | 'npc' | 'options' | 'route';
  lines?: string[];
  options?: { label: string; next: string; when?: (p: Player) => boolean }[];
  next: string;
  action?: (ctx: DialogueContext) => void;
  route?: (p: Player) => string | undefined;
}

const FLAT: Record<string, Record<string, FlatNode>> = {};

function flatten(scriptKey: string): Record<string, FlatNode> {
  const existing = FLAT[scriptKey];
  if (existing) return existing;
  const script = SCRIPTS[scriptKey];
  const out: Record<string, FlatNode> = {};
  for (const [key, node] of Object.entries(script)) {
    const npcKey = `${key}$npc`;
    if (node.route) {
      out[key] = { speaker: 'route', next: node.next ?? '', action: node.action, route: node.route };
      continue;
    }
    if (node.you?.length) {
      const hasNpc = !!node.npc?.length;
      out[key] = {
        speaker: 'you',
        lines: node.you,
        next: hasNpc ? npcKey : node.options ? `${key}$opt` : node.next ?? '',
        action: node.action,
      };
      if (hasNpc) {
        out[npcKey] = { speaker: 'npc', lines: node.npc!, next: node.options ? `${key}$opt` : node.next ?? '' };
      }
      if (node.options) out[`${key}$opt`] = { speaker: 'options', options: node.options, next: '' };
      continue;
    }
    if (node.npc?.length) {
      out[key] = {
        speaker: 'npc',
        lines: node.npc,
        next: node.options ? `${key}$opt` : node.next ?? '',
        action: node.action,
      };
      if (node.options) out[`${key}$opt`] = { speaker: 'options', options: node.options, next: '' };
      continue;
    }
    if (node.options) {
      out[key] = { speaker: 'options', options: node.options, next: '', action: node.action };
      continue;
    }
    out[key] = { speaker: 'route', next: node.next ?? '', action: node.action };
  }
  FLAT[scriptKey] = out;
  return out;
}

export function startDialogue(world: World, player: Player, npc: Npc): void {
  const key = npc.def.dialogue;
  if (!key || !SCRIPTS[key]) {
    player.message('This person has nothing to say to you.');
    return;
  }
  player.dialogue = { script: key, stage: 0, npcIndex: npc.index, data: { node: 'start' } };
  showNode(world, player, 'start');
}

function showNode(world: World, player: Player, key: string, depth = 0): void {
  const state = player.dialogue;
  if (!state || depth > 12) {
    player.closeInterface();
    return;
  }
  if (!key) {
    player.closeInterface();
    return;
  }
  const nodes = flatten(state.script);
  const node = nodes[key];
  if (!node) {
    player.closeInterface();
    return;
  }
  const npc = state.npcIndex !== undefined ? world.npcs[state.npcIndex] ?? null : null;
  node.action?.({ world, player, npc });
  state.data = { node: key };

  switch (node.speaker) {
    case 'route': {
      const target = node.route?.(player) ?? node.next;
      showNode(world, player, target, depth + 1);
      return;
    }
    case 'you':
      player.openInterface = 'dialogue';
      player.send({ t: 'dialogue', entity: { kind: 'player', name: player.username }, lines: node.lines ?? [] });
      return;
    case 'npc':
      player.openInterface = 'dialogue';
      player.send({
        t: 'dialogue',
        entity: { kind: 'npc', id: npc?.def.id, name: npc?.def.name ?? '' },
        lines: node.lines ?? [],
      });
      return;
    case 'options': {
      const visible = (node.options ?? []).filter((o) => !o.when || o.when(player));
      player.openInterface = 'dialogue';
      player.send({
        t: 'dialogue',
        entity: { kind: 'plain' },
        lines: [],
        options: visible.map((o) => o.label),
        title: 'Select an Option',
      });
      return;
    }
  }
}

/** Called when the player clicks "Click here to continue" or an option. */
export function advanceDialogue(world: World, player: Player, option?: number): void {
  const state = player.dialogue;
  if (!state) return;
  const nodes = flatten(state.script);
  const key = (state.data?.node as string) ?? 'start';
  const node = nodes[key];
  if (!node) {
    player.closeInterface();
    return;
  }
  if (node.speaker === 'options') {
    const visible = (node.options ?? []).filter((o) => !o.when || o.when(player));
    const chosen = option !== undefined ? visible[option] : undefined;
    if (!chosen) return;
    showNode(world, player, chosen.next);
    return;
  }
  showNode(world, player, node.next);
}

export function itemName(id: number): string {
  return itemDef(id)?.name ?? 'nothing';
}


