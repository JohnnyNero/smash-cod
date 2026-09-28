// Species builders: each one adds low-poly meshes to a CreatureModel and registers the joints
// the animation system drives (hips, torso, head, armL/R, legL/R, tail, earL/R).
// Coordinates: feet at y = 0, facing +z. Flat parts that should read from the side (tails,
// ears) are thin along x, because x points into the screen once the model turns sideways.

import * as THREE from 'three';
import { glowMat } from './creature.js';

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const ball = (r, mat, sx = 1, sy = 1, sz = 1, seg = 16) => {
  // Big, silhouette-defining parts get extra segments so they read as smooth curves.
  const size = r * Math.max(sx, sy, sz);
  if (size > 0.12) seg = Math.max(seg, 22);
  else if (size > 0.06) seg = Math.max(seg, 14);
  const m = mesh(new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.75))), mat);
  m.scale.set(sx, sy, sz);
  return m;
};
const group = (x = 0, y = 0, z = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  return g;
};
const cyl = (rt, rb, h, mat, seg = 14) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
// Rounded limb segment (capsule) centred on its origin, running along y.
const cap = (r, len, mat, seg = 12) => mesh(new THREE.CapsuleGeometry(r, len, 4, seg), mat);
const cone = (r, h, mat, seg = 10) => mesh(new THREE.ConeGeometry(r, h, seg), mat);
const at = (obj, x, y, z, rx = 0, ry = 0, rz = 0) => {
  obj.position.set(x, y, z);
  obj.rotation.set(rx, ry, rz);
  return obj;
};

// Shared: a pair of eyes (dark with a glint) on a head group.
function eyes(head, M, x, y, z, r = 0.05, color) {
  for (const side of [-1, 1]) {
    const eye = at(ball(r, color || M.black, 1, 1.2, 0.7, 10), side * x, y, z);
    const glint = at(ball(r * 0.35, M.white, 1, 1, 1, 6), side * x + r * 0.3, y + r * 0.4, z + r * 0.6);
    eye.userData.eye = glint.userData.eye = true; // blink targets
    head.add(eye, glint);
  }
}

// Shared: a player-coloured bandana around the neck so P1/P2 are easy to tell apart.
function bandana(parent, M, y, r, z = 0) {
  parent.add(at(cyl(r, r * 1.15, 0.08, M.team, 10), 0, y, z));
}

