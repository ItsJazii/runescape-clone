/** Bone poses for every character animation. */

import { BONE, BONE_PIVOTS, MAX_BONES } from './actormodels.ts';

export interface BoneRot {
  rx?: number;
  ry?: number;
  rz?: number;
  tx?: number;
  ty?: number;
  tz?: number;
}

export type Pose = (BoneRot | undefined)[];

/** How long one-shot animations last, in game ticks. */
export const ANIM_DURATION: Record<string, number> = {
  punch: 1,
  kick: 1,
  stab: 1,
  slash: 1,
  crush: 1,
  whip: 1,
  attack: 1,
  bow: 1,
  crossbow: 1,
  throw: 1,
  cast: 1.6,
  block: 1,
  death: 3,
  chop: 2,
  mine: 2,
  fishnet: 3,
  fishrod: 3,
  cook: 2,
  smith: 2,
  craft: 2,
  bury: 2,
  pickup: 1.2,
  eat: 2,
  pray: 3,
  teleport: 3,
  firemaking: 3,
};

const EMPTY: Pose = [];

/**
 * @param anim      animation name
 * @param t         progress, 0..1 for one-shot animations
 * @param cycle     continuous phase used by looping animations
 */
export function poseFor(anim: string, t: number, cycle: number, quadruped: boolean): Pose {
  const p: Pose = new Array(MAX_BONES).fill(undefined);

  switch (anim) {
    case 'walk':
    case 'run': {
      const speed = anim === 'run' ? 1.9 : 1.0;
      const amp = anim === 'run' ? 0.85 : 0.5;
      const s = Math.sin(cycle * Math.PI * 2 * speed);
      const s2 = Math.sin(cycle * Math.PI * 4 * speed);
      if (quadruped) {
        p[BONE.LEG_L] = { rx: s * amp * 0.8 };
        p[BONE.LEG_R] = { rx: -s * amp * 0.8 };
        p[BONE.HEAD] = { rx: s2 * 0.06 };
        p[BONE.TAIL] = { ry: s * 0.4 };
        p[BONE.ROOT] = { ty: Math.abs(s2) * 2 };
      } else {
        p[BONE.LEG_L] = { rx: s * amp };
        p[BONE.LEG_R] = { rx: -s * amp };
        p[BONE.ARM_L] = { rx: -s * amp * 0.8 };
        p[BONE.ARM_R] = { rx: s * amp * 0.8 };
        p[BONE.TORSO] = { ry: s * 0.08 };
        p[BONE.ROOT] = { ty: Math.abs(s2) * (anim === 'run' ? 5 : 2.5) };
        p[BONE.CAPE] = { rx: -0.2 - Math.abs(s) * 0.25 };
      }
      return p;
    }

    case 'idle': {
      const s = Math.sin(cycle * Math.PI * 2 * 0.35);
      p[BONE.TORSO] = { ty: s * 0.8 };
      p[BONE.ARM_L] = { rz: -0.05 + s * 0.02 };
      p[BONE.ARM_R] = { rz: 0.05 - s * 0.02 };
      p[BONE.HEAD] = { ry: Math.sin(cycle * 0.7) * 0.12 };
      if (quadruped) p[BONE.TAIL] = { ry: Math.sin(cycle * 1.6) * 0.25 };
      return p;
    }

    case 'punch':
    case 'attack': {
      const swing = Math.sin(Math.min(1, t) * Math.PI);
      p[BONE.ARM_R] = { rx: -swing * 1.9 };
      p[BONE.ARM_L] = { rx: swing * 0.4 };
      p[BONE.TORSO] = { ry: -swing * 0.3 };
      return p;
    }
    case 'kick': {
      const swing = Math.sin(Math.min(1, t) * Math.PI);
      p[BONE.LEG_R] = { rx: -swing * 1.5 };
      p[BONE.TORSO] = { rx: swing * 0.2 };
      return p;
    }
    case 'stab': {
      const swing = Math.sin(Math.min(1, t) * Math.PI);
      p[BONE.ARM_R] = { rx: -swing * 1.5, rz: -swing * 0.2 };
      p[BONE.WEAPON] = { rx: -swing * 1.5 - 0.5 };
      p[BONE.TORSO] = { ry: -swing * 0.35 };
      return p;
    }
    case 'slash':
    case 'whip': {
      const swing = Math.sin(Math.min(1, t) * Math.PI);
      p[BONE.ARM_R] = { rz: -swing * 1.5, rx: -swing * 0.7 };
      p[BONE.WEAPON] = { rz: -swing * 1.8, rx: -swing * 0.4 };
      p[BONE.TORSO] = { ry: -swing * 0.4 };
      return p;
    }
    case 'crush': {
      const swing = Math.sin(Math.min(1, t) * Math.PI);
      const lift = Math.sin(Math.min(1, t) * Math.PI * 0.5);
      p[BONE.ARM_R] = { rx: -2.4 * lift + swing * 1.4 };
      p[BONE.WEAPON] = { rx: -2.2 * lift + swing * 1.6 };
      p[BONE.TORSO] = { rx: swing * 0.25 };
      return p;
    }
    case 'bow':
    case 'crossbow':
    case 'throw': {
      const draw = Math.sin(Math.min(1, t) * Math.PI);
      p[BONE.ARM_L] = { rx: -1.45 };
      p[BONE.ARM_R] = { rx: -1.2 + draw * 0.5 };
      p[BONE.WEAPON] = { rx: -1.45, rz: 0.2 };
      p[BONE.TORSO] = { ry: 0.45 };
      return p;
    }
    case 'cast': {
      const raise = Math.sin(Math.min(1, t) * Math.PI);
      p[BONE.ARM_R] = { rx: -1.4 - raise * 0.7 };
      p[BONE.ARM_L] = { rx: -0.5 - raise * 0.4 };
      p[BONE.WEAPON] = { rx: -1.2 - raise * 0.4 };
      p[BONE.TORSO] = { rx: -raise * 0.15 };
      return p;
    }
    case 'block': {
      p[BONE.ARM_L] = { rx: -1.1 };
      p[BONE.SHIELD] = { rx: -0.7 };
      return p;
    }
    case 'death': {
      const fall = Math.min(1, t);
      const ease = fall * fall;
      p[BONE.ROOT] = { rx: ease * 1.5, ty: -ease * 12 };
      p[BONE.ARM_L] = { rx: ease * 0.9, rz: -ease * 0.6 };
      p[BONE.ARM_R] = { rx: ease * 0.9, rz: ease * 0.6 };
      p[BONE.HEAD] = { rx: -ease * 0.4 };
      return p;
    }
    case 'chop': {
      const s = Math.sin(t * Math.PI * 2);
      p[BONE.ARM_R] = { rx: -1.5 - s * 0.9 };
      p[BONE.ARM_L] = { rx: -1.1 - s * 0.7 };
      p[BONE.WEAPON] = { rx: -0.8 - s * 1.0 };
      p[BONE.TORSO] = { rx: 0.25 + s * 0.2, ry: -0.4 };
      return p;
    }
    case 'mine': {
      const s = Math.sin(t * Math.PI * 2);
      p[BONE.ARM_R] = { rx: -1.9 - s * 1.1 };
      p[BONE.ARM_L] = { rx: -1.5 - s * 0.9 };
      p[BONE.WEAPON] = { rx: -1.0 - s * 1.2 };
      p[BONE.TORSO] = { rx: 0.35 + s * 0.25 };
      return p;
    }
    case 'fishnet': {
      const s = Math.sin(t * Math.PI * 2);
      p[BONE.ARM_L] = { rx: -1.2 - s * 0.3 };
      p[BONE.ARM_R] = { rx: -1.2 + s * 0.3 };
      p[BONE.TORSO] = { rx: 0.2 };
      return p;
    }
    case 'fishrod': {
      const s = Math.sin(t * Math.PI * 2);
      p[BONE.ARM_L] = { rx: -1.0 };
      p[BONE.ARM_R] = { rx: -1.3 - s * 0.15 };
      p[BONE.WEAPON] = { rx: -1.1 - s * 0.1 };
      return p;
    }
    case 'cook':
    case 'craft': {
      const s = Math.sin(t * Math.PI * 2);
      p[BONE.ARM_L] = { rx: -1.1 - s * 0.25 };
      p[BONE.ARM_R] = { rx: -1.1 + s * 0.25 };
      p[BONE.TORSO] = { rx: 0.22 };
      return p;
    }
    case 'smith': {
      const s = Math.sin(t * Math.PI * 2);
      p[BONE.ARM_R] = { rx: -2.1 - s * 1.0 };
      p[BONE.ARM_L] = { rx: -1.0 };
      p[BONE.TORSO] = { rx: 0.3 };
      return p;
    }
    case 'bury':
    case 'pickup': {
      const bend = Math.sin(Math.min(1, t) * Math.PI);
      p[BONE.TORSO] = { rx: bend * 0.9 };
      p[BONE.ARM_L] = { rx: -bend * 0.7 };
      p[BONE.ARM_R] = { rx: -bend * 0.7 };
      p[BONE.HEAD] = { rx: -bend * 0.3 };
      return p;
    }
    case 'eat': {
      const bite = Math.sin(Math.min(1, t) * Math.PI);
      p[BONE.ARM_R] = { rx: -bite * 2.2 };
      p[BONE.HEAD] = { rx: -bite * 0.25 };
      return p;
    }
    case 'pray': {
      const s = Math.sin(t * Math.PI);
      p[BONE.ARM_L] = { rx: -1.3, rz: 0.5 };
      p[BONE.ARM_R] = { rx: -1.3, rz: -0.5 };
      p[BONE.TORSO] = { rx: 0.2 * s };
      p[BONE.HEAD] = { rx: 0.25 };
      return p;
    }
    case 'teleport': {
      const s = Math.min(1, t);
      p[BONE.ROOT] = { ry: s * Math.PI * 4, ty: s * 40 };
      p[BONE.ARM_L] = { rz: 1.1 };
      p[BONE.ARM_R] = { rz: -1.1 };
      return p;
    }
    case 'firemaking': {
      const s = Math.sin(t * Math.PI * 3);
      p[BONE.TORSO] = { rx: 0.7 };
      p[BONE.ARM_L] = { rx: -1.5 - s * 0.2 };
      p[BONE.ARM_R] = { rx: -1.5 + s * 0.2 };
      p[BONE.LEG_L] = { rx: 0.5 };
      p[BONE.LEG_R] = { rx: 0.5 };
      return p;
    }
    default:
      return EMPTY;
  }
}

