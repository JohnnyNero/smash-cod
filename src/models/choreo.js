// Signature attack choreography: short keyframed poses per species, built from each Pokémon's
// body (tails, jaws, claws, shells) instead of one generic punch/kick for everyone.
//
// Time is in "phase space" u, so keys line up with the move's real frame data whatever its
// length: u 0→0.4 is startup (wind-up), 0.4 is the first active frame (contact), 0.4→0.6 the
// active frames, 0.6→1 end lag (follow-through and recovery).
//
// A key is [u, pose, ease]: `ease` shapes the motion INTO that key: 'snap' (explosive, for the
// strike), 'smooth' (wind-ups, recoveries), 'back' (overshoots then settles), 'linear'.
// Pose: joint rotations [x, y, z] in model axes (model faces +z; -x swings a limb forward or up;
// torso/head +x leans/looks down; tail +x swings up; jaw +x opens; armL +z lifts it outward)
// plus body params: lunge (forward, x height), bodyY, rotX (flip), rotY (spin), curl, stretch,
// aura. Missing values are 0 (curl 1).

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const EASE = {
  snap: (x) => (x >= 1 ? 1 : 1 - 2 ** (-9 * x)) / (1 - 2 ** -9),
  smooth: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  back: (x) => { const c = 2.2; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; },
  linear: (x) => x,
};

// ---------------------------------------------------------------- archetypes
// W = wind-up (0.3), C = contact (0.4), F = end of active / follow-through (0.6), R = recovering.