function pikachu(model, colors) {
  const M = {
    yellow: model.mat(0xf6cf2e, { r: 0.6 }),
    brown: model.mat(0x7a4a22),
    black: model.mat(0x151515, { r: 0.4 }),
    white: model.mat(0xffffff, { r: 0.3 }),
    cheek: model.mat(0xe0402a, { r: 0.5, e: 0xff5a20, ei: 0 }),
    team: model.mat(colors.main, { r: 0.6 }),
    tail: model.mat(0xf6cf2e, { r: 0.5 }),
  };
  const j = model.j;

  const hips = group(0, 0.28, 0);
  model.body.add(hips);
  j.hips = hips;

  for (const side of [-1, 1]) {
    const leg = group(side * 0.13, 0, 0.02);
    leg.add(at(ball(0.13, M.yellow, 1, 1.25, 1.05), 0, 0.02, 0)); // thigh blends into the body
    const foot = ball(0.11, M.yellow, 1, 0.6, 1.7);
    foot.position.set(0, -0.2, 0.06);
    leg.add(foot);
    hips.add(leg);
    j[side < 0 ? 'legR' : 'legL'] = leg;
  }

  const torso = group(0, 0, 0);
  hips.add(torso);
  j.torso = torso;
  const bodyMesh = ball(1, M.yellow, 0.3, 0.3, 0.26, 12);
  bodyMesh.position.y = 0.2;
  torso.add(bodyMesh);
  for (const [y, w] of [[0.3, 0.22], [0.2, 0.2]]) torso.add(mesh(new THREE.BoxGeometry(w, 0.045, 0.05), M.brown, 0, y, -0.245));

  // Bandana in the player's colour so P1 and P2 are easy to tell apart.
  torso.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.08, 10), M.team, 0, 0.42, 0.01));
  const knot = mesh(new THREE.BoxGeometry(0.06, 0.12, 0.1), M.team, 0, 0.36, -0.22);
  knot.rotation.x = 0.5;
  torso.add(knot);

  const head = group(0, 0.44, 0.03);
  torso.add(head);
  j.head = head;
  const headMesh = ball(1, M.yellow, 0.34, 0.3, 0.3, 12);
  headMesh.position.y = 0.2;
  head.add(headMesh);
  for (const side of [-1, 1]) {
    const eye = ball(0.055, M.black, 1, 1.1, 0.7, 10);
    eye.position.set(side * 0.13, 0.24, 0.255);
    eye.userData.eye = true;
    head.add(eye);
    const glint = ball(0.02, M.white, 1, 1, 1, 6);
    glint.userData.eye = true;
    glint.position.set(side * 0.13 + 0.015, 0.265, 0.29);
    head.add(glint);
    const cheek = ball(0.075, M.cheek, 1, 1, 0.5, 8);
    cheek.position.set(side * 0.22, 0.12, 0.2);
    head.add(cheek);

    const ear = group(side * 0.17, 0.4, -0.02);
    ear.rotation.z = -side * 0.45;
    ear.add(mesh(new THREE.ConeGeometry(0.085, 0.44, 8), M.yellow, 0, 0.22, 0));
    ear.add(mesh(new THREE.ConeGeometry(0.052, 0.16, 8), M.black, 0, 0.37, 0));
    head.add(ear);
    j[side < 0 ? 'earR' : 'earL'] = ear;
  }
  head.add(ball(0.016, M.black, 1, 1, 1, 6)).position.set(0, 0.2, 0.3);
  head.add(mesh(new THREE.BoxGeometry(0.07, 0.015, 0.02), M.black, 0, 0.13, 0.29));

  for (const side of [-1, 1]) {
    const arm = group(side * 0.2, 0.3, 0.1);
    arm.add(at(cap(0.048, 0.12, M.yellow), 0, -0.08, 0));
    arm.add(ball(0.055, M.yellow, 1, 1, 1, 8)).position.set(0, -0.18, 0);
    arm.rotation.x = -0.4;
    torso.add(arm);
    j[side < 0 ? 'armR' : 'armL'] = arm;
  }

  // Lightning-bolt tail: three flat zigzag segments, thin along x so it reads from the side.
  const tail = group(0, 0.12, -0.24);
  tail.rotation.x = 0.55;
  tail.add(mesh(new THREE.BoxGeometry(0.05, 0.2, 0.07), M.brown, 0, 0.1, 0));
  const t2 = group(0, 0.19, 0);
  t2.rotation.x = -0.9;
  t2.add(mesh(new THREE.BoxGeometry(0.05, 0.26, 0.1), M.tail, 0, 0.12, 0));
  tail.add(t2);
  const t3 = group(0, 0.24, 0);
  t3.rotation.x = 1.3;
  t3.add(mesh(new THREE.BoxGeometry(0.05, 0.34, 0.24), M.tail, 0, 0.16, 0));
  t2.add(t3);
  tail.scale.setScalar(1.25);
  torso.add(tail);
  j.tail = tail;

  const spark = glowMat(0xfff27a, 0.9);
  const sparks = [];
  for (let i = 0; i < 4; i++) {
    const s = mesh(new THREE.OctahedronGeometry(0.05), spark);
    s.castShadow = false;
    s.visible = false;
    head.add(s);
    sparks.push(s);
  }
  const steel = new THREE.Color(0xc8ccd8);
  const gold = new THREE.Color(0xf6cf2e);

  return {
    allFours: true,
    update(v, t) {
      // Cheeks crackle when using electric moves (and now and then at idle).
      const electric = v.state === 'attack' && ['cast', 'ball', 'fsmash', 'dsmash', 'nair', 'dair'].includes(v.anim);
      const idleSpark = v.state === 'ground' && Math.sin(t * 1.3) > 0.97;
      const glow = electric ? 3 : idleSpark ? 1.5 : 0;
      M.cheek.emissiveIntensity = glow * (0.7 + Math.random() * 0.6);
      M.cheek.userData.baseIntensity = M.cheek.emissiveIntensity;
      sparks.forEach((s, i) => {
        s.visible = glow > 0 && Math.random() < 0.6;
        if (s.visible) {
          const side = i % 2 ? 1 : -1;
          s.position.set(side * (0.26 + Math.random() * 0.12), 0.12 + (Math.random() - 0.5) * 0.2, 0.2 + Math.random() * 0.1);
          s.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        }
      });
      // Iron Tail turns the tail to steel.
      const iron = v.state === 'attack' && (v.anim === 'tailslam' || v.anim === 'tailspike');
      M.tail.color.copy(iron ? steel : gold);
      M.tail.metalness = iron ? 0.8 : 0.05;
    },
  };
}

