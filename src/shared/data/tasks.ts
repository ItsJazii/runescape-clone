/**
 * "Getting Started" tasks. RuneScape drops you into Lumbridge with no
 * instructions, which is bewildering if you have never played, so the quest
 * tab carries a short checklist of the things worth doing first. Completing
 * one is purely informational - there are no rewards and nothing is gated.
 */

export interface TaskDef {
  id: string;
  name: string;
  /** Shown under the name while the task is outstanding. */
  hint: string;
}

export const TASKS: TaskDef[] = [
  { id: 'talk', name: 'Talk to someone', hint: 'Left-click a person such as Hans in the castle courtyard.' },
  { id: 'walk', name: 'Explore Lumbridge', hint: 'Left-click the ground to walk, or click the minimap.' },
  { id: 'chop', name: 'Chop a tree', hint: 'You start with a bronze axe. Click a tree outside the castle.' },
  { id: 'fire', name: 'Light a fire', hint: 'Use your tinderbox on the logs in your inventory.' },
  { id: 'fish', name: 'Catch a fish', hint: 'Use the small net on a fishing spot in the River Lum.' },
  { id: 'cook', name: 'Cook something', hint: 'Use raw food on a fire or on the castle kitchen range.' },
  { id: 'mine', name: 'Mine some ore', hint: 'Take your pickaxe to the mine east of the river.' },
  { id: 'smith', name: 'Smelt a bar', hint: 'Copper and tin ore make a bronze bar at a furnace.' },
  { id: 'equip', name: 'Wear some equipment', hint: 'Left-click the bronze sword in your inventory to wield it.' },
  { id: 'kill', name: 'Defeat an enemy', hint: 'Chickens north-east of the castle are a gentle start.' },
  { id: 'loot', name: 'Pick up a drop', hint: 'Left-click the items an enemy leaves behind.' },
  { id: 'eat', name: 'Eat some food', hint: 'Left-click food in your inventory to restore hitpoints.' },
  { id: 'shop', name: 'Visit a shop', hint: 'Right-click the shop keeper in the general store and pick Trade.' },
  { id: 'bank', name: 'Use a bank', hint: 'Bank booths are upstairs in Lumbridge Castle.' },
  { id: 'spell', name: 'Cast a spell', hint: 'Open the Magic tab and click Wind Strike, then click an enemy.' },
  { id: 'pray', name: 'Use a prayer', hint: 'Open the Prayer tab and activate Thick Skin.' },
];

export const TASK_IDS = TASKS.map((t) => t.id);

export function taskById(id: string): TaskDef | undefined {
  return TASKS.find((t) => t.id === id);
}
