// Procedural low-poly soldier built from boxes, with all animation done in code
// (run cycle, jumps, aim, recoil, reload, knife slash, tumble, shield, thrusters).
//
// Hierarchy: root (feet) > spinner (tumble spin around the hips) > facer (turns to face
// left/right) > body > hips > legs + torso > head + aimPivot (arms + guns).
// The model is built facing +z; `facer` rotates it to face +x or -x in the world.

import * as THREE from 'three';

const HIP_Y = 0.9;
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function limb(a, b, thick, mat) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, len + thick * 0.4), mat);
  m.position.copy(a).lerp(b, 0.5);
  m.lookAt(b);
  m.castShadow = true;
  return m;
}

function cyl(rt, rb, h, seg, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function glowMat(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false,
  });
}

const tagCache = new Map();
function tagTexture(text, css) {
  const key = text + css;
  if (tagCache.has(key)) return tagCache.get(key);
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
  tagCache.set(key, tex);
  return tex;
}

function buildGun(id, M) {
  const g = new THREE.Group();
  const parts = {};
  if (id === 'smg') {
    g.add(box(0.09, 0.13, 0.42, M.metal, 0, 0.02, 0.14));
    g.add(box(0.05, 0.05, 0.14, M.dark, 0, 0.04, 0.41));
    g.add(box(0.07, 0.05, 0.2, M.team, 0, 0.1, 0.12));
    parts.mag = box(0.05, 0.24, 0.07, M.dark, 0, -0.14, 0.2);
    parts.mag.rotation.x = 0.15;
    g.add(parts.mag);
    g.add(box(0.05, 0.13, 0.06, M.dark, 0, -0.08, 0.02));
    g.add(box(0.04, 0.08, 0.2, M.dark, 0, 0.0, -0.14));
    g.userData.muzzle = 0.5;
  } else if (id === 'shotgun') {
    g.add(box(0.1, 0.14, 0.34, M.metal, 0, 0.02, 0.1));
    g.add(cyl(0.035, 0.035, 0.62, 6, M.dark, 0, 0.06, 0.55)).rotation.x = Math.PI / 2;
    parts.pump = box(0.09, 0.08, 0.22, M.team, 0, -0.02, 0.5);
    g.add(parts.pump);
    g.add(box(0.07, 0.12, 0.3, M.wood, 0, -0.02, -0.2)).rotation.x = -0.12;
    g.add(box(0.05, 0.12, 0.06, M.dark, 0, -0.1, 0.02));
    parts.mag = box(0.06, 0.06, 0.2, M.dark, 0, -0.05, 0.3);
    g.add(parts.mag);
    g.userData.muzzle = 0.86;
  } else {
    g.add(box(0.09, 0.13, 0.5, M.metal, 0, 0.02, 0.15));
    g.add(cyl(0.03, 0.03, 0.72, 6, M.dark, 0, 0.05, 0.75)).rotation.x = Math.PI / 2;
    g.add(box(0.06, 0.06, 0.08, M.dark, 0, 0.05, 1.12));
    g.add(cyl(0.05, 0.05, 0.34, 8, M.dark, 0, 0.16, 0.18)).rotation.x = Math.PI / 2;
    const lens = cyl(0.045, 0.045, 0.02, 8, glowMat(0x9ff7ff, 0.9), 0, 0.16, 0.36);
    lens.rotation.x = Math.PI / 2;
    g.add(lens);
    g.add(box(0.07, 0.14, 0.34, M.team, 0, -0.01, -0.25));
    parts.mag = box(0.05, 0.14, 0.08, M.dark, 0, -0.1, 0.12);
    g.add(parts.mag);
    g.userData.muzzle = 1.16;
  }
  if (parts.mag) parts.magY = parts.mag.position.y;
  if (parts.pump) parts.pumpZ = parts.pump.position.z;
  g.userData.parts = parts;
  return g;
}