function charizard(model, colors) {
  const M = {
    orange: model.mat(0xf08a30, { r: 0.6 }),
    cream: model.mat(0xf3dc9a),
    wing: model.mat(0x2f8aa0, { r: 0.7 }),
    black: model.mat(0x151515, { r: 0.4 }),
    white: model.mat(0xffffff, { r: 0.3 }),
    horn: model.mat(0xf3dc9a, { r: 0.5 }),
    team: model.mat(colors.main, { r: 0.6 }),
  };
  const j = model.j;
  const hips = group(0, 0.62, 0);
  model.body.add(hips);
  j.hips = hips;
  for (const side of [-1, 1]) {
    const leg = group(side * 0.22, 0, 0);
    leg.add(at(ball(0.24, M.orange, 1, 1.25, 1.15), 0, -0.04, 0)); // big thigh tucked into the body
    leg.add(at(cyl(0.1, 0.12, 0.3, M.orange), 0, -0.36, 0.04));
    leg.add(at(ball(0.16, M.orange, 1, 0.55, 1.6), 0, -0.52, 0.1));
    for (const c of [-1, 0, 1]) leg.add(at(cone(0.03, 0.1, M.white, 5), c * 0.06, -0.52, 0.34, Math.PI / 2));
    hips.add(leg);
    j[side < 0 ? 'legR' : 'legL'] = leg;
  }
  const torso = group();
  hips.add(torso);
  j.torso = torso;
  torso.add(at(ball(1, M.orange, 0.42, 0.52, 0.38, 12), 0, 0.42, 0));
  torso.add(at(ball(1, M.cream, 0.3, 0.42, 0.12, 10), 0, 0.38, 0.28));
  torso.add(at(cyl(0.12, 0.15, 0.35, M.orange), 0, 0.92, 0.08, 0.35));
  bandana(torso, M, 0.82, 0.17, 0.05);

  const head = group(0, 1.08, 0.16);
  torso.add(head);
  j.head = head;
  head.add(at(ball(1, M.orange, 0.22, 0.2, 0.28, 10), 0, 0.1, 0.06));
  head.add(at(ball(1, M.orange, 0.15, 0.12, 0.18, 8), 0, 0.03, 0.3));
  eyes(head, M, 0.12, 0.16, 0.24, 0.045);
  head.add(at(mesh(new THREE.BoxGeometry(0.2, 0.015, 0.14), M.black), 0, -0.02, 0.36)); // mouth line
  head.add(at(ball(0.015, M.black, 1, 1, 1, 5), 0.05, 0.08, 0.47));
  head.add(at(ball(0.015, M.black, 1, 1, 1, 5), -0.05, 0.08, 0.47));
  for (const side of [-1, 1]) {
    const horn = group(side * 0.1, 0.24, -0.1);
    horn.rotation.x = -1.1;
    horn.add(at(cone(0.045, 0.26, M.horn, 6), 0, 0.13, 0));
    head.add(horn);
    j[side < 0 ? 'earR' : 'earL'] = horn;
  }
  for (const side of [-1, 1]) {
    const arm = group(side * 0.36, 0.68, 0.12);
    arm.add(at(ball(0.1, M.orange), 0, 0, 0)); // shoulder
    arm.add(at(cap(0.07, 0.24, M.orange), 0, -0.17, 0));
    arm.add(at(ball(0.085, M.orange, 1, 0.9, 1.1), 0, -0.36, 0.02));
    for (const c of [-1, 0, 1]) arm.add(at(cone(0.022, 0.08, M.white, 5), c * 0.045, -0.42, 0.07, 2.4));
    arm.rotation.x = -0.5;
    torso.add(arm);
    j[side < 0 ? 'armR' : 'armL'] = arm;
  }
  // Wings: swept back so they read in profile; flapped in update().
  const wings = [];
  for (const side of [-1, 1]) {
    const w = group(side * 0.22, 0.78, -0.26);
    w.rotation.set(-0.35, 0, side * 0.35);
    w.add(at(cyl(0.04, 0.03, 1.15, M.orange, 6), 0, 0.55, -0.25, -0.45));
    w.add(at(mesh(new THREE.BoxGeometry(0.04, 1.0, 0.85), M.wing), side * 0.02, 0.55, -0.55, 0.35));
    w.add(at(mesh(new THREE.BoxGeometry(0.035, 0.62, 0.55), M.wing), side * 0.02, 0.18, -0.88, 0.9));
    w.add(at(cone(0.03, 0.12, M.horn, 5), 0, 1.12, -0.52, -0.4)); // wing claw
    torso.add(w);
    wings.push({ g: w, side });
  }
  // Tail with the flame on the tip.
  const tail = group(0, 0.12, -0.3);
  tail.rotation.x = -2.0;
  tail.add(at(cone(0.13, 0.85, M.orange, 8), 0, 0.42, 0));
  const flameMat = glowMat(0xffa030, 0.95);
  const flame = at(cone(0.13, 0.4, flameMat, 7), 0, 0.95, 0);
  const flameCore = at(cone(0.07, 0.25, glowMat(0xfff0a0, 1), 6), 0, 0.9, 0);
  tail.add(flame, flameCore);
  torso.add(tail);
  j.tail = tail;

  return {
    update(v, t, dt, springs) {
      const flying = !v.grounded;
      const speed = flying ? 12 : 3;
      const amp = flying ? 0.5 : 0.12;
      // Wings flap, and fold/lag with the body's motion (spring).
      for (const w of wings) {
        w.g.rotation.z = w.side * (0.35 + Math.sin(t * speed) * amp + springs.ear.x * 0.35);
        w.g.rotation.x = -0.35 - springs.tail.x * 0.25;
      }
      flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
      flameCore.scale.set(1, 0.8 + Math.random() * 0.4, 1);
    },
  };
}

