// Real Pokémon models (skinned glTF from github.com/Pokemon-3D-api/assets, game rips — this is a
// private hobby project) driven by our procedural animation.
//
// creature.js still computes every pose on a set of joint objects (hips, torso, head, armL/R,
// elbowL/R, legL/R, kneeL/R, tail, earL/R, ankles). For rigged models those joints are plain
// dummies; after each update the rotations are retargeted onto the skeleton's bones:
//   bone.quaternion = P⁻¹ · R · C · P · qRest
// where P is the bone's parent rest rotation in model space, qRest the bone's rest local rotation,
// R our joint rotation (in model axes: model faces +z, -x rotation swings a limb forward) and C a
// rest correction (e.g. drops T-posed arms to hang at the sides, which our poses assume).
// Chains (neck, spine, tail, ears) share a joint's rotation with falloff weights.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const glow = (color, opacity) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
});

const IDS = ['pikachu', 'charizard', 'blastoise', 'venusaur', 'gengar', 'lucario'];
const GLTFS = {};

// Per-model fixes: Pikachu's file lies Z-up.
const FIX = { pikachu: { rotX: -Math.PI / 2 } };

export const useRigs = () => {
  const p = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  return p.get('models') !== 'procedural' && p.get('style') !== 'lowpoly';
};

export async function preloadRigs() {
  if (!useRigs()) return;
  const loader = new GLTFLoader();
  await Promise.all(IDS.map((id) => loader.loadAsync(`./models/${id}.glb`)
    .then((g) => { GLTFS[id] = g; })
    .catch((e) => console.warn('model failed, using procedural', id, e))));
}

export const hasRig = (id) => !!GLTFS[id];

const stripName = (n) => n.replace(/_\d+$/, '');

// Which bones take a share of each joint's rotation (first match wins per slot).
const CHAINS = {
  torso: [[['Spine1', 'Spine'], 0.6], [['Spine2'], 0.4]],
  head: [[['Neck1', 'Neck'], 0.25], [['Neck2'], 0.2], [['Neck3'], 0.15], [['Head'], 0.6]],
  armL: [[['LArm'], 1]], armR: [[['RArm'], 1]],
  elbowL: [[['LForeArm'], 1]], elbowR: [[['RForeArm'], 1]],
  legL: [[['LThigh'], 1]], legR: [[['RThigh'], 1]],
  kneeL: [[['LLeg'], 1]], kneeR: [[['RLeg'], 1]],
  ankleL: [[['LFoot'], 1]], ankleR: [[['RFoot'], 1]],
  // Shares compound down a chain, so they sum to about 1.
  tail: [[['Tail1', 'Tail'], 0.3], [['Tail2'], 0.2], [['Tail3'], 0.15], [['Tail4'], 0.12], [['Tail5'], 0.1], [['Tail6'], 0.08], [['Tail7'], 0.05]],
  earL: [[['LEar1', 'LEar'], 0.8], [['LEar2'], 0.4], [['LEar3'], 0.3]],
  earR: [[['REar1', 'REar'], 0.8], [['REar2'], 0.4], [['REar3'], 0.3]],
  // Extras driven by species code below.
  wingL: [[['LFeeler1'], 0.7], [['LFeeler2'], 0.3]],
  wingR: [[['RFeeler1'], 0.7], [['RFeeler2'], 0.3]],
  lockL: [[['LFeelerB1'], 0.4], [['LFeelerB2'], 0.3], [['LFeelerB3'], 0.2], [['LFeelerB4'], 0.1]],
  lockR: [[['RFeelerB1'], 0.4], [['RFeelerB2'], 0.3], [['RFeelerB3'], 0.2], [['RFeelerB4'], 0.1]],
};
// Gengar has no spine: its whole body leans from the hips.
const TORSO_FALLBACK = [[['Hips', 'Waist'], 0.5]];

const tq = new THREE.Quaternion();
const tq2 = new THREE.Quaternion();
const te = new THREE.Euler();
const ID = new THREE.Quaternion();