export class SoldierModel {
  constructor({ operator, colors, weaponId, label }) {
    const p = operator.model;
    const b = p.bulk;
    this.operator = operator;
    this.colors = colors;
    this.mats = [];
    const std = (color, o = {}) => {
      const m = new THREE.MeshStandardMaterial({
        color, roughness: o.r ?? 0.8, metalness: o.m ?? 0.05, flatShading: true,
        emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1,
      });
      m.userData.baseEmissive = m.emissive.clone();
      m.userData.baseIntensity = m.emissiveIntensity;
      this.mats.push(m);
      return m;
    };
    const main = new THREE.Color(colors.main);
    const M = {
      fabric: std(main.clone().lerp(new THREE.Color(0x2c3036), 0.55)),
      vest: std(p.headgear === 'helmet' ? 0x4b503b : 0x2d3139),
      team: std(colors.main, { r: 0.55 }),
      dark: std(0x1c1e22),
      skin: std(0xc98e66),
      metal: std(0x363b42, { r: 0.45, m: 0.55 }),
      wood: std(0x6b4a2e),
      glow: std(colors.accent, { e: colors.accent, ei: 2.4 }),
    };
    this.M = M;

    this.root = new THREE.Group();
    this.spinner = new THREE.Group();
    this.spinner.position.y = HIP_Y;
    this.root.add(this.spinner);
    this.facer = new THREE.Group();
    this.facer.position.y = -HIP_Y;
    this.spinner.add(this.facer);
    this.scale = operator.height / 1.8;
    this.facer.scale.setScalar(this.scale);
    this.body = new THREE.Group();
    this.facer.add(this.body);

    const hips = new THREE.Group();
    hips.position.y = HIP_Y;
    this.body.add(hips);
    hips.add(box(0.36 * b, 0.2, 0.24 * b, M.fabric, 0, 0.02, 0));

    // Legs
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.11 * b, 0, 0);
      hip.add(box(0.19 * b, 0.47, 0.21 * b, M.fabric, 0, -0.225, 0));
      const knee = new THREE.Group();
      knee.position.y = -0.45;
      knee.add(box(0.15 * b, 0.12, 0.06, M.dark, 0, 0, 0.11 * b));
      knee.add(box(0.16 * b, 0.36, 0.18 * b, M.fabric, 0, -0.17, 0));
      knee.add(box(0.2 * b, 0.12, 0.33, M.dark, 0, -0.39, 0.05));
      hip.add(knee);
      hips.add(hip);
      this.legs.push({ hip, knee });
    }

    // Torso
    this.torso = new THREE.Group();
    hips.add(this.torso);
    const T = this.torso;
    T.add(box(0.4 * b, 0.07, 0.28 * b, M.dark, 0, 0.12, 0));
    T.add(box(0.44 * b, 0.5, 0.26 * b, M.fabric, 0, 0.36, 0));
    T.add(box(0.5 * b, 0.36, 0.34 * b, M.vest, 0, 0.33, 0));
    for (const px of [-0.14, 0, 0.14]) T.add(box(0.1 * b, 0.12, 0.06, M.vest, px * b, 0.24, 0.19 * b));
    T.add(box(0.22 * b, 0.05, 0.02, M.team, 0.08 * b, 0.46, 0.175 * b));
    for (const side of [-1, 1]) T.add(box(0.18 * b, 0.12, 0.24 * b, M.team, side * 0.3 * b, 0.57, 0));
    T.add(box(0.34 * b, 0.42, 0.16, M.dark, 0, 0.36, -0.23 * b));
    this.flames = [];
    for (const side of [-1, 1]) {
      T.add(cyl(0.05, 0.06, 0.18, 6, M.metal, side * 0.1 * b, 0.12, -0.3 * b));
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 6), glowMat(colors.accent, 0.95));
      flame.rotation.x = Math.PI;
      flame.position.set(side * 0.1 * b, -0.2, -0.3 * b);
      flame.visible = false;
      T.add(flame);
      this.flames.push(flame);
    }

    // Head
    this.head = new THREE.Group();
    this.head.position.y = 0.62;
    T.add(this.head);
    const H = this.head;
    H.add(box(0.14, 0.1, 0.14, M.skin, 0, 0.02, 0));
    H.add(box(0.26, 0.28, 0.27, M.skin, 0, 0.17, 0));
    if (p.headgear === 'helmet') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.vest);
      dome.scale.set(1.12, 0.95, 1.18);
      dome.position.y = 0.24;
      dome.castShadow = true;
      H.add(dome);
      H.add(box(0.48, 0.05, 0.5, M.vest, 0, 0.24, 0));
      H.add(box(0.06, 0.03, 0.42, M.team, 0, 0.43, 0));
    } else {
      H.add(box(0.34, 0.36, 0.34, M.fabric, 0, 0.2, -0.04));
      H.add(box(0.3, 0.08, 0.1, M.fabric, 0, 0.37, 0.12));
      H.add(box(0.32, 0.12, 0.3, M.team, 0, -0.02, 0.01)); // scarf
    }
    if (p.face === 'mask') {
      H.add(box(0.24, 0.14, 0.07, M.dark, 0, 0.1, 0.15));
      for (const side of [-1, 1]) {
        const c = cyl(0.05, 0.05, 0.08, 8, M.metal, side * 0.1, 0.06, 0.18);
        c.rotation.x = Math.PI / 2;
        H.add(c);
      }
      H.add(box(0.25, 0.06, 0.05, M.glow, 0, 0.21, 0.145));
    } else {
      H.add(box(0.24, 0.12, 0.05, M.dark, 0, 0.08, 0.14));
      H.add(box(0.3, 0.04, 0.02, M.dark, 0, 0.21, 0.14));
      for (const side of [-1, 1]) {
        const lens = cyl(0.05, 0.05, 0.05, 8, M.glow, side * 0.065, 0.21, 0.15);
        lens.rotation.x = Math.PI / 2;
        H.add(lens);
      }
    }
    if (p.headgear === 'hood') {
      this.scarf = new THREE.Group();
      this.scarf.position.set(0.06, 0.0, -0.14);
      const s1 = box(0.1, 0.03, 0.34, M.team, 0, 0, -0.17);
      this.scarf.add(s1);
      H.add(this.scarf);
    }

    // Arms + guns rotate together around the shoulders when aiming.
    this.aimPivot = new THREE.Group();
    this.aimPivot.position.y = 0.48;
    T.add(this.aimPivot);
    const A = this.aimPivot;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const armT = 0.12 * b;
    const rs = V(-0.27 * b, 0, 0), re = V(-0.29 * b, -0.2, 0.12), rh = V(-0.04, -0.1, 0.28);
    const ls = V(0.27 * b, 0, 0), le = V(0.24 * b, -0.17, 0.26), lh = V(0.03, -0.06, 0.5);
    A.add(limb(rs, re, armT, M.fabric), limb(re, rh, armT * 0.9, M.fabric));
    A.add(limb(ls, le, armT, M.fabric), limb(le, lh, armT * 0.9, M.fabric));
    A.add(box(0.1, 0.1, 0.11, M.dark, rh.x, rh.y, rh.z));
    this.leftHand = box(0.1, 0.1, 0.11, M.dark, lh.x, lh.y, lh.z);
    A.add(this.leftHand);

    this.gunMount = new THREE.Group();
    this.gunMount.position.set(0, -0.04, 0.24);
    A.add(this.gunMount);
    this.guns = {};
    for (const id of ['smg', 'shotgun', 'sniper']) {
      const gun = buildGun(id, M);
      gun.visible = false;
      this.gunMount.add(gun);
      this.guns[id] = gun;
    }

    this.knife = new THREE.Group();
    this.knife.add(box(0.03, 0.04, 0.12, M.dark, 0, 0, 0));
    this.knife.add(box(0.02, 0.06, 0.3, M.metal, 0, 0.01, 0.2));
    this.knife.add(box(0.012, 0.012, 0.28, glowMat(0xffffff, 0.8), 0, 0.045, 0.2));
    this.knife.position.copy(lh);
    this.knife.visible = false;
    A.add(this.knife);

    this.flash = new THREE.Group();
    const fm = glowMat(0xffd27a, 1);
    for (let i = 0; i < 2; i++) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.3), fm);
      pl.rotation.set(0, Math.PI / 2, i * Math.PI / 2);
      this.flash.add(pl);
    }
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), glowMat(0xffffff, 1));
    this.flash.add(core);
    this.flash.visible = false;
    this.gunMount.add(this.flash);

    this.laserMat = glowMat(colors.accent, 0.5);
    this.laser = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 1), this.laserMat);
    this.laser.visible = false;
    this.gunMount.add(this.laser);

    if (operator.ability.id === 'shield') {
      this.shield = new THREE.Group();
      this.shield.add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.5, 0.22), glowMat(colors.accent, 0.28)));
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.26), glowMat(colors.accent, 0.9));
      frame.position.y = 0.72;
      this.shield.add(frame, frame.clone());
      this.shield.children[2].position.y = -0.72;
      this.shield.position.set(0, 0.25, 0.62);
      this.shield.visible = false;
      T.add(this.shield);
    }

    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTexture(label, colors.css), depthTest: false, transparent: true }));
    this.tag.scale.set(0.8, 0.6, 1);
    this.tag.position.y = operator.height + 0.55;
    this.tag.renderOrder = 10;
    this.root.add(this.tag);

    this.j = { hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, lean: 0, aim: 0, bob: 0 };
    this.yaw = Math.PI / 2;
    this.phase = 0;
    this.time = 0;
    this.flashAmount = -1;
    this.setWeapon(weaponId);
  }

  setWeapon(id) {
    this.weaponId = id;
    for (const [k, g] of Object.entries(this.guns)) g.visible = k === id;
    this.gun = this.guns[id];
    this.flash.position.set(0, 0.04, this.gun.userData.muzzle + 0.12);
    this.laser.scale.z = 14;
    this.laser.position.set(0, 0.04, this.gun.userData.muzzle + 7);
  }

  setFlash(amount, color) {
    const a = Math.round(amount * 20) / 20;
    if (a === this.flashAmount && !color) return;
    this.flashAmount = a;
    const c = color ? new THREE.Color(color) : new THREE.Color(0xffffff);
    for (const m of this.mats) {
      m.emissive.copy(m.userData.baseEmissive).lerp(c, a);
      m.emissiveIntensity = m.userData.baseIntensity * (1 - a) + a * 1.2;
    }
  }

  // v: view state derived from the Fighter (see Game.fighterView).
  update(v, dt) {
    this.time += dt;
    const j = this.j;
    const t = this.time;

    const targetYaw = v.yaw ?? (v.facing > 0 ? Math.PI / 2 - 0.3 : -Math.PI / 2 + 0.3);
    this.yaw = damp(this.yaw, targetYaw, 16, dt);
    this.facer.rotation.y = this.yaw;

    let hipL = 0, hipR = 0, kneeL = 0.05, kneeR = 0.05, lean = 0, bob = 0;
    if (v.grounded) {
      const run = Math.min(1, Math.abs(v.vx) / this.operator.runSpeed);
      if (run > 0.05) this.phase += dt * (5 + 9 * run);
      const s = Math.sin(this.phase);
      hipL = s * 0.9 * run;
      hipR = -s * 0.9 * run;
      kneeL = 0.1 + Math.max(0, Math.sin(this.phase + 1.6)) * 1.3 * run;
      kneeR = 0.1 + Math.max(0, Math.sin(this.phase + 1.6 + Math.PI)) * 1.3 * run;
      lean = 0.2 * run * Math.sign(v.vx * v.facing);
      bob = Math.abs(Math.cos(this.phase)) * 0.07 * run + Math.sin(t * 2.2) * 0.012;
      if (v.shield) { hipL = -0.35; hipR = 0.35; kneeL = 0.5; kneeR = 0.5; bob -= 0.08; }
    } else if (v.vy > 0) {
      hipL = -1.0; kneeL = 1.5; hipR = 0.35; kneeR = 0.7;
    } else {
      hipL = -0.35; kneeL = 0.5; hipR = 0.25; kneeR = 0.35;
    }
    if (v.hitstun && !v.tumble) lean = -0.45;

    const aimAngle = v.aimAngle;
    let aimX = -aimAngle - v.recoil * (this.weaponId === 'smg' ? 0.12 : 0.45);
    let pivotZ = -v.recoil * 0.1;
    let pivotY = 0.48 + v.ads * 0.07;
    let gunRoll = 0;
    this.knife.visible = v.knife >= 0;
    if (v.knife >= 0) {
      // Wind up high, then slash down through the front.
      const k = v.knife;
      aimX = k < 0.25 ? -1.5 * (k / 0.25) : -1.5 + (k - 0.25) / 0.75 * 2.6;
      pivotZ = 0.08;
    } else if (v.reload >= 0) {
      const r = Math.sin(Math.PI * v.reload);
      aimX += 0.6 * r;
      gunRoll = 0.9 * r;
    } else if (v.shield) {
      aimX = 0.9;
    }

    const rate = 22;
    j.hipL = damp(j.hipL, hipL, rate, dt);
    j.hipR = damp(j.hipR, hipR, rate, dt);
    j.kneeL = damp(j.kneeL, kneeL, rate, dt);
    j.kneeR = damp(j.kneeR, kneeR, rate, dt);
    j.lean = damp(j.lean, lean - aimAngle * 0.12, 14, dt);
    j.bob = damp(j.bob, bob, 20, dt);
    j.aim = v.knife >= 0 || v.recoil > 0.5 ? aimX : damp(j.aim, aimX, 30, dt);

    this.legs[0].hip.rotation.x = j.hipL;
    this.legs[1].hip.rotation.x = j.hipR;
    this.legs[0].knee.rotation.x = j.kneeL;
    this.legs[1].knee.rotation.x = j.kneeR;
    this.torso.rotation.x = j.lean;
    this.body.position.y = j.bob;
    this.head.rotation.x = -aimAngle * 0.35 - j.lean * 0.5;
    this.aimPivot.rotation.x = j.aim;
    this.aimPivot.position.set(0, pivotY, pivotZ);
    this.gunMount.rotation.z = gunRoll;

    const parts = this.gun.userData.parts;
    if (parts.mag) parts.mag.position.y = parts.magY - (v.reload >= 0 ? 0.3 * Math.sin(Math.PI * v.reload) : 0);
    if (parts.pump) parts.pump.position.z = parts.pumpZ - (v.recoil > 0 && v.recoil < 0.7 ? 0.12 * Math.sin(v.recoil / 0.7 * Math.PI) : 0);

    // Tumble: spin around the hips while launched, then settle upright.
    if (v.tumble) {
      this.spinner.rotation.z += dt * -Math.sign(v.vx || 1) * Math.min(18, 6 + Math.hypot(v.vx, v.vy) * 0.5);
    } else {
      this.spinner.rotation.z = damp(wrap(this.spinner.rotation.z), 0, 12, dt);
    }

    const sq = v.landSquash;
    const s = this.scale;
    this.facer.scale.set(s * (1 + sq * 0.12), s * (1 - sq * 0.2), s * (1 + sq * 0.12));

    this.flash.visible = v.muzzle;
    if (v.muzzle) {
      this.flash.rotation.z = Math.random() * Math.PI;
      this.flash.scale.setScalar((this.weaponId === 'smg' ? 0.7 : 1.3) * (0.8 + Math.random() * 0.4));
    }
    this.laser.visible = v.ads > 0.05 && v.knife < 0;
    this.laserMat.opacity = v.adsCharged ? 0.85 + Math.sin(t * 40) * 0.15 : 0.15 + v.ads * 0.25;
    this.laser.scale.x = this.laser.scale.y = v.adsCharged ? 2.2 : 1;

    for (const f of this.flames) {
      f.visible = v.boosting;
      if (v.boosting) f.scale.set(1, 0.8 + Math.random() * 0.8, 1);
    }
    if (this.shield) this.shield.visible = v.shield;
    if (this.scarf) this.scarf.rotation.x = 0.3 + Math.min(1.2, Math.abs(v.vx) * 0.08 + Math.max(0, -v.vy) * 0.05) + Math.sin(t * 9) * 0.12;

    let flash = v.flash;
    let flashColor = null;
    if (v.dashing) { flash = 0.7; flashColor = this.colors.accent; }
    else if (v.invuln) flash = Math.max(flash, 0.25 + 0.2 * Math.sin(t * 25));
    this.setFlash(Math.min(1, flash), flashColor);
    this.tag.visible = v.showTag;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !this.mats.includes(o.material)) o.material.dispose(); // tag textures stay cached
    });
    for (const m of this.mats) m.dispose();
  }
}