function blastoise(model, colors) {
  const M = {
    blue: model.mat(0x5a8ad8, { r: 0.6 }),
    cream: model.mat(0xf0dea8),
    shell: model.mat(0x8a5a36, { r: 0.7 }),
    rim: model.mat(0xe8d8b0),
    metal: model.mat(0x9aa3ad, { r: 0.35, m: 0.7 }),
    dark: model.mat(0x2a2e36),
    black: model.mat(0x151515, { r: 0.4 }),
    white: model.mat(0xffffff, { r: 0.3 }),
    team: model.mat(colors.main, { r: 0.6 }),
  };
  const j = model.j;
  const hips = group(0, 0.5, 0);
  model.body.add(hips);
  j.hips = hips;
  for (const side of [-1, 1]) {
    const leg = group(side * 0.26, 0, 0.02);
    leg.add(at(ball(0.2, M.blue, 1, 1.15, 1), 0, -0.12, 0));
    leg.add(at(ball(0.17, M.blue, 1, 0.5, 1.4), 0, -0.4, 0.08));
    hips.add(leg);
    j[side < 0 ? 'legR' : 'legL'] = leg;
  }
  const torso = group();
  hips.add(torso);
  j.torso = torso;
  torso.add(at(ball(1, M.blue, 0.5, 0.55, 0.45, 12), 0, 0.45, 0));
  torso.add(at(ball(1, M.cream, 0.4, 0.46, 0.14, 10), 0, 0.42, 0.34));
  torso.add(at(ball(1, M.shell, 0.58, 0.6, 0.36, 12), 0, 0.5, -0.2));
  torso.add(at(ball(1, M.rim, 0.61, 0.63, 0.12, 12), 0, 0.5, -0.02));
  bandana(torso, M, 0.9, 0.24, 0.02);
  // Shell cannons pointing forward over the shoulders.
  for (const side of [-1, 1]) {
    const c = group(side * 0.34, 0.92, -0.12);
    c.rotation.x = 1.15;
    c.add(at(cyl(0.1, 0.12, 0.6, M.metal, 10), 0, 0.28, 0));
    c.add(at(cyl(0.07, 0.07, 0.04, M.dark, 10), 0, 0.59, 0));
    torso.add(c);
  }
  const head = group(0, 0.95, 0.1);
  torso.add(head);
  j.head = head;
  head.add(at(ball(0.28, M.blue, 1, 0.9, 1, 10), 0, 0.12, 0));
  eyes(head, M, 0.12, 0.18, 0.23, 0.045);
  head.add(at(mesh(new THREE.BoxGeometry(0.16, 0.015, 0.02), M.black), 0, 0.03, 0.27));
  for (const side of [-1, 1]) {
    const ear = group(side * 0.2, 0.3, -0.02);
    ear.rotation.z = -side * 0.4;
    ear.add(at(cone(0.06, 0.14, M.blue, 6), 0, 0.06, 0));
    head.add(ear);
    j[side < 0 ? 'earR' : 'earL'] = ear;
  }
  for (const side of [-1, 1]) {
    const arm = group(side * 0.5, 0.62, 0.05);
    arm.add(at(cyl(0.11, 0.1, 0.32, M.blue), 0, -0.14, 0));
    arm.add(at(ball(0.12, M.blue), 0, -0.32, 0));
    arm.rotation.x = -0.3;
    torso.add(arm);
    j[side < 0 ? 'armR' : 'armL'] = arm;
  }
  const tail = group(0, 0.05, -0.42);
  tail.add(at(ball(0.1, M.blue, 1, 0.8, 1.3), 0, 0, -0.05));
  torso.add(tail);
  j.tail = tail;
  return {};
}