const ARCH = {
  // Straight punch / palm: chamber the elbow, twist the hips, snap it out.
  punch: [
    [0.3, { armR: [0.5, 0, 0], elbowR: [-1.5, 0, 0], armL: [-0.6, 0, 0.2], elbowL: [-1.2, 0, 0], torso: [0, -0.4, 0], head: [0, 0.25, 0], legL: [-0.35, 0, 0], legR: [0.3, 0, 0], kneeL: [0.35, 0, 0], kneeR: [0.45, 0, 0], lunge: -0.03 }, 'smooth'],
    [0.4, { armR: [-1.75, 0, 0], elbowR: [-0.1, 0, 0], armL: [0.4, 0, 0.15], elbowL: [-1.3, 0, 0], torso: [0.18, 0.5, 0], head: [0.05, -0.25, 0], legL: [-0.45, 0, 0], legR: [0.35, 0, 0], kneeL: [0.3, 0, 0], kneeR: [0.2, 0, 0], lunge: 0.13 }, 'snap'],
    [0.6, { armR: [-1.85, 0, 0], elbowR: [-0.05, 0, 0], armL: [0.45, 0, 0.15], elbowL: [-1.3, 0, 0], torso: [0.22, 0.55, 0], head: [0.05, -0.28, 0], legL: [-0.45, 0, 0], legR: [0.35, 0, 0], kneeL: [0.3, 0, 0], lunge: 0.15 }, 'linear'],
    [1, {}, 'smooth'],
  ],
  // Headbutt: rear back, then drive the whole body forward head-first.
  headbutt: [
    [0.3, { torso: [-0.4, 0, 0], head: [-0.45, 0, 0], earL: [0.5, 0, 0], earR: [0.5, 0, 0], tail: [0.5, 0, 0], legL: [0.2, 0, 0], legR: [0.4, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], bodyY: -0.04, lunge: -0.06, stretch: -0.08 }, 'smooth'],
    [0.4, { torso: [0.7, 0, 0], head: [0.55, 0, 0], earL: [-0.6, 0, 0], earR: [-0.6, 0, 0], tail: [-0.5, 0, 0], legL: [-0.3, 0, 0], legR: [0.6, 0, 0], kneeR: [0.2, 0, 0], lunge: 0.22, stretch: 0.08 }, 'snap'],
    [0.6, { torso: [0.62, 0, 0], head: [0.5, 0, 0], earL: [-0.3, 0, 0], earR: [-0.3, 0, 0], tail: [-0.3, 0, 0], legL: [-0.3, 0, 0], legR: [0.55, 0, 0], lunge: 0.2 }, 'linear'],
    [1, {}, 'smooth'],
  ],
  // Tail whip: spin so the tail lashes forward, then spin back round to face the foe.
  tailwhip: [
    [0.3, { rotY: -0.45, tail: [0.2, 0, 0.6], torso: [0.15, 0, 0], legL: [-0.2, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0], bodyY: -0.03 }, 'smooth'],
    [0.4, { rotY: 2.7, tail: [0.35, 0, -0.9], torso: [0.25, 0, 0], head: [0, 0.4, 0], lunge: 0.06 }, 'snap'],
    [0.6, { rotY: 3.2, tail: [0.2, 0, -0.5], torso: [0.2, 0, 0], head: [0, 0.3, 0], lunge: 0.06 }, 'linear'],
    [0.9, { rotY: 6.283, tail: [0, 0, 0.3] }, 'smooth'],
    [1, { rotY: 6.283 }, 'smooth'],
  ],
  // Claw swipe: raise the claw high and rake it down across the front.
  claw: [
    [0.3, { armR: [-2.7, 0, -0.3], elbowR: [-0.7, 0, 0], armL: [-0.4, 0, 0.2], torso: [-0.25, -0.45, 0], head: [-0.15, 0.2, 0], legR: [0.3, 0, 0], kneeL: [0.35, 0, 0], kneeR: [0.4, 0, 0], jaw: [0.15, 0, 0] }, 'smooth'],
    [0.4, { armR: [0.35, 0, 0.25], elbowR: [-0.25, 0, 0], armL: [-0.8, 0, 0.3], torso: [0.45, 0.45, 0], head: [0.2, -0.2, 0], legL: [-0.4, 0, 0], legR: [0.3, 0, 0], kneeL: [0.4, 0, 0], lunge: 0.11, jaw: [0.35, 0, 0] }, 'snap'],
    [0.6, { armR: [0.6, 0, 0.3], elbowR: [-0.2, 0, 0], armL: [-0.6, 0, 0.3], torso: [0.5, 0.5, 0], head: [0.2, -0.2, 0], legL: [-0.4, 0, 0], legR: [0.3, 0, 0], kneeL: [0.4, 0, 0], lunge: 0.12 }, 'linear'],
    [1, {}, 'smooth'],
  ],
  // Roundhouse: chamber the knee high, snap the leg out while the hips turn over.
  roundhouse: [
    [0.3, { legR: [-1.1, 0, 0.2], kneeR: [1.9, 0, 0], legL: [0.1, 0, 0], kneeL: [0.35, 0, 0], torso: [-0.1, -0.35, 0], armL: [-0.7, 0, 0.3], elbowL: [-1.1, 0, 0], armR: [0.3, 0, -0.3], elbowR: [-1.1, 0, 0], bodyY: 0.02 }, 'smooth'],
    [0.4, { legR: [-1.65, 0, 0.35], kneeR: [0.05, 0, 0], legL: [0.2, 0, 0], kneeL: [0.2, 0, 0], torso: [-0.35, 0.45, 0], rotY: 0.35, armL: [0.3, 0, 0.5], armR: [0.5, 0, -0.5], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0], lunge: 0.09 }, 'snap'],
    [0.6, { legR: [-1.55, 0, 0.35], kneeR: [0.15, 0, 0], legL: [0.2, 0, 0], torso: [-0.3, 0.45, 0], rotY: 0.35, armL: [0.3, 0, 0.5], armR: [0.5, 0, -0.5], lunge: 0.09 }, 'linear'],
    [0.8, { legR: [-0.6, 0, 0], kneeR: [1.2, 0, 0], torso: [0, 0.1, 0] }, 'smooth'],
    [1, {}, 'smooth'],
  ],
  // Bite: rear the head back, then lunge and chomp (jaw open on the way in, shut on contact).
  bite: [
    [0.3, { head: [-0.55, 0, 0], torso: [-0.3, 0, 0], jaw: [0.25, 0, 0], legL: [0.25, 0, 0], legR: [0.25, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0], armL: [-0.3, 0, 0], armR: [-0.3, 0, 0], lunge: -0.08, bodyY: 0.02 }, 'smooth'],
    [0.37, { head: [0.1, 0, 0], torso: [0.3, 0, 0], jaw: [0.75, 0, 0], lunge: 0.12 }, 'linear'],
    [0.42, { head: [0.4, 0, 0], torso: [0.5, 0, 0], jaw: [0, 0, 0], legL: [-0.4, 0, 0], legR: [0.4, 0, 0], armL: [-0.6, 0, 0], armR: [-0.6, 0, 0], lunge: 0.26, stretch: 0.05 }, 'snap'],
    [0.6, { head: [0.35, 0, 0], torso: [0.45, 0, 0], jaw: [0.05, 0, 0], legL: [-0.4, 0, 0], legR: [0.4, 0, 0], armL: [-0.5, 0, 0], armR: [-0.5, 0, 0], lunge: 0.24 }, 'linear'],
    [1, {}, 'smooth'],
  ],
  // Stomp: rear up on the back legs, slam the front down (squash + shockwave).
  stomp: [
    [0.3, { torso: [-0.5, 0, 0], head: [-0.35, 0, 0], armL: [-1.0, 0, 0], armR: [-1.0, 0, 0], elbowL: [0.6, 0, 0], elbowR: [0.6, 0, 0], legL: [0.2, 0, 0], legR: [0.2, 0, 0], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0], bodyY: 0.12, jaw: [0.3, 0, 0] }, 'smooth'],
    [0.4, { torso: [0.35, 0, 0], head: [0.3, 0, 0], armL: [0.25, 0, 0], armR: [0.25, 0, 0], elbowL: [0.2, 0, 0], elbowR: [0.2, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], bodyY: -0.1, stretch: -0.14, jaw: [0.5, 0, 0] }, 'snap'],
    [0.6, { torso: [0.3, 0, 0], head: [0.25, 0, 0], armL: [0.2, 0, 0], armR: [0.2, 0, 0], kneeL: [0.55, 0, 0], kneeR: [0.55, 0, 0], bodyY: -0.08, stretch: -0.08, jaw: [0.2, 0, 0] }, 'linear'],
    [1, {}, 'smooth'],
  ],
  // Body slam: crouch and coil, then throw the whole weight forward.
  bodyslam: [
    [0.3, { torso: [-0.45, -0.3, 0], head: [-0.2, 0, 0], armL: [0.7, 0, 0.3], armR: [0.7, 0, -0.3], elbowL: [-0.9, 0, 0], elbowR: [-0.9, 0, 0], legL: [0.1, 0, 0], legR: [0.45, 0, 0], kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], bodyY: -0.08, lunge: -0.12, stretch: -0.1 }, 'smooth'],
    [0.4, { torso: [0.75, 0.2, 0], head: [0.3, 0, 0], armL: [-1.3, 0, 0.2], armR: [-1.3, 0, -0.2], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0], legL: [-0.5, 0, 0], legR: [0.7, 0, 0], kneeL: [0.4, 0, 0], lunge: 0.32, stretch: 0.08, jaw: [0.35, 0, 0], aura: 0.8 }, 'snap'],
    [0.6, { torso: [0.8, 0.2, 0], head: [0.3, 0, 0], armL: [-1.4, 0, 0.2], armR: [-1.4, 0, -0.2], legL: [-0.5, 0, 0], legR: [0.7, 0, 0], kneeL: [0.4, 0, 0], lunge: 0.34, aura: 0.4 }, 'linear'],
    [1, {}, 'smooth'],
  ],
  // Palm strike (Lucario's smash): both hands cocked at the hip, then driven out with aura.
  palm: [
    [0.3, { armL: [0.8, 0, 0.2], armR: [0.9, 0, -0.2], elbowL: [-1.7, 0, 0], elbowR: [-1.7, 0, 0], torso: [-0.3, -0.55, 0], head: [0, 0.3, 0], legL: [0.1, 0, 0], legR: [0.5, 0, 0], kneeL: [0.7, 0, 0], kneeR: [0.6, 0, 0], bodyY: -0.07, lunge: -0.1, aura: 0.4 }, 'smooth'],
    [0.4, { armL: [-1.25, 0, 0.1], armR: [-1.65, 0, -0.1], elbowL: [-0.25, 0, 0], elbowR: [0, 0, 0], torso: [0.35, 0.45, 0], head: [0.1, -0.3, 0], legL: [-0.65, 0, 0], legR: [0.55, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.1, 0, 0], lunge: 0.3, stretch: 0.05, aura: 1 }, 'snap'],
    [0.6, { armL: [-1.3, 0, 0.1], armR: [-1.7, 0, -0.1], elbowL: [-0.2, 0, 0], torso: [0.4, 0.5, 0], head: [0.1, -0.3, 0], legL: [-0.65, 0, 0], legR: [0.55, 0, 0], kneeL: [0.6, 0, 0], lunge: 0.32, aura: 0.6 }, 'linear'],
    [1, {}, 'smooth'],
  ],
  // Gengar's grin lunge: float up and back, then stretch forward jaws-first.
  grinlunge: [
    [0.3, { torso: [-0.6, 0, 0], head: [-0.4, 0, 0], armL: [-2.4, 0, 0.4], armR: [-2.4, 0, -0.4], elbowL: [-0.8, 0, 0], elbowR: [-0.8, 0, 0], bodyY: 0.1, lunge: -0.08, jaw: [0.3, 0, 0], stretch: 0.06 }, 'smooth'],
    [0.4, { torso: [0.85, 0, 0], head: [0.4, 0, 0], armL: [-0.5, 0, 0.8], armR: [-0.5, 0, -0.8], elbowL: [-0.2, 0, 0], elbowR: [-0.2, 0, 0], bodyY: 0, lunge: 0.36, stretch: 0.14, jaw: [0.75, 0, 0], aura: 0.9 }, 'snap'],
    [0.6, { torso: [0.8, 0, 0], head: [0.35, 0, 0], armL: [-0.5, 0, 0.8], armR: [-0.5, 0, -0.8], lunge: 0.34, stretch: 0.08, jaw: [0.6, 0, 0], aura: 0.5 }, 'linear'],
    [1, {}, 'smooth'],
  ],
  // Quick one-armed scratch.
  swipe: [
    [0.3, { armR: [-2.1, 0, -0.5], elbowR: [-0.9, 0, 0], torso: [-0.1, -0.35, 0], jaw: [0.2, 0, 0] }, 'smooth'],
    [0.4, { armR: [0.2, 0, 0.35], elbowR: [-0.3, 0, 0], torso: [0.3, 0.4, 0], lunge: 0.08, jaw: [0.35, 0, 0] }, 'snap'],
    [0.6, { armR: [0.35, 0, 0.35], torso: [0.3, 0.4, 0], lunge: 0.08 }, 'linear'],
    [1, {}, 'smooth'],
  ],
  // Toss the head (or flower) upward to hit above.
  headtoss: [
    [0.3, { head: [0.5, 0, 0], torso: [0.35, 0, 0], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0], bodyY: -0.08, stretch: -0.1, jaw: [0.1, 0, 0] }, 'smooth'],
    [0.4, { head: [-0.9, 0, 0], torso: [-0.45, 0, 0], armL: [-0.6, 0, 0], armR: [-0.6, 0, 0], bodyY: 0.08, stretch: 0.12, jaw: [0.55, 0, 0], tail: [0.8, 0, 0] }, 'snap'],
    [0.6, { head: [-0.85, 0, 0], torso: [-0.4, 0, 0], bodyY: 0.06, stretch: 0.05, jaw: [0.4, 0, 0], tail: [0.6, 0, 0] }, 'linear'],
    [1, {}, 'smooth'],
  ],
  // Spin in the shell (Blastoise): tuck, spin, pop back out.
  shellspin: [
    [0.3, { curl: 0.82, head: [0.4, 0, 0], armL: [-0.3, 0, 0.9], armR: [-0.3, 0, -0.9], kneeL: [1, 0, 0], kneeR: [1, 0, 0], bodyY: -0.05 }, 'smooth'],
    [0.4, { curl: 0.8, rotY: 3.2, head: [0.4, 0, 0], armL: [-0.3, 0, 1.2], armR: [-0.3, 0, -1.2], kneeL: [1, 0, 0], kneeR: [1, 0, 0], aura: 0.7 }, 'snap'],
    [0.6, { curl: 0.8, rotY: 9.4, head: [0.4, 0, 0], armL: [-0.3, 0, 1.2], armR: [-0.3, 0, -1.2], kneeL: [1, 0, 0], kneeR: [1, 0, 0], aura: 0.5 }, 'linear'],
    [0.85, { rotY: 12.566 }, 'smooth'],
    [1, { rotY: 12.566 }, 'smooth'],
  ],
};