/**
 * Builds the 14 bone matrices for an actor: world placement combined with
 * the animation pose (each bone rotates about its own pivot).
 */
export function buildBoneMatrices(
  out: Float32Array[],
  worldX: number,
  worldY: number,
  worldZ: number,
  facing: number,
  scale: number,
  pose: Pose,
): void {
  const cosF = Math.cos(facing);
  const sinF = Math.sin(facing);
  const root = pose[BONE.ROOT];
  const rootTy = root?.ty ?? 0;
  const rootRx = root?.rx ?? 0;
  const rootRy = root?.ry ?? 0;

  for (let i = 0; i < MAX_BONES; i++) {
    const m = out[i];
    const rot = i === BONE.ROOT ? undefined : pose[i];
    const [px, py, pz] = BONE_PIVOTS[i] ?? [0, 0, 0];

    // Local bone rotation about its pivot.
    let a = identityLocal(TMP_A);
    if (rot) {
      translateLocal(a, px, py, pz);
      if (rot.rx) rotateXLocal(a, rot.rx);
      if (rot.ry) rotateYLocal(a, rot.ry);
      if (rot.rz) rotateZLocal(a, rot.rz);
      translateLocal(a, -px, -py, -pz);
      if (rot.tx || rot.ty || rot.tz) translateLocal(a, rot.tx ?? 0, rot.ty ?? 0, rot.tz ?? 0);
    }

    // World transform: translate -> face -> root pose -> scale.
    const w = identityLocal(TMP_B);
    translateLocal(w, worldX, worldY + rootTy * scale, worldZ);
    rotateYLocal(w, facing + rootRy);
    if (rootRx) rotateXLocal(w, rootRx);
    scaleLocal(w, scale, scale, scale);
    mulLocal(m, w, a);
    void cosF;
    void sinF;
  }
}

