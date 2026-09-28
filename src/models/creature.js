// Procedural low-poly Pokémon with code-driven animation.
//
// Hierarchy: root (feet) > spinner (tumble / zip rotation around the body centre) > facer
// (turns to face left/right) > pivot (flips and spins around the centre) > body (bob) >
// joints built by a species builder (hips, torso, head, arms, legs, tail, ears).
// Models face +z; `facer` turns them to face +x or -x in the world. Limbs hang down, so a
// negative rotation.x swings a limb forward.

import * as THREE from 'three';
import { BUILDERS } from './species.js';
import { INK_LAYER, inkTargets } from '../ink.js';

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// 0 -> 1 across [a, b]
const ramp = (p, a, b) => clamp01((p - a) / (b - a));
const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;

// Attack timing from move progress p and the first/last active fraction [A, B]:
// a = anticipation (builds through startup, released as the strike begins),
// s = strike (snaps to 1 in the last few frames before A, holds, eases back after B),
// f = follow-through swell after contact. s0 is where the snap starts.
function strikeCurve(p, A, B) {
  A = Math.max(0.06, Math.min(0.9, A));
  B = Math.max(A, Math.min(0.97, B));
  const s0 = A - Math.min(A * 0.45, 0.1);
  let a = 0;
  let s = 0;
  if (p < s0) a = easeOutCubic(p / s0);
  else if (p < A) {
    const k = (p - s0) / (A - s0);
    a = 1 - k;
    s = easeOutCubic(k);
  } else if (p < B) s = 1;
  else s = 1 - easeInOutSine(clamp01((p - B) / Math.max(0.05, (1 - B) * 0.85)));
  const f = p >= A ? Math.sin(clamp01((p - A) / Math.max(0.05, 1 - A)) * Math.PI) : 0;
  return { a, s, f, s0 };
}

const JOINTS = ['hips', 'torso', 'head', 'armL', 'armR', 'legL', 'legR', 'tail', 'earL', 'earR', 'kneeL', 'kneeR', 'elbowL', 'elbowR'];

// Character look: 'toon' = cel-shaded with ink outlines (default), 'lowpoly' = faceted.
export const STYLE = new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('style') === 'lowpoly' ? 'lowpoly' : 'toon';

let toonRamp = null;
function toonGradient() {
  if (toonRamp) return toonRamp;
  const data = new Uint8Array([90, 170, 255]); // three bands: shadow, mid, lit
  toonRamp = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.needsUpdate = true;
  return toonRamp;
}
// Cel rim light: a crisp warm band along the silhouette (the sunset behind the stadium),
// which separates the characters from the background.
function addRim(m) {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      {
        float rim = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0);
        float band = smoothstep(0.7, 0.76, rim) * (0.35 + 0.65 * max(normal.y, 0.0));
        outgoingLight += vec3(1.0, 0.78, 0.55) * band * 0.2;
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'toonRim';
}

// A small spring for secondary motion (tails, ears, wings lagging behind the body).
class Spring {
  constructor(k = 140, c = 11) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  step(dt, target = 0) {
    this.v += (-(this.x - target) * this.k - this.v * this.c) * dt;
    this.x = Math.max(-1.2, Math.min(1.2, this.x + this.v * dt));
    return this.x;
  }
}

function tagTexture(text, css) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = css;
  g.strokeStyle = '#000';
  g.lineWidth = 6;
  g.font = 'bold 44px "Black Ops One", Impact, sans-serif';
  g.textAlign = 'center';
  g.strokeText(text, 64, 46);
  g.fillText(text, 64, 46);
  g.beginPath();
  g.moveTo(44, 60);
  g.lineTo(84, 60);
  g.lineTo(64, 88);
  g.closePath();
  g.stroke();
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function glowMat(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
}

export class CreatureModel {
  constructor({ species, colors, label }) {
    this.species = species;
    this.colors = colors;
    this.h = species.size.h;
    this.mats = [];
    this.root = new THREE.Group();
    this.spinner = new THREE.Group();
    this.spinner.position.y = this.h * 0.5;
    this.root.add(this.spinner);
    this.facer = new THREE.Group();
    this.facer.position.y = -this.h * 0.5;
    this.spinner.add(this.facer);
    this.pivot = new THREE.Group();
    this.pivot.position.y = this.h * 0.5;
    this.facer.add(this.pivot);
    this.body = new THREE.Group();
    this.body.position.y = -this.h * 0.5;
    this.pivot.add(this.body);

    this.j = {};
    this.parts = BUILDERS[species.model](this, colors);
    this.eyes = [];
    this.body.traverse((o) => { if (o.userData.eye) this.eyes.push(o); });
    if (STYLE === 'toon') this.addOutlines();
    const limbs = [['legL', 'kneeL'], ['legR', 'kneeR']];
    if (this.parts.quadruped) limbs.push(['armL', 'elbowL'], ['armR', 'elbowR']);
    this.feet = limbs.map(([l, k]) => this.makeAnkle(l, k)).filter(Boolean);
    this.springs = { tail: new Spring(120, 9), tailZ: new Spring(90, 8), ear: new Spring(160, 10), bob: new Spring(200, 16) };
    this.prevV = { x: 0, y: 0 };
    this.blinkT = 2 + Math.random() * 3;
    this.appearT = 1;
    this.recallT = 1;
    this.rest = {};
    for (const name of JOINTS) {
      const o = this.j[name];
      if (o) this.rest[name] = o.rotation.clone();
    }
    this.cur = {};
    for (const name of JOINTS) this.cur[name] = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };

    const r = Math.max(this.h, species.size.w) * 0.62;
    this.shieldMat = glowMat(colors.main, 0.35);
    this.shield = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), this.shieldMat);
    this.shield.position.y = this.h * 0.5;
    this.shield.visible = false;
    this.root.add(this.shield);

    this.auraMat = glowMat(colors.accent, 0.35);
    this.aura = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.85, 1), this.auraMat);
    this.aura.visible = false;
    this.pivot.add(this.aura);

    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTexture(label, colors.css), depthTest: false, transparent: true }));
    this.tag.scale.set(0.8, 0.6, 1);
    this.tag.position.y = this.h + 0.75;
    this.tag.renderOrder = 10;
    this.root.add(this.tag);

    this.yaw = Math.PI / 2;
    this.phase = 0;
    this.time = 0;
    this.flashAmount = -1;
    this.pv = { bodyY: 0, rotX: 0, rotY: 0, curl: 1, gait: 0, lean: 0, lunge: 0, stretch: 0, bobV: 0 };
  }

  // Species builders register materials through this so hit flashes reach every part.
  mat(color, o = {}) {
    const m = STYLE === 'toon'
      ? new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1 })
      : new THREE.MeshStandardMaterial({
        color, roughness: o.r ?? 0.7, metalness: o.m ?? 0.05, flatShading: true,
        emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1,
      });
    if (STYLE === 'toon') addRim(m);
    m.userData.baseEmissive = m.emissive.clone();
    m.userData.baseIntensity = m.emissiveIntensity;
    this.mats.push(m);
    return m;
  }

  // Ink outlines are drawn in screen space (src/ink.js) around everything on INK_LAYER.
  addOutlines() {
    this.body.traverse((o) => {
      if (o.isMesh && this.mats.includes(o.material)) o.layers.enable(INK_LAYER);
    });
    inkTargets.add(this);
  }

  // Gather the lowest parts of a leg (foot and toes) under an ankle pivot, so feet can stay
  // flat on the ground while the leg swings.
  makeAnkle(legName, kneeName) {
    const knee = this.j[kneeName];
    const leg = knee || this.j[legName];
    if (!leg) return null;
    const parts = leg.children.filter((c) => c.isMesh);
    if (parts.length < (knee ? 1 : 2)) return null;
    const minY = Math.min(...parts.map((c) => c.position.y));
    const foot = parts.filter((c) => c.position.y <= minY + 0.04);
    if (!knee && foot.length === parts.length) return null;
    const ankle = new THREE.Group();
    ankle.position.set(0, minY, 0);
    leg.add(ankle);
    for (const f of foot) {
      leg.remove(f);
      f.position.y -= minY;
      ankle.add(f);
    }
    // Segment lengths for two-bone IK (hip -> knee -> ankle).
    ankle.userData = { leg: legName, knee: knee ? kneeName : null, L1: knee ? -knee.position.y : 0, L2: -minY };
    return ankle;
  }

  // Poké Ball entrance: grow in from a white flash. Recall: shrink away in a red flash.
  appear() { this.appearT = 0; }
  recall() { this.recallT = 0; }
  get recalling() { return this.recallT < 1; }

  setFlash(amount, color) {
    const a = Math.round(amount * 20) / 20;
    const key = a + (color || '');
    if (key === this.flashKey) return;
    this.flashKey = key;
    const c = new THREE.Color(color ?? 0xffffff);
    for (const m of this.mats) {
      m.emissive.copy(m.userData.baseEmissive).lerp(c, a);
      m.emissiveIntensity = m.userData.baseIntensity * (1 - a) + a * 1.2;
    }
  }

  // v: view state from Game.fighterView.
  update(v, dt) {
    this.time += dt;
    const t = this.time;
    const o = {}; // joint offsets from rest pose
    for (const name of JOINTS) o[name] = { x: 0, y: 0, z: 0 };
    let bodyY = 0;
    let lunge = 0; // body shift forward (into the attack)
    let rotX = 0;
    let rotY = 0;
    let curl = 1;
    let aura = 0;
    let auraColor = null;
    let spin = null; // spinner z target; null = settle upright
    let stretch = 0; // squash (-) and stretch (+) along the vertical
    const pv = this.pv;
    const p = v.p;
    const sd = Math.min(dt, 1 / 30);
    const grounded = v.state === 'ground' || v.state === 'landlag' || v.state === 'jumpsquat';

    // ---- body acceleration drives lean and the secondary-motion springs
    let fwdAcc = 0;
    let ay = 0;
    if (sd > 0) {
      const ax = (v.vx - this.prevV.x) / sd;
      ay = (v.vy - this.prevV.y) / sd;
      this.prevV.x = v.vx;
      this.prevV.y = v.vy;
      fwdAcc = ax * v.facing;
    }

    // ---- locomotion: the stride is tied to distance travelled so feet don't skate
    const speed = Math.abs(v.vx);
    const run = Math.min(1, speed / (v.runSpeed || 8));
    pv.gait = damp(pv.gait, grounded && v.state === 'ground' ? (v.dash ? 1 : v.skid ? 0 : run) : 0, v.dash ? 30 : 9, dt);

    // Edge-triggered events: dash start (lean kick + smear), take-off (stretch), landing
    // (a spring impulse that sinks the body and rebounds).
    if (v.dash && !this.prevDash) { pv.lean += 0.3; pv.smear = 0.3; }
    this.prevDash = v.dash;
    if (this.prevState === 'jumpsquat' && v.state === 'air') this.takeoffT = 0.1;
    this.prevState = v.state;
    if (v.landSquash > (this.prevLand || 0) + 0.05) this.springs.bob.v -= 14 * v.landSquash;
    this.prevLand = v.landSquash;
    this.takeoffT = Math.max(0, (this.takeoffT || 0) - dt);
    pv.smear = Math.max(0, (pv.smear || 0) - dt * 3);
    const gait = pv.gait;
    if (grounded) {
      const before = Math.floor(this.phase / Math.PI);
      this.phase += (speed * dt) / (this.h * 0.55);
      if (Math.floor(this.phase / Math.PI) !== before && pv.gait > 0.45) this.footstep = true; // a foot plants
    }
    // Lean into acceleration, rock back when braking or turning around.
    const skid = v.state === 'ground' && v.vx * v.facing < -0.5 ? 1 : 0;
    pv.lean = damp(pv.lean, grounded ? Math.max(-0.35, Math.min(0.35, fwdAcc * 0.012)) - skid * 0.3 : 0, 8, dt);

    // ---- base pose from state
    if (grounded) {
      const ph = this.phase;
      const s = Math.sin(ph);
      const c = Math.cos(ph);
      const amp = gait * (0.5 + 0.55 * gait);
      // Legs swing through; the forward-swinging leg lifts a little higher.
      o.legL.x = s * amp - Math.max(0, -c) * 0.35 * gait;
      o.legR.x = -s * amp - Math.max(0, c) * 0.35 * gait;
      // Arms pump against the legs, bent forward more as speed builds.
      o.armL.x = -s * amp * 0.85 - 0.35 * gait;
      o.armR.x = s * amp * 0.85 - 0.35 * gait;
      o.armL.z = 0.12 * gait;
      o.armR.z = -0.12 * gait;
      // Knees fold as each leg swings forward and straighten as the foot plants; elbows stay
      // bent and pump with the arms.
      o.kneeL.x = gait * (0.18 + 1.15 * Math.max(0, -c));
      o.kneeR.x = gait * (0.18 + 1.15 * Math.max(0, c));
      if (this.parts.quadruped) {
        o.elbowL.x = gait * (0.15 + 0.9 * Math.max(0, c));
        o.elbowR.x = gait * (0.15 + 0.9 * Math.max(0, -c));
      } else {
        o.elbowL.x = -(0.55 + 0.25 * s) * gait;
        o.elbowR.x = -(0.55 - 0.25 * s) * gait;
      }
      const lean = 0.1 * gait + 0.28 * gait * gait + pv.lean;
      o.torso.x = lean;
      o.torso.y = s * 0.22 * gait; // shoulders twist against the hips
      o.torso.z = c * 0.05 * gait; // weight rolls from foot to foot
      // The head stays level and looks ahead, like a real runner.
      o.head.x = -lean * 0.75;
      o.head.y = -s * 0.14 * gait;
      o.head.z = -c * 0.04 * gait;
      o.earL.x = o.earR.x = -0.55 * gait;
      o.tail.x = -0.35 * gait;
      // Two bounces per stride: highest mid-stride, lowest as the legs pass.
      if (this.parts.allFours) {
        // Pikachu drops onto all fours at speed: body pitched forward, arms become front legs
        // in a bounding gait, head held up to look ahead.
        const q = Math.max(0, (gait - 0.55) / 0.45) ** 1.5;
        o.torso.x += 0.95 * q;
        o.head.x += -0.85 * q;
        o.armL.x = o.armL.x * (1 - q) + q * (-1.1 + Math.sin(ph + 0.6) * 0.9);
        o.armR.x = o.armR.x * (1 - q) + q * (-1.1 + Math.sin(ph + 0.9) * 0.9);
        o.legL.x = o.legL.x * (1 - q) + q * (0.35 + Math.sin(ph + Math.PI) * 0.8);
        o.legR.x = o.legR.x * (1 - q) + q * (0.35 + Math.sin(ph + Math.PI + 0.3) * 0.8);
        o.tail.x -= 1.2 * q; // counter the body pitch so the tail streams out behind
        o.torso.y *= 1 - q;
      }
      bodyY = (1 - Math.abs(c)) * 0.075 * gait - 0.02 * gait;
      stretch = (1 - Math.abs(c)) * 0.04 * gait - 0.02 * gait;
      const idle = 1 - Math.min(1, gait * 3);
      if (idle > 0 && v.state === 'ground') {
        // Ready stance: knees soft, breathing, weight shifting, glancing about.
        const br = Math.sin(t * 2.4);
        bodyY += idle * (-0.015 + br * 0.012);
        stretch += idle * br * 0.012;
        o.torso.x += idle * (0.08 + br * 0.03);
        o.torso.z += idle * Math.sin(t * 1.1) * 0.04;
        o.head.x += idle * (-0.06 - br * 0.02);
        o.head.y += idle * Math.sin(t * 0.45) * Math.max(0, Math.sin(t * 0.21)) * 0.5;
        o.head.z += idle * -Math.sin(t * 1.1) * 0.05;
        o.armL.x += idle * (-0.35 + br * 0.05);
        o.armR.x += idle * (-0.45 - br * 0.05);
        o.armL.z += idle * (0.12 + br * 0.04);
        o.armR.z += idle * (-0.12 - br * 0.04);
        o.legL.x += idle * -0.12;
        o.legR.x += idle * 0.12;
        if (!this.parts.quadruped) {
          o.elbowL.x += idle * (-0.7 + br * 0.06); // guard up
          o.elbowR.x += idle * (-0.85 - br * 0.06);
        }
        o.tail.z += idle * Math.sin(t * 1.6) * 0.15;
      }
      if (v.state === 'jumpsquat') { bodyY -= 0.12; stretch -= 0.1; o.armL.x = o.armR.x = 0.5; o.elbowL.x = o.elbowR.x = -0.3; o.torso.x += 0.25; }
      else if (v.state === 'landlag') { bodyY -= 0.08; o.torso.x += 0.25; o.armL.z = 0.5; o.armR.z = -0.5; }
      if (v.skid) {
        // Braking: lean back, front foot braced out ahead, arms thrown out for balance.
        o.torso.x = -0.4;
        o.head.x = 0.25;
        o.legL.x = -0.65; o.legR.x = 0.15;
        o.kneeL.x = 0.15; o.kneeR.x = 0.75;
        o.armL.x = -0.9; o.armR.x = -0.5;
        o.armL.z = 0.6; o.armR.z = -0.6;
        o.elbowL.x = o.elbowR.x = -0.3;
        o.tail.x = -0.5;
        bodyY = -0.07;
      }
    } else if (v.state === 'air' || v.state === 'helpless') {
      // Blend continuously from the rising tuck to the falling spread.
      const k = Math.max(-1, Math.min(1, v.vy / 12));
      const up = Math.max(0, k);
      const down = Math.max(0, -k);
      o.legL.x = -0.95 * up + 0.1 * down;
      o.legR.x = -0.35 * up + 0.35 * down;
      o.kneeL.x = 1.5 * up + 0.2 * down;
      o.kneeR.x = 0.9 * up + 0.45 * down;
      o.elbowL.x = o.elbowR.x = -0.5 * up - 0.25 * down;
      o.armL.x = -1.9 * up - 0.3 * down;
      o.armR.x = -1.6 * up - 0.5 * down;
      o.armL.z = 0.2 * up + 0.75 * down + Math.sin(t * 7) * 0.08 * down;
      o.armR.z = -0.2 * up - 0.75 * down - Math.sin(t * 7 + 1) * 0.08 * down;
      o.torso.x = 0.14 * Math.max(-1, Math.min(1, (v.vx * v.facing) / 6)) - 0.12 * up;
      o.head.x = -0.2 * up + 0.12 * down;
      o.tail.x = 0.4 * down - 0.3 * up;
      o.earL.x = o.earR.x = 0.35 * up - 0.3 * down;
      stretch = Math.min(0.14, Math.abs(v.vy) * 0.006) * (v.vy > 0 ? 1 : 0.6) + this.takeoffT * 1.5;
      if (v.flip >= 0) {
        // Double jump: a quick front flip, tucked tight.
        const kf = 1 - (1 - v.flip) ** 3;
        rotX = Math.PI * 2 * kf;
        const tuck = Math.sin(v.flip * Math.PI);
        curl = 1 - 0.18 * tuck;
        o.legL.x = o.legR.x = -1.3 * tuck;
        o.kneeL.x = o.kneeR.x = 1.9 * tuck; // cannonball
        o.armL.x = o.armR.x = -1.2 * tuck;
        o.elbowL.x = o.elbowR.x = -1.2 * tuck;
        stretch = 0;
      }
      if (v.state === 'helpless') {
        o.armL.x = o.armR.x = -2.8 + Math.sin(t * 6) * 0.2;
        o.torso.x = -0.25;
        o.legL.x = Math.sin(t * 6) * 0.3;
        o.legR.x = -Math.sin(t * 6) * 0.3;
        o.kneeL.x = 0.5 + Math.sin(t * 6) * 0.3;
        o.kneeR.x = 0.5 - Math.sin(t * 6) * 0.3;
        o.elbowL.x = o.elbowR.x = -0.2;
      }
    } else if (v.state === 'shield') {
      bodyY = -0.08;
      stretch = -0.05;
      o.armL.x = o.armR.x = -1.3;
      o.armL.z = 0.35; o.armR.z = -0.35;
      o.torso.x = 0.3;
      o.head.x = -0.2;
      o.legL.x = -0.3; o.legR.x = 0.3;
      o.elbowL.x = o.elbowR.x = -1.3; // arms crossed in front
    } else if (v.state === 'shieldbreak') {
      o.torso.x = -0.4 + Math.sin(t * 5) * 0.12;
      o.head.z = Math.sin(t * 3.5) * 0.35;
      o.head.x = 0.3;
      o.armL.z = 0.6; o.armR.z = -0.6;
      bodyY = Math.sin(t * 5) * 0.02;
    } else if (v.state === 'dodge') {
      if (v.dodge === 'roll') { curl = 0.8; spin = -v.facing * v.sf * 0.35; }
      else if (v.dodge === 'air') { rotY = v.sf * 0.5; o.armL.x = o.armR.x = -1.5; curl = 0.9; }
      else { o.torso.x = -0.35; bodyY = -0.06; o.armL.z = 0.5; o.armR.z = -0.5; }
    } else if (v.state === 'hitstun') {
      // Whip away from the hit, limbs trailing behind the launch.
      const back = v.vx * v.facing < 0 ? 1 : -0.6;
      o.torso.x = -0.55 * back - v.flash * 0.35 * back;
      o.head.x = -0.45 * back - v.flash * 0.3;
      o.armL.x = -2.3 + Math.sin(t * 9) * 0.35;
      o.armR.x = -2.5 + Math.cos(t * 8) * 0.35;
      o.armL.z = 0.5; o.armR.z = -0.5;
      o.legL.x = 0.4 + Math.sin(t * 7) * 0.35;
      o.legR.x = -0.2 - Math.sin(t * 7) * 0.35;
      o.kneeL.x = 0.6 + Math.sin(t * 7) * 0.4;
      o.kneeR.x = 0.9 - Math.sin(t * 7) * 0.4;
      o.elbowL.x = -0.4 - Math.sin(t * 9) * 0.3;
      o.elbowR.x = -0.6 - Math.cos(t * 8) * 0.3;
      o.tail.x = 0.8 * back;
      stretch = v.flash * 0.1;
    } else if (v.state === 'ledge') {
      o.armL.x = o.armR.x = -3.0;
      o.legL.x = -0.3 + Math.sin(t * 2.5) * 0.25;
      o.legR.x = -0.3 - Math.sin(t * 2.5) * 0.25;
      o.kneeL.x = 0.9 - Math.sin(t * 2.5) * 0.3;
      o.kneeR.x = 0.9 + Math.sin(t * 2.5) * 0.3;
      o.elbowL.x = o.elbowR.x = -0.35;
      o.torso.x = 0.1;
      o.head.x = -0.3;
    } else if (v.state === 'getup') {
      const k = easeOutCubic(p);
      o.armL.x = o.armR.x = -2.4 * (1 - k);
      o.legL.x = -1.1 * (1 - k);
      o.torso.x = 0.4 * Math.sin(k * Math.PI);
      bodyY = 0.08 * Math.sin(k * Math.PI);
    } else if (v.state === 'holding') {
      o.armL.x = o.armR.x = -1.5 + Math.sin(t * 4) * 0.05;
      o.torso.x = 0.2;
      o.legL.x = -0.3; o.legR.x = 0.3;
    } else if (v.state === 'sleep') {
      rotX = -Math.PI / 2; // lying on its back
      bodyY = -this.h * 0.3 + Math.sin(t * 2) * 0.02;
      stretch = Math.sin(t * 2) * 0.03;
      o.armL.z = 0.6; o.armR.z = -0.6;
      o.kneeL.x = 0.7; o.kneeR.x = 0.3;
      o.elbowL.x = o.elbowR.x = -0.9;
    } else if (v.state === 'held') {
      o.armL.x = -2.5 + Math.sin(t * 11) * 0.35;
      o.armR.x = -2.5 + Math.cos(t * 11) * 0.35;
      o.legL.x = Math.sin(t * 10) * 0.6;
      o.legR.x = -Math.sin(t * 10) * 0.6;
      o.kneeL.x = 0.6 + Math.sin(t * 10) * 0.5;
      o.kneeR.x = 0.6 - Math.sin(t * 10) * 0.5;
      o.head.z = Math.sin(t * 6) * 0.2;
    }

    // ---- attack animations. Each has a wind-up (a), a snap into the strike (s) timed to the
    // move's first active frame, a hold through the active frames, and an eased recovery;
    // f is a follow-through swell after the hit.
    if (v.state === 'attack' && v.anim) {
      const hits = v.hits || [[0.3, 0.5]];
      const [A, B] = hits[0];
      const k = strikeCurve(p, A, B);
      let a = v.charging ? 1 : k.a;
      const s = v.charging ? 0 : k.s;
      const f = v.charging ? 0 : k.f;
      if (v.charging) bodyY = Math.sin(t * 55) * 0.012;
      const sweep = (x0, x1) => x0 + (x1 - x0) * easeOutCubic(ramp(p, k.s0, B)); // spins and flips
      switch (v.anim) {
        case 'jab':
          o.armR.x = 0.6 * a - 1.9 * s;
          o.armL.x = -0.5 * a + 0.5 * s;
          o.torso.y = -0.35 * a + 0.5 * s;
          o.torso.x = 0.05 * a + 0.2 * s;
          o.head.y = 0.2 * a - 0.25 * s;
          o.elbowR.x = -1.5 * a - 0.9 * (1 - s) * (1 - a); // chambered, then punches straight
          o.elbowL.x = -1.0;
          o.legL.x = -0.35; o.legR.x = 0.3;
          o.kneeL.x = 0.25; o.kneeR.x = 0.35;
          lunge = 0.1 * s;
          break;
        case 'ftilt':
        case 'ledgeAttack':
          o.legR.x = -0.5 * a - 1.8 * s - 0.2 * f;
          o.kneeR.x = 1.7 * a + 0.1 * (1 - s); // knee chambers up, then the kick snaps out
          o.legL.x = 0.15 * s;
          o.kneeL.x = 0.3;
          o.elbowL.x = o.elbowR.x = -0.8;
          o.torso.x = 0.15 * a - 0.45 * s;
          o.torso.y = -0.2 * a + 0.3 * s;
          o.armL.x = 0.4 * a - 0.9 * s;
          o.armR.x = -0.3 * a + 0.7 * s;
          o.head.x = 0.3 * s;
          lunge = 0.12 * s;
          break;
        case 'utilt':
          o.tail.x = -0.6 * a + 2.5 * s + 0.3 * f;
          o.torso.x = 0.3 * a - 0.45 * s;
          o.armL.x = o.armR.x = 0.3 * a - 1.4 * s;
          o.elbowL.x = o.elbowR.x = -0.8 * a - 0.3 * s;
          o.head.x = 0.15 * a - 0.45 * s;
          bodyY = -0.07 * a + 0.05 * s;
          stretch = -0.08 * a + 0.1 * s;
          break;
        case 'dtilt': {
          const crouch = Math.max(a, s, ramp(p, 0, 0.12) * (1 - ramp(p, B, 1)));
          bodyY = -0.16 * crouch;
          stretch = -0.1 * crouch;
          o.legR.x = -0.2 * a - 1.4 * s;
          o.kneeR.x = 1.2 * a + 0.2 * (1 - s);
          o.legL.x = -0.4 * crouch;
          o.elbowL.x = o.elbowR.x = -0.6 * crouch;
          o.torso.x = 0.55 * crouch;
          o.head.x = -0.45 * crouch;
          o.tail.x = 1.1 * s;
          o.armL.x = o.armR.x = -0.6 * crouch;
          lunge = 0.12 * s;
          break;
        }
        case 'dash':
          o.torso.x = 0.25 * a + 1.0 * s;
          o.head.x = -0.2 * a - 0.7 * s;
          o.armL.x = o.armR.x = -0.5 * a + 1.0 * s;
          o.legL.x = -0.3 * s; o.legR.x = 0.8 * s;
          o.kneeL.x = 0.5 * s + 0.3 * a; o.kneeR.x = 0.9 * s;
          o.elbowL.x = o.elbowR.x = -0.9 * a - 0.2 * s;
          curl = 1 - 0.08 * s;
          lunge = 0.18 * s;
          stretch = 0.08 * s;
          break;
        case 'fsmash':
          o.torso.x = -0.45 * a + 0.75 * s;
          o.torso.y = -0.5 * a + 0.45 * s;
          o.armL.x = o.armR.x = 1.1 * a - 2.1 * s;
          o.head.x = -0.25 * a + 0.35 * s;
          o.legL.x = 0.1 * a - 0.6 * s;
          o.legR.x = 0.35 * a + 0.55 * s;
          o.kneeL.x = 0.4 * a + 0.5 * s; // front knee takes the weight
          o.kneeR.x = 0.6 * a + 0.1 * s;
          o.elbowL.x = o.elbowR.x = -1.4 * a - 0.15 * s; // arms cocked back, then thrown straight
          o.tail.x = 0.6 * a - 0.4 * s;
          bodyY += -0.07 * a;
          stretch = -0.07 * a + 0.05 * s;
          lunge = -0.12 * a + 0.28 * s;
          aura = s;
          break;
        case 'usmash':
          bodyY += -0.12 * a + 0.3 * s;
          stretch = -0.12 * a + 0.12 * s;
          rotX = v.charging ? 0.25 : -Math.PI * 2 * easeOutCubic(ramp(p, k.s0, B + (1 - B) * 0.3));
          o.tail.x = 1.6 * s;
          o.armL.x = o.armR.x = 0.6 * a - 2.4 * s;
          o.kneeL.x = o.kneeR.x = 1.0 * a + 0.6 * s;
          o.elbowL.x = o.elbowR.x = -0.8 * a;
          curl = 1 - 0.15 * s - 0.08 * a;
          break;
        case 'dsmash':
          rotY = v.charging ? 0 : sweep(0, Math.PI * 4);
          curl = 1 - 0.12 * a - 0.18 * s;
          bodyY += -0.1 * a - 0.04 * s;
          o.legL.x = -0.8 * s; o.legR.x = 0.8 * s;
          o.kneeL.x = o.kneeR.x = 0.9 * a + 0.5 * s;
          o.armL.z = 0.3 * a + 1.2 * s; o.armR.z = -0.3 * a - 1.2 * s;
          aura = s * (1 - ramp(p, B, 1));
          break;
        case 'nair':
          curl = 1 - 0.1 * a - 0.2 * s;
          aura = s * (1 - ramp(p, B, 1));
          rotX = -sweep(0, Math.PI * 2);
          o.armL.z = 1.2 * s; o.armR.z = -1.2 * s;
          o.legL.x = -0.6 * a; o.legR.x = -0.6 * a;
          o.kneeL.x = o.kneeR.x = 1.4 * a + 0.4 * s;
          break;
        case 'fair':
          rotX = sweep(0, Math.PI * 2);
          curl = 1 - 0.12 * a - 0.2 * s;
          o.armL.x = o.armR.x = -2.2 * a + 0.8 * s;
          o.elbowL.x = o.elbowR.x = -1.0 * a;
          o.kneeL.x = o.kneeR.x = 1.5 * (a + s * 0.6);
          o.tail.x = -0.8 * a + 1.2 * s;
          break;
        case 'bair':
          o.legL.x = o.legR.x = -0.6 * a + 1.6 * s + 0.2 * f;
          o.kneeL.x = o.kneeR.x = 1.8 * a + 0.1 * (1 - s); // tucked, then a two-footed donkey kick
          o.torso.x = -0.25 * a + 0.55 * s;
          o.head.y = 0.5 * s;
          o.head.x = -0.3 * s;
          o.armL.x = o.armR.x = -0.4 * a - 1.0 * s;
          o.tail.x = 1.4 * s;
          lunge = -0.15 * s;
          break;
        case 'uair':
          o.tail.x = -0.6 * a + 2.7 * s;
          rotX = 0.35 * a - 0.9 * s;
          o.armL.x = o.armR.x = 0.4 * a - 2.4 * s;
          o.head.x = -0.5 * s;
          o.legL.x = o.legR.x = -0.6 * a + 0.3 * s;
          o.kneeL.x = o.kneeR.x = 1.2 * a + 0.3;
          break;
        case 'dair':
          rotY = sweep(0, Math.PI * 6);
          o.armL.x = o.armR.x = -1.5 * a - 3 * s;
          o.legL.x = o.legR.x = -1.0 * a;
          o.kneeL.x = o.kneeR.x = 1.4 * a;
          curl = 1 - 0.15 * a;
          stretch = 0.12 * s;
          aura = s * (1 - ramp(p, B, 1));
          break;
        case 'grab':
          o.armL.x = o.armR.x = 0.3 * a - 1.7 * s;
          o.armL.z = 0.2 * a; o.armR.z = -0.2 * a;
          o.elbowL.x = o.elbowR.x = -1.2 * a - 0.2 * s;
          o.kneeL.x = 0.3; o.kneeR.x = 0.5 * s;
          o.torso.x = -0.1 * a + 0.4 * s;
          o.head.x = -0.3 * s;
          lunge = 0.15 * s;
          break;
        case 'throwF':
          o.armL.x = o.armR.x = -1.5 + 0.7 * a - 1.4 * s;
          o.torso.x = -0.3 * a + 0.45 * s;
          o.torso.y = -0.3 * a + 0.3 * s;
          lunge = 0.15 * s;
          break;
        case 'throwB':
          rotY = Math.PI * easeInOutSine(ramp(p, 0.05, B));
          o.armL.x = o.armR.x = -1.5 - 0.6 * s;
          o.torso.x = -0.2 * s;
          break;
        case 'throwU':
          o.armL.x = o.armR.x = -1.3 + 0.4 * a - 1.7 * s;
          bodyY = -0.1 * a + 0.12 * s;
          stretch = -0.1 * a + 0.12 * s;
          o.head.x = -0.4 * s;
          break;
        case 'throwD':
          bodyY = 0.4 * Math.sin(Math.PI * ramp(p, 0.05, A)) - 0.06 * s;
          o.armL.x = o.armR.x = -2.2;
          stretch = -0.12 * s;
          break;
        case 'cast':
          o.torso.x = -0.3 * a + 0.35 * s;
          o.torso.y = -0.2 * a + 0.1 * s;
          o.armL.x = o.armR.x = 0.6 * a - 1.5 * s;
          o.elbowL.x = o.elbowR.x = -1.3 * a - 0.2 * s;
          o.head.x = -0.2 * a + 0.1 * s;
          o.legL.x = -0.3 * s; o.legR.x = 0.3 * s;
          o.kneeL.x = 0.2 + 0.3 * s; o.kneeR.x = 0.3;
          lunge = -0.05 * a + 0.08 * s;
          aura = 0.3 * a + 0.5 * s * (1 - ramp(p, B, 1));
          break;
        case 'ball':
          curl = 0.7;
          aura = 1;
          spin = (this.spinner.rotation.z || 0) - v.facing * 0.5;
          break;
        case 'zip':
          curl = 0.85;
          aura = 0.5;
          stretch = 0.12;
          // Lie along the direction of travel: head leads, upright when zipping straight up.
          if (v.zipDir) spin = (Math.atan2(v.zipDir.y, Math.abs(v.zipDir.x)) - Math.PI / 2) * (v.facing > 0 ? 1 : -1);
          o.armL.x = o.armR.x = 1.2;
          o.legL.x = o.legR.x = 1.2;
          o.kneeL.x = o.kneeR.x = 0.3;
          break;
        case 'tailslam':
          rotX = sweep(0, Math.PI * 2);
          o.tail.x = -0.5 * a + 1.9 * s;
          curl = 1 - 0.1 * a;
          bodyY = -0.06 * a + 0.2 * Math.sin(Math.PI * ramp(p, k.s0, B));
          break;
        case 'tailspike':
          rotY = sweep(0, Math.PI * 4);
          o.tail.x = 1.2 + 1.6 * s;
          o.armL.x = o.armR.x = -1.2 * a - 2.5 * s;
          stretch = 0.12 * s;
          break;
        case 'breath': // Flamethrower
          o.torso.x = -0.3 * a + 0.3 * s;
          o.head.x = -0.5 * a + 0.4 * s + Math.sin(t * 20) * 0.03 * s;
          o.armL.x = o.armR.x = 0.3 * a - 0.8 * s;
          lunge = -0.06 * a + 0.06 * s;
          aura = 0.4 * s;
          auraColor = 0xff6a20;
          break;
        case 'blitz': // Flare Blitz
          curl = 0.8 + 0.1 * a;
          aura = 1;
          auraColor = 0xff5a10;
          o.torso.x = -0.3 * a + 1.0 * s;
          o.armL.x = o.armR.x = 0.9 * s - 0.5 * a;
          lunge = 0.2 * s;
          stretch = 0.1 * s;
          break;
        case 'fly':
          if (v.zipDir) spin = (Math.atan2(v.zipDir.y, Math.abs(v.zipDir.x)) - Math.PI / 2) * (v.facing > 0 ? 1 : -1) * 0.6;
          o.armL.x = o.armR.x = -2.8;
          o.legL.x = o.legR.x = 0.6;
          stretch = 0.1;
          break;
        case 'claw': { // Dragon Claw: two slashes
          const k2 = hits[1] ? strikeCurve(p, hits[1][0], hits[1][1]) : k;
          const second = p >= k2.s0 ? 1 : 0;
          o.armR.x = -2.6 * a + 3.0 * s * (1 - second) + 0.4 * second;
          o.armL.x = -2.4 * Math.max(a, second * k2.a) + 3.0 * k2.s * second;
          o.torso.y = -0.35 * a + 0.45 * s * (1 - second) - 0.45 * k2.s * second;
          o.torso.x = 0.3 * Math.max(s, k2.s);
          lunge = 0.1 * Math.max(s, k2.s);
          aura = 0.7 * k2.s * second;
          auraColor = 0x7a4aff;
          break;
        }
        case 'cannon': // Hydro Pump / Ice Beam
          o.torso.x = 0.2 * a - 0.2 * s;
          bodyY = -0.06 * a - 0.04 * s;
          stretch = -0.08 * a;
          o.armL.z = 0.4; o.armR.z = -0.4;
          o.head.x = 0.2 * a;
          lunge = -0.1 * s;
          aura = 0.5 * s;
          auraColor = 0x5ab0ff;
          break;
        case 'shellspin': // Rapid Spin
          curl = 0.85;
          rotY = t * 30;
          o.armL.x = o.armR.x = 0.5;
          break;
        case 'setup': { // Swords Dance, Shell Smash, Destiny Bond
          const e = easeInOutSine(Math.sin(Math.PI * ramp(p, 0.05, 0.95)));
          o.armL.x = o.armR.x = -2.8 * e;
          o.head.x = -0.3 * e;
          rotY = Math.PI * 2 * easeInOutSine(ramp(p, 0.25, 0.7));
          bodyY = 0.12 * e;
          stretch = 0.08 * e;
          aura = e;
          auraColor = v.bond ? 0x9a4aff : 0xff6a4a;
          break;
        }
        case 'beam': // Giga Drain
          o.armL.x = o.armR.x = 0.3 * a - 1.4 * s;
          o.torso.x = -0.2 * a + 0.3 * s;
          aura = 0.6 * s;
          auraColor = 0x7acc4a;
          break;
        case 'powder':
          o.armL.z = 1.2 * Math.max(a, s); o.armR.z = -1.2 * Math.max(a, s);
          o.tail.x = 0.6 * Math.sin(t * 25) * s - 0.4 * a;
          bodyY = 0.05 * Math.sin(t * 12) * s;
          break;
        case 'hypno':
          o.armL.x = -1.5 * Math.max(a, s) + Math.sin(t * 9) * 0.4 * s;
          o.armR.x = -1.5 * Math.max(a, s) - Math.sin(t * 9) * 0.4 * s;
          o.head.x = 0.2 * s;
          o.head.z = Math.sin(t * 6) * 0.15 * s;
          aura = 0.5 * s;
          auraColor = 0xb07aff;
          break;
        case 'burst': // Sludge Wave
          curl = 1 - 0.18 * a + 0.22 * s;
          o.armL.z = -0.3 * a + 1.4 * s; o.armR.z = 0.3 * a - 1.4 * s;
          o.torso.x = 0.3 * a - 0.2 * s;
          aura = s * (1 - ramp(p, B, 1));
          auraColor = 0xb04ad0;
          break;
        case 'flurry': { // Close Combat
          const last = hits[hits.length - 1];
          const kl = strikeCurve(p, last[0], last[1]);
          if (p < kl.s0) {
            const w = Math.sin(p * 48);
            o.armR.x = -0.3 - 1.5 * Math.max(0, w);
            o.armL.x = -0.3 - 1.5 * Math.max(0, -w);
            o.torso.y = 0.3 * w;
            lunge = 0.08 * Math.abs(w);
          } else {
            o.armR.x = 0.6 * kl.a - 2.0 * kl.s;
            o.torso.x = 0.45 * kl.s;
            o.torso.y = 0.45 * kl.s;
            lunge = 0.2 * kl.s;
          }
          o.legL.x = -0.35; o.legR.x = 0.35;
          aura = 0.5;
          auraColor = 0x4a8aff;
          break;
        }
        default:
          o.armR.x = 0.5 * a - 1.6 * s;
          o.torso.y = 0.3 * s;
          lunge = 0.08 * s;
          break;
      }
    }

    // Venusaur's front legs are its "arms": their elbows only fold backwards, like knees.
    if (this.parts.quadruped && v.state === 'attack') {
      o.elbowL.x = Math.abs(o.elbowL.x) * 0.4;
      o.elbowR.x = Math.abs(o.elbowR.x) * 0.4;
    }

    // ---- victory pose on the results screen
    if (v.victory) {
      const hop = Math.abs(Math.sin(t * 5));
      bodyY = hop * 0.35;
      stretch = (hop - 0.5) * 0.12;
      o.armL.x = -2.9 + Math.sin(t * 10) * 0.3;
      o.armR.x = -2.9 - Math.sin(t * 10) * 0.3;
      o.head.x = -0.3;
      o.tail.x = Math.sin(t * 8) * 0.5;
      o.legL.x = o.legR.x = -0.4 * (1 - hop);
      o.kneeL.x = o.kneeR.x = 0.9 * (1 - hop);
      o.elbowL.x = o.elbowR.x = -0.3;
      rotY = Math.sin(t * 2) * 0.4;
    }

    // ---- two-bone IK: when the body dips while standing, the knees bend so the feet stay on
    // the floor instead of sinking into it (crouches, landings, wind-ups, the idle breath).
    const standing = (grounded || v.state === 'shield' || v.state === 'holding' || (v.grounded && (v.state === 'attack' || v.state === 'dodge')))
      && v.state !== 'sleep' && !v.victory;
    if (standing && bodyY < 0) {
      for (const ankle of this.feet) {
        const { leg, knee, L1, L2 } = ankle.userData;
        if (!knee || L1 <= 0 || L2 <= 0) continue;
        const D0 = L1 + L2;
        const D = D0 - Math.min(-bodyY, D0 * 0.55);
        const hip = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))));
        const bendK = Math.PI - Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2))));
        o[leg].x -= hip;
        o[knee].x += bendK;
      }
    }

    // ---- secondary motion: tails, ears and wings lag behind the body's acceleration
    const bob = bodyY;
    const bobAcc = sd > 0 ? ((bob - pv.bodyY) / sd - pv.bobV) / sd : 0;
    if (sd > 0) {
      pv.bobV = (bob - pv.bodyY) / sd;
      const jolt = -ay - bobAcc * 3;
      this.springs.tail.v += (jolt * 0.004 - fwdAcc * 0.004) * (Math.abs(ay) < 400 ? 1 : 0.3);
      this.springs.tailZ.v += fwdAcc * 0.003;
      this.springs.ear.v += jolt * 0.005;
      this.springs.bob.v += -ay * 0.0015;
    }
    const tailS = this.springs.tail.step(sd, 0);
    const tailZ = this.springs.tailZ.step(sd, 0);
    const earS = this.springs.ear.step(sd, 0);
    const bobS = this.springs.bob.step(sd, 0);
    o.tail.z += Math.sin(t * 2.2) * 0.12 + tailZ;
    o.tail.x += tailS;
    o.earL.z += Math.sin(t * 1.7) * 0.05;
    o.earR.z += -Math.sin(t * 1.9) * 0.05;
    o.earL.x += earS * 0.8;
    o.earR.x += earS * 0.8;

    // ---- tumble and zip spin around the body centre
    if (v.tumble && (v.state === 'hitstun' || v.state === 'air')) {
      spin = this.spinner.rotation.z - Math.sign(v.vx || 1) * dt * Math.min(18, 6 + Math.hypot(v.vx, v.vy) * 0.5);
    }
    if (spin !== null) this.spinner.rotation.z = spin;
    else this.spinner.rotation.z = damp(wrap(this.spinner.rotation.z), 0, 14, dt);

    // ---- apply: joints follow their targets through slightly springy (underdamped) motion,
    // so poses flow into each other with a little overshoot instead of snapping.
    const atk = v.state === 'attack';
    // Short states (3-frame jumpsquat, landings, dashes, skids) need stiff joints or the pose
    // never arrives before the state is over.
    const snappy = v.state === 'jumpsquat' || v.state === 'landlag' || v.dash || v.skid || this.takeoffT > 0;
    const w = atk ? 62 : snappy ? 60 : v.state === 'hitstun' ? 40 : 30;
    const zeta = atk ? 0.78 : snappy ? 0.75 : 0.62;
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    const w2 = w * w;
    const dmp = 2 * zeta * w;
    for (const name of JOINTS) {
      const jo = this.j[name];
      if (!jo) continue;
      const c = this.cur[name];
      const tg = o[name];
      for (let i = 0; i < n; i++) {
        c.vx += (w2 * (tg.x - c.x) - dmp * c.vx) * h;
        c.vy += (w2 * (tg.y - c.y) - dmp * c.vy) * h;
        c.vz += (w2 * (tg.z - c.z) - dmp * c.vz) * h;
        c.x += c.vx * h;
        c.y += c.vy * h;
        c.z += c.vz * h;
      }
      const r = this.rest[name];
      jo.rotation.set(r.x + c.x, r.y + c.y, r.z + c.z);
    }
    // Feet stay flat on the ground while grounded (ankles counter the leg swing); in the air
    // they point their toes a little.
    const plant = grounded ? (v.skid ? 1 : 0.85) : 0;
    for (const ankle of this.feet) {
      const u = ankle.userData;
      const swing = this.cur[u.leg].x + (u.knee ? this.cur[u.knee].x : 0);
      ankle.rotation.x = damp(ankle.rotation.x, -swing * plant + (grounded ? 0 : 0.35), 30, dt);
    }
    pv.bodyY = damp(pv.bodyY, bodyY, atk ? 30 : 20, dt);
    pv.lunge = damp(pv.lunge, lunge * this.h, atk ? 35 : 12, dt);
    pv.curl = damp(pv.curl, curl, 25, dt);
    pv.stretch = damp(pv.stretch, stretch + v.landSquash * -0.22, 22, dt);
    if (v.state === 'jumpsquat') { pv.bodyY = bodyY; pv.stretch = -0.18; } // snap into the crouch
    // Flips and spins are driven directly so they complete cleanly.
    pv.rotX = atk || v.flip >= 0 || rotX === 0 ? rotX : damp(pv.rotX, rotX, 20, dt);
    pv.rotY = rotY;
    this.body.position.y = -this.h * 0.5 + pv.bodyY + bobS * 0.12;
    this.body.position.z = pv.lunge;
    this.pivot.rotation.set(pv.rotX, pv.rotY, 0);
    const st = Math.max(-0.3, Math.min(0.25, pv.stretch));
    const side = 1 - st * 0.6; // keep volume: stretch tall and thin, squash short and wide
    this.pivot.scale.set(pv.curl * side, pv.curl * (1 + st), pv.curl * side * (1 + pv.smear * 0.5));

    const targetYaw = v.yaw ?? (v.facing > 0 ? Math.PI / 2 - 0.3 : -Math.PI / 2 + 0.3);
    // Turn with a quick, slightly overshooting whip.
    const yv = this.yawV || 0;
    // Turn fast when moving (dash-dances and pivots read in ~4 frames), lazily when idle.
    const yw = grounded && (Math.abs(v.vx) > 1 || v.dash || v.skid) ? 55 : 26;
    let yaw = this.yaw;
    let yvel = yv;
    for (let i = 0; i < n; i++) {
      yvel += (yw * yw * (targetYaw - yaw) - 2 * 0.7 * yw * yvel) * h;
      yaw += yvel * h;
    }
    this.yaw = yaw;
    this.yawV = yvel;
    this.facer.rotation.y = this.yaw;
    if (v.shake) this.root.position.x += (Math.random() - 0.5) * 0.12 * v.shake;

    this.auraMat.color.set(auraColor ?? this.colors.accent);
    this.aura.visible = aura > 0.02;
    this.auraMat.opacity = 0.45 * aura * (0.8 + Math.random() * 0.4);
    this.shield.visible = v.state === 'shield';
    if (this.shield.visible) {
      const sc = 0.45 + 0.55 * v.shieldFrac;
      this.shield.scale.setScalar(sc);
      this.shieldMat.opacity = 0.22 + (1 - v.shieldFrac) * 0.25 + Math.sin(t * 12) * 0.03;
    }

    if (this.parts.update) this.parts.update(v, t, dt, this.springs);

    // Blink every few seconds.
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 && v.state !== 'sleep';
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3.5;
    for (const e of this.eyes) e.scale.y = (e.userData.sy ??= e.scale.y) * (blink || v.state === 'sleep' ? 0.12 : 1);

    // Poké Ball entrance (grow out of a white flash) and recall (shrink into red light).
    let grow = 1;
    if (this.appearT < 1) {
      this.appearT = Math.min(1, this.appearT + dt / 0.45);
      const k = this.appearT;
      grow = k < 0.7 ? (k / 0.7) * 1.12 : 1.12 - 0.12 * ((k - 0.7) / 0.3); // overshoot and settle
    }
    if (this.recallT < 1) {
      this.recallT = Math.min(1, this.recallT + dt / 0.3);
      grow = 1 - this.recallT;
    }
    this.root.scale.setScalar(Math.max(0.01, grow));

    let flash = v.flash;
    let flashColor = null;
    if (v.state === 'dodge' && v.intangible) { flash = 0.45; flashColor = 0x9fd8ff; }
    else if (v.invuln) flash = Math.max(flash, 0.25 + 0.2 * Math.sin(t * 25));
    else if (v.state === 'helpless') { flash = 0.25; flashColor = 0x000000; }
    else if (v.charging) { flash = 0.2 + 0.2 * Math.sin(t * 30); flashColor = 0xffe070; }
    else if (v.bond) { flash = 0.25 + 0.15 * Math.sin(t * 8); flashColor = 0x8a3aff; }
    else if (v.seeded && Math.sin(t * 6) > 0.3) { flash = 0.25; flashColor = 0x6adc3a; }
    else if (v.boosted) { flash = 0.12 + 0.08 * Math.sin(t * 5); flashColor = 0xff5a3a; }
    if (this.appearT < 1) { flash = 1 - this.appearT; flashColor = null; }
    if (this.recallT < 1) { flash = 0.4 + this.recallT * 0.6; flashColor = 0xff3030; }
    this.setFlash(Math.min(1, flash), flashColor);
    this.tag.visible = v.showTag;
  }

  dispose() {
    inkTargets.delete(this);
    this.root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material && obj.material.map) obj.material.map.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}