// Heavier variants: bigger wind-up and follow-through for smash attacks.
function heavier(keys, k = 1.25, aura = 0.8) {
  return keys.map(([u, pose, ease]) => {
    const p = {};
    for (const [name, v] of Object.entries(pose)) p[name] = Array.isArray(v) ? v.map((x) => x * k) : name === 'curl' ? v : v * k;
    if (u > 0.35 && u < 0.7 && aura) p.aura = Math.max(p.aura || 0, aura);
    return [u, p, ease];
  });
}

// ---------------------------------------------------------------- per species
// anim name (from moves.js) -> choreography. Anything not listed uses the generic animation.
const CHOREO = {
  pikachu: { jab: ARCH.headbutt, ftilt: ARCH.tailwhip, fsmash: heavier(ARCH.headbutt, 1.3), utilt: ARCH.headtoss },
  charizard: { jab: ARCH.claw, ftilt: ARCH.tailwhip, fsmash: heavier(ARCH.bite, 1.2), dtilt: ARCH.claw, utilt: ARCH.headtoss },
  blastoise: { jab: ARCH.punch, ftilt: ARCH.bodyslam, fsmash: heavier(ARCH.bodyslam, 1.1), dsmash: ARCH.shellspin, utilt: ARCH.headtoss },
  venusaur: { jab: ARCH.bite, ftilt: ARCH.bite, fsmash: heavier(ARCH.bite, 1.25), dtilt: ARCH.stomp, dsmash: heavier(ARCH.stomp, 1.2), utilt: ARCH.headtoss },
  gengar: { jab: ARCH.swipe, ftilt: ARCH.claw, fsmash: ARCH.grinlunge, utilt: ARCH.headtoss },
  lucario: { jab: ARCH.punch, ftilt: ARCH.roundhouse, fsmash: ARCH.palm },
};