// Build the rigged body for a CreatureModel. Returns the parts object creature.js expects.
export function buildRig(model, id, colors, makeMat) {
  const src = GLTFS[id];
  const scene = cloneSkinned(src.scene);
  const fix = new THREE.Group();
  if (FIX[id]?.rotX) fix.rotation.x = FIX[id].rotX;
  fix.add(scene);
  const wrap = new THREE.Group();
  wrap.add(fix);
  model.body.add(wrap);

  // Materials: the model's own (or toon when that style is on), registered for hit flashes.
  const matCache = new Map();
  // Meshes skinned mainly to flame bones (Charizard's TailA chain) become glowing fire.
  const flameMat = (m) => new THREE.MeshBasicMaterial({
    map: m.map || null, color: 0xff9a40, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
  const dominantBone = (o) => {
    const si = o.geometry.attributes.skinIndex;
    const sw = o.geometry.attributes.skinWeight;
    if (!si || !o.skeleton) return '';
    const counts = {};
    for (let i = 0; i < si.count; i++) {
      let best = 0;
      let bj = 0;
      for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > best) { best = sw.getComponent(i, k); bj = si.getComponent(i, k); }
      const n = stripName(o.skeleton.bones[bj].name);
      counts[n] = (counts[n] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  };
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (/^TailA/.test(dominantBone(o))) {
      o.material = flameMat(o.material);
      o.castShadow = false;
      o.frustumCulled = false;
      o.userData.sharedGeometry = true;
      return;
    }
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false; // skinned bounds don't follow the pose
    o.userData.sharedGeometry = true;
    const conv = (m) => {
      if (matCache.has(m)) return matCache.get(m);
      const t = makeMat(m);
      matCache.set(m, t);
      return t;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });

  // Bones by (suffix-stripped) name.
  const bones = {};
  scene.traverse((o) => { if (o.isBone) bones[stripName(o.name)] ??= o; });

  // Normalise: model height -> species height, feet on the floor, hips centred.
  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(fix);
  const s = model.h / Math.max(0.01, box.max.y - box.min.y);
  wrap.scale.setScalar(s);
  wrap.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(fix);
  const hipsBone = bones.Hips || bones.Waist;
  const hp = hipsBone ? hipsBone.getWorldPosition(new THREE.Vector3()) : box2.getCenter(new THREE.Vector3());
  wrap.position.set(-hp.x, -box2.min.y, -hp.z * 0.5);
  model.body.updateMatrixWorld(true);

  // Model-space rest rotation of a bone (relative to the body frame).
  const bodyInv = model.body.getWorldQuaternion(new THREE.Quaternion()).invert();
  const restWorld = (o) => bodyInv.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
  const posOf = (o) => model.body.worldToLocal(o.getWorldPosition(new THREE.Vector3()));

  // Which side is "L"? Our armL/legL is at +x; flip the mapping if the rig disagrees.
  let flip = false;
  if (bones.LThigh && bones.RThigh) flip = posOf(bones.LThigh).x < posOf(bones.RThigh).x;
  const side = (n) => (flip ? n.replace(/^L/, '§').replace(/^R/, 'L').replace(/^§/, 'R') : n);

  const drivers = [];
  const dummies = {};
  const addChain = (joint, chain) => {
    const dummy = dummies[joint] || (dummies[joint] = new THREE.Object3D());
    for (const [names, weight] of chain) {
      const bone = names.map((n) => bones[side(n)]).find(Boolean);
      if (!bone || drivers.some((d) => d.bone === bone)) continue;
      const P = bone.parent ? restWorld(bone.parent) : new THREE.Quaternion();
      drivers.push({ bone, dummy, weight, P, Pinv: P.clone().invert(), qRest: bone.quaternion.clone(), C: new THREE.Quaternion() });
    }
  };
  for (const [joint, chain] of Object.entries(CHAINS)) addChain(joint, chain);
  if (!drivers.some((d) => d.dummy === dummies.torso)) addChain('torso', TORSO_FALLBACK);
  // Normalise each chain so its shares add up to the whole rotation, however many of the listed
  // bones this rig actually has (ears keep a little extra floppiness).
  for (const [joint, dummy] of Object.entries(dummies)) {
    const ds = drivers.filter((d) => d.dummy === dummy);
    const sum = ds.reduce((a, d) => a + d.weight, 0);
    // A torso that falls back to the root bone (Hips/Waist) leans legs and all, so only half.
    const want = joint.startsWith('ear') ? 1.2 : joint === 'torso' && ds.length === 1 && /^(Hips|Waist)/.test(ds[0].bone.name) ? 0.5 : 1;
    if (sum > 0) for (const d of ds) d.weight *= want / sum;
  }

  // Species extras.
  let extra = null;
  if (id === 'charizard' && dummies.wingL) {
    const flameBone = bones.TailA01;
    extra = {
      update(v, t, dt, springs) {
        // Wings flap hard in the air, idle-breathe on the ground, and lag behind motion.
        const flying = !v.grounded;
        const flap = Math.sin(t * (flying ? 12 : 3)) * (flying ? 0.45 : 0.1) + springs.ear.x * 0.3;
        dummies.wingL.rotation.set(-springs.tail.x * 0.2, 0, flap);
        dummies.wingR.rotation.set(-springs.tail.x * 0.2, 0, -flap);
        // The tail flame flickers.
        if (flameBone) flameBone.scale.set(0.9 + Math.random() * 0.15, 0.85 + Math.random() * 0.35, 0.9 + Math.random() * 0.15);
      } };
  } else if (id === 'lucario' && dummies.lockL) {
    extra = {
      update(v, t, dt, springs) {
        // Aura appendages stream behind when running and bounce with the body.
        const k = -Math.min(0.6, Math.abs(v.vx) * 0.05) - springs.tail.x * 0.8;
        dummies.lockL.rotation.set(k + Math.sin(t * 3) * 0.1, 0, 0);
        dummies.lockR.rotation.set(k + Math.sin(t * 3 + 1) * 0.1, 0, 0);
      },
    };
  }

  // Rest corrections: arms hang down (and a little out) instead of a T/A pose.
  const quad = id === 'venusaur';
  for (const [arm, fore] of [['armL', 'LForeArm'], ['armR', 'RForeArm']]) {
    const d = drivers.find((x) => x.dummy === dummies[arm]);
    const f = bones[side(fore)];
    if (!d || !f) continue;
    const dir = posOf(f).sub(posOf(d.bone)).normalize();
    const target = quad ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(Math.sign(dir.x) * 0.3, -1, 0.08).normalize();
    if (dir.angleTo(target) > 0.35) d.C.setFromUnitVectors(dir, target);
  }

  // Joints creature.js animates.
  for (const name of ['hips', 'torso', 'head', 'armL', 'armR', 'elbowL', 'elbowR', 'legL', 'legR', 'kneeL', 'kneeR', 'tail', 'earL', 'earR']) {
    model.j[name] = dummies[name] || (dummies[name] = new THREE.Object3D());
  }

  // Ankles + segment lengths for the two-bone IK in creature.js.
  const feet = [];
  for (const [leg, knee, ankle, T, K, F] of [['legL', 'kneeL', 'ankleL', 'LThigh', 'LLeg', 'LFoot'], ['legR', 'kneeR', 'ankleR', 'RThigh', 'RLeg', 'RFoot']]) {
    const t = bones[side(T)]; const k = bones[side(K)]; const f = bones[side(F)];
    if (!t || !k || !f) continue;
    const L1 = posOf(t).distanceTo(posOf(k));
    const L2 = posOf(k).distanceTo(posOf(f));
    const a = dummies[ankle];
    a.userData = { leg, knee, L1, L2 };
    feet.push(a);
  }

  return {
    rig: true,
    feet,
    allFours: false, // Pikachu's rig is weighted to the hips; the all-fours run needs its own pass
    extra,
    update(v, t, dt, springs) { if (extra) extra.update(v, t, dt, springs); },
    quadruped: quad,
    bones,
    drivers,
    // After creature.js has posed the joints: write them onto the bones.
    retarget() {
      for (const d of drivers) {
        te.copy(d.dummy.rotation);
        tq.setFromEuler(te);
        if (d.weight !== 1) tq.slerpQuaternions(ID, tq, d.weight);
        // bone = P⁻¹ · R · C · P · qRest
        tq2.copy(d.Pinv).multiply(tq).multiply(d.C).multiply(d.P).multiply(d.qRest);
        d.bone.quaternion.copy(tq2);
      }
    },
  };
}
