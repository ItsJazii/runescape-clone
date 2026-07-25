/**
 * Side-effect entry point that registers every item definition.
 * `equipment.ts` adds all wearable items to the registry declared in
 * `items.ts`, so anything that looks items up by id must import this first.
 */

import './items.ts';
import './equipment.ts';

export * from './items.ts';
