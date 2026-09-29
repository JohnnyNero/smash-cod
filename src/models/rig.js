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
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { phaseU } from './choreo.js';

const glow = (color, opacity) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
});

const IDS = ['pikachu', 'charizard', 'blastoise', 'venusaur', 'gengar', 'lucario'];
const GLTFS = {};

// Per-model fixes for the older (unanimated) files: Pikachu's lies Z-up.
const FIX = { pikachu: { rotX: -Math.PI / 2 } };

// Where the hit lands inside each attack clip (fraction of its length), so clips can be
// time-warped to put that moment on the move's first active frame.
const IMPACT = { physical: 0.38, special: 0.34 };

const EXTRA_CLIPS = { charizard: 'charizard_clips.json' };

// Charizard's battle clips all hover in the air (it battles on the wing in Sword/Shield). On the
// ground it uses its field clips (standing idle, walk) and the hovering ones are lowered onto
// the floor by this much (Waist height, model units); its extra air jumps use the fly clip.
const HOVER = { charizard: { drop: 0.69, ground: ['idle_ground', 'idle_alt_ground', 'walk', 'happy', 'angry', 'drowse', 'sleep'] } };
// Quick grounded normals that would cram a whole flying tackle clip into a few frames: these
// stand on the ground idle and are posed entirely by the procedural choreography instead.
const CLIPLESS = { charizard: new Set(['jab', 'ftilt', 'utilt', 'dtilt', 'grab', 'throwF', 'throwB', 'throwU', 'throwD', 'claw']) };

export const useRigs = () => {
  const p = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  return p.get('models') !== 'procedural' && p.get('style') !== 'lowpoly';
};

export async function preloadRigs() {
  if (!useRigs()) return;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(IDS.map((id) => loader.loadAsync(`./models/${id}.glb`)
    .then(async (g) => {
      // Extra clips pulled from the full Sword/Shield set (e.g. Charizard's grounded idle and fly).
      if (EXTRA_CLIPS[id]) {
        try {
          const list = await (await fetch(`./models/${EXTRA_CLIPS[id]}`)).json();
          for (const j of list) g.animations.push(THREE.AnimationClip.parse(j));
        } catch (e) { console.warn('extra clips failed', id, e); }
      }
      stripRootMotion(g);
      GLTFS[id] = g;
    })
    .catch((e) => console.warn('model failed, using procedural', id, e))));
}

export const hasRig = (id) => !!GLTFS[id];

