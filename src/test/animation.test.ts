import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BONE, actorMesh } from '../client/gl/actormodels.ts';
import { ANIM_DURATION, isQuadruped, poseFor, type Pose } from '../client/gl/animation.ts';
import { allNpcs } from '../shared/data/npcs.ts';

/** Bone indices that actually have geometry attached in a model. */
function bonesWithGeometry(model: string): Set<number> {
  const mesh = actorMesh(`test:${model}`, { model, colour: 0x808080, colour2: 0x404040 });
  const used = new Set<number>();
  for (let i = 0; i < mesh.bones.length; i++) used.add(mesh.bones[i]);
  return used;
}

/**
 * Bone indices a pose actually rotates or translates. The sine curves the poses
 * are built from land on values like 1e-16 at their endpoints, which is at rest.
 */
function bonesDrivenBy(pose: Pose): Set<number> {
  const driven = new Set<number>();
  for (let i = 0; i < pose.length; i++) {
    const rot = pose[i];
    if (!rot) continue;
    if (Object.values(rot).some((v) => typeof v === 'number' && Math.abs(v) > 1e-6)) driven.add(i);
  }
  return driven;
}

/** The pose halfway through the strike, which is where the extremes live. */
function attackPose(model: string, t = 0.35): Pose {
  return poseFor('attack', t, 0, isQuadruped(model));
}

const MODELS = [...new Set(allNpcs().map((d) => d.model))];

describe('quadruped classification', () => {
  it('recognises the four-legged models', () => {
    for (const model of ['cow', 'rat', 'spider', 'scorpion', 'bear', 'unicorn', 'chicken']) {
      assert.equal(isQuadruped(model), true, `${model} should be a quadruped`);
    }
  });

  it('leaves humanoids and scenery alone', () => {
    for (const model of ['human', 'goblin', 'wizard', 'skeleton', 'demon', 'fishspot']) {
      assert.equal(isQuadruped(model), false, `${model} should not be a quadruped`);
    }
    assert.equal(isQuadruped(undefined), false);
  });
});

describe('attack animations', () => {
  it('visibly moves every npc model', () => {
    for (const model of MODELS) {
      const driven = bonesDrivenBy(attackPose(model));
      // A root transform moves the whole model, so it always counts.
      if (driven.has(BONE.ROOT)) continue;
      const geometry = bonesWithGeometry(model);
      const moved = [...driven].filter((b) => geometry.has(b));
      assert.ok(moved.length > 0, `${model} does not move any of its own bones when attacking`);
    }
  });

  it('never drives the arm bones of a quadruped', () => {
    // ARM_L/ARM_R are reused for hind legs (spider) and pincers (scorpion),
    // and the humanoid pivots would fling them off the model.
    for (const model of MODELS.filter(isQuadruped)) {
      const driven = bonesDrivenBy(attackPose(model));
      assert.ok(!driven.has(BONE.ARM_L), `${model} drives ARM_L when attacking`);
      assert.ok(!driven.has(BONE.ARM_R), `${model} drives ARM_R when attacking`);
    }
  });

  it('still swings the right arm for humanoids', () => {
    const driven = bonesDrivenBy(attackPose('human'));
    assert.ok(driven.has(BONE.ARM_R));
  });

  it('returns to rest once the strike is over', () => {
    for (const model of ['human', 'cow']) {
      const settled = bonesDrivenBy(poseFor('attack', 1, 0, isQuadruped(model)));
      assert.equal(settled.size, 0, `${model} stays deformed after attacking`);
    }
  });
});

describe('ranged animations', () => {
  const drawHandAt = (t: number) => poseFor('bow', t, 0, false)[BONE.ARM_L];

  it('travels through a draw and a release rather than holding a pose', () => {
    const drawn = drawHandAt(0.55);
    const released = drawHandAt(1);
    assert.ok(drawn && released);
    // The string hand has to visibly move between full draw and release.
    assert.ok(Math.abs((drawn.rz ?? 0) - (released.rz ?? 0)) > 0.4, 'the draw hand barely moves');
  });

  it('holds the bow steady in the weapon hand', () => {
    for (const t of [0, 0.5, 1]) {
      const arm = poseFor('bow', t, 0, false)[BONE.ARM_R];
      assert.equal(arm?.rx, -1.5, 'the bow arm should not wobble mid-shot');
    }
  });

  it('winds a thrown weapon up and lets it go', () => {
    const wound = poseFor('throw', 0.4, 0, false)[BONE.ARM_R];
    const thrown = poseFor('throw', 1, 0, false)[BONE.ARM_R];
    assert.ok((wound?.rx ?? 0) < -1.5, 'the throwing arm should draw back behind the head');
    assert.ok((thrown?.rx ?? 0) > (wound?.rx ?? 0), 'the throwing arm should come forward');
  });
});

describe('flinch animation', () => {
  it('is a known animation with a duration', () => {
    assert.ok(ANIM_DURATION.block > 0);
  });

  it('visibly reacts for both body types', () => {
    for (const model of ['human', 'cow', 'spider']) {
      const pose = poseFor('block', 0.5, 0, isQuadruped(model));
      const driven = bonesDrivenBy(pose);
      const moved = driven.has(BONE.ROOT) || [...driven].some((b) => bonesWithGeometry(model).has(b));
      assert.ok(moved, `${model} does not react when hit`);
    }
  });

  it('starts and ends at rest so it can be replayed', () => {
    for (const t of [0, 1]) {
      assert.equal(bonesDrivenBy(poseFor('block', t, 0, false)).size, 0);
    }
  });
});
