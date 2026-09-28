// Procedural low-poly Pokémon with code-driven animation.
//
// Hierarchy: root (feet) > spinner (tumble / zip rotation around the body centre) > facer
// (turns to face left/right) > pivot (flips and spins around the centre) > body (bob) >
// joints built by a species builder (hips, torso, head, arms, legs, tail, ears).
// Models face +z; `facer` turns them to face +x or -x in the world. Limbs hang down, so a
// negative rotation.x swings a limb forward.

import * as THREE from 'three';
import { BUILDERS } from './species.js';

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// 0 -> 1 -> 0 across [a, b]
const pulse = (p, a, b) => (p <= a || p >= b ? 0 : Math.sin(((p - a) / (b - a)) * Math.PI));
// 0 -> 1 across [a, b]
const ramp = (p, a, b) => clamp01((p - a) / (b - a));

const JOINTS = ['hips', 'torso', 'head', 'armL', 'armR', 'legL', 'legR', 'tail', 'earL', 'earR'];

// Character look: 'toon' = cel-shaded with ink outlines (default), 'lowpoly' = faceted.
export const STYLE = new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('style') === 'lowpoly' ? 'lowpoly' : 'toon';
const OUTLINE = 0.022; // outline thickness in world units

let toonRamp = null;
function toonGradient() {
  if (toonRamp) return toonRamp;
  const data = new Uint8Array([90, 170, 255]); // three bands: shadow, mid, lit
  toonRamp = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.needsUpdate = true;
  return toonRamp;
}
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x14121c, side: THREE.BackSide });

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
    for (const name of JOINTS) this.cur[name] = { x: 0, y: 0, z: 0 };

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
    this.pv = { bodyY: 0, rotX: 0, rotY: 0, curl: 1 };
  }

  // Species builders register materials through this so hit flashes reach every part.
  mat(color, o = {}) {
    const m = STYLE === 'toon'
      ? new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1 })
      : new THREE.MeshStandardMaterial({
        color, roughness: o.r ?? 0.7, metalness: o.m ?? 0.05, flatShading: true,
        emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1,
      });
    m.userData.baseEmissive = m.emissive.clone();
    m.userData.baseIntensity = m.emissiveIntensity;
    this.mats.push(m);
    return m;
  }

  // Ink outlines: a slightly larger back-face copy of each body part (the "inverted hull" trick).
  addOutlines() {
    const targets = [];
    this.body.traverse((o) => {
      if (o.isMesh && this.mats.includes(o.material) && !o.userData.eye) targets.push(o);
    });
    for (const m of targets) {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const r = m.geometry.boundingSphere.radius * ((m.scale.x + m.scale.y + m.scale.z) / 3);
      if (r < 0.035) continue; // tiny details stay clean
      const hull = new THREE.Mesh(m.geometry, outlineMat);
      hull.scale.setScalar(1 + OUTLINE / r);
      hull.castShadow = false;
      hull.userData.outline = true;
      m.add(hull);
    }
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
    let rotX = 0;
    let rotY = 0;
    let curl = 1;
    let aura = 0;
    let auraColor = null;
    let spin = null; // spinner z target; null = settle upright
    const p = v.p;
    const run = Math.min(1, Math.abs(v.vx) / (v.runSpeed || 8));

    // ---- secondary motion: springs driven by the body's acceleration
    const sd = Math.min(dt, 1 / 30);
    if (sd > 0) {
      const ax = (v.vx - this.prevV.x) / sd;
      const ay = (v.vy - this.prevV.y) / sd;
      this.prevV.x = v.vx;
      this.prevV.y = v.vy;
      const fwd = ax * v.facing;
      this.springs.tail.v += (-ay * 0.004 - fwd * 0.004) * (Math.abs(ay) < 400 ? 1 : 0.3);
      this.springs.tailZ.v += fwd * 0.003;
      this.springs.ear.v += -ay * 0.005;
      this.springs.bob.v += -ay * 0.0015;
    }
    const tailS = this.springs.tail.step(sd, 0);
    const tailZ = this.springs.tailZ.step(sd, 0);
    const earS = this.springs.ear.step(sd, 0);
    const bobS = this.springs.bob.step(sd, 0);

    // ---- base pose from state
    o.tail.z = Math.sin(t * 2.2) * 0.12 + tailZ;
    o.tail.x = tailS;
    o.earL.z = Math.sin(t * 1.7) * 0.05;
    o.earR.z = -Math.sin(t * 1.9) * 0.05;
    o.earL.x = o.earR.x = earS * 0.8;
    if (v.state === 'ground' || v.state === 'landlag' || v.state === 'jumpsquat') {
      if (run > 0.05) this.phase += dt * (6 + 11 * run);
      const s = Math.sin(this.phase);
      o.legL.x = s * 1.0 * run;
      o.legR.x = -s * 1.0 * run;
      o.armL.x = -s * 0.9 * run;
      o.armR.x = s * 0.9 * run;
      o.torso.x = 0.38 * run + Math.sin(t * 2.5) * 0.03;
      o.torso.y = s * 0.18 * run; // hips and shoulders twist against each other
      o.head.y = -s * 0.12 * run;
      o.head.x = -0.15 * run; // keep eyes forward while leaning
      o.earL.x += -0.5 * run;
      o.earR.x += -0.5 * run;
      bodyY = Math.abs(Math.cos(this.phase)) * 0.08 * run;
      if (run < 0.05 && v.state === 'ground') {
        // Idle: breathe, and now and then glance around.
        bodyY = Math.sin(t * 2.4) * 0.012;
        o.head.y = Math.sin(t * 0.45) * Math.max(0, Math.sin(t * 0.21)) * 0.45;
        o.head.x = Math.sin(t * 0.7) * 0.05;
        o.armL.z = 0.08 + Math.sin(t * 2.4) * 0.04;
        o.armR.z = -0.08 - Math.sin(t * 2.4) * 0.04;
      }
      if (v.state !== 'ground') { bodyY -= 0.1; curl = 0.95; } // crouch before a jump / on landing
    } else if (v.state === 'air' || v.state === 'helpless') {
      if (v.vy > 0) {
        o.legL.x = -0.8; o.legR.x = -0.4;
        o.armL.x = o.armR.x = -2.2;
      } else {
        o.legL.x = -0.2; o.legR.x = 0.25;
        o.armL.z = 0.7 + Math.sin(t * 10) * 0.1; o.armR.z = -0.7 - Math.sin(t * 10) * 0.1;
      }
      if (v.flip >= 0) {
        // Double jump: a quick front flip, tucked.
        const k = 1 - (1 - v.flip) ** 3;
        rotX = Math.PI * 2 * k;
        curl = 1 - 0.18 * Math.sin(v.flip * Math.PI);
        o.legL.x = o.legR.x = -1.2 * Math.sin(v.flip * Math.PI);
      }
      if (v.state === 'helpless') {
        o.armL.x = o.armR.x = -2.8;
        o.torso.x = -0.2;
      }
    } else if (v.state === 'shield') {
      bodyY = -0.06;
      o.armL.x = o.armR.x = -1.2;
      o.torso.x = 0.2;
    } else if (v.state === 'shieldbreak') {
      o.torso.x = -0.4 + Math.sin(t * 8) * 0.1;
      o.head.z = Math.sin(t * 5) * 0.3;
      o.armL.z = 0.5; o.armR.z = -0.5;
    } else if (v.state === 'dodge') {
      if (v.dodge === 'roll') { curl = 0.8; spin = -v.facing * v.sf * 0.35; }
      else if (v.dodge === 'air') { rotY = v.sf * 0.5; o.armL.x = o.armR.x = -1.5; }
      else { o.torso.x = -0.3; bodyY = -0.05; }
    } else if (v.state === 'hitstun') {
      // Whip away from the hit: backwards if launched away from where we face.
      const back = v.vx * v.facing < 0 ? 1 : -0.6;
      o.torso.x = -0.5 * back - v.flash * 0.3 * back;
      o.head.x = -0.5 * back * v.flash;
      o.armL.x = -2.5 + Math.sin(t * 20) * 0.5;
      o.armR.x = -2.5 + Math.cos(t * 20) * 0.5;
      o.legL.x = Math.sin(t * 18) * 0.6;
      o.legR.x = -Math.sin(t * 18) * 0.6;
    } else if (v.state === 'ledge') {
      o.armL.x = o.armR.x = -3.0;
      o.legL.x = Math.sin(t * 3) * 0.2;
      o.legR.x = -Math.sin(t * 3) * 0.2;
      o.torso.x = 0.1;
    } else if (v.state === 'getup') {
      o.armL.x = o.armR.x = -2.2 * (1 - p);
      o.legL.x = -1.0 * (1 - p);
    } else if (v.state === 'holding') {
      o.armL.x = o.armR.x = -1.5;
      o.torso.x = 0.15;
    } else if (v.state === 'sleep') {
      rotX = -Math.PI / 2; // lying on its back
      bodyY = -this.h * 0.3 + Math.sin(t * 2) * 0.02;
      o.armL.z = 0.6; o.armR.z = -0.6;
    } else if (v.state === 'held') {
      o.armL.x = -2.6 + Math.sin(t * 22) * 0.4;
      o.armR.x = -2.6 + Math.cos(t * 22) * 0.4;
      o.legL.x = Math.sin(t * 20) * 0.7;
      o.legR.x = -Math.sin(t * 20) * 0.7;
    }

    // ---- attack animations (p = move progress 0..1)
    if (v.state === 'attack' && v.anim) {
      switch (v.anim) {
        case 'jab':
          o.armR.x = -1.7 * pulse(p, 0.1, 0.5);
          o.torso.y = 0.3 * pulse(p, 0.1, 0.5);
          break;
        case 'ftilt':
        case 'ledgeAttack':
          o.legR.x = -1.6 * pulse(p, 0.15, 0.5);
          o.torso.x = -0.35 * pulse(p, 0.15, 0.5);
          o.armL.x = -1 * pulse(p, 0.15, 0.5);
          break;
        case 'utilt':
          o.tail.x = 2.2 * pulse(p, 0.1, 0.55);
          o.torso.x = -0.35 * pulse(p, 0.1, 0.55);
          break;
        case 'dtilt':
          bodyY = -0.15 * pulse(p, 0, 1);
          o.legR.x = -1.4 * pulse(p, 0.15, 0.45);
          o.torso.x = 0.5 * pulse(p, 0, 1);
          o.tail.x = 1.0 * pulse(p, 0.15, 0.45);
          break;
        case 'dash':
          o.torso.x = 1.0 * pulse(p, 0.1, 0.5);
          o.armL.x = o.armR.x = 0.9 * pulse(p, 0.1, 0.5);
          curl = 1 - 0.1 * pulse(p, 0.1, 0.5);
          break;
        case 'fsmash': {
          const wind = v.charging ? 1 : pulse(p, 0, 0.3);
          const strike = v.charging ? 0 : pulse(p, 0.28, 0.6);
          o.torso.x = -0.5 * wind + 0.7 * strike;
          o.armL.x = o.armR.x = 0.8 * wind - 1.8 * strike;
          o.head.x = 0.3 * strike;
          aura = strike;
          if (v.charging) bodyY = Math.sin(t * 60) * 0.015;
          break;
        }
        case 'usmash':
          rotX = v.charging ? 0.3 : -Math.PI * 2 * ramp(p, 0.2, 0.45);
          o.tail.x = 1.5 * pulse(p, 0.2, 0.5);
          curl = 1 - 0.15 * pulse(p, 0.2, 0.45);
          if (v.charging) bodyY = Math.sin(t * 60) * 0.015 - 0.05;
          break;
        case 'dsmash':
          rotY = v.charging ? 0 : Math.PI * 4 * ramp(p, 0.18, 0.32);
          curl = v.charging ? 0.9 : 1 - 0.25 * pulse(p, 0.15, 0.4);
          aura = pulse(p, 0.18, 0.32);
          if (v.charging) bodyY = Math.sin(t * 60) * 0.015 - 0.08;
          break;
        case 'nair':
          curl = 1 - 0.25 * pulse(p, 0.05, 0.6);
          aura = pulse(p, 0.08, 0.55);
          rotX = -Math.PI * 2 * ramp(p, 0.05, 0.55);
          break;
        case 'fair':
          rotX = Math.PI * 4 * ramp(p, 0.15, 0.35);
          curl = 1 - 0.25 * pulse(p, 0.1, 0.4);
          break;
        case 'bair':
          o.legL.x = o.legR.x = 1.4 * pulse(p, 0.12, 0.45);
          o.torso.x = 0.4 * pulse(p, 0.12, 0.45);
          break;
        case 'uair':
          o.tail.x = 2.6 * pulse(p, 0.12, 0.45);
          rotX = -0.8 * pulse(p, 0.1, 0.5);
          break;
        case 'dair':
          rotY = Math.PI * 6 * ramp(p, 0.2, 0.45);
          o.armL.x = o.armR.x = -3;
          o.legL.x = o.legR.x = 0;
          aura = pulse(p, 0.2, 0.45);
          break;
        case 'grab':
          o.armL.x = o.armR.x = -1.6 * pulse(p, 0.1, 0.6);
          o.torso.x = 0.3 * pulse(p, 0.1, 0.6);
          break;
        case 'throwF':
          o.armL.x = o.armR.x = -1.5 - 1.2 * ramp(p, 0.3, 0.5);
          break;
        case 'throwB':
          rotY = Math.PI * ramp(p, 0.1, 0.55);
          o.armL.x = o.armR.x = -1.5;
          break;
        case 'throwU':
          o.armL.x = o.armR.x = -1.5 - 1.5 * ramp(p, 0.1, 0.5);
          bodyY = 0.1 * pulse(p, 0.3, 0.7);
          break;
        case 'throwD':
          bodyY = 0.35 * pulse(p, 0.05, 0.45);
          o.armL.x = o.armR.x = -2.2;
          break;
        case 'cast':
          o.torso.x = -0.25 * pulse(p, 0, 0.35) + 0.35 * pulse(p, 0.3, 0.7);
          o.armL.x = o.armR.x = -1.3 * pulse(p, 0.25, 0.8);
          aura = 0.6 * pulse(p, 0.2, 0.5);
          break;
        case 'ball':
          curl = 0.7;
          aura = 1;
          spin = (this.spinner.rotation.z || 0) - v.facing * 0.5;
          break;
        case 'zip':
          curl = 0.85;
          aura = 0.5;
          // Lie along the direction of travel: head leads, upright when zipping straight up.
          if (v.zipDir) spin = (Math.atan2(v.zipDir.y, Math.abs(v.zipDir.x)) - Math.PI / 2) * (v.facing > 0 ? 1 : -1);
          o.armL.x = o.armR.x = 1.2;
          o.legL.x = o.legR.x = 1.2;
          break;
        case 'tailslam':
          rotX = Math.PI * 2 * ramp(p, 0.1, 0.38);
          o.tail.x = 1.8 * pulse(p, 0.15, 0.45);
          break;
        case 'tailspike':
          rotY = Math.PI * 4 * ramp(p, 0.15, 0.5);
          o.tail.x = 2.8;
          o.armL.x = o.armR.x = -2.5;
          break;
        case 'breath': // Flamethrower
          o.torso.x = 0.25 * pulse(p, 0.15, 0.85);
          o.head.x = 0.35 * pulse(p, 0.15, 0.85);
          o.armL.x = o.armR.x = -0.8 * pulse(p, 0.1, 0.85);
          aura = 0.4 * pulse(p, 0.2, 0.8);
          auraColor = 0xff6a20;
          break;
        case 'blitz': // Flare Blitz
          curl = 0.8;
          aura = 1;
          auraColor = 0xff5a10;
          o.torso.x = 0.9;
          o.armL.x = o.armR.x = 0.9;
          break;
        case 'fly':
          if (v.zipDir) spin = (Math.atan2(v.zipDir.y, Math.abs(v.zipDir.x)) - Math.PI / 2) * (v.facing > 0 ? 1 : -1) * 0.6;
          o.armL.x = o.armR.x = -2.8;
          o.legL.x = o.legR.x = 0.6;
          break;
        case 'claw': // Dragon Claw: two slashes
          o.armR.x = -2.6 + 3.2 * ramp(p, 0.18, 0.32);
          o.armL.x = -2.6 + 3.2 * ramp(p, 0.42, 0.55);
          o.torso.y = 0.4 * pulse(p, 0.15, 0.35) - 0.4 * pulse(p, 0.4, 0.6);
          aura = pulse(p, 0.4, 0.6) * 0.7;
          auraColor = 0x7a4aff;
          break;
        case 'cannon': // Hydro Pump / Ice Beam
          o.torso.x = -0.15 - 0.1 * pulse(p, 0.25, 0.7);
          bodyY = -0.05 * pulse(p, 0.2, 0.7);
          o.armL.z = 0.4; o.armR.z = -0.4;
          aura = 0.5 * pulse(p, 0.2, 0.7);
          auraColor = 0x5ab0ff;
          break;
        case 'shellspin': // Rapid Spin
          curl = 0.85;
          rotY = t * 30;
          o.armL.x = o.armR.x = 0.5;
          break;
        case 'setup': // Swords Dance, Shell Smash, Destiny Bond
          o.armL.x = o.armR.x = -2.8 * pulse(p, 0.1, 0.9);
          o.head.x = -0.3 * pulse(p, 0.1, 0.9);
          rotY = Math.PI * 2 * ramp(p, 0.3, 0.7);
          aura = pulse(p, 0.3, 0.9);
          auraColor = v.anim === 'setup' && v.bond ? 0x9a4aff : 0xff6a4a;
          break;
        case 'beam': // Giga Drain
          o.armL.x = o.armR.x = -1.3 * pulse(p, 0.2, 0.8);
          o.torso.x = 0.25 * pulse(p, 0.2, 0.8);
          aura = 0.6 * pulse(p, 0.25, 0.6);
          auraColor = 0x7acc4a;
          break;
        case 'powder':
          o.armL.z = 1.2 * pulse(p, 0.1, 0.8); o.armR.z = -1.2 * pulse(p, 0.1, 0.8);
          o.tail.x = 0.6 * Math.sin(t * 25) * pulse(p, 0.1, 0.8);
          break;
        case 'hypno':
          o.armL.x = -1.5 + Math.sin(t * 14) * 0.4;
          o.armR.x = -1.5 - Math.sin(t * 14) * 0.4;
          o.head.x = 0.2;
          aura = 0.5 * pulse(p, 0.25, 0.6);
          auraColor = 0xb07aff;
          break;
        case 'burst': // Sludge Wave
          curl = 1 - 0.2 * pulse(p, 0, 0.15) + 0.25 * pulse(p, 0.15, 0.45);
          o.armL.z = 1.4 * pulse(p, 0.15, 0.6); o.armR.z = -1.4 * pulse(p, 0.15, 0.6);
          aura = pulse(p, 0.15, 0.45);
          auraColor = 0xb04ad0;
          break;
        case 'flurry': // Close Combat
          if (p < 0.55) {
            o.armR.x = -1.7 * Math.abs(Math.sin(p * 45));
            o.armL.x = -1.7 * Math.abs(Math.cos(p * 45));
          } else {
            o.armR.x = -1.9 * pulse(p, 0.55, 0.75);
            o.torso.x = 0.4 * pulse(p, 0.55, 0.75);
          }
          aura = 0.5;
          auraColor = 0x4a8aff;
          break;
        default:
          o.armR.x = -1.5 * pulse(p, 0.1, 0.5);
          break;
      }
    }

    // ---- victory pose on the results screen
    if (v.victory) {
      bodyY = Math.abs(Math.sin(t * 5)) * 0.35;
      o.armL.x = -2.9 + Math.sin(t * 10) * 0.3;
      o.armR.x = -2.9 - Math.sin(t * 10) * 0.3;
      o.head.x = -0.3;
      o.tail.x = Math.sin(t * 8) * 0.5;
      rotY = Math.sin(t * 2) * 0.4;
      curl = 1 + Math.abs(Math.sin(t * 5)) * 0.05;
    }

    // ---- tumble and zip spin around the body centre
    if (v.tumble && (v.state === 'hitstun' || v.state === 'air')) {
      spin = this.spinner.rotation.z - Math.sign(v.vx || 1) * dt * Math.min(18, 6 + Math.hypot(v.vx, v.vy) * 0.5);
    }
    if (spin !== null) this.spinner.rotation.z = spin;
    else this.spinner.rotation.z = damp(wrap(this.spinner.rotation.z), 0, 14, dt);

    // ---- apply
    const rate = v.state === 'attack' ? 40 : 18;
    for (const name of JOINTS) {
      const jo = this.j[name];
      if (!jo) continue;
      const c = this.cur[name];
      c.x = damp(c.x, o[name].x, rate, dt);
      c.y = damp(c.y, o[name].y, rate, dt);
      c.z = damp(c.z, o[name].z, rate, dt);
      const r = this.rest[name];
      jo.rotation.set(r.x + c.x, r.y + c.y, r.z + c.z);
    }
    const pv = this.pv;
    pv.bodyY = damp(pv.bodyY, bodyY, 20, dt);
    pv.curl = damp(pv.curl, curl, 25, dt);
    // Flips and spins are driven directly so they complete cleanly.
    pv.rotX = v.state === 'attack' || v.flip >= 0 || rotX === 0 ? rotX : damp(pv.rotX, rotX, 20, dt);
    pv.rotY = rotY;
    this.body.position.y = -this.h * 0.5 + pv.bodyY + bobS * 0.12;
    this.pivot.rotation.set(pv.rotX, pv.rotY, 0);
    const sq = v.landSquash;
    this.pivot.scale.set(pv.curl * (1 + sq * 0.15), pv.curl * (1 - sq * 0.22), pv.curl * (1 + sq * 0.15));

    const targetYaw = v.yaw ?? (v.facing > 0 ? Math.PI / 2 - 0.3 : -Math.PI / 2 + 0.3);
    this.yaw = damp(this.yaw, targetYaw, 16, dt);
    this.facer.rotation.y = this.yaw;

    this.auraMat.color.set(auraColor ?? this.colors.accent);
    this.aura.visible = aura > 0.02;
    this.auraMat.opacity = 0.45 * aura * (0.8 + Math.random() * 0.4);
    this.shield.visible = v.state === 'shield';
    if (this.shield.visible) {
      const s = 0.45 + 0.55 * v.shieldFrac;
      this.shield.scale.setScalar(s);
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
    this.root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material === outlineMat) return; // shared by every model
      if (obj.material && obj.material.map) obj.material.map.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}