/* Local 4x4 helpers operating on Float32Array(16) column-major matrices. */

const TMP_A = new Float32Array(16);
const TMP_B = new Float32Array(16);
const TMP_C = new Float32Array(16);

function identityLocal(m: Float32Array): Float32Array {
  m.fill(0);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function mulLocal(out: Float32Array, a: Float32Array, b: Float32Array): void {
  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
    TMP_C[i * 4] = b0 * a[0] + b1 * a[4] + b2 * a[8] + b3 * a[12];
    TMP_C[i * 4 + 1] = b0 * a[1] + b1 * a[5] + b2 * a[9] + b3 * a[13];
    TMP_C[i * 4 + 2] = b0 * a[2] + b1 * a[6] + b2 * a[10] + b3 * a[14];
    TMP_C[i * 4 + 3] = b0 * a[3] + b1 * a[7] + b2 * a[11] + b3 * a[15];
  }
  out.set(TMP_C);
}

const OP = new Float32Array(16);

function applyLocal(m: Float32Array): void {
  mulLocal(m, m, OP);
}

function translateLocal(m: Float32Array, x: number, y: number, z: number): void {
  identityLocal(OP);
  OP[12] = x;
  OP[13] = y;
  OP[14] = z;
  applyLocal(m);
}

function scaleLocal(m: Float32Array, x: number, y: number, z: number): void {
  identityLocal(OP);
  OP[0] = x;
  OP[5] = y;
  OP[10] = z;
  applyLocal(m);
}

function rotateXLocal(m: Float32Array, a: number): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  identityLocal(OP);
  OP[5] = c;
  OP[6] = s;
  OP[9] = -s;
  OP[10] = c;
  applyLocal(m);
}

function rotateYLocal(m: Float32Array, a: number): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  identityLocal(OP);
  OP[0] = c;
  OP[2] = -s;
  OP[8] = s;
  OP[10] = c;
  applyLocal(m);
}

function rotateZLocal(m: Float32Array, a: number): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  identityLocal(OP);
  OP[0] = c;
  OP[1] = s;
  OP[4] = -s;
  OP[5] = c;
  applyLocal(m);
}