function venusaur(model, colors) {
  const M = {
    teal: model.mat(0x5ab0a0, { r: 0.6 }),
    spot: model.mat(0x3a7a78),
    leaf: model.mat(0x2f8a3e, { r: 0.7 }),
    trunk: model.mat(0x7a5a3a),
    petal: model.mat(0xf07888, { r: 0.6 }),
    petalDark: model.mat(0xd8506a, { r: 0.6 }),
    yellow: model.mat(0xf6d84a),
    black: model.mat(0x151515, { r: 0.4 }),
    white: model.mat(0xffffff, { r: 0.3 }),
    red: model.mat(0xc83a3a, { r: 0.4 }),
    team: model.mat(colors.main, { r: 0.6 }),
  };
  const j = model.j;
  const hips = group(0, 0.46, 0);
  model.body.add(hips);
  j.hips = hips;
  const torso = group();
  hips.add(torso);
  j.torso = torso;
  torso.add(at(ball(1, M.teal, 0.55, 0.4, 0.72, 12), 0, 0.25, 0));
  for (const [x, y, z] of [[0.45, 0.3, 0.2], [-0.45, 0.3, 0.2], [0.42, 0.22, -0.3], [-0.42, 0.22, -0.3], [0.3, 0.52, -0.1], [-0.3, 0.52, -0.1]]) {
    torso.add(at(ball(0.1, M.spot, 1, 0.6, 1.2, 6), x, y, z));
  }
  bandana(torso, M, 0.3, 0.36, 0.5);
  // Back legs (legL/R) and front legs (armL/R) so the run cycle becomes a gait.
  for (const side of [-1, 1]) {
    const leg = group(side * 0.36, 0, -0.38);
    leg.add(at(ball(0.2, M.teal, 1, 1.1, 1.15), 0, -0.05, 0)); // haunch
    leg.add(at(cap(0.15, 0.16, M.teal), 0, -0.26, 0));
    leg.add(at(ball(0.17, M.teal, 1, 0.5, 1.3), 0, -0.42, 0.06));
    for (const c of [-1, 1]) leg.add(at(cone(0.03, 0.08, M.white, 5), c * 0.06, -0.45, 0.26, Math.PI / 2));
    hips.add(leg);
    j[side < 0 ? 'legR' : 'legL'] = leg;
    const front = group(side * 0.38, 0.05, 0.4);
    front.add(at(cap(0.15, 0.24, M.teal), 0, -0.24, 0));
    front.add(at(ball(0.17, M.teal, 1, 0.5, 1.3), 0, -0.47, 0.06));
    for (const c of [-1, 1]) front.add(at(cone(0.03, 0.08, M.white, 5), c * 0.06, -0.5, 0.26, Math.PI / 2));
    torso.add(front);
    j[side < 0 ? 'armR' : 'armL'] = front;
  }
  const head = group(0, 0.32, 0.62);
  torso.add(head);
  j.head = head;
  head.add(at(ball(1, M.teal, 0.36, 0.26, 0.3, 10), 0, 0.05, 0.12));
  eyes(head, M, 0.17, 0.12, 0.34, 0.05, M.red);
  head.add(at(mesh(new THREE.BoxGeometry(0.3, 0.02, 0.02), M.black), 0, -0.05, 0.41));
  for (const side of [-1, 1]) {
    const ear = group(side * 0.22, 0.25, 0.05);
    ear.rotation.z = -side * 0.5;
    ear.add(at(cone(0.07, 0.16, M.teal, 6), 0, 0.07, 0));
    head.add(ear);
    j[side < 0 ? 'earR' : 'earL'] = ear;
  }
  // The flower on its back doubles as the "tail" joint, so it sways and whips in attacks.
  const flower = group(0, 0.55, -0.08);
  flower.add(at(cyl(0.16, 0.2, 0.3, M.trunk), 0, 0.1, 0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const leaf = group(0, 0.15, 0);
    leaf.rotation.y = a;
    leaf.add(at(ball(1, M.leaf, 0.17, 0.03, 0.4), 0, 0, 0.42, -0.25)); // broad fern frond
    leaf.add(at(mesh(new THREE.BoxGeometry(0.025, 0.035, 0.66), M.spot), 0, 0.012, 0.42, -0.25)); // midrib
    flower.add(leaf);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const petal = group(0, 0.35, 0);
    petal.rotation.y = a;
    petal.add(at(ball(1, i % 2 ? M.petal : M.petalDark, 0.2, 0.06, 0.34, 8), 0, 0.02, 0.3, -0.35));
    flower.add(petal);
  }
  flower.add(at(ball(0.13, M.yellow, 1, 0.8, 1, 8), 0, 0.42, 0));
  torso.add(flower);
  j.tail = flower;
  return {};
}

function gengar(model, colors) {
  const M = {
    purple: model.mat(0x6a4aa0, { r: 0.6 }),
    dark: model.mat(0x4a3278),
    white: model.mat(0xffffff, { r: 0.3 }),
    black: model.mat(0x151515, { r: 0.4 }),
    eye: model.mat(0xff2a3a, { e: 0xff1a2a, ei: 1.5 }),
    team: model.mat(colors.main, { r: 0.6 }),
  };
  const j = model.j;
  const hips = group(0, 0.26, 0);
  model.body.add(hips);
  j.hips = hips;
  for (const side of [-1, 1]) {
    const leg = group(side * 0.26, 0, 0.02);
    leg.add(at(ball(0.13, M.purple, 1, 1, 1), 0, -0.06, 0));
    leg.add(at(ball(0.13, M.purple, 1, 0.5, 1.5), 0, -0.2, 0.06));
    hips.add(leg);
    j[side < 0 ? 'legR' : 'legL'] = leg;
  }
  const torso = group();
  hips.add(torso);
  j.torso = torso;
  torso.add(at(ball(0.56, M.purple, 1, 0.95, 0.9, 12), 0, 0.38, 0));
  for (let i = 0; i < 6; i++) {
    const a = -0.9 + i * 0.36;
    torso.add(at(cone(0.09, 0.3, M.purple, 6), Math.sin(a) * 0.35, 0.52 + Math.cos(a) * 0.3, -0.38, -0.9, 0, -a * 0.8));
  }
  // The face is the "head" joint so it can still nod and tilt.
  const head = group(0, 0.4, 0.3);
  torso.add(head);
  j.head = head;
  for (const side of [-1, 1]) {
    const eye = at(ball(0.1, M.eye, 1.1, 0.7, 0.5, 10), side * 0.18, 0.14, 0.2, 0, 0, side * 0.35);
    const pupil = at(ball(0.03, M.white, 1, 1, 1, 6), side * 0.18, 0.13, 0.25);
    eye.userData.eye = pupil.userData.eye = true;
    head.add(eye, pupil);
  }
  // Wide grin: a curved row of teeth sunk into the body surface.
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.13;
    const x = Math.sin(a) * 0.5;
    const z = Math.sqrt(1 - (x / 0.56) ** 2) * 0.5 - 0.3 + 0.01; // on the body surface
    head.add(at(mesh(new THREE.BoxGeometry(0.075, 0.09, 0.04), M.white), x, -0.1 + Math.abs(i) * 0.012, z, 0, a, 0));
  }
  for (const side of [-1, 1]) {
    const ear = group(side * 0.3, 0.8, -0.05);
    ear.rotation.z = -side * 0.35;
    ear.add(at(cone(0.13, 0.36, M.purple, 6), 0, 0.14, 0));
    if (side > 0) ear.add(at(mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 12), M.team), 0, 0.04, 0, Math.PI / 2)); // team ribbon
    torso.add(ear);
    j[side < 0 ? 'earR' : 'earL'] = ear;
  }
  for (const side of [-1, 1]) {
    const arm = group(side * 0.5, 0.4, 0.1);
    arm.add(at(cyl(0.08, 0.07, 0.24, M.purple), 0, -0.1, 0));
    for (const c of [-1, 0, 1]) arm.add(at(cone(0.03, 0.09, M.purple, 5), c * 0.04, -0.26, 0.02, Math.PI));
    arm.rotation.z = side * 0.3;
    torso.add(arm);
    j[side < 0 ? 'armR' : 'armL'] = arm;
  }
  const tail = group(0, 0.12, -0.45);
  tail.rotation.x = -1.7;
  tail.add(at(cone(0.1, 0.3, M.purple, 6), 0, 0.12, 0));
  torso.add(tail);
  j.tail = tail;
  return {
    update(v, t) {
      M.eye.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.5;
      M.eye.userData.baseIntensity = M.eye.emissiveIntensity;
    },
  };
}