// Game clips move the whole body (attacks lunge a metre or more). Our physics owns horizontal
// position, so pin the root bones' x/z to their first frame; vertical hops stay.
function stripRootMotion(gltf) {
  for (const clip of gltf.animations || []) {
    for (const tr of clip.tracks) {
      if (!/^(Origin|Waist|trOrigin|trWaist)\.position$/.test(tr.name)) continue;
      const v = tr.values;
      const x0 = v[0];
      const z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
  }
}

const stripName = (n) => n.replace(/_\d+$/, '');

// Which bones take a share of each joint's rotation (first match wins per slot).
const CHAINS = {
  torso: [[['Spine1', 'Spine'], 0.6], [['Spine2'], 0.4]],
  head: [[['Neck1', 'Neck'], 0.25], [['Neck2'], 0.2], [['Neck3'], 0.15], [['Head'], 0.6]],
  // Shoulders take a share of arm swings so the whole arm moves, not just from the socket.
  armL: [[['LShoulder'], 0.25], [['LArm'], 0.75]], armR: [[['RShoulder'], 0.25], [['RArm'], 0.75]],
  jaw: [[['Jaw'], 1]],
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
// Seconds of lag per bone along floppy chains (a wave travels down tails, ears, locks, wings).
const LAG = { tail: 0.045, earL: 0.04, earR: 0.04, lockL: 0.05, lockR: 0.05, wingL: 0.035, wingR: 0.035 };

// Gengar has no spine: its whole body leans from the hips.
const TORSO_FALLBACK = [[['Hips', 'Waist'], 0.5]];

const tq = new THREE.Quaternion();
const tq2 = new THREE.Quaternion();
const tq3 = new THREE.Quaternion();
const tq4 = new THREE.Quaternion();
const te2 = new THREE.Euler();
const te = new THREE.Euler();
const ID = new THREE.Quaternion();

// Build the rigged body for a CreatureModel. Returns the parts object creature.js expects.
export function buildRig(model, id, colors, makeMat) {
  const src = GLTFS[id];
  const scene = cloneSkinned(src.scene);
  // Animated (Sword/Shield) models carry real clips; the older files are posed procedurally.
  const animated = (src.animations || []).length > 4;
  const fix = new THREE.Group();
  if (!animated && FIX[id]?.rotX) fix.rotation.x = FIX[id].rotX;
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
    if (/^(tr)?TailA/.test(dominantBone(o))) {
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
    let k = 0;
    for (const [names, weight] of chain) {
      const bone = names.map((n) => bones[side('tr' + n)] || bones[side(n)]).find(Boolean);
      if (!bone || drivers.some((d) => d.bone === bone)) continue;
      const P = bone.parent ? restWorld(bone.parent) : new THREE.Quaternion();
      // Follow-through: each further bone of a floppy chain lags a little behind the last.
      // Floppy chains also get a per-bone spring wobble that grows toward the tip.
      const jig = LAG[joint] ? { x: 0, vx: 0, z: 0, vz: 0, reach: k + 1 } : null;
      const lag = (LAG[joint] || 0) * k++;
      drivers.push({ bone, dummy, weight, lag, jig, P, Pinv: P.clone().invert(), qRest: bone.quaternion.clone(), C: new THREE.Quaternion() });
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
  if (animated) {
    // The clips animate wings and locks; just keep the tail flame flickering.
    const flameBone = bones.TailA01 || bones.trTailA01;
    extra = { update() { if (flameBone) flameBone.scale.set(0.9 + Math.random() * 0.15, 0.85 + Math.random() * 0.35, 0.9 + Math.random() * 0.15); } };
  } else if (id === 'charizard' && dummies.wingL) {
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

  // Rest corrections: arms hang down (and a little out) instead of a T/A pose. (Not needed when
  // clips pose the arms.)
  const quad = id === 'venusaur';
  for (const [arm, fore] of animated ? [] : [['armL', 'LForeArm'], ['armR', 'RForeArm']]) {
    const d = drivers.find((x) => x.dummy === dummies[arm] && stripName(x.bone.name) === side(arm === 'armL' ? 'LArm' : 'RArm'));
    const f = bones[side(fore)];
    if (!d || !f) continue;
    const dir = posOf(f).sub(posOf(d.bone)).normalize();
    const target = quad ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(Math.sign(dir.x) * 0.3, -1, 0.08).normalize();
    if (dir.angleTo(target) > 0.35) d.C.setFromUnitVectors(dir, target);
  }

  // A bone below a rest-corrected bone (the forearm under a T-posed arm we dropped to hang) must
  // bend in the corrected frame, not the original T-pose frame, or an elbow "bend" about x just
  // twists a sideways forearm along its own length. Ccorr = corrections of driven ancestors.
  for (const d of drivers) {
    const acc = new THREE.Quaternion();
    for (let b = d.bone.parent; b; b = b.parent) {
      const up = drivers.find((x) => x.bone === b);
      if (up && up.C.w < 0.9999) acc.premultiply(up.C);
    }
    d.Cacc = acc;
    d.CaccInv = acc.clone().invert();
  }

  // Joints creature.js animates.
  for (const name of ['hips', 'torso', 'head', 'armL', 'armR', 'elbowL', 'elbowR', 'legL', 'legR', 'kneeL', 'kneeR', 'tail', 'earL', 'earR', 'jaw']) {
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

  // ---- clips (animated models)
  const mixer = animated ? new THREE.AnimationMixer(scene) : null;
  const clipByName = {};
  for (const c of src.animations || []) clipByName[c.name] = c;
  const actions = {};
  let cur = null;
  let curName = '';
  const has = (n) => !!clipByName[n];
  const play = (name, { loop = true, fade = 0.15, timeScale = 1 } = {}) => {
    if (!has(name)) name = 'idle';
    if (!has(name)) return null;
    const a = actions[name] || (actions[name] = mixer.clipAction(clipByName[name]));
    if (curName !== name) {
      a.reset();
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !loop;
      a.paused = false;
      a.enabled = true;
      a.setEffectiveWeight(1);
      a.play();
      if (cur) a.crossFadeFrom(cur, fade, false);
      cur = a;
      curName = name;
    }
    a.timeScale = timeScale;
    return a;
  };
  // Attack clip for a move: physical clips for normals, special ones for specials; the second
  // variant (if the species has one) for smashes, aerials and up/down specials, for variety.
  const attackClip = (v) => {
    // Stat-boosting moves (Swords Dance, Nasty Plot…) roar or glare instead of striking.
    if (v.anim === 'setup') return has('angry') ? 'angry' : 'roar';
    if (v.special) return (v.slot === 'up' || v.slot === 'down') && has('attack_special2') ? 'attack_special2' : 'attack_special';
    const alt = v.anim && /smash|air/.test(v.anim);
    return alt && has('attack_physical2') ? 'attack_physical2' : 'attack_physical';
  };
  let idleFor = 0;
  const hover = animated ? HOVER[id] : null;
  const clipless = (v) => !!(animated && CLIPLESS[id] && v.state === 'attack' && v.grounded && CLIPLESS[id].has(v.anim));
  const waist = hover ? (scene.getObjectByName('Waist') || scene.getObjectByName('trWaist')) : null;
  let dropK = 0;
  const selectClip = (v, dt = 0) => {
    const a = pickClip(v, dt);
    if (waist) {
      // Grounded in a hovering clip: lower it onto the floor.
      const want = v.grounded && curName && !hover.ground.includes(curName) ? 1 : 0;
      dropK += (want - dropK) * Math.min(1, dt * 14);
    }
    return a;
  };
  const pickClip = (v, dt = 0) => {
    const run = Math.abs(v.vx) / (v.runSpeed || 8);
    if (model.appearT < 1) return play(has('roar') ? 'roar' : 'idle', { loop: false, fade: 0.05 });
    if (v.faint) return play(has('faint') ? 'faint' : 'hurt', { loop: false, fade: 0.2 });
    if (v.victory) return play(has('happy') ? 'happy' : 'roar', { loop: true, fade: 0.25 });
    if (v.taunt) {
      const name = has(v.taunt) ? v.taunt : has('happy') ? 'happy' : 'roar';
      const a = play(name, { loop: false, fade: 0.12 });
      // Fit the clip to the taunt's length.
      if (a) a.timeScale = Math.max(0.8, a.getClip().duration / 1.25);
      return a;
    }
    // Frozen solid: the pose stops dead. Fully paralyzed: a stuttering flinch.
    if (v.state === 'frozen') { if (cur) cur.timeScale = 0; return cur; }
    if (v.state === 'paralyzed') return play('hurt', { loop: true, fade: 0.04, timeScale: Math.random() < 0.5 ? 0 : 1.5 });
    const idle = v.state === 'ground' && !v.dash && run <= 0.08;
    idleFor = idle ? idleFor + dt : 0;
    if (hover) {
      // Charizard: grounded idle/walk/run on its feet; flying on its extra jumps and Fly.
      const airborne = !v.grounded && ['air', 'helpless'].includes(v.state);
      if (v.state === 'attack' && v.anim === 'fly') return play('fly', { fade: 0.1 });
      if (airborne && v.airJump && v.vy > -2) return play('fly', { fade: 0.12, timeScale: 1.2 });
      if (v.state === 'ground') {
        if (v.dash || run > 0.72) return play('walk', { timeScale: Math.max(1.3, Math.min(2.4, run * 2.2)), fade: 0.12 });
        if (run > 0.08 && !v.skid) return play('walk', { timeScale: Math.max(0.6, Math.min(1.6, run / 0.45)), fade: 0.15 });
        if (idleFor > 6 && has('idle_alt_ground')) {
          const a = play('idle_alt_ground', { loop: false, fade: 0.3 });
          if (a && a.time >= a.getClip().duration - 0.05) idleFor = -Math.random() * 5;
          return a;
        }
        return play('idle_ground', { fade: 0.25 });
      }
      if (v.grounded && ['shield', 'holding', 'switching', 'getup'].includes(v.state)) return play('idle_ground', { fade: 0.15 });
    }
    switch (v.state) {
      case 'attack': {
        if (clipless(v)) return play('idle_ground', { fade: 0.08 });
        const name = attackClip(v);
        const a = play(name, { loop: false, fade: 0.06 });
        if (a) {
          // Time-warp the clip so its impact lands on the move's first active frame.
          const D = a.getClip().duration;
          const imp = (v.special ? IMPACT.special : IMPACT.physical) * D;
          const [A, B] = (v.hits || [[0.3, 0.5]])[0];
          const u = v.charging ? 0.3 : phaseU(v.p, A, B);
          a.paused = true;
          a.time = u < 0.4 ? (u / 0.4) * imp : imp + ((u - 0.4) / 0.6) * (D * 0.98 - imp);
        }
        return a;
      }
      case 'hitstun': case 'held': return play('hurt', { loop: false, fade: 0.05 });
      case 'shieldbreak': return play(has('drowse') ? 'drowse' : 'hurt', { loop: true });
      case 'sleep': return play(has('sleep') ? 'sleep' : has('drowse') ? 'drowse' : 'idle', { loop: true, fade: 0.3 });
      case 'jumpsquat': case 'landlag': case 'getup': return play('land', { loop: false, fade: 0.05 });
      case 'ground':
        if (v.dash || run > 0.72) return play('run', { timeScale: Math.max(0.75, Math.min(1.5, run * 1.05)), fade: 0.12 });
        if (run > 0.08 && !v.skid) return play('walk', { timeScale: Math.max(0.6, Math.min(1.6, run / 0.45)), fade: 0.15 });
        // Standing still a while: an idle fidget now and then (the alternate wait clip).
        if (idleFor > 5 && has('idle_alt')) {
          const a = play('idle_alt', { loop: false, fade: 0.3 });
          if (a && a.time >= a.getClip().duration - 0.05) idleFor = -Math.random() * 4;
          return a;
        }
        return play('idle', { fade: 0.2 });
      default: return play('idle', { fade: 0.15 }); // air, shield, ledge, dodge, holding...
    }
  };
  // Parents first, so offsets compose down the hierarchy.
  const depth = (b) => { let n = 0; for (let x = b; x; x = x.parent) n++; return n; };
  if (animated) drivers.sort((a, b) => depth(a.bone) - depth(b.bone));
  const qb = new THREE.Quaternion();
  const qbInv = new THREE.Quaternion();
  const pw = new THREE.Quaternion();
  const pwInv = new THREE.Quaternion();

  return {
    rig: true,
    clips: animated,
    flyJumps: !!hover, // air jumps fly (clip) instead of flipping
    clipless,
    feet,
    allFours: id === 'pikachu' && !animated, // the real run clip is already on all fours
    // Bone at the business end of a limb (motion trails).
    limb(name) {
      const pick = (...ns) => ns.map((n) => bones[side('tr' + n)] || bones[side(n)] || bones[n]).find(Boolean) || null;
      switch (name) {
        case 'handR': return pick('RHand', 'RForeArm');
        case 'handL': return pick('LHand', 'LForeArm');
        case 'footR': return pick('RFoot', 'RLeg');
        case 'footL': return pick('LFoot', 'LLeg');
        case 'head': return pick('Head');
        case 'tail': return pick('Tail7', 'Tail6', 'Tail5', 'Tail4', 'Tail3', 'Tail2', 'Tail1', 'Tail');
        default: return null;
      }
    },
    extra,
    update(v, t, dt, springs) { if (extra) extra.update(v, t, dt, springs); },
    quadruped: quad,
    bones,
    drivers,
    // After creature.js has posed the joints: write them onto the bones.
    // excite: the body's forward/vertical acceleration and turn rate, which set the springs going.
    retarget(dt = 1 / 60, excite = null, view = null) {
      if (mixer && view) {
        // Bones a clip doesn't animate keep whatever they were last frame, so put every driven
        // bone back to rest first; otherwise the offsets below would stack up frame after frame
        // (the rotation spins away and drifts off unit length, blowing the mesh up).
        for (const d of drivers) d.bone.quaternion.copy(d.qRest);
        selectClip(view, dt);
        mixer.update(dt);
        if (waist && dropK > 0.001) waist.position.y -= hover.drop * dropK;
        model.body.getWorldQuaternion(qb);
        qbInv.copy(qb).invert();
      }
      // Keep a short history of each joint's rotation for the lagging chain bones.
      for (const dm of Object.values(dummies)) {
        const h = dm.userData.hist || (dm.userData.hist = []);
        for (const e of h) e.age += dt;
        const e = h.length > 24 ? h.pop() : { q: new THREE.Quaternion(), age: 0 };
        e.q.setFromEuler(dm.rotation);
        e.age = 0;
        h.unshift(e);
      }
      for (const d of drivers) {
        if (d.lag > 0) {
          const h = d.dummy.userData.hist;
          let e = h[h.length - 1];
          for (const x of h) if (x.age >= d.lag) { e = x; break; }
          tq3.copy(e.q);
        } else {
          te.copy(d.dummy.rotation);
          tq3.setFromEuler(te);
        }
        if (d.jig && excite && dt > 0) {
          // Underdamped spring per bone: kicked by acceleration (up/down swing) and turning
          // (sideways whip); farther bones along the chain swing more.
          const j = d.jig;
          const h = Math.min(dt, 1 / 30);
          const kick = 0.35 + 0.2 * j.reach;
          j.vx += (-140 * j.x - 9 * j.vx + (-excite.ay * 0.0022 - excite.ax * 0.0016) * kick) * h;
          j.vz += (-140 * j.z - 9 * j.vz + (excite.yawV * 0.06 + excite.ax * 0.0006) * kick) * h;
          j.x = Math.max(-0.6, Math.min(0.6, j.x + j.vx * h));
          j.z = Math.max(-0.6, Math.min(0.6, j.z + j.vz * h));
          te2.set(j.x, 0, j.z);
          tq4.setFromEuler(te2);
          tq3.premultiply(tq4);
        }
        // (slerpQuaternions copies its first argument into the target before reading the
        // second, so the target must not also be an input.)
        if (d.weight !== 1) tq.slerpQuaternions(ID, tq3, d.weight);
        else tq.copy(tq3);
        if (mixer) {
          // On top of the clip pose: rotate the bone by R about its pivot in model axes.
          // local' = pw⁻¹ · (Qb R Qb⁻¹) · pw · local
          d.bone.parent.getWorldQuaternion(pw);
          pwInv.copy(pw).invert();
          tq.premultiply(qb).multiply(qbInv);
          tq2.copy(pwInv).multiply(tq).multiply(pw);
          d.bone.quaternion.premultiply(tq2).normalize();
          continue;
        }
        // bone = P⁻¹ · (Cacc⁻¹ · R · Cacc) · C · P · qRest
        tq.premultiply(d.CaccInv).multiply(d.Cacc);
        tq2.copy(d.Pinv).multiply(tq).multiply(d.C).multiply(d.P).multiply(d.qRest);
        d.bone.quaternion.copy(tq2);
      }
    },
  };
}