export const choreoFor = (species, anim) => (CHOREO[species] && CHOREO[species][anim]) || null;
export const CHOREO_LIST = CHOREO;

// Move progress p (0..1) and first/last active fractions -> phase space u.
export function phaseU(p, A, B) {
  A = Math.max(0.04, Math.min(0.9, A));
  B = Math.max(A + 0.01, Math.min(0.97, B));
  if (p < A) return 0.4 * (p / A);
  if (p < B) return 0.4 + 0.2 * ((p - A) / (B - A));
  return Math.min(1, 0.6 + 0.4 * ((p - B) / (1 - B)));
}

// Evaluate a choreography at u: returns { joint: [x, y, z], ...body params }.
export function evalChoreo(keys, u) {
  let prev = [0, {}, 'linear'];
  let next = keys[keys.length - 1];
  for (const k of keys) {
    if (k[0] <= u) prev = k;
    if (k[0] > u) { next = k; break; }
  }
  if (prev === next || u >= next[0]) next = prev;
  const span = next[0] - prev[0];
  const x = span > 0 ? clamp01((u - prev[0]) / span) : 1;
  const e = (EASE[next[2]] || EASE.smooth)(x);
  const out = {};
  const names = new Set([...Object.keys(prev[1]), ...Object.keys(next[1])]);
  for (const n of names) {
    const a = prev[1][n];
    const b = next[1][n];
    if (Array.isArray(a) || Array.isArray(b)) {
      const A = a || [0, 0, 0];
      const B = b || [0, 0, 0];
      out[n] = [A[0] + (B[0] - A[0]) * e, A[1] + (B[1] - A[1]) * e, A[2] + (B[2] - A[2]) * e];
    } else {
      const d = n === 'curl' ? 1 : 0;
      const A = a ?? d;
      const B = b ?? d;
      out[n] = A + (B - A) * e;
    }
  }
  return out;
}