function lucario(model, colors) {
  const M = {
    blue: model.mat(0x3f6fd0, { r: 0.6 }),
    black: model.mat(0x24242f, { r: 0.5 }),
    cream: model.mat(0xeedc9a),
    steel: model.mat(0xd8dde6, { r: 0.3, m: 0.7 }),
    white: model.mat(0xffffff, { r: 0.3 }),
    red: model.mat(0xd8323a, { r: 0.4 }),
    team: model.mat(colors.main, { r: 0.6 }),
  };
  const j = model.j;
  const hips = group(0, 0.74, 0);
  model.body.add(hips);
  j.hips = hips;
  // Digitigrade legs: black-furred thighs, slim blue shins angled back, black paws.
  for (const side of [-1, 1]) {
    const leg = group(side * 0.13, 0, 0);
    leg.add(at(ball(1, M.black, 0.1, 0.17, 0.12), 0, -0.1, 0.02));
    leg.add(at(cap(0.066, 0.26, M.blue), 0, -0.44, -0.03, 0.15));
    leg.add(at(ball(1, M.black, 0.075, 0.05, 0.14), 0, -0.7, 0.05));
    hips.add(leg);
    j[side < 0 ? 'legR' : 'legL'] = leg;
  }
  const torso = group();
  hips.add(torso);
  j.torso = torso;
  torso.add(at(ball(1, M.black, 0.16, 0.15, 0.13), 0, 0.06, 0)); // black waist
  torso.add(at(ball(1, M.blue, 0.19, 0.2, 0.15), 0, 0.33, -0.01)); // blue chest and back
  torso.add(at(ball(1, M.cream, 0.15, 0.15, 0.09), 0, 0.33, 0.08)); // cream chest fur
  for (const side of [-1, 1]) torso.add(at(cone(0.06, 0.16, M.cream, 8), side * 0.06, 0.2, 0.1, Math.PI, 0, side * 0.3)); // fur tufts
  torso.add(at(cone(0.045, 0.17, M.steel, 8), 0, 0.34, 0.2, Math.PI / 2)); // chest spike
  bandana(torso, M, 0.5, 0.11, 0.01);

  const head = group(0, 0.54, 0.02);
  torso.add(head);
  j.head = head;
  head.add(at(ball(1, M.blue, 0.18, 0.17, 0.18), 0, 0.14, 0));
  head.add(at(ball(1, M.black, 0.085, 0.07, 0.11), 0, 0.07, 0.15)); // muzzle
  head.add(at(ball(0.025, M.black), 0, 0.1, 0.26)); // nose
  head.add(at(ball(1, M.blue, 0.1, 0.06, 0.08), 0, 0.2, 0.12)); // brow over the mask
  // Black mask: lobes wrapping the eyes, running back to the appendages.
  for (const side of [-1, 1]) head.add(at(ball(1, M.black, 0.1, 0.055, 0.11), side * 0.085, 0.14, 0.1, 0, side * 0.45, 0));
  eyes(head, M, 0.085, 0.145, 0.185, 0.034, M.red);
  // Fluffy blue cheek fur.
  for (const side of [-1, 1]) head.add(at(cone(0.05, 0.14, M.blue, 7), side * 0.17, 0.08, 0.02, 0, 0, side * 1.9));
  for (const side of [-1, 1]) {
    const ear = group(side * 0.1, 0.28, -0.02);
    ear.rotation.z = -side * 0.22;
    ear.add(at(cone(0.07, 0.3, M.blue, 10), 0, 0.14, 0));
    ear.add(at(cone(0.035, 0.18, M.black, 6), 0, 0.11, 0.035)); // inner ear
    head.add(ear);
    j[side < 0 ? 'earR' : 'earL'] = ear;
  }
  // Four aura-sensing appendages hanging from the back of the head.
  const locks = [];
  for (const [x, y] of [[-0.07, 0.1], [0.07, 0.1], [-0.06, 0.19], [0.06, 0.19]]) {
    const l = group(x, y, -0.15);
    l.rotation.x = 2.5;
    l.add(at(cap(0.028, 0.2, M.black, 8), 0, 0.13, 0));
    head.add(l);
    locks.push(l);
  }
  // Blue arms, black paws with a steel spike on the back of each.
  for (const side of [-1, 1]) {
    const arm = group(side * 0.23, 0.43, 0);
    arm.add(at(ball(0.075, M.blue), 0, 0, 0));
    arm.add(at(cap(0.055, 0.18, M.blue), 0, -0.14, 0));
    arm.add(at(ball(1, M.black, 0.065, 0.075, 0.065), 0, -0.3, 0.01));
    arm.add(at(cone(0.028, 0.12, M.steel, 6), 0, -0.28, -0.08, -Math.PI / 2));
    torso.add(arm);
    j[side < 0 ? 'armR' : 'armL'] = arm;
  }
  // Bushy tail.
  const tail = group(0, 0.02, -0.12);
  tail.rotation.x = -2.3;
  tail.add(at(ball(1, M.blue, 0.075, 0.2, 0.085), 0, 0.2, 0));
  torso.add(tail);
  j.tail = tail;
  return {
    update(v, t, dt, springs) {
      // The appendages stream behind when running and bounce with the body (spring).
      locks.forEach((l, i) => {
        l.rotation.x = 2.5 + Math.sin(t * 3 + i) * 0.12 - Math.min(0.6, Math.abs(v.vx) * 0.05) - springs.tail.x * 0.8;
      });
    },
  };
}

export const BUILDERS = { pikachu, charizard, blastoise, venusaur, gengar, lucario };
