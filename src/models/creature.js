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
    const m = new THREE.MeshStandardMaterial({
      color, roughness: o.r ?? 0.7, metalness: o.m ?? 0.05, flatShading: true,
      emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1,
    });
    m.userData.baseEmissive = m.emissive.clone();
    m.userData.baseIntensity = m.emissiveIntensity;
    this.mats.push(m);
    return m;
  }

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
    let spin = null; // spinner z target; null = settle upright
    const p = v.p;
    const run = Math.min(1, Math.abs(v.vx) / (v.runSpeed || 8));

    // ---- base pose from state
    o.tail.z = Math.sin(t * 2.2) * 0.12;
    o.earL.z = Math.sin(t * 1.7) * 0.05;
    o.earR.z = -Math.sin(t * 1.9) * 0.05;
    if (v.state === 'ground' || v.state === 'landlag' || v.state === 'jumpsquat') {
      if (run > 0.05) this.phase += dt * (6 + 10 * run);
      const s = Math.sin(this.phase);
      o.legL.x = s * 0.9 * run;
      o.legR.x = -s * 0.9 * run;
      o.armL.x = -s * 0.8 * run;
      o.armR.x = s * 0.8 * run;
      o.torso.x = 0.35 * run + Math.sin(t * 2.5) * 0.03;
      o.earL.x = o.earR.x = -0.5 * run;
      bodyY = Math.abs(Math.cos(this.phase)) * 0.06 * run;
      if (v.state !== 'ground') bodyY -= 0.08;
    } else if (v.state === 'air' || v.state === 'helpless') {
      if (v.vy > 0) {
        o.legL.x = -0.7; o.legR.x = -0.4;
        o.armL.x = o.armR.x = -2.2;
      } else {
        o.legL.x = -0.2; o.legR.x = 0.2;
        o.armL.z = 0.7; o.armR.z = -0.7;
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
      o.torso.x = -0.5;
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
        default:
          o.armR.x = -1.5 * pulse(p, 0.1, 0.5);
          break;
      }
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
    pv.rotX = v.state === 'attack' || rotX === 0 ? rotX : damp(pv.rotX, rotX, 20, dt);
    pv.rotY = rotY;
    this.body.position.y = -this.h * 0.5 + pv.bodyY;
    this.pivot.rotation.set(pv.rotX, pv.rotY, 0);
    const sq = v.landSquash;
    this.pivot.scale.set(pv.curl * (1 + sq * 0.15), pv.curl * (1 - sq * 0.22), pv.curl * (1 + sq * 0.15));

    const targetYaw = v.yaw ?? (v.facing > 0 ? Math.PI / 2 - 0.3 : -Math.PI / 2 + 0.3);
    this.yaw = damp(this.yaw, targetYaw, 16, dt);
    this.facer.rotation.y = this.yaw;

    this.aura.visible = aura > 0.02;
    this.auraMat.opacity = 0.45 * aura * (0.8 + Math.random() * 0.4);
    this.shield.visible = v.state === 'shield';
    if (this.shield.visible) {
      const s = 0.45 + 0.55 * v.shieldFrac;
      this.shield.scale.setScalar(s);
      this.shieldMat.opacity = 0.22 + (1 - v.shieldFrac) * 0.25 + Math.sin(t * 12) * 0.03;
    }

    if (this.parts.update) this.parts.update(v, t, dt);

    let flash = v.flash;
    let flashColor = null;
    if (v.state === 'dodge' && v.intangible) { flash = 0.45; flashColor = 0x9fd8ff; }
    else if (v.invuln) flash = Math.max(flash, 0.25 + 0.2 * Math.sin(t * 25));
    else if (v.state === 'helpless') { flash = 0.25; flashColor = 0x000000; }
    else if (v.charging) { flash = 0.2 + 0.2 * Math.sin(t * 30); flashColor = 0xffe070; }
    this.setFlash(Math.min(1, flash), flashColor);
    this.tag.visible = v.showTag;
  }

  dispose() {
    this.root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material && obj.material.map) obj.material.map.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}
